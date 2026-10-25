// SendMeta — 하류(구독자별) 메타 링 : 출력 순번 → 원본 extSeq·레이어·송신 시각·재전송 횟수. min(100ms,2RTT) 억제·최대 3회(PRD_02 D-4).
package nack

import "time"

// SendMeta — jeju 송신 고루틴 전용(잠금 없음).
type SendMeta struct{} // M2 에서 구현

// NewSendMeta — size 개 링. [TBD : M2 — 영상 512 기준]
func NewSendMeta(size int) *SendMeta { return &SendMeta{} }

// Push — 보낸 패킷 기록. M2 에서 구현.
func (m *SendMeta) Push(out uint16, src uint64, layer int8, at time.Time) {}

// Resolve — 청중 NACK 의 출력 순번을 원본으로 되돌린다. 억제 간격 안이거나 3회 초과면 ok=false. M2 에서 구현.
func (m *SendMeta) Resolve(out uint16, now time.Time, rtt time.Duration) (src uint64, layer int8, ok bool) {
	return 0, 0, false
}
