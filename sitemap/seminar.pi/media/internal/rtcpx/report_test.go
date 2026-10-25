// rtcpx 단위 테스트 — LSR/DLSR RTT 계산 경계값(실행 : go test ./internal/rtcpx)
package rtcpx

import (
	"testing"
	"time"
)

func TestRTT(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	lsrAt := func(d time.Duration) uint32 { return uint32(NTPTime(now.Add(-d)) >> 16) }
	cases := []struct {
		name      string
		lsr, dlsr uint32
		min, max  time.Duration
	}{
		{"LSR 없음", 0, 0, 0, 0},
		{"100ms, 지연 0", lsrAt(100 * time.Millisecond), 0, 99 * time.Millisecond, 101 * time.Millisecond},
		{"300ms, DLSR 200ms", lsrAt(300 * time.Millisecond), 65536 / 5, 99 * time.Millisecond, 101 * time.Millisecond},
		{"DLSR 가 더 큼 → 0", lsrAt(10 * time.Millisecond), 65536, 0, 0},
	}
	for _, c := range cases {
		if got := RTT(c.lsr, c.dlsr, now); got < c.min || got > c.max {
			t.Errorf("%s : %v, 기대 %v~%v", c.name, got, c.min, c.max)
		}
	}
}
