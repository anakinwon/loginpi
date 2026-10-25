// 연결 품질 점수 — LiveKit 과 같은 식(REA_03 5.10)이어야 K-5 비교가 공정하다. M4 에서 구현.
package metrics

import "time"

// Sample — 점수 계산 입력(5초 창).
type Sample struct {
	LossRatio    float64 // 0~1
	RTT          time.Duration
	Jitter       time.Duration
	BitrateRatio float64 // 실제/기대 비트레이트 0~1(영상)
}

// Score — 품질 점수와 등급("excellent"|"good"|"poor"|"lost"). M1~M3 : 0, "" (미계산). M4 에서 구현.
func Score(s Sample) (score float64, grade string) { return 0, "" }
