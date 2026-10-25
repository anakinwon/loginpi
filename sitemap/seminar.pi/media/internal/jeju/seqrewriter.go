// SeqRewriter — 입력 64비트 순번 → 출력 16비트 순번. 전환·버림이 있어도 출력은 빈틈없이 이어진다(REA_02 5.6). M1 : 오프셋만, M3 : Drop 메움 완성.
package jeju

// SeqRewriter — 송신 고루틴 전용. 0값 그대로 쓴다.
type SeqRewriter struct {
	started bool
	offset  uint64 // out = uint16(in + offset)
	last    uint16 // 마지막 출력 순번
	maxIn   uint64
}

// Sync — 다음 Input(in) 이 직전 출력 + 1 이 되도록 재기준(레이어 전환·첫 패킷).
func (s *SeqRewriter) Sync(in uint64) {
	s.offset = uint64(s.last) + 1 - in
	s.maxIn = in - 1
	s.started = true
}

// Drop — in 을 보내지 않음. M3 : 이후 순번을 당겨 출력에 구멍이 생기지 않게 한다. M3 에서 구현.
func (s *SeqRewriter) Drop(in uint64) {}

// Input — 출력 순번. ok=false 면 보내지 말 것(M3 : 재기준 이전의 옛 패킷 등).
func (s *SeqRewriter) Input(in uint64) (out uint16, ok bool) {
	if !s.started {
		s.Sync(in)
	}
	out = uint16(in + s.offset)
	if in > s.maxIn {
		s.maxIn, s.last = in, out
	}
	return out, true
}
