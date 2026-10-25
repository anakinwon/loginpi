// 혼잡 판정 — REMB 하락 추세(Kendall 순위상관)·NACK 비율 창, 회복 탐침 간격 조절(PRD_02 3.3 bwe·D-7, REA_03 5.7·5.8). Allocator 이벤트 고루틴 전용.
package bwe

import "time"

// 판정 상수(REA_03 5.7 LiveKit 기본값을 초기값으로) [TBD : M4 T4 실측으로 조정]
const (
	trendMaxSamples   = 12
	trendMinSamples   = 8
	trendThreshold    = -0.6
	probeTrendSamples = 3 // 탐침 중
	probeTrendThresh  = 0.0
	collapseWindow    = 500 * time.Millisecond // 같은 값 반복 정리

	nackWindowMin   = 2 * time.Second
	nackRatioThresh = 0.08
	probeNackWindow = 500 * time.Millisecond
	probeNackThresh = 0.04
	nackMinSent     = 50 // 표본이 너무 적은 창은 판정 안 함 [TBD]
)

// trend — REMB 표본(시간순). 기울기 대신 Kendall 순위상관으로 이상값에 강하게.
type trend struct {
	vals   []int64
	lastAt time.Time
}

func (t *trend) reset() { t.vals = t.vals[:0] }

// add — 같은 값이 500ms 안에 반복되면 버린다.
func (t *trend) add(v int64, now time.Time) {
	if n := len(t.vals); n > 0 && t.vals[n-1] == v && now.Sub(t.lastAt) < collapseWindow {
		return
	}
	t.lastAt = now
	if len(t.vals) == trendMaxSamples {
		copy(t.vals, t.vals[1:])
		t.vals = t.vals[:trendMaxSamples-1]
	}
	t.vals = append(t.vals, v)
}

// falling — 하락 추세인가(평시 표본 8개 이상·τ<−0.6, 탐침 중 3개 이상·τ<0).
func (t *trend) falling(probing bool) bool {
	minN, th := trendMinSamples, trendThreshold
	if probing {
		minN, th = probeTrendSamples, probeTrendThresh
	}
	return len(t.vals) >= minN && kendall(t.vals) < th
}

// kendall — x = 시간 순서, y = 값. τ = (일치 − 불일치) / 쌍 수. 같은 값은 어느 쪽도 아님.
func kendall(v []int64) float64 {
	n := len(v)
	if n < 2 {
		return 0
	}
	c := 0
	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			switch {
			case v[j] > v[i]:
				c++
			case v[j] < v[i]:
				c--
			}
		}
	}
	return float64(c) / float64(n*(n-1)/2)
}

// nackWindow — 창(평시 2초, 탐침 중 0.5초) 동안 보낸 패킷·반복(재전송) 수.
type nackWindow struct {
	start          time.Time
	sent, repeated uint64
}

func (w *nackWindow) reset(now time.Time) { *w = nackWindow{start: now} }

// add — 창이 차면 비율과 혼잡 여부를 돌려주고 새 창을 연다. 덜 찼으면 done=false.
func (w *nackWindow) add(sent, repeated uint32, now time.Time, probing bool) (ratio float64, congested, done bool) {
	if w.start.IsZero() {
		w.start = now
	}
	w.sent += uint64(sent)
	w.repeated += uint64(repeated)
	win, th := nackWindowMin, nackRatioThresh
	if probing {
		win, th = probeNackWindow, probeNackThresh
	}
	if now.Sub(w.start) < win {
		return 0, false, false
	}
	if w.sent >= nackMinSent {
		ratio = float64(w.repeated) / float64(w.sent)
	}
	w.reset(now)
	return ratio, ratio > th, true
}

// 탐침 간격(REA_03 5.8) : 3초 시작, 실패 시 1.5배, 최대 2분. 탐침 길이 [TBD : 정착 대기 RTT×5 적용 전 고정값]
const (
	probeInterval    = 3 * time.Second
	probeIntervalMax = 2 * time.Minute
	probeBackoff     = 1.5
	probeDuration    = 2 * time.Second
	probeMinBps      = 200_000
	probeGainFactor  = 1.2
)

// prober — 패딩 탐침 상태기계 : 대기 → 탐침(probeDuration) → 성공(간격 초기화)/실패(1.5배).
type prober struct {
	active    bool
	goal      int64 // 추가로 보낼 bps
	endAt     time.Time
	nextAt    time.Time
	interval  time.Duration
	congested bool // 탐침 중 혼잡이 판정됐나
	startREMB int64
}

func (p *prober) stop() {
	p.active, p.congested = false, false
	p.interval = 0
	p.nextAt = time.Time{}
}

func (p *prober) due(now time.Time) bool { return !p.active && !now.Before(p.nextAt) }

func (p *prober) start(now time.Time, goal, remb int64) {
	if p.interval == 0 {
		p.interval = probeInterval
	}
	p.active, p.congested, p.goal, p.startREMB = true, false, goal, remb
	p.endAt = now.Add(probeDuration)
}

// finish — 탐침 종료. 성공이면 간격 초기화, 실패면 1.5배(최대 2분).
func (p *prober) finish(now time.Time, ok bool) {
	p.active = false
	if ok {
		p.interval = probeInterval
	} else {
		p.interval = time.Duration(float64(p.interval) * probeBackoff)
		if p.interval > probeIntervalMax {
			p.interval = probeIntervalMax
		}
	}
	p.nextAt = now.Add(p.interval)
}
