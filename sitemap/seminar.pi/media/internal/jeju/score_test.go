// ntf score 등급 변화 판정 표 형식 테스트(M4, SIGNAL_API 3.4) — 등급이 바뀔 때만·판정 보류·RR 끊김 lost. 실행 : go test ./internal/jeju -run Quality
package jeju

import (
	"testing"
	"time"

	"seminar.pi/media/internal/metrics"
)

func TestQualityTick(t *testing.T) {
	bad := metrics.Sample{LossRatio: 0.25} // 원점수 30(하한)
	type step struct {
		pkts    uint32
		sinceRR time.Duration
		s       metrics.Sample
		grade   string
		changed bool
	}
	cases := []struct {
		name  string
		steps []step
	}{
		{"좋은 연결은 알림 0건", []step{{10, 0, metrics.Sample{}, "excellent", false}, {20, 0, metrics.Sample{}, "excellent", false}}},
		{"RR 전·보낸 것 없음 = 보류", []step{{10, -1, bad, "excellent", false}, {10, 0, bad, "excellent", false}}},
		{"하강 빠르게·상승 느리게, 바뀔 때만", []step{
			{10, 0, metrics.Sample{}, "excellent", false},
			{20, 0, bad, "good", true},  // 100 → 44
			{30, 0, bad, "poor", true},  // 44 → 32.8
			{40, 0, bad, "poor", false}, // 같은 등급 = 알림 없음
			{50, 0, metrics.Sample{}, "good", true},
		}},
		{"RR 10초 넘게 끊김 = lost, 다시 오면 회복", []step{
			{10, 0, metrics.Sample{}, "excellent", false},
			{20, rrLostAfter + time.Second, metrics.Sample{}, "lost", true},
			{30, 0, metrics.Sample{}, "excellent", true},
		}},
	}
	for _, c := range cases {
		var q quality
		for i, st := range c.steps {
			_, g, ch := q.tick(st.pkts, st.sinceRR, st.s)
			if g != st.grade || ch != st.changed {
				t.Errorf("%s 단계 %d : %s %v, 기대 %s %v", c.name, i, g, ch, st.grade, st.changed)
			}
		}
	}
}
