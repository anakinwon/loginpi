// 레이어 활성·비트레이트 — 500ms 주기 판정, 레이어 0은 2초·상위는 10초 연속이어야 활성, 비트레이트 1초 갱신(PRD_02 3.3 santorini, REA_03 5.5, M4).
// observe 는 수신 고루틴 전용, Active·Bitrate 는 jeju·bwe·bora 고루틴이 읽는다 → 읽히는 값만 atomic.
package santorini

import (
	"sync/atomic"
	"time"
)

const (
	actPeriod     = 500 * time.Millisecond
	bitratePeriod = time.Second
	staleAfter    = 2 * actPeriod // 마지막 패킷 뒤 이만큼 조용하면 정지로 본다
)

// 주기당 최소 패킷 수·활성까지 연속 주기 수(REA_03 5.5 : 레이어 0 = 1개·4주기, 상위 = 5개·20주기)
func actRule(idx int8) (minPkts, needPeriods int) {
	if idx <= 0 {
		return 1, 4
	}
	return 5, 20
}

// activity — 수신 고루틴 소유 필드 + atomic 공개 값.
type activity struct {
	periodStart time.Time
	count       int
	streak      int
	rateStart   time.Time
	bytes       int64

	active  atomic.Bool
	lastAt  atomic.Int64 // UnixNano
	bitrate atomic.Int64 // bps
}

// observe — 수신 고루틴이 패킷마다 호출(크기 n 바이트).
func (l *Layer) observe(n int, now time.Time) {
	a := &l.act
	if a.periodStart.IsZero() {
		a.periodStart, a.rateStart = now, now
	}
	minPkts, need := actRule(l.idx)
	switch el := now.Sub(a.periodStart); {
	case el >= 2*actPeriod: // 빈 주기가 끼었다 = 최소 수 미달 주기 → 정지
		a.streak, a.count, a.periodStart = 0, 0, now
		a.active.Store(false)
	case el >= actPeriod: // 주기 마감
		if a.count >= minPkts {
			a.streak++
			if a.streak >= need {
				a.active.Store(true)
			}
		} else {
			a.streak = 0
			a.active.Store(false)
		}
		a.count = 0
		a.periodStart = a.periodStart.Add(actPeriod)
	}
	a.count++

	a.bytes += int64(n)
	if el := now.Sub(a.rateStart); el >= bitratePeriod {
		a.bitrate.Store(a.bytes * 8 * int64(time.Second) / int64(el))
		a.bytes, a.rateStart = 0, now
	}
	a.lastAt.Store(now.UnixNano())
}

// stale — 마지막 패킷 뒤 staleAfter 가 지났나.
func (a *activity) stale(now time.Time) bool {
	return now.UnixNano()-a.lastAt.Load() >= int64(staleAfter)
}

// Active — 레이어 활성 여부(연속 주기 충족 + 최근 1초 안에 패킷).
func (l *Layer) Active() bool { return l.act.active.Load() && !l.act.stale(time.Now()) }

// Bitrate — 최근 1초 비트레이트(bps). 패킷이 끊겼으면 0.
func (l *Layer) Bitrate() int64 {
	if l.act.stale(time.Now()) {
		return 0
	}
	return l.act.bitrate.Load()
}
