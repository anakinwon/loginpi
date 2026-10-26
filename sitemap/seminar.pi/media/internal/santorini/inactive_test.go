// M3 ⑥ 레이어 비활성 감지 — 공개 Active()·Bitrate() 가 "연속 주기 충족 + 최근 패킷" 둘 다 볼 때만 활성인지(PRD_02 3.3 santorini, REA_03 5.5).
// 실행 : go test ./internal/santorini
package santorini

import (
	"testing"
	"time"
)

func TestLayerInactiveDetection(t *testing.T) {
	cases := []struct {
		name       string
		feed       time.Duration // 레이어 0 에 10ms 간격으로 보낸 시간(0 = 안 보냄)
		quietFor   time.Duration // 마지막 패킷 뒤 지금까지 조용한 시간
		wantActive bool
		wantRate   bool // Bitrate > 0
	}{
		{"패킷 없음", 0, 0, false, false},
		{"2.5초 연속 · 방금 받음", 2500 * time.Millisecond, 100 * time.Millisecond, true, true},
		{"2.5초 연속 · 1.5초 조용 → 비활성·0bps", 2500 * time.Millisecond, 1500 * time.Millisecond, false, false},
		{"1초만 · 방금 받음 → 아직", time.Second, 100 * time.Millisecond, false, true},
	}
	for _, c := range cases {
		l := newLayer(0, Video, nil)
		if c.feed > 0 {
			start := time.Now().Add(-c.quietFor - c.feed)
			for at := time.Duration(0); at <= c.feed; at += 10 * time.Millisecond {
				l.observe(1000, start.Add(at))
			}
		}
		if got := l.Active(); got != c.wantActive {
			t.Errorf("%s : Active=%v 기대 %v", c.name, got, c.wantActive)
		}
		if got := l.Bitrate() > 0; got != c.wantRate {
			t.Errorf("%s : Bitrate=%d (>0 기대 %v)", c.name, l.Bitrate(), c.wantRate)
		}
	}
}
