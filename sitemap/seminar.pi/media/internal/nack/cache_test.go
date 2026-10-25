// PacketCache 단위 테스트 — 저장·조회·덮어쓰기·키프레임 위치(실행 : go test ./internal/nack)
package nack

import "testing"

func TestPacketCache(t *testing.T) {
	c := NewPacketCache(4)
	dst := make([]byte, SlotSize)
	i1 := c.Store(65537, 10, true, false, []byte{1, 2, 3})
	c.Store(65538, 10, false, true, []byte{4})
	cases := []struct {
		name string
		got  int
		want int
	}{
		{"GetAt 적중", c.GetAt(65537, i1, dst), 3},
		{"Get 적중", c.Get(65538, dst), 1},
		{"없는 순번", c.Get(70000, dst), 0},
		{"범위 밖 idx", c.GetAt(65537, 99, dst), 0},
		{"dst 부족", c.GetAt(65537, i1, make([]byte, 1)), 0},
	}
	for _, x := range cases {
		if x.got != x.want {
			t.Errorf("%s : %d, 기대 %d", x.name, x.got, x.want)
		}
	}
	c.Store(65541, 20, false, false, []byte{9}) // 65537 과 같은 슬롯 덮어씀
	if n := c.GetAt(65537, i1, dst); n != 0 {
		t.Errorf("덮인 슬롯이 %d 바이트 반환", n)
	}
	if k, ok := c.LastKeyframe(); !ok || k != 65537 {
		t.Errorf("LastKeyframe=%d,%v", k, ok)
	}
}
