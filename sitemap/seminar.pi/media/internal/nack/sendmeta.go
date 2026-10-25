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
	fence     uint16 // 이 출력 순번부터 현재 구간(레이어 전환·재개로 헤더 재작성 기준이 바뀐 지점)
	fenced    bool
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
	if m.fenced && int(int16(out-m.fence)) >= len(m.ring) {
		m.fenced = false // 경계가 링 밖으로 밀려남 — 16비트 비교가 감겨 뒤집히기 전에 푼다
	}
}

// Fence — out 부터 새 구간. 그 앞 출력 순번(전환 전 레이어·Sync 로 일부러 비운 칸)은 Resolve 가 거부하고 infer 도 경계를 넘지 않는다.
// 이전 구간 패킷은 TS·VP8 오프셋이 달라 현재 기준으로 다시 쓰면 수신 측 프레임 조립이 깨진다 — 복구는 PLI 경로에 맡긴다.
func (m *SendMeta) Fence(out uint16) { m.fence, m.fenced = out, true }

// before — out 이 현재 구간 앞인가.
func (m *SendMeta) before(out uint16) bool { return m.fenced && int16(out-m.fence) < 0 }

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
	if m.stopped || m.before(out) {
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
// out 은 현재 구간 안(Resolve 가 before 를 거부)이라 뒤쪽 이웃은 같은 구간이고, 앞쪽 이웃도 경계 앞이면 쓰지 않는다.
func (m *SendMeta) infer(out uint16) (uint64, int8, bool) {
	for d := uint16(1); d <= inferSpan; d++ {
		if n := m.at(out + d); n.valid && n.out == out+d && !n.at.IsZero() && n.src >= uint64(d) {
			return n.src - uint64(d), n.layer, true
		}
		if p := m.at(out - d); p.valid && p.out == out-d && !p.at.IsZero() && !m.before(out-d) {
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
