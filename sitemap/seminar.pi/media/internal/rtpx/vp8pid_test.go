// VP8 picture ID·TL0PICIDX 연속화 표 형식 테스트(M4) — 15/7비트, 감김 0x7FFF→0, 레이어 전환 재기준(실행 : go test ./internal/rtpx)
package rtpx

import "testing"

// vp8 — X·I(M=1, 15비트)·L 기술자 + VP8 헤더 1바이트.
func vp8(pid uint16, tl0 uint8) []byte {
	return []byte{0x90, 0xC0, 0x80 | byte(pid>>8&0x7F), byte(pid), tl0, 0x00}
}

func TestVP8PictureID(t *testing.T) {
	cases := []struct {
		name string
		p    []byte
		pid  uint16
		ok   bool
	}{
		{"15비트", vp8(0x1234, 0), 0x1234, true},
		{"7비트", []byte{0x90, 0x80, 0x05, 0x00}, 5, true},
		{"I 없음", []byte{0x10, 0x00}, 0, false},
		{"잘림(15비트 둘째 바이트 없음)", []byte{0x90, 0x80, 0x81}, 0, false},
	}
	for _, c := range cases {
		pid, ok := VP8PictureID(c.p)
		if pid != c.pid || ok != c.ok {
			t.Errorf("%s : %d %v", c.name, pid, ok)
		}
	}
}

func TestVP8Munger(t *testing.T) {
	steps := []struct {
		pid     uint16
		tl0     uint8
		sync    bool
		wantPID uint16
		wantTL0 uint8
	}{
		{100, 7, false, 100, 7},       // 첫 패킷 : 그대로
		{101, 8, false, 101, 8},       // 연속
		{0x7FFE, 200, true, 102, 9},   // 레이어 전환 : 직전 + 1
		{0x7FFF, 201, false, 103, 10}, // 같은 오프셋 유지
		{0, 202, false, 104, 11},      // 입력 감김 0x7FFF→0
		{1, 202, false, 105, 11},      // TL0 그대로(같은 기본 계층 프레임)
	}
	var m VP8Munger
	for i, st := range steps {
		p := vp8(st.pid, st.tl0)
		if st.sync {
			m.Sync()
		}
		if !m.Rewrite(p) {
			t.Fatalf("단계 %d : Rewrite 실패", i)
		}
		if got, _ := VP8PictureID(p); got != st.wantPID || p[4] != st.wantTL0 {
			t.Errorf("단계 %d : pid=%d tl0=%d, 기대 %d %d", i, got, p[4], st.wantPID, st.wantTL0)
		}
	}
	// 출력 감김 : 직전 출력 0x7FFF 에서 전환하면 다음은 0
	var w VP8Munger
	w.Rewrite(vp8(0x7FFF, 0))
	w.Sync()
	p := vp8(10, 0)
	w.Rewrite(p)
	if got, _ := VP8PictureID(p); got != 0 {
		t.Errorf("출력 감김 : %d, 기대 0", got)
	}
}
