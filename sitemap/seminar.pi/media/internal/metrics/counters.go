// 엔진 전역 카운터(PRD_02 3.3 metrics, K-5 Q7·Q8). M2 수집 지점 : NACKIn·Retransmits·DuplicateNACK·CacheMiss = jeju/retransmit.go,
// NACKOut·PLIOut = santorini/feedback.go, QueueDrops = forward/congest.go. PacketsIn·Keyframes = santorini/layer.go handle, PacketsOut = jeju send, LayerSwitches = jeju 전환.
// 구독자·레이어별 분해는 [TBD : M4 비교에서 필요해지면].
package metrics

import "sync/atomic"

// Counters — 모든 필드는 atomic. 어느 고루틴이든 Add 해도 된다.
type Counters struct {
	PacketsIn     atomic.Uint64
	PacketsOut    atomic.Uint64
	NACKIn        atomic.Uint64 // 청중 → 서버
	NACKOut       atomic.Uint64 // 서버 → 발표자
	Retransmits   atomic.Uint64
	DuplicateNACK atomic.Uint64
	CacheMiss     atomic.Uint64
	PLIOut        atomic.Uint64 // 발표자에게 보낸 PLI(Q8)
	Keyframes     atomic.Uint64
	LayerSwitches atomic.Uint64
	QueueDrops    atomic.Uint64
}

// Global — 엔진 전체 카운터. M2 에서 수집 지점 연결.
var Global Counters

// Snapshot — 현재 값 복사(관리 API GET /admin/metrics 가 JSON 으로 내보낸다). schema.pi 적재는 [TBD : M5 export].
func (c *Counters) Snapshot() map[string]uint64 {
	return map[string]uint64{
		"packetsIn": c.PacketsIn.Load(), "packetsOut": c.PacketsOut.Load(),
		"nackIn": c.NACKIn.Load(), "nackOut": c.NACKOut.Load(),
		"retransmits": c.Retransmits.Load(), "duplicateNack": c.DuplicateNACK.Load(), "cacheMiss": c.CacheMiss.Load(),
		"pliOut": c.PLIOut.Load(), "keyframes": c.Keyframes.Load(), "layerSwitches": c.LayerSwitches.Load(),
		"queueDrops": c.QueueDrops.Load(),
	}
}
