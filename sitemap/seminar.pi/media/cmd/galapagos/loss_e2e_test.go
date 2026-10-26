// M2 손실 시나리오 T2·T3·T6·T7 (PRD_02 7.2) — 프로세스 내 모의 손실(loss_harness_test.go) 위에서 엔진 카운터와 청중 쪽 순번 연속성을 본다.
// 통과 기준은 시험 전에 정한 값(M2_TURN_NETEM.md 5절)이며 실패해도 기준을 낮추지 않는다. 실행 : go test ./cmd/galapagos -run Loss -v
package main

import (
	"fmt"
	"testing"
	"time"
)

// 통과 기준(사전 확정)
const (
	minRecovered   = 0.99                   // 구멍 난 순번 중 메워진 비율 — 3% 손실 회복(PRD_02 M2 완료 기준)
	maxRecoverP95  = time.Second            // Q3 : 1초 이내
	maxCacheMiss   = 0.05                   // D-3 되돌림 조건 : CacheMiss / NACKIn
	maxRtxPerLoss  = 2.0                    // T6 : 손실 순번당 재전송 평균 — 넘으면 중복 재전송 폭주
	maxPLIPerSecL0 = 2.0                    // Q8 : 레이어 l(0) 초당 2회
	minPLIGapL0    = 450 * time.Millisecond // Limiter 500ms − 피드백 주기·타이머 여유
	limiterL0      = 500 * time.Millisecond // 레이어 l Limiter 간격 — 폭주 창 안 최대 PLI = 창/간격 + 1(첫 PLI 는 창 시작 경계)
	cleanTail      = 300 * time.Millisecond // run 뒤 손실 없이 더 보내는 구간 — 마지막 손실도 뒤 패킷으로 구멍이 드러나게
	warmup         = 1500 * time.Millisecond
)

type scenario struct {
	name     string
	subRx    []*shaper // 청중별 하류(엔진 → 청중), nil = 손실 없음
	pubTx    *shaper   // 발표자 상류(발표자 → 엔진)
	run      time.Duration
	phase    func(el time.Duration) // run 동안 10ms 마다(T3 버스트 창)
	pliAfter time.Duration
	storm    time.Duration // run 뒤 청중 전원 PLI 폭주 구간(T7)
}

type outcome struct {
	subs     []subResult
	d        counterDelta
	dRun     counterDelta // 손실 구간(run)만의 증가분 — T7 폭주와 섞지 않는다
	pub      *pubBot
	stormPLI []time.Time
	runSec   float64
}

func clean() *shaper { return newShaper(0, 0, 0, 1) }

func runScenario(t *testing.T, sc scenario) outcome {
	url := startEngine(t)
	pubTx := sc.pubTx
	if pubTx == nil {
		pubTx = clean()
	}
	pubLoss := pubTx.loss.Load()
	pubTx.setLoss(0) // 연결·첫 화면은 손실 없이, warmup 뒤 적용
	pub := startPublisher(t, url, newLossyConn(t, pubTx, clean()))
	subs := make([]*subBot, len(sc.subRx))
	rxLoss := make([]uint64, len(sc.subRx))
	for i, rx := range sc.subRx {
		if rx == nil {
			rx = clean()
			sc.subRx[i] = rx
		}
		rxLoss[i] = rx.loss.Load()
		rx.setLoss(0)
		subs[i] = startSubscriber(t, url, fmt.Sprintf("a%d", i+1), newLossyConn(t, clean(), rx), sc.pliAfter)
	}
	for _, s := range subs {
		s.waitFirst(t)
	}
	time.Sleep(warmup)
	before := snapshot()
	pubTx.loss.Store(pubLoss)
	for i, rx := range sc.subRx {
		rx.loss.Store(rxLoss[i])
	}
	start := time.Now()
	for el := time.Duration(0); el < sc.run; el = time.Since(start) {
		if sc.phase != nil {
			sc.phase(el)
		}
		time.Sleep(10 * time.Millisecond)
	}
	runSec := time.Since(start).Seconds()
	dRun := delta(before)
	pubTx.setLoss(0) // 끝 구간 : 손실을 풀고 조금 더 보내 run 마지막 손실도 구멍으로 잡히게(재전송도 이 구간엔 손실 없음 — 5.1 한계)
	for _, rx := range sc.subRx {
		rx.setLoss(0)
	}
	time.Sleep(cleanTail)
	var storm []time.Time
	if sc.storm > 0 {
		time.Sleep(drainWait) // 앞 구간 구멍 정리 뒤 폭주
		mark := len(pub.PLIs())
		for _, s := range subs {
			s.storm.Store(true)
		}
		time.Sleep(sc.storm)
		for _, s := range subs {
			s.storm.Store(false)
		}
		storm = pub.PLIs()[mark:]
	}
	pub.Stop()
	time.Sleep(drainWait)
	o := outcome{d: delta(before), dRun: dRun, pub: pub, stormPLI: storm, runSec: runSec}
	last := uint16(pub.lastSeq.Load())
	for _, s := range subs {
		o.subs = append(o.subs, s.result(last))
	}
	t.Logf("[%s] 엔진 증가분 nackIn=%d nackOut=%d rtx=%d dupNack=%d cacheMiss=%d(%.1f%%) pliOut=%d queueDrops=%d keyframes=%d packetsOut=%d",
		sc.name, o.d["nackIn"], o.d["nackOut"], o.d["retransmits"], o.d["duplicateNack"], o.d["cacheMiss"],
		100*ratio(o.d["cacheMiss"], o.d["nackIn"]), o.d["pliOut"], o.d["queueDrops"], o.d["keyframes"], o.d["packetsOut"])
	t.Logf("[%s] 발표자 받은 NACK 순번=%d 재전송=%d PLI=%d · 상류 손실 버림=%d/%d", sc.name, pub.nacked.Load(), pub.resent.Load(),
		len(pub.PLIs()), pubTx.dropped.Load(), pubTx.dropped.Load()+pubTx.passed.Load())
	for i, r := range o.subs {
		t.Logf("[%s] %s 받음=%d 중복=%d 구멍=%d 회복=%d(%.2f%%) 포기=%d 남음=%d NACK=%d PLI=%d 회복시간 p50=%v p95=%v max=%v 끝구간=%d · 하류 버림=%d",
			sc.name, r.Name, r.Received, r.Dups, r.Lost, r.Recovered, 100*r.RecoveredRatio(), r.GaveUp, r.StillMiss,
			r.NACKSent, r.PLISent, r.RecoverP50, r.RecoverP95, r.RecMax, r.Tail, sc.subRx[i].dropped.Load())
	}
	return o
}

// checkRecovery — 손실이 걸린 청중의 회복률·회복 시간.
func checkRecovery(t *testing.T, name string, r subResult) {
	t.Helper()
	if r.Tail != 0 {
		t.Errorf("[%s] %s : 발표자 마지막 순번까지 못 받음(끝 구간 %d — 구멍으로도 안 잡힌 손실)", name, r.Name, r.Tail)
	}
	if r.Lost == 0 {
		t.Errorf("[%s] %s : 구멍이 하나도 없음 — 손실 주입이 안 됨", name, r.Name)
		return
	}
	if r.RecoveredRatio() < minRecovered {
		t.Errorf("[%s] %s 회복률 %.2f%% < %.0f%% (구멍 %d · 포기 %d · 남음 %d)", name, r.Name, 100*r.RecoveredRatio(), 100*minRecovered, r.Lost, r.GaveUp, r.StillMiss)
	}
	if r.RecoverP95 > maxRecoverP95 {
		t.Errorf("[%s] %s 회복 p95 %v > %v", name, r.Name, r.RecoverP95, maxRecoverP95)
	}
}

func checkCacheMiss(t *testing.T, name string, d counterDelta) {
	t.Helper()
	if x := ratio(d["cacheMiss"], d["nackIn"]); x > maxCacheMiss {
		t.Errorf("[%s] 캐시 미스율 %.1f%% > %.0f%% (D-3 되돌림 조건)", name, 100*x, 100*maxCacheMiss)
	}
}

func checkPLIRate(t *testing.T, name string, d counterDelta, sec float64) {
	t.Helper()
	if r := float64(d["pliOut"]) / sec; r > maxPLIPerSecL0 {
		t.Errorf("[%s] PLIOut %.2f/초 > %.0f/초 (Q8 레이어 l)", name, r, maxPLIPerSecL0)
	}
}

// T2 — 청중 1명 하류 균일 손실 3%.
func TestLossT2Uniform3(t *testing.T) {
	o := runScenario(t, scenario{name: "T2", subRx: []*shaper{newShaper(0.03, 0, 0, 2)}, run: 12 * time.Second, pliAfter: time.Second})
	checkRecovery(t, "T2", o.subs[0])
	checkCacheMiss(t, "T2", o.d)
	if o.d["retransmits"] == 0 {
		t.Errorf("[T2] 재전송 0")
	}
}

// T3 — 청중 1명 버스트 10%(PRD 5초를 2초로 줄임, 상관 25% 는 모사하지 않음) 뒤 회복.
func TestLossT3Burst10(t *testing.T) {
	if testing.Short() {
		t.Skip("-short : T3 생략")
	}
	rx := newShaper(0, 0, 0, 3)
	o := runScenario(t, scenario{name: "T3", subRx: []*shaper{rx}, run: 8 * time.Second, pliAfter: time.Second,
		phase: func(el time.Duration) {
			if el >= 2*time.Second && el < 4*time.Second {
				rx.setLoss(0.10)
			} else {
				rx.setLoss(0)
			}
		}})
	checkRecovery(t, "T3", o.subs[0])
	checkCacheMiss(t, "T3", o.d)
	checkPLIRate(t, "T3", o.d, o.runSec)
}

// T6 — 하류 150ms±30ms(FIFO) + 3% 손실. 지연만이면 NACK 이 없어 볼 것이 없으므로 T2 손실을 함께 건다.
func TestLossT6Delay150(t *testing.T) {
	if testing.Short() {
		t.Skip("-short : T6 생략")
	}
	o := runScenario(t, scenario{name: "T6", subRx: []*shaper{newShaper(0.03, 150*time.Millisecond, 30*time.Millisecond, 6)}, run: 12 * time.Second, pliAfter: time.Second})
	r := o.subs[0]
	checkRecovery(t, "T6", r)
	if r.Lost > 0 {
		if x := float64(o.d["retransmits"]) / float64(r.Lost); x > maxRtxPerLoss {
			t.Errorf("[T6] 손실 순번당 재전송 %.2f > %.1f (중복 재전송 — 청중 중복 수신 %d)", x, maxRtxPerLoss, r.Dups)
		}
	}
}

// T7 — 발표자 상류 3%, 청중 5명. 구멍은 상류 NACK 로 메워져야 하고, 끝에 청중 전원 PLI 폭주(100ms 마다) 3초로 Limiter 합치기를 본다.
func TestLossT7Upstream3(t *testing.T) {
	if testing.Short() {
		t.Skip("-short : T7 생략")
	}
	const n = 5
	o := runScenario(t, scenario{name: "T7", subRx: make([]*shaper, n), pubTx: newShaper(0.03, 0, 0, 7),
		run: 10 * time.Second, pliAfter: time.Second, storm: 3 * time.Second})
	for _, r := range o.subs {
		checkRecovery(t, "T7", r)
	}
	if o.pub.nacked.Load() == 0 {
		t.Errorf("[T7] 엔진이 발표자에게 NACK 를 보내지 않음")
	}
	sent := 0
	for _, r := range o.subs {
		sent += r.PLISent
	}
	checkPLIRate(t, "T7 손실 구간", o.dRun, o.runSec)
	st := o.stormPLI
	t.Logf("[T7] PLI : 손실 구간 PLIOut=%d(%.1f초) · 청중 송신 합계(전 구간)=%d · 폭주 3초 동안 발표자 수신=%d", o.dRun["pliOut"], o.runSec, sent, len(st))
	// 첫 PLI 는 창 시작 경계에 올 수 있어 그 뒤 간격 수로 센다 : (n−1) ≤ 창/Limiter 간격
	if limit := int(3 * time.Second / limiterL0); len(st)-1 > limit {
		t.Errorf("[T7] 폭주 중 발표자 PLI %d건 — 첫 PLI 뒤 %d건 > %d건(3초/%v)", len(st), len(st)-1, limit, limiterL0)
	}
	for i := 1; i < len(st); i++ {
		if g := st[i].Sub(st[i-1]); g < minPLIGapL0 {
			t.Errorf("[T7] 발표자 PLI 간격 %v < %v", g, minPLIGapL0)
		}
	}
	if len(st) == 0 {
		t.Errorf("[T7] 폭주 중 PLI 가 발표자에게 하나도 안 감")
	}
}
