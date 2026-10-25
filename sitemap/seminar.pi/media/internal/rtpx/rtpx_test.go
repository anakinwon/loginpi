// rtpx 표 형식 단위 테스트 — 순번 감김·순서 뒤바뀜·VP8 키프레임 판별(실행 : go test ./internal/rtpx)
package rtpx

import "testing"

func TestSeqExtender(t *testing.T) {
	cases := []struct {
		name string
		in   []uint16
		want []uint64
	}{
		{"연속", []uint16{1, 2, 3}, []uint64{65537, 65538, 65539}},
		{"감김 65535→0", []uint16{65534, 65535, 0, 1}, []uint64{131070, 131071, 131072, 131073}},
		{"감김 직후 늦게 온 패킷", []uint16{65535, 0, 65534, 1}, []uint64{131071, 131072, 131070, 131073}},
		{"첫 패킷보다 앞선 순번", []uint16{10, 9}, []uint64{65546, 65545}},
	}
	for _, c := range cases {
		var e SeqExtender
		for i, s := range c.in {
			if got := e.Extend(s); got != c.want[i] {
				t.Errorf("%s[%d] : Extend(%d)=%d, 기대 %d", c.name, i, s, got, c.want[i])
			}
		}
	}
}

func TestSeqLess(t *testing.T) {
	cases := []struct {
		a, b uint16
		want bool
	}{{1, 2, true}, {2, 1, false}, {65535, 0, true}, {0, 65535, false}, {5, 5, false}}
	for _, c := range cases {
		if got := SeqLess(c.a, c.b); got != c.want {
			t.Errorf("SeqLess(%d,%d)=%v", c.a, c.b, got)
		}
	}
}

func TestIsVP8Keyframe(t *testing.T) {
	cases := []struct {
		name string
		p    []byte
		want bool
	}{
		{"빈 페이로드", nil, false},
		{"기술자 1바이트 + 키프레임", []byte{0x10, 0x00}, true},
		{"기술자 1바이트 + 델타", []byte{0x10, 0x01}, false},
		{"S=0 이어지는 조각", []byte{0x00, 0x00}, false},
		{"X·I(15비트)·L·T + 키프레임", []byte{0x90, 0xE0, 0x81, 0x02, 0x03, 0x04, 0x00}, true},
		{"X·I(7비트) + 델타", []byte{0x90, 0x80, 0x05, 0x01}, false},
		{"잘린 페이로드", []byte{0x90, 0x80}, false},
	}
	for _, c := range cases {
		if got := IsVP8Keyframe(c.p); got != c.want {
			t.Errorf("%s : %v, 기대 %v", c.name, got, c.want)
		}
	}
}
