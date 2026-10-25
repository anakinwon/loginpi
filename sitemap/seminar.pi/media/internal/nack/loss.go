// LossTracker — 상류(발표자 방향) 손실 추적. 첫 NACK 은 구멍 뒤로 20ms 분량(2~24패킷)·최근 4패킷 이상 도착한 뒤,
// 이후 RTT 간격·최대 10회 재요청, 상한을 넘으면 키프레임 이전 정리 → 그래도 넘치면 비우고 PLI(PRD_02 D-4, REA_01 5.3·REA_02 5.3).
package nack

import (
	"slices"
	"time"

	"github.com/pion/rtcp"
)

const (
	// MaxPendingNACK — 대기 NACK 상한 초안(LiveKit 5000 → 30명 규모 축소, PRD_02 3.3 nack). [TBD : M2 실측]
	MaxPendingNACK = 1000
	MaxNACKTries   = 10                     // 순번당 상류 NACK 최대 횟수(REA_02 5.3)
	DefaultRTT     = 100 * time.Millisecond // RTT 를 아직 모를 때(REA_02 5.3)
	RecentSkip     = 4                      // 최근 4패킷은 순서 뒤바뀜일 수 있어 첫 NACK 에서 뺀다(REA_01 5.3)
	minNACKDelay   = 2                      // 첫 NACK 대기 패킷 수 하한(REA_01 5.3 — 중복 ACK 2개)
	maxNACKDelay   = 24                     // 상한
)

type lossEntry struct {
	tries  uint8
	last   time.Time
	forced bool // 하류 캐시 미스에서 온 요청(Request) — 첫 NACK 대기 없이 바로
}

// LossTracker — 레이어 수신 고루틴 전용(잠금 없음). 0값이 아니라 NewLossTracker 로 만든다.
type LossTracker struct {
	started  bool
	max      uint64 // 받은 가장 큰 확장 순번
	lastKey  uint64
	hasKey   bool
	missing  map[uint64]lossEntry
	overflow bool

	// 첫 NACK 대기 패킷 수 = 패킷 속도/50(=20ms 분량), 2~24(REA_01 5.3). 1초마다 Due 에서 갱신.
	count     int
	rateStart time.Time
	delay     uint64
}

// NewLossTracker — 레이어당 1개.
func NewLossTracker() *LossTracker {
	return &LossTracker{missing: map[uint64]lossEntry{}, delay: minNACKDelay}
}

// Receive — 수신 순번 기록(순서 뒤바뀜·재전송 도착 포함).
func (t *LossTracker) Receive(extSeq uint64, key bool) {
	t.count++
	if key && (!t.hasKey || extSeq > t.lastKey) {
		t.lastKey, t.hasKey = extSeq, true
	}
	if !t.started {
		t.started, t.max = true, extSeq
		return
	}
	if extSeq <= t.max {
		delete(t.missing, extSeq) // 늦게 왔거나 재전송으로 복구
		return
	}
	if gap := extSeq - t.max - 1; gap > MaxPendingNACK {
		clear(t.missing) // 구멍이 상한보다 크면 복구할 가치 없음 → 키프레임으로
		t.overflow = true
	} else {
		for s := t.max + 1; s < extSeq; s++ {
			t.missing[s] = lossEntry{}
		}
	}
	t.max = extSeq
	if len(t.missing) > MaxPendingNACK {
		t.trim()
	}
}

// trim — 상한 초과 : 마지막 키프레임 이전 항목 삭제, 그래도 넘치면 전부 비우고 Overflow(REA_02 5.3).
func (t *LossTracker) trim() {
	if t.hasKey {
		for s := range t.missing {
			if s < t.lastKey {
				delete(t.missing, s)
			}
		}
	}
	if len(t.missing) > MaxPendingNACK {
		clear(t.missing)
		t.overflow = true
	}
}

// Request — 하류 캐시 미스(jeju 50ms 묶음)로 온 상류 재요청. 이미 대기 중이거나 아직 받지 않은 미래 순번이면 무시.
func (t *LossTracker) Request(extSeq uint64) {
	if !t.started || extSeq >= t.max || len(t.missing) >= MaxPendingNACK {
		return
	}
	if _, ok := t.missing[extSeq]; !ok {
		t.missing[extSeq] = lossEntry{forced: true}
	}
}

// Due — 지금 상류로 보낼 NACK 묶음(오름차순, 감김은 NackPair 가 16비트로 처리). rtt<=0 이면 DefaultRTT.
func (t *LossTracker) Due(now time.Time, rtt time.Duration) []rtcp.NackPair {
	if rtt <= 0 {
		rtt = DefaultRTT
	}
	if t.rateStart.IsZero() {
		t.rateStart = now
	} else if el := now.Sub(t.rateStart); el >= time.Second {
		d := uint64(float64(t.count) / el.Seconds() / 50)
		t.delay = min(max(d, minNACKDelay), maxNACKDelay)
		t.count, t.rateStart = 0, now
	}
	wait := max(t.delay, RecentSkip)

	var seqs []uint64
	for s, e := range t.missing {
		if e.tries == 0 {
			if !e.forced && t.max-s < wait {
				continue // 순서 뒤바뀜일 수 있음
			}
		} else if now.Sub(e.last) < rtt {
			continue // 재요청은 RTT 간격
		}
		e.tries++
		e.last = now
		if e.tries >= MaxNACKTries {
			delete(t.missing, s) // 10회째 보내고 포기
		} else {
			t.missing[s] = e
		}
		seqs = append(seqs, s)
	}
	if len(seqs) == 0 {
		return nil
	}
	slices.Sort(seqs)
	s16 := make([]uint16, len(seqs))
	for i, s := range seqs {
		s16[i] = uint16(s)
	}
	return rtcp.NackPairsFromSequenceNumbers(s16)
}

// Overflow — 직전 확인 이후 상한 초과가 있었으면 true(읽으면 지워짐) → 호출자가 pli.NackOverflow 로 PLI 요청.
func (t *LossTracker) Overflow() bool {
	o := t.overflow
	t.overflow = false
	return o
}
