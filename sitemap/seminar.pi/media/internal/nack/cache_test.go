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

// M2 : 늦은 옛 패킷이 새 슬롯을 덮지 않음·늦은 키프레임 조각이 LastKeyframe 을 되돌리지 않음·Has·Last·감김
func TestPacketCacheLate(t *testing.T) {
	c := NewPacketCache(4)
	dst := make([]byte, SlotSize)
	if _, ok := c.Last(); ok {
		t.Error("빈 캐시 Last ok")
	}
	c.Store(131070, 1, true, false, []byte{1}) // uint16 65534
	c.Store(131072, 2, false, true, []byte{2}) // 감김 뒤 uint16 0
	c.Store(131074, 3, true, false, []byte{3}) // 131070 과 같은 슬롯 → 덮음
	c.Store(131070, 1, true, false, []byte{9}) // 한 바퀴 늦은 재전송 → 무시
	cases := []struct {
		name string
		got  bool
		want bool
	}{
		{"새 패킷 유지", c.Get(131074, dst) == 1 && dst[0] == 3, true},
		{"옛 패킷 저장 안 됨", c.Has(131070), false},
		{"감김 뒤 패킷", c.Has(131072), true},
		{"없는 순번", c.Has(131073), false},
	}
	for _, x := range cases {
		if x.got != x.want {
			t.Errorf("%s : %v, 기대 %v", x.name, x.got, x.want)
		}
	}
	if k, _ := c.LastKeyframe(); k != 131074 {
		t.Errorf("LastKeyframe=%d, 기대 131074", k)
	}
	c.Store(131073, 4, true, false, []byte{4}) // 늦게 온(순서 뒤바뀜) 키프레임 조각
	if k, _ := c.LastKeyframe(); k != 131074 {
		t.Errorf("늦은 키 조각이 LastKeyframe 을 %d 로 되돌림", k)
	}
	if l, ok := c.Last(); !ok || l != 131074 {
		t.Errorf("Last=%d,%v", l, ok)
	}
	big := NewPacketCache(4)
	if n := big.Store(1, 0, false, false, make([]byte, SlotSize+1)); big.GetAt(1, n, dst) != 0 {
		t.Error("SlotSize 초과 패킷 저장됨")
	}
}
