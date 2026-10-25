// bwe 표 형식 테스트(M4) — Kendall 추세·NACK 창·할당(레이어 0 보장·우선순위·1.2배 히스테리시스)·혼잡 확정·탐침·dynacast·청중 30명 벤치
// 실행 : go test ./internal/bwe · go test -bench . ./internal/bwe
package bwe

import (
	"math"
	"sync"
	"testing"
	"time"
)

type fakeTarget struct {
	mu    sync.Mutex
	layer int8
	calls int
}

func (f *fakeTarget) SetTarget(l int8, paused bool) {
	f.mu.Lock()
	f.layer, f.calls = l, f.calls+1
	f.mu.Unlock()
}

func (f *fakeTarget) get() int8 { f.mu.Lock(); defer f.mu.Unlock(); return f.layer }

// 표준 3레이어 : l 150k · m 500k · h 1.5M, 전부 활성
func view(id string, prio uint8) ConsumerView {
	return ConsumerView{ID: id, Priority: prio, Bitrates: [3]int64{150_000, 500_000, 1_500_000}, Active: [3]bool{true, true, true}, MaxLayer: 2}
}

func TestKendall(t *testing.T) {
	cases := []struct {
		name string
		v    []int64
		want float64
	}{
		{"단조 증가", []int64{1, 2, 3, 4}, 1},
		{"단조 감소", []int64{4, 3, 2, 1}, -1},
		{"모두 같음", []int64{5, 5, 5}, 0},
		{"표본 1개", []int64{5}, 0},
		{"한 번 튐", []int64{10, 9, 8, 20, 7}, 0.2 - 0.2*3}, // 일치 2 · 불일치 8 → −0.6
	}
	for _, c := range cases {
		if got := kendall(c.v); math.Abs(got-c.want) > 1e-9 {
			t.Errorf("%s : %.3f, 기대 %.3f", c.name, got, c.want)
		}
	}
}

func TestTrendFalling(t *testing.T) {
	t0 := time.Now()
	var tr trend
	for i := 0; i < 7; i++ {
		tr.add(int64(2_000_000-i*100_000), t0.Add(time.Duration(i)*time.Second))
	}
	if tr.falling(false) {
		t.Error("표본 7개로 판정하면 안 됨")
	}
	tr.add(1_000_000, t0.Add(8*time.Second))
	if !tr.falling(false) {
		t.Error("표본 8개 하락 → 혼잡")
	}
	// 같은 값 500ms 안 반복은 버림
	var c trend
	c.add(5, t0)
	c.add(5, t0.Add(100*time.Millisecond))
	c.add(5, t0.Add(700*time.Millisecond))
	if len(c.vals) != 2 {
		t.Errorf("붕괴 창 : 표본 %d, 기대 2", len(c.vals))
	}
	// 최대 12개 유지
	for i := 0; i < 20; i++ {
		c.add(int64(i), t0.Add(time.Duration(i+2)*time.Second))
	}
	if len(c.vals) != trendMaxSamples {
		t.Errorf("표본 상한 %d", len(c.vals))
	}
}

func TestNackWindow(t *testing.T) {
	t0 := time.Now()
	cases := []struct {
		name           string
		sent, repeated uint32
		at             time.Duration
		probing        bool
		cong, done     bool
	}{
		{"창 덜 참", 500, 100, time.Second, false, false, false},
		{"2초 9% → 혼잡", 500, 0, 2 * time.Second, false, true, true}, // 누적 1000 중 100... 아래에서 계산
	}
	var w nackWindow
	w.add(0, 0, t0, false)
	for _, c := range cases {
		_, cong, done := w.add(c.sent, c.repeated, t0.Add(c.at), c.probing)
		if cong != c.cong || done != c.done {
			t.Errorf("%s : cong=%v done=%v", c.name, cong, done)
		}
	}
	// 7% 는 혼잡 아님, 탐침 중 5% 는 혼잡(0.5초 창)
	w.reset(t0)
	if _, cong, _ := w.add(1000, 70, t0.Add(2*time.Second), false); cong {
		t.Error("7% 혼잡 판정")
	}
	w.reset(t0)
	if _, cong, done := w.add(1000, 50, t0.Add(600*time.Millisecond), true); !cong || !done {
		t.Error("탐침 중 5% 미판정")
	}
	w.reset(t0)
	if _, cong, _ := w.add(10, 5, t0.Add(3*time.Second), false); cong {
		t.Error("표본 부족 창은 판정하지 않음")
	}
}

func TestAllocateLayerZeroAndPriority(t *testing.T) {
	cases := []struct {
		name      string
		capacity  int64
		want      map[string]int8
		deficient bool
	}{
		{"제한 없음 → 모두 h", 0, map[string]int8{"screen": 2, "cam": 2}, false},
		{"용량 극소 → 그래도 레이어 0(일시정지 끔)", 10_000, map[string]int8{"screen": 0, "cam": 0}, true},
		{"우선순위 높은 화면공유 먼저", 800_000, map[string]int8{"screen": 1, "cam": 0}, true},
		{"한 단계씩 공정 분배(h 하나보다 m 둘)", 1_900_000, map[string]int8{"screen": 1, "cam": 1}, true},
		{"둘 다 m", 1_100_000, map[string]int8{"screen": 1, "cam": 1}, true},
		{"충분", 3_100_000, map[string]int8{"screen": 2, "cam": 2}, false},
	}
	for _, c := range cases {
		co := newCore()
		ts := map[string]*fakeTarget{"screen": {}, "cam": {}}
		co.add("screen", ts["screen"])
		co.add("cam", ts["cam"])
		co.update(view("screen", 255))
		co.update(view("cam", 1))
		co.committed = c.capacity
		co.allocate()
		for id, want := range c.want {
			if got := ts[id].get(); got != want {
				t.Errorf("%s : %s=%d, 기대 %d", c.name, id, got, want)
			}
		}
		if (co.state == Deficient) != c.deficient {
			t.Errorf("%s : 상태 %v", c.name, co.state)
		}
	}
}

func TestAllocateHysteresisAndMax(t *testing.T) {
	co := newCore()
	ft := &fakeTarget{}
	co.add("a", ft)
	co.update(view("a", 1))
	co.committed = 2_000_000
	co.allocate()
	if ft.get() != 2 {
		t.Fatalf("h 기대, %d", ft.get())
	}
	co.committed = 600_000 // 하향 → m
	co.allocate()
	if ft.get() != 1 {
		t.Fatalf("m 기대, %d", ft.get())
	}
	co.committed = 1_600_000 // h 1.5M 는 되지만 1.2배(1.8M) 미만 → 그대로 m
	co.allocate()
	if ft.get() != 1 {
		t.Errorf("히스테리시스 : %d, 기대 1", ft.get())
	}
	co.committed = 1_850_000
	co.allocate()
	if ft.get() != 2 {
		t.Errorf("1.2배 확보 후 h : %d", ft.get())
	}
	// 상한(setLayer)·비활성 레이어 반영
	v := view("a", 1)
	v.MaxLayer = 1
	co.committed = 0
	co.update(v)
	if ft.get() != 1 {
		t.Errorf("상한 1 : %d", ft.get())
	}
	v = view("a", 1)
	v.Active[2], v.Active[1] = false, false
	co.update(v)
	if ft.get() != 0 {
		t.Errorf("m·h 비활성 : %d", ft.get())
	}
}

func TestCongestionCommitAndProbe(t *testing.T) {
	co := newCore()
	ft := &fakeTarget{}
	co.add("a", ft)
	co.update(view("a", 1))
	var sinks []int64
	co.probeSink = func(b int64) { sinks = append(sinks, b) }
	t0 := time.Now()
	// REMB 2.0M → 0.9M 하락 8표본 → 용량 0.9M 확정 → m, DEFICIENT
	for i := 0; i < 8; i++ {
		co.onREMB(int64(2_000_000-i*150_000), []uint32{7}, t0.Add(time.Duration(i)*time.Second))
	}
	if co.state != Deficient || ft.get() != 1 || co.committed != 950_000 {
		t.Fatalf("혼잡 확정 : 상태 %v 레이어 %d 용량 %d", co.state, ft.get(), co.committed)
	}
	// 다른 SSRC 로 같은 REMB 가 2초 안에 오면 무시
	co.onREMB(10, []uint32{9}, t0.Add(7500*time.Millisecond))
	if co.lastREMB == 10 {
		t.Error("추적 SSRC 아닌 REMB 반영")
	}
	// 탐침 : 확정 뒤 3초 쉬고 시작, 목표 = (1.5M−0.5M)×1.2 = 1.2M
	now := t0.Add(7 * time.Second)
	co.tick(now.Add(time.Second))
	if co.probe.active {
		t.Fatal("간격 전 탐침 시작")
	}
	now = now.Add(3 * time.Second)
	co.tick(now)
	if !co.probe.active || len(sinks) != 1 || sinks[0] != 1_200_000 {
		t.Fatalf("탐침 시작 : %v %v", co.probe.active, sinks)
	}
	// 실패(REMB 그대로) → 간격 4.5초
	co.tick(now.Add(probeDuration))
	if co.probe.active || co.probe.interval != 4500*time.Millisecond || sinks[len(sinks)-1] != 0 {
		t.Fatalf("탐침 실패 : %v %v", co.probe.interval, sinks)
	}
	// 다음 탐침 중 REMB 상승 → 성공 → 용량 = REMB → h, STABLE(제한 해제)
	now = now.Add(probeDuration + 4500*time.Millisecond)
	co.tick(now)
	if !co.probe.active {
		t.Fatal("두 번째 탐침 미시작")
	}
	co.onREMB(2_500_000, []uint32{7}, now.Add(time.Second))
	co.tick(now.Add(probeDuration))
	if co.state != Stable || ft.get() != 2 || co.committed != 0 || co.probe.active {
		t.Errorf("탐침 성공 : 상태 %v 레이어 %d 용량 %d", co.state, ft.get(), co.committed)
	}
}

func TestLossCongestion(t *testing.T) {
	co := newCore()
	ft := &fakeTarget{}
	co.add("a", ft)
	co.update(view("a", 1)) // 기대 1.5M
	t0 := time.Now()
	co.onNack(0, 0, t0)
	co.onNack(1000, 200, t0.Add(2*time.Second)) // 20% → 1.5M × (1 − 0.08) = 1.38M
	if co.committed != 1_380_000 || ft.get() != 1 {
		t.Errorf("손실 혼잡 : 용량 %d 레이어 %d", co.committed, ft.get())
	}
}

func TestDynacast(t *testing.T) {
	t0 := time.Now()
	d := NewDynacast()
	steps := []struct {
		name    string
		do      func() (int8, bool)
		pub     int8
		changed bool
	}{
		{"구독자 둘 다 l → 하향 대기", func() (int8, bool) { d.Set("a", 0, t0); return d.Set("b", 0, t0) }, 2, false},
		{"4초 → 아직", func() (int8, bool) { return d.Tick(t0.Add(4 * time.Second)) }, 2, false},
		{"5초 → l 만", func() (int8, bool) { return d.Tick(t0.Add(5 * time.Second)) }, 0, true},
		{"한 명 h 요청 → 즉시 상향", func() (int8, bool) { return d.Set("b", 2, t0.Add(6*time.Second)) }, 2, true},
		{"h 요청자 퇴장 → 대기", func() (int8, bool) { return d.Remove("b", t0.Add(7*time.Second)) }, 2, false},
		{"대기 중 m 요청 → 상향 아님(현재 h)", func() (int8, bool) { return d.Set("a", 1, t0.Add(8*time.Second)) }, 2, false},
		{"7초 대기 끝 → m", func() (int8, bool) { return d.Tick(t0.Add(12 * time.Second)) }, 1, true},
	}
	for _, st := range steps {
		pub, ch := st.do()
		if pub != st.pub || ch != st.changed {
			t.Errorf("%s : %d %v, 기대 %d %v", st.name, pub, ch, st.pub, st.changed)
		}
	}
	if r := Rids(1); !r["l"] || !r["m"] || r["h"] {
		t.Errorf("Rids(1) = %v", r)
	}
}

// TestAllocatorGoroutine — 이벤트 고루틴 경유 동작(채널 직렬화).
func TestAllocatorGoroutine(t *testing.T) {
	a := NewAllocator()
	defer a.Close()
	ft := &fakeTarget{}
	a.Add("a", ft)
	a.OnConsumerChanged(view("a", 1))
	a.OnREMB(float32(math.NaN()), []uint32{1}) // 거부
	deadline := time.Now().Add(time.Second)
	for ft.get() != 2 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if ft.get() != 2 || a.State() != Stable {
		t.Errorf("레이어 %d 상태 %v", ft.get(), a.State())
	}
	a.Remove("a")
	a.Close()
	a.Close()      // 두 번 닫아도 안전
	a.Add("b", ft) // 닫힌 뒤 막히지 않음
}

// TestThirtySubscribers — 청중 30명(구독 PC 30개) × 트랙 2개, 절반이 대역 하락. 합성 부하 도구(C-6) 승인 전 대체.
func TestThirtySubscribers(t *testing.T) {
	t0 := time.Now()
	for i := 0; i < 30; i++ {
		co := newCore()
		cam, scr := &fakeTarget{}, &fakeTarget{}
		co.add("cam", cam)
		co.add("scr", scr)
		co.update(view("cam", 1))
		co.update(view("scr", 255))
		if i%2 == 1 { // 대역 하락 : 3.2M → 0.8M
			for k := 0; k < 10; k++ {
				co.onREMB(int64(3_200_000-k*266_000), []uint32{1}, t0.Add(time.Duration(k)*time.Second))
			}
			// 8번째 표본(1.338M)에서 확정 → l 둘(0.3M) + m 둘(+0.7M) = 1.0M, h 는 못 감
			if co.state != Deficient || scr.get() != 1 || cam.get() != 1 || co.committed != 1_338_000 {
				t.Errorf("구독자 %d : 상태 %v scr=%d cam=%d", i, co.state, scr.get(), cam.get())
			}
		} else if co.state != Stable || cam.get() != 2 || scr.get() != 2 {
			t.Errorf("구독자 %d : 상태 %v", i, co.state)
		}
	}
}

// BenchmarkAllocate30 — 구독자 30명분 재할당(용량 제한) 1회 비용.
func BenchmarkAllocate30(b *testing.B) {
	cores := make([]*core, 30)
	for i := range cores {
		co := newCore()
		for _, id := range []string{"cam", "scr", "panel"} {
			co.add(id, &fakeTarget{})
			co.update(view(id, uint8(len(id))))
		}
		co.committed = 1_200_000
		cores[i] = co
	}
	b.ResetTimer()
	for n := 0; n < b.N; n++ {
		for _, co := range cores {
			co.allocate()
		}
	}
}
