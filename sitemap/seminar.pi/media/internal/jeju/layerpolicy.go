// LayerPolicy 구현 — 음성 : 그대로 전달. 영상 : simulcast 전환(목표/현재 분리, 키프레임 경계, SR NTP TS 정렬·75ms 상한, SR 없으면 보류+재요청,
// 프레임 미완료 skip, 옛 패킷 차단, 부족 상태 하향 즉시 차단, VP8 picture ID 연속화) — PRD_02 D-8, REA_02 5.7, REA_03 5.5.
package jeju

import (
	"encoding/binary"
	"time"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/metrics"
	"seminar.pi/media/internal/nack"
	"seminar.pi/media/internal/pli"
	"seminar.pi/media/internal/rtpx"
	"seminar.pi/media/internal/santorini"
)

const (
	videoClock     = 90000                         // VP8 RTP 클록(Hz)
	maxTSBackstep  = 75 * videoClock / 1000        // 역행 보정 상한 75ms(REA_02 5.7)
	setMaxDebounce = 100 * time.Millisecond        // consumer.setLayer 디바운스(REA_03 5.11)
	keyRetryEvery  = time.Second                   // 목표 레이어 키프레임 재요청 간격 [TBD : M4 실측]
	topLayer       = int8(santorini.MaxLayers - 1) // h
)

// layerSource — 정책이 레이어에서 쓰는 것만(*santorini.Layer 가 만족, 테스트는 가짜).
type layerSource interface {
	LastSR() (santorini.SR, bool)
	Cache() *nack.PacketCache
	RequestKeyframe(r pli.Reason)
	Active() bool // 비활성 감지(santorini activity) — 비활성 레이어는 목표에서 뺀다(M3 ⑥)
}

// newPolicy — Consumer 생성 시 정책 선택. 음성은 레이어 1개라 그대로 전달, 영상은 simulcast 정책(레이어 1개여도 동작).
func newPolicy(p *santorini.Producer) LayerPolicy {
	if p == nil || p.Kind() != santorini.Video {
		return &singleLayer{started: true}
	}
	return newSimulcast(func(i int8) layerSource {
		if l := p.Layer(i); l != nil {
			return l
		}
		return nil // nil 인터페이스로(타입 있는 nil 금지)
	})
}

// singleLayer — 레이어 0 만, 첫 키프레임부터 보낸다(started=true 면 즉시).
type singleLayer struct{ started bool }

func (s *singleLayer) Decide(it forward.Item, lastMarker bool) (Decision, *Switch) {
	if it.Layer != 0 {
		return SilentDrop, nil
	}
	if !s.started {
		if !it.Key {
			return Buffer, nil
		}
		s.started = true
	}
	return Forward, nil
}

func (s *singleLayer) SetTarget(layer int8, paused bool)  {}
func (s *singleLayer) SetMax(layer int8)                  {}
func (s *singleLayer) State() (current, target, max int8) { return 0, 0, 0 }

// simulcast — 송신 고루틴 전용(잠금 없음).
type simulcast struct {
	layer   func(i int8) layerSource
	current int8 // -1 = 아직 시작 전
	target  int8 // bwe.Allocator 결정
	max     int8 // 클라이언트 상한(setLayer)
	paused  bool

	pendingMax   int8 // 디바운스 대기 중인 상한(-1 = 없음)
	pendingMaxAt time.Time

	minSeq    uint64 // 현재 레이어 전환 기준 순번 — 이보다 앞선 옛 패킷 차단
	blocked   bool   // 부족 상태 하향 : 낮은 레이어 키프레임까지 현재 레이어 전달 중지
	requested time.Time
	retried   bool // 75ms 초과 보정 1회 보류 여부

	tsOffset uint32 // 출력 TS = 입력 TS − tsOffset
	lastOut  uint32 // 마지막 출력 TS(noteSent)
	hasLast  bool
	vp8      rtpx.VP8Munger
	buf      [nack.SlotSize]byte // 키프레임 TS 읽기용
}

func newSimulcast(layer func(int8) layerSource) *simulcast {
	return &simulcast{layer: layer, current: -1, target: topLayer, max: topLayer, pendingMax: -1}
}

// eff — 실제 목표 = min(target, max) 이하에서 가장 높은 활성 레이어(없으면 0 — 할당기 desired 와 같은 규칙, M3 ⑥).
// 할당기에 들지 않는 녹화 Consumer 도 발행자가 상위 레이어를 끊으면 다음 키프레임 경계에서 내려간다(멈춤 방지).
func (s *simulcast) eff() int8 {
	e := s.target
	if s.max < e {
		e = s.max
	}
	for e > 0 {
		if l := s.layer(e); l != nil && l.Active() {
			break
		}
		e--
	}
	if e < 0 {
		e = 0
	}
	return e
}

// wants — 키프레임 레이어 l 로 전환할 수 있나(상향 : 현재 < l ≤ 목표, 하향 : 목표 ≤ l < 현재 — REA_03 5.5).
func (s *simulcast) wants(l, eff int8) bool {
	switch {
	case s.current < 0:
		return l <= eff
	case s.current < eff:
		return s.current < l && l <= eff
	case s.current > eff:
		return eff <= l && l < s.current
	}
	return false
}

func (s *simulcast) Decide(it forward.Item, lastMarker bool) (Decision, *Switch) {
	if s.pendingMax >= 0 && it.At.Sub(s.pendingMaxAt) >= setMaxDebounce {
		s.max, s.pendingMax = s.pendingMax, -1
	}
	eff := s.eff()
	if s.paused {
		if it.Layer == s.current {
			return Drop, nil
		}
		return SilentDrop, nil
	}
	if s.current != eff && (s.requested.IsZero() || it.At.Sub(s.requested) >= keyRetryEvery) {
		if l := s.layer(eff); l != nil {
			l.RequestKeyframe(pli.LayerSwitch) // Limiter 가 합친다
		}
		s.requested = it.At
	}
	if it.Layer == s.current {
		switch {
		case it.ExtSeq < s.minSeq: // 전환 전의 옛 패킷
			return SilentDrop, nil
		case s.blocked:
			return Drop, nil
		}
		return Forward, nil
	}
	if !it.Key || !s.wants(it.Layer, eff) {
		if s.current < 0 && it.Layer == eff {
			return Buffer, nil
		}
		return SilentDrop, nil
	}
	if !s.align(it) {
		return SilentDrop, nil
	}
	sw := &Switch{From: s.current, To: it.Layer}
	s.current, s.minSeq, s.blocked, s.requested = it.Layer, it.ExtSeq, false, time.Time{}
	return Forward, sw
}

// align — 새 레이어 TS 오프셋 계산. 보류해야 하면 false(이 키프레임은 버리고 재요청).
// offN = offR + tsN − tsR − Δntp·90000 : 두 레이어 SR 이 가리키는 같은 벽시계 순간을 같은 출력 TS 로 맞춘다.
func (s *simulcast) align(it forward.Item) bool {
	nw := s.layer(it.Layer)
	if s.current < 0 || nw == nil {
		return true // 첫 시작 : 오프셋 0
	}
	ref := s.layer(s.current)
	if ref == nil {
		return true
	}
	srR, okR := ref.LastSR()
	srN, okN := nw.LastSR()
	if !okR || !okN { // SR 없으면 보류 + 키프레임 재요청(PRD_02 D-8). [TBD : 오래 안 오면 경과 시간 기준 대체]
		nw.RequestKeyframe(pli.LayerSwitch)
		return false
	}
	dntp := float64(int64(srN.NTP-srR.NTP)) / (1 << 32) // 초(부호 있음)
	off := s.tsOffset + srN.RTPTime - srR.RTPTime - uint32(int64(dntp*videoClock))

	// 역행 방지 : 새 키프레임 출력 TS 가 이미 보낸 TS 이하이면 밀어 준다. 75ms 넘게 밀어야 하면 1회는 다음 키프레임을 기다린다.
	if s.hasLast {
		if n := nw.Cache().GetAt(it.ExtSeq, it.Idx, s.buf[:]); n >= 12 {
			out := binary.BigEndian.Uint32(s.buf[4:8]) - off
			if d := int32(out - s.lastOut); d <= 0 {
				extra := uint32(-d) + 1 // [TBD : 1틱 대신 프레임 간격]
				if extra > maxTSBackstep && !s.retried {
					s.retried = true
					nw.RequestKeyframe(pli.LayerSwitch)
					return false
				}
				off -= extra
			}
		}
	}
	s.retried = false
	s.tsOffset = off
	return true
}

// SetTarget — Allocator 결정. 현재보다 낮추면(부족 상태 하향) 낮은 레이어 키프레임까지 현재 레이어를 즉시 막는다.
func (s *simulcast) SetTarget(layer int8, paused bool) {
	if layer > topLayer {
		layer = topLayer
	}
	s.target, s.paused = layer, paused
	s.blocked = s.current >= 0 && s.eff() < s.current
	s.requested = time.Time{}
}

// SetMax — 클라이언트 상한. 100ms 디바운스 후 반영, 하향이어도 막지 않고 키프레임 경계까지 계속 보낸다.
func (s *simulcast) SetMax(layer int8) {
	if layer < 0 {
		layer = 0
	}
	if layer > topLayer {
		layer = topLayer
	}
	s.pendingMax, s.pendingMaxAt = layer, time.Now()
}

// State — current 는 시작 전이면 목표(키프레임 요청 대상)를 돌려준다.
func (s *simulcast) State() (current, target, max int8) {
	cur := s.current
	if cur < 0 {
		cur = s.eff()
	}
	return cur, s.target, s.max
}

// SetTarget — bwe.Target 구현(Allocator 고루틴 → 채널).
func (c *Consumer) SetTarget(layer int8, paused bool) {
	c.do(func() { c.policy.SetTarget(layer, paused) })
}

// SetMax — consumer.setLayer 상한(signal → bora → 여기). 디바운스는 정책이 한다.
func (c *Consumer) SetMax(layer int8) { c.do(func() { c.policy.SetMax(layer) }) }

// applySwitch — decide 가 Switch 를 받으면 SeqRewriter.Sync 대신 부른다(송신 고루틴 전용).
// 프레임 중간 전환이면 순번 1개를 건너뛰어 디코더가 이전 프레임을 불완전으로 처리하게 한다(REA_02 5.7). TS 오프셋·VP8 재기준.
func (c *Consumer) applySwitch(sw *Switch, it forward.Item) {
	in := it.ExtSeq
	if sw.From >= 0 && !c.lastMarker {
		in--
	}
	c.seq.Sync(in)
	c.fencePend = true // 다음 송신 순번부터 새 TS·VP8 기준 — 그 앞은 재전송 안 함
	if s, ok := c.policy.(*simulcast); ok {
		c.tsOffset = s.tsOffset
		s.vp8.Sync()
	}
	if sw.From >= 0 {
		metrics.Global.LayerSwitches.Add(1)
	}
}

// noteSent — 송신 루프가 패킷을 보낸 뒤 출력 TS 를 알린다(역행 방지 기준).
func (c *Consumer) noteSent(outTS uint32) {
	if s, ok := c.policy.(*simulcast); ok {
		s.lastOut, s.hasLast = outTS, true
	}
}

// rewriteVP8 — Forward 패킷 페이로드의 picture ID·TL0PICIDX 연속화(제자리).
func (c *Consumer) rewriteVP8(payload []byte) {
	if s, ok := c.policy.(*simulcast); ok {
		s.vp8.Rewrite(payload)
	}
}
