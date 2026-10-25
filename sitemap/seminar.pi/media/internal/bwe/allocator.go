// Allocator — 구독 PC 당 1개. 1회차 레이어 0 보장 → 우선순위·목표 거리 순 상향, 재상향 1.2배 히스테리시스, 일시정지 기본 끔(PRD_02 3.3 bwe·D-8, REA_02 5.8, REA_03 5.6).
// 이벤트 고루틴 1개가 core 를 단독 소유한다(D-10). 공개 메서드는 이벤트를 넣기만 한다.
package bwe

import (
	"math"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// AllocState — 할당 상태.
type AllocState uint8

const (
	Stable AllocState = iota
	Deficient
)

func (s AllocState) String() string {
	if s == Deficient {
		return "deficient"
	}
	return "stable"
}

// Target — 할당 결과 수신자(*jeju.Consumer 가 구현, 내부는 채널).
type Target interface {
	SetTarget(layer int8, paused bool)
}

// ConsumerView — 트랙 상태 스냅샷(값 복사 — 공유 없음).
type ConsumerView struct {
	ID       string
	Priority uint8    // 화면공유 255 > 발표자 영상 > 패널 영상
	Bitrates [3]int64 // 레이어별 bps(santorini Layer.Bitrate)
	Active   [3]bool  // 레이어 활성(santorini Layer.Active)
	MaxLayer int8     // consumer.setLayer 상한(기본 2 로 채워 보낼 것 — 0값은 l 만)
}

const (
	hysteresis     = 1.2  // 내렸던 레이어 재상향 시 필요 배수(REA_02 5.8)
	commitFraction = 0.95 // 기대 사용량의 95% 이하일 때만 용량 확정(REA_03 5.7)
	lossFactor     = 0.4  // 손실 사유 용량 = 기대 × (1 − 0.4 × NACK비율)
	rembRetrack    = 2 * time.Second
	tickEvery      = 250 * time.Millisecond // 탐침 상태기계 주기 [TBD]
	eventQueue     = 64
)

// Allocator — 이벤트 큐 1개.
type Allocator struct {
	ev    chan func(*core, time.Time)
	state atomic.Uint32
	once  sync.Once
	done  chan struct{}
}

// NewAllocator — 구독 PC 생성 시 bora 가 만든다. Close 로 고루틴을 끝낸다.
func NewAllocator() *Allocator {
	a := &Allocator{ev: make(chan func(*core, time.Time), eventQueue), done: make(chan struct{})}
	go a.run()
	return a
}

func (a *Allocator) run() {
	c := newCore()
	tk := time.NewTicker(tickEvery)
	defer tk.Stop()
	for {
		select {
		case fn := <-a.ev:
			fn(c, time.Now())
		case now := <-tk.C:
			c.tick(now)
		case <-a.done:
			return
		}
		a.state.Store(uint32(c.state))
	}
}

// post — must=true 면 자리가 날 때까지 기다린다(등록·해제·변경). 아니면 큐가 차면 버린다(REMB·NACK 통계 — 다음 값이 곧 온다).
func (a *Allocator) post(fn func(*core, time.Time), must bool) {
	if must {
		select {
		case a.ev <- fn:
		case <-a.done:
		}
		return
	}
	select {
	case a.ev <- fn:
	default:
	}
}

// Add — 구독 트랙 등록.
func (a *Allocator) Add(id string, t Target) {
	a.post(func(c *core, now time.Time) { c.add(id, t) }, true)
}

// Remove — 구독 트랙 해제.
func (a *Allocator) Remove(id string) {
	a.post(func(c *core, now time.Time) { c.remove(id) }, true)
}

// OnREMB — 추적 SSRC 1개의 REMB 에만 반응(같은 REMB 가 트랙마다 올라오는 중복 제거).
func (a *Allocator) OnREMB(bps float32, ssrcs []uint32) {
	if bps < 0 || math.IsNaN(float64(bps)) || math.IsInf(float64(bps), 0) || len(ssrcs) == 0 {
		return // 신뢰 경계 : 청중이 보낸 값
	}
	ss := append([]uint32(nil), ssrcs...)
	a.post(func(c *core, now time.Time) { c.onREMB(int64(bps), ss, now) }, false)
}

// OnNackStats — 2~3초 창 NACK 비율(혼잡 8%). sent = 보낸 패킷, repeated = 재전송(NACK 응답) 수.
func (a *Allocator) OnNackStats(sent, repeated uint32) {
	a.post(func(c *core, now time.Time) { c.onNack(sent, repeated, now) }, false)
}

// OnConsumerChanged — 레이어 활성·비트레이트·상한 변경.
func (a *Allocator) OnConsumerChanged(v ConsumerView) {
	a.post(func(c *core, now time.Time) { c.update(v) }, true)
}

// SetProbeSink — 탐침 시작(bps>0)·종료(0) 통지 대상. 패딩 송신은 구독 Transport 쪽(통합 단계). 이벤트 고루틴에서 불린다.
func (a *Allocator) SetProbeSink(fn func(bps int64)) {
	a.post(func(c *core, now time.Time) { c.probeSink = fn }, true)
}

// State — 현재 상태(어느 고루틴이든).
func (a *Allocator) State() AllocState { return AllocState(a.state.Load()) }

// Close — 이벤트 고루틴 종료.
func (a *Allocator) Close() { a.once.Do(func() { close(a.done) }) }

// ---- core : 이벤트 고루틴 전용(잠금 없음, 시각은 인자로 — 테스트가 직접 부른다) ----

type track struct {
	t       Target
	v       ConsumerView
	alloc   int8 // 마지막 적용 레이어(-1 = 아직 없음)
	lowFrom int8 // 이 레이어 이하로 다시 올릴 땐 1.2배 필요(-1 = 없음)
}

// desired — 상한 이하에서 가장 높은 활성 레이어. 활성 레이어가 없으면 0(레이어 0 보장).
func (tr *track) desired() int8 {
	for l := min(tr.v.MaxLayer, 2); l > 0; l-- {
		if tr.v.Active[l] {
			return l
		}
	}
	return 0
}

// next — cur 위의 다음 활성 레이어(≤ desired). 없으면 -1.
func (tr *track) next(cur, want int8) int8 {
	for l := cur + 1; l <= want; l++ {
		if tr.v.Active[l] {
			return l
		}
	}
	return -1
}

type core struct {
	tracks    map[string]*track
	order     []*track // 정렬 재사용
	state     AllocState
	committed int64 // 확정 용량(bps). 0 = 제한 없음(STABLE)
	lastREMB  int64
	rembAt    time.Time
	tracked   uint32
	hasTrack  bool
	trend     trend
	nack      nackWindow
	probe     prober
	probeSink func(bps int64)
}

func newCore() *core { return &core{tracks: map[string]*track{}} }

func (c *core) add(id string, t Target) {
	if tr, ok := c.tracks[id]; ok {
		tr.t = t
		return
	}
	c.tracks[id] = &track{t: t, v: ConsumerView{ID: id, MaxLayer: 2}, alloc: -1, lowFrom: -1}
	c.allocate()
}

func (c *core) remove(id string) {
	delete(c.tracks, id)
	c.allocate()
}

func (c *core) update(v ConsumerView) {
	tr, ok := c.tracks[v.ID]
	if !ok {
		return
	}
	tr.v = v
	c.allocate()
}

func (c *core) onREMB(bps int64, ssrcs []uint32, now time.Time) {
	has := false
	for _, s := range ssrcs {
		if c.hasTrack && s == c.tracked {
			has = true
			break
		}
	}
	if !has {
		if c.hasTrack && now.Sub(c.rembAt) < rembRetrack {
			return // 다른 트랙에 실려 온 같은 REMB
		}
		c.tracked, c.hasTrack = ssrcs[0], true
	}
	c.lastREMB, c.rembAt = bps, now
	c.trend.add(bps, now)
	if c.trend.falling(c.probe.active) {
		c.congested(now, false, 0)
	}
}

func (c *core) onNack(sent, repeated uint32, now time.Time) {
	if ratio, cong, done := c.nack.add(sent, repeated, now, c.probe.active); done && cong {
		c.congested(now, true, ratio)
	}
}

// expected — 현재 할당 레이어 비트레이트 합.
func (c *core) expected() int64 {
	var sum int64
	for _, tr := range c.tracks {
		if tr.alloc >= 0 {
			sum += tr.v.Bitrates[tr.alloc]
		}
	}
	return sum
}

// congested — 용량 확정 후 재할당. 손실 사유면 기대 × (1 − 0.4·비율), 아니면 마지막 REMB(REA_03 5.7).
func (c *core) congested(now time.Time, loss bool, ratio float64) {
	if c.probe.active {
		c.probe.congested = true
	}
	exp := c.expected()
	capBps := c.lastREMB
	if loss {
		capBps = int64(float64(exp) * (1 - lossFactor*ratio))
		if c.lastREMB > 0 && c.lastREMB < capBps {
			capBps = c.lastREMB
		}
	}
	if capBps <= 0 || float64(capBps) > commitFraction*float64(exp) || capBps == c.committed {
		return // 작은 흔들림엔 재할당하지 않음
	}
	c.committed = capBps
	c.trend.reset()
	c.nack.reset(now)
	c.allocate()
	if c.state == Deficient && !c.probe.active { // 확정 직후엔 한 간격 쉬고 탐침
		c.probe.nextAt = now.Add(max(c.probe.interval, probeInterval))
	}
}

// tick — 탐침 상태기계.
func (c *core) tick(now time.Time) {
	if c.state != Deficient {
		return
	}
	if c.probe.active {
		if now.Before(c.probe.endAt) {
			return
		}
		ok := !c.probe.congested && c.lastREMB > c.committed
		if ok {
			c.committed = c.lastREMB
		}
		c.probe.finish(now, ok)
		c.sink(0)
		if ok {
			c.allocate()
		}
		return
	}
	if c.probe.due(now) {
		goal := c.probeGoal()
		c.probe.start(now, goal, c.lastREMB)
		c.trend.reset()
		c.nack.reset(now)
		c.sink(goal)
	}
}

func (c *core) sink(bps int64) {
	if c.probeSink != nil {
		c.probeSink(bps)
	}
}

// probeGoal — 목표에서 가장 먼 트랙의 다음 단계 증가분 × 120%, 최소 200kbps(REA_03 5.8).
func (c *core) probeGoal() int64 {
	var best *track
	bestGap := int8(0)
	for _, tr := range c.sorted() {
		if gap := tr.desired() - tr.alloc; gap > bestGap {
			best, bestGap = tr, gap
		}
	}
	goal := int64(probeMinBps)
	if best != nil && best.alloc >= 0 {
		if n := best.next(best.alloc, best.desired()); n >= 0 {
			if g := int64(float64(best.v.Bitrates[n]-best.v.Bitrates[best.alloc]) * probeGainFactor); g > goal {
				goal = g
			}
		}
	}
	return goal
}

// sorted — 우선순위 높은 순, 같으면 ID 순(결정적).
func (c *core) sorted() []*track {
	c.order = c.order[:0]
	for _, tr := range c.tracks {
		c.order = append(c.order, tr)
	}
	sort.Slice(c.order, func(i, j int) bool {
		a, b := c.order[i], c.order[j]
		if a.v.Priority != b.v.Priority {
			return a.v.Priority > b.v.Priority
		}
		return a.v.ID < b.v.ID
	})
	return c.order
}

// allocate — 전체 재할당. 결과는 라운드가 끝날 때 한꺼번에 적용한다.
func (c *core) allocate() {
	ts := c.sorted()
	plan := make([]int8, len(ts))
	if c.committed <= 0 { // 제한 없음 : 각자 원하는 레이어
		for i, tr := range ts {
			plan[i] = tr.desired()
		}
	} else {
		// 1회차 : 모두 레이어 0 보장(일시정지 끔 — 용량을 넘어도 보낸다)
		remain := c.committed
		for _, tr := range ts {
			remain -= tr.v.Bitrates[0]
		}
		// 이후 : 우선순위 높고 목표에서 먼 트랙부터 한 단계씩, 더 올릴 수 없을 때까지
		for raised := true; raised; {
			raised = false
			idx := make([]int, 0, len(ts))
			for i, tr := range ts {
				if plan[i] < tr.desired() {
					idx = append(idx, i)
				}
			}
			sort.SliceStable(idx, func(x, y int) bool {
				a, b := ts[idx[x]], ts[idx[y]]
				if a.v.Priority != b.v.Priority {
					return a.v.Priority > b.v.Priority
				}
				return a.desired()-plan[idx[x]] > b.desired()-plan[idx[y]]
			})
			for _, i := range idx {
				tr := ts[i]
				n := tr.next(plan[i], tr.desired())
				if n < 0 {
					continue
				}
				delta := tr.v.Bitrates[n] - tr.v.Bitrates[plan[i]]
				need := delta
				if tr.lowFrom >= 0 && n <= tr.lowFrom {
					need = int64(hysteresis*float64(tr.v.Bitrates[n])) - tr.v.Bitrates[plan[i]]
				}
				if need <= remain {
					remain -= delta
					plan[i] = n
					raised = true
				}
			}
		}
	}

	deficient := false
	for i, tr := range ts {
		l := plan[i]
		switch {
		case c.committed <= 0:
			tr.lowFrom = -1
		case tr.alloc > l:
			tr.lowFrom = max(tr.lowFrom, tr.alloc)
		case tr.lowFrom >= 0 && l >= tr.lowFrom:
			tr.lowFrom = -1
		}
		if l < tr.desired() {
			deficient = true
		}
		if l != tr.alloc {
			tr.alloc = l
			if tr.t != nil {
				tr.t.SetTarget(l, false)
			}
		}
	}
	if deficient {
		c.state = Deficient
		return
	}
	if c.state == Deficient { // STABLE 진입 : 탐침 중지·용량 제한 해제(REA_03 5.6)
		if c.probe.active {
			c.sink(0)
		}
		c.probe.stop()
		c.committed = 0
		c.trend.reset()
	}
	c.state = Stable
}
