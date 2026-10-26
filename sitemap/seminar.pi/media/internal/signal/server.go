// WebSocket /signal 서버 — 연결 1개 = 세션 1개(읽기 고루틴 + 쓰기 고루틴). join(입장권) → Handler 위임, 생존 확인 20초 ping·45초 종료.
// RFC 6455 는 ws.go(표준 라이브러리 직접 구현). 근거 PRD_02 5절·D-9.
package signal

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// sendQueue — 세션 송신 큐 크기. 차면 느린 클라이언트로 보고 연결을 끊는다. [TBD : M2 실측]
const sendQueue = 128

// DevTicketEnabled — 개발용 입장(join 에 room·role 직접 지정). 운영이면 무조건 false(R-P6 가드 첫 줄).
func DevTicketEnabled() bool {
	if os.Getenv("NODE_ENV") == "production" || os.Getenv("MEDIA_ENV") == "production" {
		return false
	}
	return os.Getenv("MEDIA_DEV_TICKET") == "1"
}

type server struct {
	h       Handler
	v       *Verifier
	dev     bool
	origins map[string]bool // 비어 있으면 Origin 검사 안 함(개발)
}

// NewServer — /signal 핸들러. 연결마다 세션 고루틴 1개 : JoinTimeout 안에 join → v.Verify(개발용이면 생략) → h.Join, 이후 h.Request 로 위임.
// 환경변수 : MEDIA_ALLOWED_ORIGINS(쉼표), MEDIA_DEV_TICKET(DevTicketEnabled).
func NewServer(h Handler, v *Verifier) http.Handler {
	sv := &server{h: h, v: v, dev: DevTicketEnabled(), origins: map[string]bool{}}
	for _, o := range strings.Split(os.Getenv("MEDIA_ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			sv.origins[o] = true
		}
	}
	return sv
}

func (sv *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if len(sv.origins) > 0 && !sv.origins[r.Header.Get("Origin")] {
		// 거부한 Origin 을 남겨 MEDIA_ALLOWED_ORIGINS 를 맞출 수 있게 한다(브라우저는 403 본문을 보여주지 않음)
		log.Printf("origin 불허 : %q", r.Header.Get("Origin"))
		http.Error(w, "origin 불허", http.StatusForbidden)
		return
	}
	ws, err := Upgrade(w, r, MaxMessage)
	if err != nil {
		return
	}
	sv.serve(ws)
}

// session — Session 구현. out 은 직렬화된 봉투, nil 은 "여기까지 보내고 닫기" 표시.
type session struct {
	id       string
	ws       *WSConn
	out      chan []byte
	done     chan struct{}
	once     sync.Once
	lastRecv atomic.Int64 // UnixNano — 읽기 고루틴이 쓰고 쓰기 고루틴이 ping 판단에 읽음
	pingID   atomic.Int64
}

func newSession(ws *WSConn) *session {
	s := &session{id: rand.Text(), ws: ws, out: make(chan []byte, sendQueue), done: make(chan struct{})}
	s.lastRecv.Store(time.Now().UnixNano())
	return s
}

func (s *session) ID() string { return s.id }

// shutdown — done 을 닫고 소켓 닫기는 별도 고루틴에 맡긴다. ws.Close 는 쓰기 잠금(wmu)·쓰기 기한(최대 10초 ×2)을 기다릴 수 있어
// 호출자(방 고루틴의 Send·pion 후보 콜백)가 느린 청중 1명 때문에 멈추면 안 된다(Send 비차단 계약).
func (s *session) shutdown() {
	s.once.Do(func() {
		close(s.done)
		go func() { _ = s.ws.Close() }()
	})
}

// enqueue — 비차단. 큐가 차면 느린 클라이언트 → 연결 종료.
func (s *session) enqueue(b []byte) {
	select {
	case <-s.done:
		return
	default:
	}
	select {
	case s.out <- b:
	case <-s.done:
	default:
		log.Printf("signal: 세션 %s 송신 큐 가득 참 — 종료", s.id)
		s.shutdown()
	}
}

func (s *session) send(e Envelope) {
	b, err := json.Marshal(e)
	if err != nil {
		log.Printf("signal: 직렬화 실패 %v", err)
		return
	}
	s.enqueue(b)
}

func rawJSON(d any) json.RawMessage {
	if d == nil {
		return nil
	}
	b, err := json.Marshal(d)
	if err != nil {
		return nil
	}
	return b
}

// Send — 알림. 여러 고루틴 안전·비차단.
func (s *session) Send(n Notification) {
	s.send(Envelope{T: TypeNtf, M: n.M, D: rawJSON(n.D)})
}

// Close — ntf error 를 보내고, 큐에 쌓인 것까지 보낸 뒤 닫는다.
func (s *session) Close(code ErrCode) {
	s.Send(Notification{M: NError, D: Errf(code, "세션 종료")})
	s.enqueue(nil)
}

func (s *session) reply(id int64, d any, e *Error) {
	ok := e == nil
	s.send(Envelope{T: TypeRes, ID: id, OK: &ok, D: rawJSON(d), E: e})
}

// writeLoop — 쓰기 고루틴. 무수신 PingIdle 이면 ping 요청을 보낸다(응답은 아무 메시지나 수신으로 갱신).
func (s *session) writeLoop() {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	pinged := int64(0)
	for {
		select {
		case b := <-s.out:
			if b == nil {
				s.shutdown()
				return
			}
			if err := s.ws.WriteText(b); err != nil {
				s.shutdown()
				return
			}
		case now := <-t.C:
			last := s.lastRecv.Load()
			if now.Sub(time.Unix(0, last)) >= PingIdle && pinged != last {
				pinged = last
				s.send(Envelope{T: TypeReq, ID: s.pingID.Add(1), M: MPing, D: json.RawMessage("{}")})
			}
		case <-s.done:
			return
		}
	}
}

// read — 봉투 1개. 기한은 마지막 수신 + d.
func (s *session) read(d time.Duration) (Envelope, error) {
	var e Envelope
	_ = s.ws.SetReadDeadline(time.Now().Add(d))
	op, msg, err := s.ws.ReadMessage()
	if err != nil {
		return e, err
	}
	s.lastRecv.Store(time.Now().UnixNano())
	if op != opText {
		return e, errWSProtocol
	}
	err = json.Unmarshal(msg, &e)
	return e, err
}

func (sv *server) serve(ws *WSConn) {
	s := newSession(ws)
	wdone := make(chan struct{})
	go func() { s.writeLoop(); close(wdone) }()
	defer func() { // 쌓인 응답·오류 알림을 다 보낸 뒤 닫는다
		s.enqueue(nil)
		select {
		case <-wdone:
		case <-time.After(writeTimeout):
		}
		s.shutdown()
	}()

	// ① join — JoinTimeout 안에 첫 메시지가 join 요청이어야 한다
	env, err := s.read(JoinTimeout)
	if err != nil {
		return
	}
	if env.T != TypeReq || env.M != MJoin {
		s.reply(env.ID, nil, Errf(CodeTicketInvalid, "첫 메시지는 join"))
		s.enqueue(nil)
		return
	}
	t, e := sv.authenticate(env.D)
	if e == nil {
		var res JoinRes
		if res, e = sv.h.Join(s, t); e == nil {
			s.reply(env.ID, res, nil)
		}
	}
	if e != nil {
		s.reply(env.ID, nil, e)
		s.enqueue(nil)
		return
	}
	defer sv.h.Left(s)

	// ② 요청 처리 — 아무것도 받지 못한 채 DeadIdle 이 지나면 읽기 기한 초과로 종료
	for {
		env, err := s.read(DeadIdle)
		if err != nil {
			return
		}
		switch env.T {
		case TypeReq:
			switch env.M {
			case MPing:
				s.reply(env.ID, struct{}{}, nil)
			case MLeave:
				s.reply(env.ID, struct{}{}, nil)
				s.enqueue(nil)
				return
			default:
				d, e := sv.h.Request(s, env.M, env.D)
				if end, ok := d.(EndSession); ok && e == nil {
					s.reply(env.ID, end.D, nil)
					s.Close(end.Code)
					return
				}
				s.reply(env.ID, d, e)
			}
		case TypeNtf: // 클라이언트 알림(trickle 등) — 응답 없음
			if _, e := sv.h.Request(s, env.M, env.D); e != nil {
				log.Printf("signal: 알림 %s 처리 실패 %v", env.M, e)
			}
		}
		// TypeRes(서버 ping 응답)는 수신 시각 갱신만으로 충분
	}
}

// devJoin — 개발용 join 데이터(DevTicketEnabled 일 때만 받는다).
type devJoin struct {
	Ticket string `json:"ticket"`
	Room   string `json:"room"`
	Role   Role   `json:"role"`
	Name   string `json:"name"`
	Sub    string `json:"sub"`
	Cap    int    `json:"cap"`
}

// DevCap — 개발용 입장의 기본 정원(발표 1 + 청중 30).
const DevCap = 31

// authenticate — 입장권 검증. 입장권이 없고 개발 모드면 room·role 을 그대로 받는다.
func (sv *server) authenticate(d json.RawMessage) (Ticket, *Error) {
	var j devJoin
	if err := json.Unmarshal(d, &j); err != nil {
		time.Sleep(FailDelay)
		return Ticket{}, Errf(CodeTicketInvalid, "join 데이터 해석 실패")
	}
	now := time.Now()
	if j.Ticket == "" && sv.dev && j.Room != "" {
		if j.Role != RolePresenter && j.Role != RolePanel && j.Role != RoleAudience {
			return Ticket{}, Errf(CodeRoleForbidden, "알 수 없는 역할")
		}
		if j.Sub == "" {
			j.Sub = rand.Text()
		}
		if j.Cap <= 0 {
			j.Cap = DevCap
		}
		return Ticket{Aud: Audience, Room: j.Room, Sub: j.Sub, Name: j.Name, Role: j.Role, Cap: j.Cap,
			Iat: now.Unix(), Exp: now.Add(TicketTTL).Unix(), Jti: rand.Text()}, nil
	}
	if sv.v == nil {
		time.Sleep(FailDelay)
		return Ticket{}, Errf(CodeTicketInvalid, "입장권 검증기 없음")
	}
	t, err := sv.v.Verify(j.Ticket, now)
	if err != nil {
		var se *Error
		if errors.As(err, &se) {
			return Ticket{}, se
		}
		return Ticket{}, Errf(CodeTicketInvalid, err.Error())
	}
	return t, nil
}
