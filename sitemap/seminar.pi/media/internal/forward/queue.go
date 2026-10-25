// 구독자별 크기 제한 큐(기본 32). 비차단 Offer — 차면 congest.go 규칙으로 버린다.
package forward

import (
	"sync/atomic"
	"time"
)

// QueueSize — 구독자 큐 초기 크기(PRD_02 3.3 forward). [TBD : M2 실측]
const QueueSize = 32

// Item — 큐 항목. 본문은 santorini 레이어 캐시(nack.PacketCache)에 있고 여기엔 위치만 담는다.
type Item struct {
	ExtSeq uint64    // 64비트 확장 순번(rtpx.SeqExtender)
	Idx    uint16    // 캐시 슬롯 위치(nack.PacketCache.Store 반환값)
	Key    bool      // 키프레임 첫 조각
	Marker bool      // 프레임 마지막 조각
	Layer  int8      // simulcast 레이어 0/1/2(rid l/m/h), 단일 레이어는 0
	At     time.Time // 수신 시각(전달 지연 Q9 측정)
}

// Queue — 구독자 × 트랙 1개당 1개.
type Queue struct {
	ch      chan Item
	needKey atomic.Bool   // 버림이 생겨 키프레임이 필요함(소비 고루틴이 TakeKeyframeNeed 로 꺼냄)
	dropped atomic.Uint64 // 누적 버림 수(metrics)
	cong    congestion    // M2 congest.go 소유 상태
}

// NewQueue — size<=0 이면 QueueSize.
func NewQueue(size int) *Queue {
	if size <= 0 {
		size = QueueSize
	}
	return &Queue{ch: make(chan Item, size)}
}

// Offer — 비차단 투입. 버렸으면 true. 여러 레이어 고루틴이 동시에 불러도 안전해야 한다.
func (q *Queue) Offer(it Item) (dropped bool) {
	if q.dropping(it) {
		return true
	}
	select {
	case q.ch <- it:
		return false
	default:
		return q.onFull(it)
	}
}

// C — 소비 채널(jeju 송신 고루틴 전용). 큐는 닫지 않는다 — 소비자는 자기 done 채널로 끝낸다.
func (q *Queue) C() <-chan Item { return q.ch }

// TakeKeyframeNeed — 버림 뒤 키프레임 필요 표시를 꺼내고 지운다.
func (q *Queue) TakeKeyframeNeed() bool { return q.needKey.Swap(false) }

// Dropped — 누적 버림 수.
func (q *Queue) Dropped() uint64 { return q.dropped.Load() }
