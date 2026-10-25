// jeju 표 형식 단위 테스트 — SeqRewriter 연속성(감김·전환 재기준)과 단일 레이어 판정(실행 : go test ./internal/jeju)
package jeju

import (
	"testing"

	"seminar.pi/media/internal/forward"
)

func TestSeqRewriter(t *testing.T) {
	var s SeqRewriter
	steps := []struct {
		in   uint64
		sync bool
		want uint16
	}{
		{131070, false, 0}, // 첫 패킷 : last(0)+1 이 아니라 Sync 로 1
		{131071, false, 0},
		{131073, false, 0}, // 구멍은 M3 Drop 전까지 그대로
		{500000, true, 0},  // 레이어 전환 재기준 → 직전 + 1
		{500001, false, 0},
	}
	want := []uint16{1, 2, 4, 5, 6}
	for i, st := range steps {
		if st.sync {
			s.Sync(st.in)
		}
		out, ok := s.Input(st.in)
		if !ok || out != want[i] {
			t.Errorf("단계 %d : Input(%d)=%d,%v 기대 %d", i, st.in, out, ok, want[i])
		}
	}
}

func TestSingleLayerDecide(t *testing.T) {
	p := &singleLayer{}
	cases := []struct {
		it   forward.Item
		want Decision
	}{
		{forward.Item{Layer: 0}, Buffer},
		{forward.Item{Layer: 1, Key: true}, SilentDrop},
		{forward.Item{Layer: 0, Key: true}, Forward},
		{forward.Item{Layer: 0}, Forward},
	}
	for i, c := range cases {
		if d, _ := p.Decide(c.it, false); d != c.want {
			t.Errorf("#%d : %v, 기대 %v", i, d, c.want)
		}
	}
}
