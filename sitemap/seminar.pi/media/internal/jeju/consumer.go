// Consumer 본체 — 생성·송신 고루틴·명령 채널·닫힘, 송신 루프(PRD_02 4.1 6~10단계)와 하류 SR(0.5초).
package jeju

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/pion/rtcp"
	"github.com/pion/rtp"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/nack"
	"seminar.pi/media/internal/pli"
	"seminar.pi/media/internal/rtcpx"
	"seminar.pi/media/internal/santorini"
)

// Writer — 출력(*webrtc.TrackLocalStaticRTP 가 만족, record.Recorder 도 구현).
type Writer interface {
	WriteRTP(p *rtp.Packet) error
}

// Consumer — bora(방) 고루틴이 만들고 닫는다.
type Consumer struct {
	id       string
	producer *santorini.Producer
	q        *forward.Queue
	out      Writer
	outSSRC  uint32
	report   santorini.RTCPWriter // 하류 SR 송신(구독 Transport). nil 이면 SR 없음 — Start 전에만 설정
	clock    uint32               // RTP 시계(Hz)

	// 송신 고루틴 소유(잠금 없음)
	policy     LayerPolicy // M4 layerpolicy.go 가 만든다
	seq        SeqRewriter // M3
	meta       *nack.SendMeta
	paused     bool
	lastMarker bool
	tsOffset   uint32 // M1 단일 레이어 : 0, M4 전환 시 재계산
	sent       sendStats
	rtt        time.Duration // 청중 RR 로 잰 왕복 시간(SendMeta 억제 간격·품질 점수 입력, M2·M4)

	started atomic.Bool
	cmd     chan func()
	once    sync.Once
	done    chan struct{}
}

// sendStats — 하류 SR 용 누적값(송신 고루틴 소유).
type sendStats struct {
	packets, octets uint32
	lastTS          uint32
	lastAt          time.Time
}

// New — 출력 SSRC 는 호출자(bora)가 정한 값(구독 PC sender 의 SSRC). paused 면 resume 전까지 보내지 않는다(M3).
func New(id string, p *santorini.Producer, out Writer, outSSRC uint32, paused bool) *Consumer {
	clock := uint32(48000)
	if p.Kind() == santorini.Video {
		clock = 90000
	}
	return &Consumer{
		id: id, producer: p, q: forward.NewQueue(forward.QueueSize), out: out, outSSRC: outSSRC, clock: clock,
		policy: newPolicy(p), meta: nack.NewSendMeta(nack.VideoSlots), paused: paused,
		cmd: make(chan func(), 64), done: make(chan struct{}),
	}
}

func (c *Consumer) ID() string                    { return c.id }
func (c *Consumer) ProducerID() string            { return c.producer.ID() }
func (c *Consumer) Producer() *santorini.Producer { return c.producer }
func (c *Consumer) OutSSRC() uint32               { return c.outSSRC }
func (c *Consumer) Done() <-chan struct{}         { return c.done }

// Queue — santorini Layer.Subscribe 에 넘길 큐(bora 가 레이어마다 연결).
func (c *Consumer) Queue() *forward.Queue { return c.q }

// SetReporter — 하류 SR 을 보낼 곳(구독 Transport). Start 전에만 부른다.
func (c *Consumer) SetReporter(w santorini.RTCPWriter) { c.report = w }

// Start — 송신 고루틴을 1번만 띄운다(구독 PC 연결·answer 적용 뒤, bora).
func (c *Consumer) Start() {
	if c.started.CompareAndSwap(false, true) {
		go c.Run()
	}
}

// Started — Start 가 불렸는지(bora 가 새 레이어를 붙일 때 구독 여부 판단).
func (c *Consumer) Started() bool { return c.started.Load() }

// Close — 송신 고루틴 종료. 레이어 Unsubscribe·Transport RemoveTrack 은 bora(lifecycle.go)가 한다.
func (c *Consumer) Close() { c.once.Do(func() { close(c.done) }) }

// do — 다른 고루틴 → 송신 고루틴 명령. 닫혔으면 버린다.
func (c *Consumer) do(fn func()) {
	select {
	case c.cmd <- fn:
	case <-c.done:
	}
}

// Run — 송신 고루틴. 시작 시 c.replay()(M2) 가 false 면 키프레임 요청(pli.NewConsumer — Limiter 가 0.5초 상한).
// 루프 : cmd 처리 / q.C() 항목 → c.decide(M3) → cache.GetAt → 출력 헤더(OutSSRC·seq.Input·ts−tsOffset, 확장 새로 — D-12) → out.WriteRTP → c.recordSent(M2).
// q.TakeKeyframeNeed() 면 키프레임 요청. 하류 SR 은 SRInterval 마다.
func (c *Consumer) Run() {
	if !c.replay() {
		c.requestKeyframe(pli.NewConsumer)
	}
	buf := make([]byte, nack.SlotSize)
	var pkt rtp.Packet
	sr := time.NewTicker(rtcpx.SRInterval)
	defer sr.Stop()
	for {
		select {
		case fn := <-c.cmd:
			fn()
		case it := <-c.q.C():
			if c.q.TakeKeyframeNeed() {
				c.requestKeyframe(pli.QueueDrop)
			}
			c.forward(it, buf, &pkt)
		case now := <-sr.C:
			c.sendSR(now)
		case <-c.done:
			return
		}
	}
}

// forward — 항목 1개 송신(송신 고루틴 전용).
func (c *Consumer) forward(it forward.Item, buf []byte, pkt *rtp.Packet) {
	if !c.decide(it) {
		return
	}
	l := c.producer.Layer(it.Layer)
	if l == nil {
		return
	}
	n := l.Cache().GetAt(it.ExtSeq, it.Idx, buf)
	if n == 0 {
		return // 슬롯이 덮였다 — 구멍은 NACK 로 복구(M2)
	}
	if pkt.Unmarshal(buf[:n]) != nil {
		return
	}
	out, ok := c.seq.Input(it.ExtSeq)
	if !ok {
		return
	}
	pkt.SSRC = c.outSSRC
	pkt.SequenceNumber = out
	pkt.Timestamp -= c.tsOffset
	pkt.Extension, pkt.Extensions = false, nil
	if c.out.WriteRTP(pkt) != nil {
		return
	}
	now := time.Now()
	c.lastMarker = it.Marker
	c.sent.packets++
	c.sent.octets += uint32(len(pkt.Payload))
	c.sent.lastTS, c.sent.lastAt = pkt.Timestamp, now
	c.recordSent(out, it, now)
}

// sendSR — 하류 SR. 발표자 SR 이 있으면 그 NTP↔RTP 를 지금으로 외삽하고, 없으면 마지막 보낸 TS 에서 외삽한다.
func (c *Consumer) sendSR(now time.Time) {
	if c.report == nil || c.sent.packets == 0 {
		return
	}
	ts := rtcpx.ExtrapolateRTP(c.sent.lastTS, c.sent.lastAt, now, c.clock)
	cur, _, _ := c.policy.State()
	if l := c.producer.Layer(cur); l != nil {
		if s, ok := l.LastSR(); ok {
			ts = rtcpx.ExtrapolateRTP(s.RTPTime, s.At, now, c.clock) - c.tsOffset
		}
	}
	_ = c.report.WriteRTCP([]rtcp.Packet{rtcpx.SenderReport(c.outSSRC, now, ts, c.sent.packets, c.sent.octets)})
}
