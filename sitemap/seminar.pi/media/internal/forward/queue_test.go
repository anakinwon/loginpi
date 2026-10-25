// forward 큐 단위 테스트 — 비차단 투입과 가득 참 버림(실행 : go test ./internal/forward)
package forward

import "testing"

func TestQueueOfferFull(t *testing.T) {
	q := NewQueue(2)
	for i, want := range []bool{false, false, true} {
		if got := q.Offer(Item{ExtSeq: uint64(i)}); got != want {
			t.Errorf("Offer #%d 버림=%v, 기대 %v", i, got, want)
		}
	}
	if q.Dropped() != 1 || !q.TakeKeyframeNeed() || q.TakeKeyframeNeed() {
		t.Errorf("버림 수·키프레임 필요 표시 불일치 : dropped=%d", q.Dropped())
	}
	if it := <-q.C(); it.ExtSeq != 0 {
		t.Errorf("FIFO 아님 : %d", it.ExtSeq)
	}
}
