// 탐침 자체 점검 — wss 클라이언트 프레이밍(7·16·64비트 길이, 마스킹)을 엔진 WS 서버(signal.Upgrade)와 맞대고, env 파일 같은 키 마지막 줄 규칙을 본다.
// 실행 : go test ./tools/probe (네트워크 = 로컬 루프백만)
package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"seminar.pi/media/internal/signal"
)

func TestWSRoundTrip(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := signal.Upgrade(w, r, 1<<20)
		if err != nil {
			return
		}
		for {
			_, m, err := ws.ReadMessage()
			if err != nil {
				return
			}
			_ = ws.WriteText(m)
		}
	}))
	defer srv.Close()
	c, err := dialWS("ws"+strings.TrimPrefix(srv.URL, "http")+"/signal", defaultOrigin)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	for _, n := range []int{5, 100, 70000} { // 바이트 15·300·210000 → 길이 7비트·16비트·64비트
		want := strings.Repeat("가", n)
		if err := c.write(1, []byte(want)); err != nil {
			t.Fatal(err)
		}
		got, err := c.read()
		if err != nil || string(got) != want {
			t.Fatalf("%d자 왕복 실패 : %v (받은 %d바이트)", n, err, len(got))
		}
	}
}

// 관리 API 가 401·200([]) 을 줄 때, 평문 ws:// 원격 주소일 때 cleanup 결과 문구(401 이 "없음"으로 통과해 보이던 결함 회귀).
func TestCleanupStatus(t *testing.T) {
	var code atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if code.Load() != http.StatusOK {
			http.Error(w, "unauthorized", int(code.Load()))
			return
		}
		_, _ = w.Write([]byte("[]"))
	}))
	defer srv.Close()
	local := "ws" + strings.TrimPrefix(srv.URL, "http") + "/signal"
	key := []byte(strings.Repeat("k", signal.MinSecret))
	for _, c := range []struct {
		code      int32
		url, want string
	}{
		{http.StatusUnauthorized, local, "확인 불가"},
		{http.StatusOK, local, "없음(엔진 방 0개)"},
		{http.StatusOK, "ws://203.0.113.1/signal", "보내지 않음"},
	} {
		code.Store(c.code)
		if got := cleanup(c.url, key); !strings.Contains(got, c.want) {
			t.Fatalf("응답 %d %s : %q 에 %q 없음", c.code, c.url, got, c.want)
		}
	}
}

// 같은 순번은 한 번만, 순번이 한 바퀴 돌면 다시 센다.
func TestFreshSeq(t *testing.T) {
	seen := make([]bool, 1<<16)
	if !fresh(seen, 7) || fresh(seen, 7) {
		t.Fatal("중복 순번 제거 실패")
	}
	for s := 8; s < 8+1<<16; s++ { // 한 바퀴(8 → 65535 → 0 → 7, 마지막 7 은 처음 본 7 이 지워진 뒤)
		if !fresh(seen, uint16(s)) {
			t.Fatalf("순번 %d 를 새 패킷으로 세지 않음", uint16(s))
		}
	}
}

func TestSecretFromLastLine(t *testing.T) {
	t.Setenv("MEDIA_TOKEN_SECRET", "")
	f := filepath.Join(t.TempDir(), ".env")
	old, cur := strings.Repeat("a", 64), strings.Repeat("b", 43)
	if err := os.WriteFile(f, []byte("MEDIA_TOKEN_SECRET="+old+"\r\nX=1\nMEDIA_TOKEN_SECRET=\""+cur+"\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := string(secretFrom(f, "MEDIA_TOKEN_SECRET")); got != cur {
		t.Fatalf("마지막 줄(43자)이 아님 : 길이 %d", len(got))
	}
}
