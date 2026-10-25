// signal 서버 단위 테스트 — 가짜 Handler 로 WS 핸드셰이크·join(개발용·입장권 거부)·ping·요청 위임·운영 가드(실행 : go test ./internal/signal)
package signal

import (
	"bufio"
	"encoding/json"
	"net"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakeHandler struct{ left chan string }

func (f *fakeHandler) Join(s Session, t Ticket) (JoinRes, *Error) {
	return JoinRes{PeerID: "p-" + t.Name, Role: t.Role}, nil
}

func (f *fakeHandler) Request(s Session, m string, d json.RawMessage) (any, *Error) {
	if m == "echo" {
		return d, nil
	}
	return nil, Errf(CodeNotFound, m)
}

func (f *fakeHandler) Left(s Session) { f.left <- s.ID() }

func roundTrip(t *testing.T, ws *WSConn, e Envelope) Envelope {
	t.Helper()
	b, _ := json.Marshal(e)
	if err := ws.WriteText(b); err != nil {
		t.Fatal(err)
	}
	_ = ws.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, msg, err := ws.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	var r Envelope
	if err := json.Unmarshal(msg, &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestServer(t *testing.T) {
	cases := []struct {
		name    string
		dev     string
		nodeEnv string
		join    string
		wantOK  bool
		code    ErrCode
	}{
		{"개발용 입장", "1", "", `{"room":"r","role":"presenter","name":"a"}`, true, ""},
		{"개발용 꺼짐 → 입장권 검증(M5 전 거부)", "", "", `{"room":"r","role":"presenter"}`, false, CodeTicketInvalid},
		{"운영 가드 — NODE_ENV=production 이면 개발용 무시", "1", "production", `{"room":"r","role":"presenter"}`, false, CodeTicketInvalid},
		{"개발용 잘못된 역할", "1", "", `{"room":"r","role":"admin"}`, false, CodeRoleForbidden},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("MEDIA_DEV_TICKET", c.dev)
			t.Setenv("NODE_ENV", c.nodeEnv)
			h := &fakeHandler{left: make(chan string, 1)}
			srv := httptest.NewServer(NewServer(h, NewVerifier(nil)))
			defer srv.Close()
			ws, err := DialWS("ws"+strings.TrimPrefix(srv.URL, "http"), "", MaxMessage)
			if err != nil {
				t.Fatal(err)
			}
			defer ws.Close()
			r := roundTrip(t, ws, Envelope{T: TypeReq, ID: 1, M: MJoin, D: json.RawMessage(c.join)})
			if r.T != TypeRes || r.ID != 1 || r.OK == nil || *r.OK != c.wantOK {
				t.Fatalf("join 응답 %+v", r)
			}
			if !c.wantOK {
				if r.E == nil || r.E.Code != c.code {
					t.Fatalf("오류 코드 %+v, 기대 %s", r.E, c.code)
				}
				return
			}
			if r := roundTrip(t, ws, Envelope{T: TypeReq, ID: 2, M: MPing}); !*r.OK || r.ID != 2 {
				t.Errorf("ping 응답 %+v", r)
			}
			if r := roundTrip(t, ws, Envelope{T: TypeReq, ID: 3, M: "echo", D: json.RawMessage(`{"x":1}`)}); !*r.OK || string(r.D) != `{"x":1}` {
				t.Errorf("요청 위임 %+v %s", r, r.D)
			}
			if r := roundTrip(t, ws, Envelope{T: TypeReq, ID: 4, M: "nope"}); *r.OK || r.E.Code != CodeNotFound {
				t.Errorf("없는 메서드 %+v", r)
			}
			roundTrip(t, ws, Envelope{T: TypeReq, ID: 5, M: MLeave})
			select {
			case <-h.left:
			case <-time.After(3 * time.Second):
				t.Error("leave 뒤 Left 호출 없음")
			}
		})
	}
}

func TestWSOrigin(t *testing.T) {
	t.Setenv("MEDIA_ALLOWED_ORIGINS", "https://ok.example")
	srv := httptest.NewServer(NewServer(&fakeHandler{left: make(chan string, 1)}, nil))
	defer srv.Close()
	url := "ws" + strings.TrimPrefix(srv.URL, "http")
	if _, err := DialWS(url, "https://evil.example", MaxMessage); err == nil {
		t.Error("허용 안 된 Origin 이 연결됨")
	}
	ws, err := DialWS(url, "https://ok.example", MaxMessage)
	if err != nil {
		t.Fatalf("허용 Origin 거부: %v", err)
	}
	ws.Close()
}

// 송신 큐가 차서 끊을 때 호출자(방 고루틴)는 소켓 쓰기(최대 10초)를 기다리지 않는다 — Send 비차단 계약.
func TestSendQueueFullDoesNotBlock(t *testing.T) {
	a, b := net.Pipe() // 상대가 읽지 않으면 쓰기가 막히는 느린 청중 대역
	defer b.Close()
	s := newSession(&WSConn{c: a, r: bufio.NewReader(a), max: MaxMessage})
	done := make(chan struct{})
	go func() {
		for i := 0; i < sendQueue+10; i++ {
			s.Send(Notification{M: "x"})
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("큐 가득 참 처리에서 호출자가 막힘")
	}
	select {
	case <-s.done:
	default:
		t.Fatal("큐가 찼는데 세션이 끝나지 않음")
	}
}
