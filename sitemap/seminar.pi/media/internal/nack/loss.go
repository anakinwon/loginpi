// LossTracker — 상류(발표자 방향) 손실 추적. 첫 NACK 20ms(2~24패킷)·최근 4패킷 제외, 이후 RTT 간격·최대 10회, 넘치면 PLI(PRD_02 D-4).
package nack

import (
	"time"

	"github.com/pion/rtcp"
)

// MaxPendingNACK — 대기 NACK 상한 초안(LiveKit 5000 → 30명 규모 축소, PRD_02 3.3 nack). [TBD : M2 실측]
const MaxPendingNACK = 1000

// LossTracker — 레이어 수신 고루틴 전용(잠금 없음).
type LossTracker struct{} // M2 에서 구현

// NewLossTracker — 레이어당 1개.
func NewLossTracker() *LossTracker { return &LossTracker{} }

// Receive — 수신 순번 기록(순서 뒤바뀜 포함). M2 에서 구현.
func (t *LossTracker) Receive(extSeq uint64, key bool) {}

// Due — 지금 상류로 보낼 NACK 묶음. M1 : 없음. M2 에서 구현.
func (t *LossTracker) Due(now time.Time, rtt time.Duration) []rtcp.NackPair { return nil }

// Overflow — 상한 초과(키프레임 이전 정리 후에도) → 호출자가 PLI 요청. M2 에서 구현.
func (t *LossTracker) Overflow() bool { return false }
