// RFC 6464 오디오 레벨 해석 표 형식 시험(실행 : go test ./internal/rtpx)
package rtpx

import "testing"

// RFC 6464 3절 — V 비트·7비트 레벨, 2바이트 형식의 0 채움, 빈 원소.
func TestAudioLevel(t *testing.T) {
	cases := []struct {
		in    []byte
		level uint8
		voice bool
		ok    bool
	}{
		{[]byte{0x80 | 30}, 30, true, true},
		{[]byte{127}, 127, false, true},
		{[]byte{0x80, 0, 0}, 0, true, true},
		{nil, 0, false, false},
	}
	for _, c := range cases {
		l, v, ok := AudioLevel(c.in)
		if l != c.level || v != c.voice || ok != c.ok {
			t.Errorf("AudioLevel(%x) = %d,%v,%v 기대 %d,%v,%v", c.in, l, v, ok, c.level, c.voice, c.ok)
		}
	}
}
