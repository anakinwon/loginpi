// 품질 점수 표 형식 테스트(M4) — 손실·지연·비트레이트·레이어 거리·평활(실행 : go test ./internal/metrics)
package metrics

import (
	"math"
	"testing"
	"time"
)

func TestScore(t *testing.T) {
	ms := time.Millisecond
	cases := []struct {
		name  string
		s     Sample
		want  float64
		grade string
	}{
		{"완벽", Sample{}, 100, "excellent"},
		{"RTT 80ms 지터 0 → 지연 1", Sample{RTT: 80 * ms}, 99, "excellent"},
		{"지연값 200ms → (200−120)/10=8", Sample{RTT: 200 * ms, Jitter: 50 * ms}, 92, "excellent"},
		{"영상 손실 2% → 20", Sample{LossRatio: 0.02}, 80, "good"},
		{"음성 손실 2% → 16", Sample{LossRatio: 0.02, Audio: true}, 84, "excellent"},
		{"비트레이트 절반 → 100+20ln0.5", Sample{BitrateRatio: 0.5}, 100 + 20*math.Log(0.5), "excellent"},
		{"레이어 거리 1 → 65", Sample{LayerDistance: 1}, 65, "good"},
		{"레이어 거리 2 → 30", Sample{LayerDistance: 2}, 30, "poor"},
		{"손실 20% → 하한 30", Sample{LossRatio: 0.2}, 30, "poor"},
		{"음성은 레이어 무시", Sample{LayerDistance: 2, Audio: true}, 100, "excellent"},
	}
	for _, c := range cases {
		got, g := Score(c.s)
		if math.Abs(got-c.want) > 1e-9 || g != c.grade {
			t.Errorf("%s : %.3f %s, 기대 %.3f %s", c.name, got, g, c.want, c.grade)
		}
	}
}

func TestScorerSmoothing(t *testing.T) {
	var sc Scorer
	steps := []struct {
		s    Sample
		want float64
	}{
		{Sample{}, 100},
		{Sample{LayerDistance: 2}, 100 + 0.8*(30-100)}, // 44 : 빠르게 하강
		{Sample{}, 44 + 0.4*(100-44)},                  // 66.4 : 느리게 상승
	}
	for i, st := range steps {
		if got, _ := sc.Update(st.s); math.Abs(got-st.want) > 1e-9 {
			t.Errorf("단계 %d : %.3f, 기대 %.3f", i, got, st.want)
		}
	}
}
