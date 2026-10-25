// 연결 품질 점수 — LiveKit 과 같은 식(REA_03 5.10)이어야 K-5 비교가 공정하다(M4).
// Score 는 순수 함수(창 1개 → 원점수), Scorer 는 5초마다 Update 하는 평활 상태(소유 고루틴 1개 전용).
package metrics

import (
	"math"
	"time"
)

// 점수 상수(REA_03 5.10)
const (
	scoreFloor       = 30.0
	lossWeightVideo  = 10.0
	lossWeightAudio  = 8.0 // Opus
	layerPenalty     = 35.0
	bitrateLogWeight = 20.0
	fallWeight       = 0.8 // 하강 : 새 값 가중 크게(빠르게)
	riseWeight       = 0.4 // 상승 : 느리게
)

// Sample — 점수 계산 입력(5초 창).
type Sample struct {
	LossRatio     float64 // 0~1(순서 뒤바뀜·상류 손실 제외)
	RTT           time.Duration
	Jitter        time.Duration
	BitrateRatio  float64 // 실제/기대 비트레이트(영상). 0 이하 = 계산 안 함
	LayerDistance int8    // 원하는 레이어까지 남은 단계(영상, 0 = 도달)
	Audio         bool    // true 면 손실 가중 Opus(8), 비트레이트·레이어 점수 없음
}

// Score — 원점수(30~100)와 등급("excellent"|"good"|"poor"|"lost"). 패킷·비트레이트·레이어 점수 중 최소.
func Score(s Sample) (score float64, grade string) {
	score = math.Max(scoreFloor, math.Min(rawScore(s), 100))
	return score, Grade(score)
}

func rawScore(s Sample) float64 {
	// 패킷 점수 = 100 − 지연 효과 − 손실 효과
	v := float64(s.RTT/2+2*s.Jitter) / float64(time.Millisecond)
	delay := v / 40
	if v > 160 {
		delay = (v - 120) / 10
	}
	w := lossWeightVideo
	if s.Audio {
		w = lossWeightAudio
	}
	score := 100 - delay - s.LossRatio*100*w
	if s.Audio {
		return score
	}
	if s.BitrateRatio > 0 && s.BitrateRatio < 1 { // 100 − 20·ln(기대/실제)
		score = math.Min(score, 100+bitrateLogWeight*math.Log(s.BitrateRatio))
	}
	if s.LayerDistance > 0 {
		score = math.Min(score, 100-layerPenalty*float64(s.LayerDistance))
	}
	return score
}

// Grade — >80 excellent, >40 good, >20 poor, 그 이하 lost.
func Grade(score float64) string {
	switch {
	case score > 80:
		return "excellent"
	case score > 40:
		return "good"
	case score > 20:
		return "poor"
	}
	return "lost"
}

// Scorer — 5초마다 Update. 하강은 빠르게(새 값 0.8), 상승은 느리게(0.4).
type Scorer struct {
	score float64
	init  bool
}

// Update — 평활 점수와 등급.
func (sc *Scorer) Update(s Sample) (score float64, grade string) {
	raw, _ := Score(s)
	switch {
	case !sc.init:
		sc.score, sc.init = raw, true
	case raw < sc.score:
		sc.score += fallWeight * (raw - sc.score)
	default:
		sc.score += riseWeight * (raw - sc.score)
	}
	return sc.score, Grade(sc.score)
}
