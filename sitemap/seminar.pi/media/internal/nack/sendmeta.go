// SendMeta — 하류(구독자별) 메타 링 : 출력 순번 → 원본 extSeq·레이어·송신 시각·재전송 횟수(REA_03 5.3 sequencer 개념).
// 억제 min(100ms,2RTT)·최대 3회·PLI 후 키프레임까지 재전송 중단, 캐시 미스는 50ms 묶음 대기(상한 MaxPendingNACK)(PRD_02 D-4).
package nack

import "time"

const (
	MaxRetransmits = 3                      // 출력 순번당 하류 재전송 최대 횟수(REA_03 5.3)
	RtxSuppress    = 100 * time.Millisecond // 재요청 억제 상한 — 실제 간격 min(100ms, 2RTT)
	MissBatchWait  = 50 * time.Millisecond  // 캐시 미스 묶음 대기(REA_01 5.4)
	inferSpan      = 16                     // 보낸 적 없는 출력 순번(상류 손실 구멍)을 이웃 항목에서 추정할 탐색 폭
)

type metaEntry struct {
	valid   bool
	out     uint16
	src     uint64
	layer   int8
	at      time.Time // 송신 시각
	lastRtx time.Time
	count   uint8
}

// Miss — 캐시에 없던 재전송 요청(레이어별 상류 NACK 로 묶어 보낸다).
type Miss struct {
	Src   uint64
	Layer int8
}

// SendMeta — jeju 송신 고루틴 전용(잠금 없음).
type SendMeta struct {
	ring      []metaEntry
	rtt       time.Duration
	stopped   bool // 구독자 PLI 후 키프레임이 나갈 때까지 재전송 중단(REA_03 5.3 FlagStopRTXOnPLI 개념)
	miss      []Miss
	missSince time.Time
}

// NewSendMeta — size 개 링(영상 512 기준, size<=0 이면 VideoSlots).
func NewSendMeta(size int) *SendMeta {
	if size <= 0 {
		size = VideoSlots
	}
	return &SendMeta{ring: make([]metaEntry, size)}
}

func (m *SendMeta) at(out uint16) *metaEntry { return &m.ring[int(out)%len(m.ring)] }

// Push — 보낸 패킷 기록. 키프레임 송신 표시는 KeyframeSent 로 따로.
func (m *SendMeta) Push(out uint16, src uint64, layer int8, at time.Time) {
	*m.at(out) = metaEntry{valid: true, out: out, src: src, layer: layer, at: at}
}

// SetRTT — 하류 RR 로 잰 RTT(억제 간격 입력). RTT — 마지막 값(없으면 0).
func (m *SendMeta) SetRTT(rtt time.Duration) { m.rtt = rtt }
func (m *SendMeta) RTT() time.Duration       { return m.rtt }

// StopRTX — 구독자가 PLI·FIR 를 보냄 → 키프레임이 나갈 때까지 재전송 중단.
func (m *SendMeta) StopRTX() { m.stopped = true }

// KeyframeSent — 키프레임 첫 조각을 보냄 → 재전송 재개.
func (m *SendMeta) KeyframeSent() { m.stopped = false }

// Stopped — 재전송 중단 중인가.
func (m *SendMeta) Stopped() bool { return m.stopped }

// Resolve — 청중 NACK 의 출력 순번을 원본으로 되돌린다. ok=false : 재전송 중단 중, 억제 간격 안, 3회 초과, 추정 불가.
// 보낸 적 없는 출력 순번(상류 손실로 생긴 구멍)은 가까운 이웃 항목의 순번 차로 원본을 추정하고 그 자리에 기록한다
// (출력 = 입력 + 오프셋 구간 안이라는 가정, 이웃과의 사이에 SeqRewriter.Drop 이 있으면 1칸 어긋날 수 있다 — ponytail: M3 Drop 확정 후 SeqRewriter 역매핑으로 교체).
func (m *SendMeta) Resolve(out uint16, now time.Time, rtt time.Duration) (src uint64, layer int8, ok bool) {
	if m.stopped {
		return 0, 0, false
	}
	e := m.at(out)
	if !e.valid || e.out != out {
		s, l, found := m.infer(out)
		if !found {
			return 0, 0, false
		}
		*e = metaEntry{valid: true, out: out, src: s, layer: l}
	}
	if e.count >= MaxRetransmits {
		return 0, 0, false
	}
	gap := RtxSuppress
	if rtt > 0 && 2*rtt < gap {
		gap = 2 * rtt
	}
	if e.count > 0 && now.Sub(e.lastRtx) < gap {
		return 0, 0, false
	}
	e.count++
	e.lastRtx = now
	return e.src, e.layer, true
}

// infer — out 앞뒤 inferSpan 안의 실제 송신 항목에서 원본 순번을 추정(뒤쪽 우선 — NACK 은 뒤 패킷이 도착한 뒤에 온다).
func (m *SendMeta) infer(out uint16) (uint64, int8, bool) {
	for d := uint16(1); d <= inferSpan; d++ {
		if n := m.at(out + d); n.valid && n.out == out+d && !n.at.IsZero() && n.src >= uint64(d) {
			return n.src - uint64(d), n.layer, true
		}
		if p := m.at(out - d); p.valid && p.out == out-d && !p.at.IsZero() {
			return p.src + uint64(d), p.layer, true
		}
	}
	return 0, 0, false
}

// AddMiss — 캐시 미스 기록. 첫 미스부터 MissBatchWait 뒤 TakeMisses 가 묶어 꺼낸다. 상한을 넘으면 오래된 것부터 버린다.
func (m *SendMeta) AddMiss(src uint64, layer int8, now time.Time) {
	for _, x := range m.miss {
		if x.Src == src && x.Layer == layer {
			return
		}
	}
	if len(m.miss) == 0 {
		m.missSince = now
	}
	if len(m.miss) >= MaxPendingNACK {
		m.miss = m.miss[1:]
	}
	m.miss = append(m.miss, Miss{src, layer})
}

// TakeMisses — 묶음 대기가 끝났으면 모아 둔 미스를 돌려주고 비운다. 아직이면 nil.
func (m *SendMeta) TakeMisses(now time.Time) []Miss {
	if len(m.miss) == 0 || now.Sub(m.missSince) < MissBatchWait {
		return nil
	}
	out := m.miss
	m.miss = nil
	return out
}
