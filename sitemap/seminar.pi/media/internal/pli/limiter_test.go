// pli.Limiter 단위 테스트 — 합침·최소 간격·키프레임 해제(실행 : go test ./internal/pli)
package pli

import (
	"testing"
	"time"
)

func TestLimiter(t *testing.T) {
	t0 := time.Unix(1000, 0)
	l := NewLimiter(0)
	steps := []struct {
		at   time.Duration
		need bool
		key  bool
		want bool
	}{
		{0, false, false, false},                     // 요청 없음
		{0, true, false, true},                       // 첫 요청 즉시
		{100 * time.Millisecond, true, false, false}, // 간격 안 → 합침
		{600 * time.Millisecond, false, false, true}, // 키프레임 안 옴 → 간격 뒤 재요청
		{700 * time.Millisecond, false, true, false}, // 키프레임 도착 → 해제
		{2 * time.Second, false, false, false},
	}
	for i, s := range steps {
		if s.need {
			l.Need(SubscriberPLI)
		}
		if s.key {
			l.KeyframeSeen()
		}
		if got := l.Tick(t0.Add(s.at)); got != s.want {
			t.Errorf("단계 %d : Tick=%v, 기대 %v", i, got, s.want)
		}
	}
}
