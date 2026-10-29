// simulcast LayerPolicy 표 형식 테스트(M4) — 키프레임 경계 전환·SR TS 정렬·SR 없으면 보류·75ms 상한·옛 패킷 차단·부족 하향 즉시 차단·setLayer 디바운스·청중 30명 벤치
// 실행 : go test ./internal/jeju · go test -bench LayerPolicy ./internal/jeju
package jeju

import (
	"encoding/binary"
	"testing"
	"time"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/nack"
	"seminar.pi/media/internal/pli"
	"seminar.pi/media/internal/santorini"
)

// fakeLayer — SR·캐시·키프레임 요청 기록.
type fakeLayer struct {
	sr       santorini.SR
	hasSR    bool
	cache    *nack.PacketCache
	reqs     int
	inactive bool // 비활성 레이어 흉내(기본 활성)
}

func (f *fakeLayer) LastSR() (santorini.SR, bool) { return f.sr, f.hasSR }
func (f *fakeLayer) Cache() *nack.PacketCache     { return f.cache }
func (f *fakeLayer) RequestKeyframe(pli.Reason)   { f.reqs++ }
func (f *fakeLayer) Active() bool                 { return !f.inactive }

func newFakes() [3]*fakeLayer {
	var fs [3]*fakeLayer
	for i := range fs {
		fs[i] = &fakeLayer{cache: nack.NewPacketCache(nack.VideoSlots)}
	}
	return fs
}

func policyOf(fs [3]*fakeLayer) *simulcast {
	return newSimulcast(func(i int8) layerSource {
		if i < 0 || int(i) >= len(fs) {
			return nil
		}
		return fs[i]
	})
}

// store — 레이어 캐시에 RTP TS 를 가진 12바이트 패킷을 넣고 Item 을 만든다.
func store(f *fakeLayer, layer int8, ext uint64, ts uint32, key bool, at time.Time) forward.Item {
	pkt := make([]byte, 12)
	pkt[0] = 0x80
	binary.BigEndian.PutUint32(pkt[4:8], ts)
	idx := f.cache.Store(ext, ts, key, true, pkt)
	return forward.Item{ExtSeq: ext, Idx: idx, Key: key, Marker: true, Layer: layer, At: at}
}

const ntpSec = uint64(1) << 32

func TestSimulcastStartAndUpgrade(t *testing.T) {
	fs := newFakes()
	p := policyOf(fs)
	t0 := time.Now()
	type step struct {
		name string
		it   forward.Item
		want Decision
		swTo int8 // -2 = 전환 없음
	}
	steps := []step{
		{"시작 전 목표 레이어 델타 → Buffer", store(fs[2], 2, 1000, 0, false, t0), Buffer, -2},
		{"시작 전 다른 레이어 델타 → SilentDrop", store(fs[0], 0, 5000, 0, false, t0), SilentDrop, -2},
		{"l 키프레임으로 시작", store(fs[0], 0, 5001, 0, true, t0), Forward, 0},
		{"l 연속", store(fs[0], 0, 5002, 3000, false, t0), Forward, -2},
		{"h 델타는 전환 불가", store(fs[2], 2, 1002, 0, false, t0), SilentDrop, -2},
	}
	for _, st := range steps {
		d, sw := p.Decide(st.it, true)
		to := int8(-2)
		if sw != nil {
			to = sw.To
		}
		if d != st.want || to != st.swTo {
			t.Errorf("%s : %v 전환 %d, 기대 %v %d", st.name, d, to, st.want, st.swTo)
		}
	}
	// SR 없음 → h 키프레임 보류 + 재요청
	before := fs[2].reqs
	if d, sw := p.Decide(store(fs[2], 2, 1003, 0, true, t0), true); d != SilentDrop || sw != nil || fs[2].reqs <= before {
		t.Errorf("SR 없음 : %v %v 요청 %d→%d", d, sw, before, fs[2].reqs)
	}
	// SR 도착 : l 은 NTP 1000s↔TS 1000, h 는 NTP 1000.5s↔TS 50000 → offH = 0 + 50000 − 1000 − 45000 = 4000
	fs[0].sr, fs[0].hasSR = santorini.SR{NTP: 1000 * ntpSec, RTPTime: 1000}, true
	fs[2].sr, fs[2].hasSR = santorini.SR{NTP: 1000*ntpSec + ntpSec/2, RTPTime: 50000}, true
	d, sw := p.Decide(store(fs[2], 2, 1010, 95000, true, t0), true)
	if d != Forward || sw == nil || sw.From != 0 || sw.To != 2 || p.tsOffset != 4000 {
		t.Fatalf("상향 전환 : %v %+v off=%d", d, sw, p.tsOffset)
	}
	// 전환 후 : 옛 h 패킷 차단, l 은 SilentDrop
	cases := []struct {
		name string
		it   forward.Item
		want Decision
	}{
		{"전환 기준보다 앞선 옛 h", store(fs[2], 2, 1009, 0, false, t0), SilentDrop},
		{"새 h", store(fs[2], 2, 1011, 0, false, t0), Forward},
		{"l 은 다른 레이어", store(fs[0], 0, 5010, 0, false, t0), SilentDrop},
	}
	for _, c := range cases {
		if d, _ := p.Decide(c.it, true); d != c.want {
			t.Errorf("%s : %v, 기대 %v", c.name, d, c.want)
		}
	}
}

func TestSimulcastDeficientDowngradeBlocks(t *testing.T) {
	fs := newFakes()
	for i := range fs {
		fs[i].sr, fs[i].hasSR = santorini.SR{NTP: 1000 * ntpSec, RTPTime: uint32(i) * 10000}, true
	}
	p := policyOf(fs)
	t0 := time.Now()
	p.Decide(store(fs[2], 2, 100, 0, true, t0), true) // h 로 시작
	p.SetTarget(0, false)                             // 부족 상태 하향
	if d, _ := p.Decide(store(fs[2], 2, 101, 0, false, t0), true); d != Drop {
		t.Errorf("하향 즉시 차단 : %v, 기대 Drop", d)
	}
	// 하향은 목표 ≤ l < 현재 → 먼저 온 m 키프레임으로도 내려간다(REA_03 5.5), 차단 해제
	if d, sw := p.Decide(store(fs[1], 1, 300, 0, true, t0), true); d != Forward || sw == nil || sw.To != 1 || p.blocked {
		t.Errorf("m 키프레임 하향 : %v %+v blocked=%v", d, sw, p.blocked)
	}
}

// TestSimulcastInactiveLayer — M3 ⑥ : 비활성 레이어는 목표에서 빠진다(할당기 밖 녹화 Consumer 멈춤 방지).
func TestSimulcastInactiveLayer(t *testing.T) {
	fs := newFakes()
	for i := range fs {
		fs[i].sr, fs[i].hasSR = santorini.SR{NTP: 1000 * ntpSec, RTPTime: 0}, true
	}
	p := policyOf(fs)
	t0 := time.Now()
	p.Decide(store(fs[2], 2, 100, 0, true, t0), true) // h 로 시작(목표 = 최고 레이어 고정)
	fs[2].inactive = true                             // 발행자가 h 를 끊음
	if cur, _, _ := p.State(); cur != 2 {
		t.Fatalf("현재 레이어 %d, 기대 2", cur)
	}
	before := fs[1].reqs
	if d, _ := p.Decide(store(fs[0], 0, 500, 0, false, t0), true); d != SilentDrop || fs[1].reqs <= before {
		t.Errorf("h 비활성 → m 키프레임 요청 : %v 요청 %d→%d", d, before, fs[1].reqs)
	}
	if d, sw := p.Decide(store(fs[1], 1, 300, 0, true, t0), true); d != Forward || sw == nil || sw.To != 1 {
		t.Errorf("m 키프레임에서 하향 : %v %+v", d, sw)
	}
	// 전부 비활성이면 l(0) 이 목표 — 레이어 0 보장
	fs[1].inactive, fs[0].inactive = true, true
	if e := p.eff(); e != 0 {
		t.Errorf("전부 비활성 목표 %d, 기대 0", e)
	}
	// h 가 다시 활성(10초 연속은 santorini 가 판정) → 목표 복귀
	fs[2].inactive = false
	if e := p.eff(); e != 2 {
		t.Errorf("h 재활성 목표 %d, 기대 2", e)
	}
}

func TestSimulcastSetMaxDebounceNoBlock(t *testing.T) {
	fs := newFakes()
	for i := range fs {
		fs[i].sr, fs[i].hasSR = santorini.SR{NTP: 1000 * ntpSec, RTPTime: 0}, true
	}
	p := policyOf(fs)
	t0 := time.Now()
	p.Decide(store(fs[2], 2, 100, 0, true, t0), true)
	p.SetMax(0)
	// 100ms 전 : 상한 미반영 → h 계속
	if d, _ := p.Decide(store(fs[2], 2, 101, 3000, false, t0), true); d != Forward {
		t.Errorf("디바운스 전 : %v", d)
	}
	later := t0.Add(200 * time.Millisecond)
	// 반영 후에도 클라이언트 하향은 막지 않음 → l 키프레임 전까지 h 계속
	if d, _ := p.Decide(store(fs[2], 2, 102, 6000, false, later), true); d != Forward || p.max != 0 {
		t.Errorf("디바운스 후 : %v max=%d", d, p.max)
	}
	p.lastOut, p.hasLast = 6000, true
	d, sw := p.Decide(store(fs[0], 0, 900, 9000, true, later), true)
	if d != Forward || sw == nil || sw.To != 0 {
		t.Errorf("l 키프레임에서 하향 : %v %+v", d, sw)
	}
}

func TestSimulcastBackstep75ms(t *testing.T) {
	fs := newFakes()
	for i := range fs {
		fs[i].sr, fs[i].hasSR = santorini.SR{NTP: 1000 * ntpSec, RTPTime: 0}, true // 같은 기준 → 오프셋 0
	}
	p := policyOf(fs)
	t0 := time.Now()
	p.SetTarget(0, false)
	p.Decide(store(fs[0], 0, 10, 0, true, t0), true)
	p.SetTarget(2, false)
	cases := []struct {
		name    string
		lastOut uint32
		keyTS   uint32
		wantOut uint32 // 키프레임 출력 TS
	}{
		{"역행 없음", 1000, 2000, 2000},
		{"10ms 역행 → 직전 + 1", 3000, 2100, 3001},
		{"감김 경계 역행", 5, 0xFFFFFFF0, 6},
	}
	for i, c := range cases {
		p.current, p.tsOffset = 0, 0
		p.lastOut, p.hasLast = c.lastOut, true
		d, _ := p.Decide(store(fs[2], 2, uint64(100+i*10), c.keyTS, true, t0), true)
		if d != Forward || c.keyTS-p.tsOffset != c.wantOut {
			t.Errorf("%s : %v 출력 %d, 기대 %d", c.name, d, c.keyTS-p.tsOffset, c.wantOut)
		}
	}
	// 100ms 역행 : 1회 보류 후 두 번째는 적용
	p.current, p.tsOffset, p.lastOut = 0, 0, 20000
	if d, _ := p.Decide(store(fs[2], 2, 300, 11000, true, t0), true); d != SilentDrop {
		t.Errorf("75ms 초과 1회차 : %v, 기대 보류", d)
	}
	if d, _ := p.Decide(store(fs[2], 2, 310, 11000, true, t0), true); d != Forward || 11000-p.tsOffset != 20001 {
		t.Errorf("75ms 초과 2회차 : %v 출력 %d", d, 11000-p.tsOffset)
	}
}

func TestApplySwitchIncompleteFrameSkip(t *testing.T) {
	c := &Consumer{policy: newSimulcast(func(int8) layerSource { return nil })}
	c.seq.Sync(10)
	c.seq.Input(10) // 출력 1
	c.lastMarker = false
	c.applySwitch(&Switch{From: 0, To: 2}, forward.Item{ExtSeq: 500})
	if out, _ := c.seq.Input(500); out != 3 {
		t.Errorf("프레임 미완료 전환 : %d, 기대 3(1개 건너뜀)", out)
	}
	c.lastMarker = true
	c.applySwitch(&Switch{From: 2, To: 0}, forward.Item{ExtSeq: 9000})
	if out, _ := c.seq.Input(9000); out != 4 {
		t.Errorf("프레임 경계 전환 : %d, 기대 4", out)
	}
}

// BenchmarkLayerPolicy30 — 청중 30명 × 3레이어 패킷 판정(합성 부하 도구 C-6 승인 전 대체).
func BenchmarkLayerPolicy30(b *testing.B) {
	fs := newFakes()
	for i := range fs {
		fs[i].sr, fs[i].hasSR = santorini.SR{NTP: 1000 * ntpSec, RTPTime: 0}, true
	}
	ps := make([]*simulcast, 30)
	for i := range ps {
		ps[i] = policyOf(fs)
		ps[i].SetTarget(int8(i%3), false)
	}
	t0 := time.Now()
	items := make([]forward.Item, 300)
	for i := range items {
		l := int8(i % 3)
		items[i] = forward.Item{ExtSeq: uint64(1000 + i/3), Layer: l, Key: i/3%100 == 0, Marker: true, At: t0}
	}
	b.ResetTimer()
	for n := 0; n < b.N; n++ {
		it := items[n%len(items)]
		for _, p := range ps {
			p.Decide(it, true)
		}
	}
}
