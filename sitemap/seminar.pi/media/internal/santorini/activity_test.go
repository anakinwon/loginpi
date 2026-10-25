// 레이어 활성·비트레이트 표 형식 테스트(M4) — 연속 주기 판정·빈 주기 정지·비트레이트(실행 : go test ./internal/santorini)
package santorini

import (
	"testing"
	"time"
)

func TestActivity(t *testing.T) {
	cases := []struct {
		name   string
		idx    int8
		perPer int           // 주기당 패킷 수
		dur    time.Duration // 보낸 시간
		gapAt  time.Duration // 이 시점 이후 1초 쉼(0 = 없음)
		want   bool
	}{
		{"레이어0 2초 연속 → 활성", 0, 1, 2600 * time.Millisecond, 0, true},
		{"레이어0 1초 → 아직", 0, 1, 1100 * time.Millisecond, 0, false},
		{"레이어2 주기당 5개 10초 → 활성", 2, 5, 10600 * time.Millisecond, 0, true},
		{"레이어2 주기당 4개 → 미달", 2, 4, 11 * time.Second, 0, false},
		{"레이어2 8초 → 아직", 2, 5, 8 * time.Second, 0, false},
		{"레이어0 중간 1초 빈 구간 → 재시작", 0, 1, 3 * time.Second, 1500 * time.Millisecond, false},
	}
	for _, c := range cases {
		l := newLayer(c.idx, Video, nil)
		start := time.Now().Add(-c.dur - 50*time.Millisecond)
		step := actPeriod / time.Duration(c.perPer)
		gapped := false
		for at := time.Duration(0); at < c.dur; at += step {
			if c.gapAt > 0 && at >= c.gapAt && !gapped {
				at += time.Second
				gapped = true
			}
			l.observe(1000, start.Add(at))
		}
		if got := l.act.active.Load(); got != c.want {
			t.Errorf("%s : active=%v, 기대 %v", c.name, got, c.want)
		}
	}
}

func TestActivityStaleAndBitrate(t *testing.T) {
	l := newLayer(0, Video, nil)
	start := time.Now().Add(-3 * time.Second)
	// 100패킷/초 × 1000B = 800kbps, 2.5초
	for at := time.Duration(0); at <= 2500*time.Millisecond; at += 10 * time.Millisecond {
		l.observe(1000, start.Add(at))
	}
	if br := l.act.bitrate.Load(); br < 790_000 || br > 810_000 {
		t.Errorf("비트레이트 %d, 기대 약 800000", br)
	}
	if !l.act.active.Load() {
		t.Fatal("2.5초 연속인데 비활성")
	}
	// 마지막 패킷이 0.5초 전 → 아직 활성, 이후 오래 조용하면 정지·0bps
	if l.act.stale(start.Add(2900 * time.Millisecond)) {
		t.Error("0.4초 조용한데 stale")
	}
	if !l.act.stale(start.Add(4 * time.Second)) {
		t.Error("1.5초 조용한데 stale 아님")
	}
}
