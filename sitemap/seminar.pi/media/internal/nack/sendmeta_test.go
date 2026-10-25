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

// 전환 경계(Fence) : 경계 앞 순번·Sync 로 비운 칸은 거부, 경계 뒤 구멍 추정은 경계 앞 이웃을 쓰지 않는다. 감김 포함.
func TestSendMetaFence(t *testing.T) {
	t0 := time.Unix(4000, 0)
	cases := []struct {
		name  string
		base  uint16 // 첫 출력 순번
		fence uint16 // base 기준 오프셋 — 이 칸 앞 1칸(fence-1)은 Sync 로 비움
		query uint16 // base 기준 오프셋
		ok    bool
	}{
		{"경계 뒤 송신 순번", 100, 6, 7, true},
		{"경계 앞 송신 순번(옛 레이어)", 100, 6, 3, false},
		{"Sync 로 비운 칸", 100, 6, 5, false},
		{"감김 — 경계 뒤", 65530, 6, 8, true},
		{"감김 — 비운 칸", 65530, 6, 5, false},
		{"감김 — 경계 앞", 65530, 6, 2, false},
	}
	for _, c := range cases {
		m := NewSendMeta(VideoSlots)
		for i := uint16(0); i < 10; i++ {
			if i == c.fence-1 {
				continue // 프레임 중간 전환 : 출력 1칸 비움
			}
			if i == c.fence {
				m.Fence(c.base + i)
			}
			m.Push(c.base+i, 500000+uint64(i), int8(i/c.fence), t0) // 경계 앞 레이어 0, 뒤 레이어 1
		}
		_, l, ok := m.Resolve(c.base+c.query, t0, 0)
		if ok != c.ok || (ok && l != 1) {
			t.Errorf("%s : ok=%v 레이어 %d, 기대 ok=%v", c.name, ok, l, c.ok)
		}
	}
}

// 경계가 링보다 멀어지면 풀린다 — 16비트 비교가 감겨 새 순번을 거부하지 않게.
func TestSendMetaFenceExpires(t *testing.T) {
	t0 := time.Unix(4000, 0)
	m := NewSendMeta(VideoSlots)
	m.Fence(0)
	for i := 0; i < 40000; i++ { // 32768 을 넘겨 감김 구간을 지나감
		m.Push(uint16(i), uint64(i)+1000, 0, t0)
	}
	if _, _, ok := m.Resolve(uint16(39990), t0, 0); !ok {
		t.Fatal("오래된 경계가 새 순번 재전송을 막음")
	}
}
