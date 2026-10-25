// 16비트 RTP 순번 비교·64비트 확장(RFC 3550 직렬 산술). 감김 65535→0 과 순서 뒤바뀜을 같은 규칙으로 처리한다.
package rtpx

// SeqLess — a 가 b 보다 앞선 순번인가(감김 고려, 두 값 차이가 2^15 미만이라고 가정).
func SeqLess(a, b uint16) bool { return a != b && int16(b-a) > 0 }

// SeqExtender — 16비트 순번을 64비트 순번으로 확장한다. 0값 그대로 쓴다(소유 고루틴 1개 전용, 잠금 없음).
// 첫 값을 1<<16 위에서 시작해 첫 패킷보다 늦게 도착한 패킷도 음수가 되지 않게 한다.
type SeqExtender struct {
	started bool
	max     uint64 // 지금까지 본 가장 큰 확장 순번
}

// Extend — 확장 순번을 돌려준다. 늦게 온 패킷은 max 보다 작은 값을 받고 max 는 바뀌지 않는다.
func (e *SeqExtender) Extend(seq uint16) uint64 {
	if !e.started {
		e.started = true
		e.max = 1<<16 | uint64(seq)
		return e.max
	}
	ext := uint64(int64(e.max) + int64(int16(seq-uint16(e.max))))
	if ext > e.max {
		e.max = ext
	}
	return ext
}
