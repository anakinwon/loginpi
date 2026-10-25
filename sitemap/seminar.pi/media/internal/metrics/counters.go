// 엔진 전역 카운터(PRD_02 3.3 metrics). 구독자·레이어별 분해는 M2 가 필요할 때 추가한다.
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
