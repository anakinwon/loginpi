// 상류 피드백 단위 테스트 — 손실 → NACK, 상한 초과 → PLI, 하류 미스 재요청 필터(키프레임 이전·이미 도착)(실행 : go test ./internal/santorini)
package santorini

import (
	"slices"
	"testing"
	"time"

	"github.com/pion/rtcp"

	"seminar.pi/media/internal/nack"
	"seminar.pi/media/internal/rtcpx"
)

var b = uint64(1<<16) + 100

func kinds(ps []rtcp.Packet) (nackSeqs []uint16, plis int) {
	for _, p := range ps {
		if _, s, ok := rtcpx.ParseNACK(p); ok {
			nackSeqs = append(nackSeqs, s...)
		}
		if _, ok := rtcpx.ParsePLI(p); ok {
			plis++
		}
	}
	return
}

func TestLayerFeedback(t *testing.T) {
	now := time.Unix(4000, 0)
	cases := []struct {
		name     string
		recv     []uint64
		key      uint64 // 0 = 키프레임 없음
		request  []uint64
		wantNACK []uint16
		wantPLI  int
	}{
		{"손실 없음", []uint64{b, b + 1, b + 2}, 0, nil, nil, 0},
		{"구멍 1개 → NACK", []uint64{b, b + 2, b + 3, b + 4, b + 5}, 0, nil, []uint16{uint16(b + 1)}, 0},
		{"상한 넘는 구멍 → PLI", []uint64{b, b + nack.MaxPendingNACK + 5}, 0, nil, nil, 1},
		{"하류 미스 : 키프레임 이전·이미 캐시에 있는 순번 제외", []uint64{b, b + 1, b + 2, b + 3, b + 4, b + 5}, b + 2,
			[]uint64{b + 1, b + 3}, nil, 0},
	}
	for _, c := range cases {
		l := newLayer(0, Video, make(chan struct{}))
		for _, e := range c.recv {
			key := e == c.key
			l.cache.Store(e, 0, key, false, []byte{0x80})
			l.loss.Receive(e, key)
		}
		if c.request != nil {
			l.requestNACK(c.request)
		}
		gotN, gotP := kinds(l.feedback(now, 1234, 0))
		if !slices.Equal(gotN, c.wantNACK) || gotP != c.wantPLI {
			t.Errorf("%s : NACK %v PLI %d, 기대 %v %d", c.name, gotN, gotP, c.wantNACK, c.wantPLI)
		}
	}
}

// 캐시에서 덮여 사라진(미스) 순번은 키프레임 이후면 상류로 재요청된다.
func TestRequestNACKEvicted(t *testing.T) {
	l := newLayer(0, Audio, make(chan struct{})) // 음성 64슬롯
	for e := b; e < b+100; e++ {
		l.cache.Store(e, 0, e == b, false, []byte{0x80})
		l.loss.Receive(e, e == b)
	}
	l.requestNACK([]uint64{b + 10}) // 64슬롯을 넘어 덮임
	gotN, _ := kinds(l.feedback(time.Unix(4000, 0), 1, 0))
	if !slices.Equal(gotN, []uint16{uint16(b + 10)}) {
		t.Errorf("덮인 순번 재요청 : %v", gotN)
	}
}
