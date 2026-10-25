// SendMeta 표 형식 단위 테스트 — 억제 간격 min(100ms,2RTT)·3회 상한·PLI 후 중단·출력 순번 감김·구멍 추정·미스 50ms 묶음(실행 : go test ./internal/nack)
package nack

import (
	"testing"
	"time"
)

func TestSendMetaResolve(t *testing.T) {
	t0 := time.Unix(3000, 0)
	ms := time.Millisecond
	type q struct {
		at      time.Duration
		out     uint16
		wantSrc uint64
		ok      bool
	}
	cases := []struct {
		name  string
		rtt   time.Duration
		push  []uint16 // out 순번(src = 200000 + 순서)
		stop  bool
		query []q
	}{
		{"억제 100ms·3회 상한(RTT 모름)", 0, []uint16{10, 11, 12}, false, []q{
			{0, 11, 200001, true},
			{50 * ms, 11, 0, false}, // 억제
			{100 * ms, 11, 200001, true},
			{200 * ms, 11, 200001, true}, // 3회째
			{400 * ms, 11, 0, false},     // 3회 초과
		}},
		{"억제 2RTT(RTT 20ms → 40ms)", 20 * ms, []uint16{10}, false, []q{
			{0, 10, 200000, true},
			{39 * ms, 10, 0, false},
			{40 * ms, 10, 200000, true},
		}},
		{"출력 순번 감김 65535→0", 0, []uint16{65534, 65535, 0, 1}, false, []q{
			{0, 65535, 200001, true},
			{0, 0, 200002, true},
		}},
		{"보낸 적 없는 구멍은 이웃에서 추정", 0, []uint16{100, 101, 103, 104}, false, []q{
			{0, 102, 200001, true}, // 뒤 이웃 103 의 src 200002 − 1
		}},
		{"너무 먼 순번은 추정 불가", 0, []uint16{100}, false, []q{
			{0, 200, 0, false},
		}},
		{"PLI 후 재전송 중단", 0, []uint16{10, 11}, true, []q{
			{0, 10, 0, false},
		}},
	}
	for _, c := range cases {
		m := NewSendMeta(VideoSlots)
		m.SetRTT(c.rtt)
		for i, o := range c.push {
			m.Push(o, 200000+uint64(i), 1, t0.Add(-time.Second))
		}
		if c.stop {
			m.StopRTX()
		}
		for i, x := range c.query {
			src, layer, ok := m.Resolve(x.out, t0.Add(x.at), m.RTT())
			if ok != x.ok || src != x.wantSrc || (ok && layer != 1) {
				t.Errorf("%s #%d out=%d : src=%d layer=%d ok=%v, 기대 %d,%v", c.name, i, x.out, src, layer, ok, x.wantSrc, x.ok)
			}
		}
	}
}

func TestSendMetaStopResume(t *testing.T) {
	now := time.Unix(3000, 0)
	m := NewSendMeta(VideoSlots)
	m.Push(5, 99, 0, now)
	m.StopRTX()
	if _, _, ok := m.Resolve(5, now, 0); ok {
		t.Error("중단 중 재전송")
	}
	m.KeyframeSent()
	if src, _, ok := m.Resolve(5, now, 0); !ok || src != 99 {
		t.Errorf("재개 후 %d,%v", src, ok)
	}
	m.Push(5+VideoSlots, 100, 0, now) // 같은 슬롯 덮어씀(이웃이 없어 추정도 불가)
	if _, _, ok := m.Resolve(5, now.Add(time.Second), 0); ok {
		t.Error("덮인 순번을 원본으로 되돌림")
	}
}

func TestSendMetaMissBatch(t *testing.T) {
	t0 := time.Unix(3000, 0)
	m := NewSendMeta(8)
	m.AddMiss(1, 0, t0)
	m.AddMiss(1, 0, t0.Add(10*time.Millisecond)) // 중복
	m.AddMiss(2, 1, t0.Add(20*time.Millisecond))
	if got := m.TakeMisses(t0.Add(49 * time.Millisecond)); got != nil {
		t.Errorf("50ms 전 꺼냄 : %v", got)
	}
	got := m.TakeMisses(t0.Add(MissBatchWait))
	if len(got) != 2 || got[0] != (Miss{1, 0}) || got[1] != (Miss{2, 1}) {
		t.Errorf("묶음 : %v", got)
	}
	if m.TakeMisses(t0.Add(time.Second)) != nil {
		t.Error("비운 뒤에도 남음")
	}
	for i := 0; i < MaxPendingNACK+5; i++ {
		m.AddMiss(uint64(i), 0, t0)
	}
	if got := m.TakeMisses(t0.Add(time.Second)); len(got) != MaxPendingNACK || got[0].Src != 5 {
		t.Errorf("상한 : %d개, 첫 %d", len(got), got[0].Src)
	}
}
