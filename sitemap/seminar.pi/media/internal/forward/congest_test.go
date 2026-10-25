// 혼잡 버림 단위 테스트 — 영상 marker 까지 버림·키프레임에서 재개·레이어 독립·음성 단건 버림(실행 : go test ./internal/forward)
package forward

import "testing"

func TestCongestFrameDrop(t *testing.T) {
	type in struct {
		it     Item
		drain  bool // 투입 전에 큐 1칸 비움
		wantDr bool
	}
	cases := []struct {
		name    string
		audio   bool
		steps   []in
		wantKey bool
	}{
		{"영상 : 찬 뒤 marker 까지 버림", false, []in{
			{Item{ExtSeq: 1}, false, false},
			{Item{ExtSeq: 2}, false, true},              // 가득 참 → 버림 + 프레임 버림 시작
			{Item{ExtSeq: 3}, true, true},               // 자리가 나도 같은 프레임이면 버림
			{Item{ExtSeq: 4, Marker: true}, true, true}, // marker 까지 버림
			{Item{ExtSeq: 5}, false, false},             // 다음 프레임은 받음
		}, true},
		{"영상 : 버리는 중 키프레임이면 재개", false, []in{
			{Item{ExtSeq: 1}, false, false},
			{Item{ExtSeq: 2}, false, true},
			{Item{ExtSeq: 3, Key: true}, true, false},
		}, true},
		{"영상 : marker 조각에서 가득 참이면 이어 버리지 않음", false, []in{
			{Item{ExtSeq: 1}, false, false},
			{Item{ExtSeq: 2, Marker: true}, false, true},
			{Item{ExtSeq: 3}, true, false},
		}, true},
		{"영상 : 다른 레이어는 영향 없음", false, []in{
			{Item{ExtSeq: 1}, false, false},
			{Item{ExtSeq: 2, Layer: 2}, false, true},
			{Item{ExtSeq: 3, Layer: 0}, true, false},
			{Item{ExtSeq: 4, Layer: 2}, true, true},
		}, true},
		{"음성 : 그 패킷만 버림, 키프레임 표시 없음", true, []in{
			{Item{ExtSeq: 1}, false, false},
			{Item{ExtSeq: 2}, false, true},
			{Item{ExtSeq: 3}, true, false},
		}, false},
	}
	for _, c := range cases {
		q := NewQueue(1)
		q.SetAudio(c.audio)
		drops := uint64(0)
		for i, s := range c.steps {
			if s.drain {
				select {
				case <-q.C():
				default:
				}
			}
			if got := q.Offer(s.it); got != s.wantDr {
				t.Errorf("%s #%d : 버림=%v, 기대 %v", c.name, i, got, s.wantDr)
			}
			if s.wantDr {
				drops++
			}
		}
		if q.Dropped() != drops {
			t.Errorf("%s : Dropped=%d, 기대 %d", c.name, q.Dropped(), drops)
		}
		if got := q.TakeKeyframeNeed(); got != c.wantKey {
			t.Errorf("%s : 키프레임 필요=%v, 기대 %v", c.name, got, c.wantKey)
		}
	}
}
