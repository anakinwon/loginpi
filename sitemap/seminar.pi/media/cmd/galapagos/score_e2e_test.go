// ntf score e2e(M4, SIGNAL_API 3.4) — 청중 봇 2명 중 하나가 RR 손실 25% 를 보고하면 그 봇만 등급 변화 알림을 받고, 회복하면 excellent 로 돌아온다.
// 좋은 연결 봇은 알림 0건, 같은 등급 연속 알림 없음. 주기는 시험에서만 300ms 로 줄인다. 실행 : go test ./cmd/galapagos -run Score -v
package main

import (
	"testing"
	"time"

	"seminar.pi/media/internal/jeju"
	"seminar.pi/media/internal/signal"
)

func (s *subBot) gotScores() []signal.ScoreNtf {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]signal.ScoreNtf(nil), s.scores...)
}

// waitGrade — d 안에 마지막 등급이 want 가 되면 true.
func waitGrade(s *subBot, want string, d time.Duration) bool {
	for end := time.Now().Add(d); time.Now().Before(end); time.Sleep(50 * time.Millisecond) {
		if sc := s.gotScores(); len(sc) > 0 && sc[len(sc)-1].Grade == want {
			return true
		}
	}
	return false
}

func TestScoreNotify(t *testing.T) {
	old := jeju.ScoreInterval
	jeju.ScoreInterval = 300 * time.Millisecond // 엔진 시작 전에만 바꾼다(Consumer 가 시작할 때 읽음)
	t.Cleanup(func() { jeju.ScoreInterval = old })
	url := startEngine(t)
	startPublisher(t, url, newLossyConn(t, clean(), clean()))
	good := startSubscriber(t, url, "a1", newLossyConn(t, clean(), clean()), 0)
	bad := startSubscriber(t, url, "a2", newLossyConn(t, clean(), clean()), 0)
	good.waitFirst(t)
	bad.waitFirst(t)
	time.Sleep(time.Second) // 첫 판정(excellent = 기준값, 알림 없음)

	bad.rrLoss.Store(64) // 25%
	if !waitGrade(bad, "poor", 6*time.Second) {
		t.Fatalf("poor 미수신 : %+v", bad.gotScores())
	}
	bad.rrLoss.Store(0)
	if !waitGrade(bad, "excellent", 10*time.Second) {
		t.Fatalf("회복 excellent 미수신 : %+v", bad.gotScores())
	}
	sc := bad.gotScores()
	for i := 1; i < len(sc); i++ {
		if sc[i].Grade == sc[i-1].Grade {
			t.Errorf("같은 등급 연속 알림 : %+v", sc)
		}
	}
	if sc[0].ConsumerID == "" {
		t.Errorf("consumerId 없음 : %+v", sc[0])
	}
	if g := good.gotScores(); len(g) != 0 {
		t.Errorf("좋은 연결에 알림 : %+v", g)
	}
	t.Logf("a2 등급 변화 : %+v", sc)
}
