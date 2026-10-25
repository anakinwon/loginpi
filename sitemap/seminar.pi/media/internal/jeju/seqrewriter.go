// SeqRewriter — 입력 64비트 순번 → 출력 16비트 순번. 일부러 버린 순번(Drop)은 당겨 메우고, 재기준(Sync) 뒤에도 출력은 빈틈없이 이어진다(REA_02 5.6).
package jeju

import "sort"

// dropCap — 기억하는 버린 순번 수 상한. 넘치면 오래된 절반을 오프셋에 접어 넣는다. [TBD : M4 실측 — 전환 빈도]
const dropCap = 256

// SeqRewriter — 송신 고루틴 전용. 0값 그대로 쓴다.
// 출력 = uint16(in + offset − (in 보다 작은 버린 순번 수)). 64비트 입력이라 감김 비교가 필요 없다.
type SeqRewriter struct {
	started bool
	offset  uint64   // 감김은 uint64·uint16 나머지 연산으로 자연 처리
	last    uint16   // 지금까지 최대 출력 순번
	hi      uint64   // 지금까지 최대 입력(보냈거나 버린 것) + 1 — 0 입력에서도 감김 없게 배타 상한
	floor   uint64   // 이보다 작은 입력은 거부(재기준 이전의 옛 패킷 — REA_02 5.7 옛 패킷 차단)
	dropped []uint64 // 버린 입력(오름차순, 모두 floor 이상)

	// resync — 재개(resume) 뒤 첫 키프레임에서 Sync 대기(decision.go 가 사용).
	// ponytail: Consumer 필드가 M1 파일이라 여기 둔다 — 통합 때 Consumer 로 옮겨도 동작 같음.
	resync bool
}

// Sync — 다음 Input(in) 이 직전 최대 출력 + 1 이 되도록 재기준(첫 패킷·레이어 전환·재개). in 미만은 이후 거부.
// 프레임 미완료 전환(M4, REA_02 5.7)은 Sync(in-1) 로 출력 순번 1개를 비워 디코더가 앞 프레임을 불완전으로 처리하게 한다.
func (s *SeqRewriter) Sync(in uint64) {
	s.offset = uint64(s.last) + 1 - in
	s.hi = in
	s.floor = in
	s.dropped = s.dropped[:0]
	s.started = true
}

// Drop — in 을 보내지 않음. 최대 입력보다 큰 것만 기록해 이후 출력을 1씩 당긴다(구독자 쪽 구멍 → 헛 NACK 방지).
// 이미 지나간(늦게 온) 순번을 버리는 경우는 출력이 이미 나갔으므로 기록하지 않는다.
func (s *SeqRewriter) Drop(in uint64) {
	if !s.started {
		s.Sync(in)
	}
	if in < s.hi {
		return
	}
	s.hi = in + 1
	s.dropped = append(s.dropped, in) // in > 기존 전부 → 정렬 유지
	if len(s.dropped) > dropCap {
		k := len(s.dropped) / 2
		s.offset -= uint64(k) // 접은 k 개는 앞으로 모든 입력보다 작으므로 오프셋에 반영
		s.floor = s.dropped[k-1] + 1
		s.dropped = append(s.dropped[:0], s.dropped[k:]...)
	}
}

// Input — 출력 순번. ok=false 면 보내지 말 것(재기준 이전의 옛 패킷, 버린 순번이 다시 온 경우).
func (s *SeqRewriter) Input(in uint64) (out uint16, ok bool) {
	if !s.started {
		s.Sync(in)
	}
	if in < s.floor {
		return 0, false
	}
	n := sort.Search(len(s.dropped), func(i int) bool { return s.dropped[i] >= in })
	if n < len(s.dropped) && s.dropped[n] == in {
		return 0, false // 재전송 중복 방지
	}
	out = uint16(in + s.offset - uint64(n))
	if in >= s.hi {
		s.hi, s.last = in+1, out
	}
	return out, true
}
