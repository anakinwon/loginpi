// Consumer 본체 — 생성·송신 고루틴·명령 채널·닫힘, 송신 루프(PRD_02 4.1 6~10단계)와 하류 SR(0.5초).
package jeju

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/pion/rtcp"
	"github.com/pion/rtp"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/metrics"
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
	fir        pli.FIRFilter // 같은 FIR 순번 반복 무시(M2)
	fencePend  bool          // 전환·재개 뒤 첫 송신 순번에서 SendMeta.Fence(재전송 헤더 기준이 바뀜)
	statSent   uint32        // NACK 비율 창 입력 : 마지막 보고 뒤 보낸 패킷(M4 D-7)
	statRtx    uint32        // 같은 창의 재전송 수

	// Start 전에만 설정(Start 의 채널 닫힘이 송신 고루틴과의 순서를 보장)
	absID     uint8                       // 구독 PC 에 협상된 abs-send-time 확장 ID(0 = 없음, D-12 M4)
	nackStats func(sent, repeated uint32) // 할당기 OnNackStats(nil 이면 보고 안 함)

	started atomic.Bool
	startCh chan struct{}
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
	clock, slots := uint32(48000), nack.AudioSlots
	if p.Kind() == santorini.Video {
		clock, slots = 90000, nack.VideoSlots
	}
	c := &Consumer{
		id: id, producer: p, q: forward.NewQueue(forward.QueueSize), out: out, outSSRC: outSSRC, clock: clock,
		policy: newPolicy(p), meta: nack.NewSendMeta(slots), paused: paused,
		cmd: make(chan func(), 64), startCh: make(chan struct{}), done: make(chan struct{}),
	}
	c.q.SetAudio(p.Kind() == santorini.Audio) // 음성은 그 패킷만 버림(M2 congest)
	go c.loop()                               // Start 전에도 명령을 비운다 — 연결 전 Pause·SetTarget·SetMax 가 do 에서 막히지 않게
	return c
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

// SetAbsSendTimeID — 협상된 abs-send-time 확장 ID(capri.AbsSendTimeID). Start 전에만 부른다.
func (c *Consumer) SetAbsSendTimeID(id uint8) { c.absID = id }

// SetNackStats — NACK 비율 혼잡 판정 입력(bwe.Allocator.OnNackStats). Start 전에만 부른다.
func (c *Consumer) SetNackStats(fn func(sent, repeated uint32)) { c.nackStats = fn }

// Start — 송신을 1번만 시작한다(구독 PC 연결·answer 적용 뒤, bora).
func (c *Consumer) Start() {
	if c.started.CompareAndSwap(false, true) {
		close(c.startCh)
	}
}

// Started — Start 가 불렸는지(bora 가 새 레이어를 붙일 때 구독 여부 판단).
func (c *Consumer) Started() bool { return c.started.Load() }

// Close — 송신 고루틴 종료. 레이어 Unsubscribe·Transport RemoveTrack 은 bora(lifecycle.go)가 한다.
func (c *Consumer) Close() { c.once.Do(func() { close(c.done) }) }

// do — 다른 고루틴 → 송신 고루틴 명령. 닫혔으면 버린다. 송신 고루틴은 New 부터 Close 까지 늘 비우므로 무기한 막히지 않는다(D-10).
func (c *Consumer) do(fn func()) {
	select {
	case c.cmd <- fn:
	case <-c.done:
	}
}

// loop — 송신 고루틴(New 가 띄움). Start 전에는 명령만 처리하고(상태는 이 고루틴 소유 그대로), Start 뒤 run.
func (c *Consumer) loop() {
	for {
		select {
		case fn := <-c.cmd:
			fn()
		case <-c.startCh:
			c.run()
			return
		case <-c.done:
			return
		}
	}
}

// run — 송신 본체. 시작 시 c.replay()(M2) 가 false 면 키프레임 요청(pli.NewConsumer — Limiter 가 0.5초 상한).
// 루프 : cmd 처리 / q.C() 항목 → c.decide(M3) → cache.GetAt → 출력 헤더(OutSSRC·seq.Input·ts−tsOffset, 확장 새로 — D-12) → out.WriteRTP → c.recordSent(M2).
// q.TakeKeyframeNeed() 면 키프레임 요청. 하류 SR 은 SRInterval 마다.
func (c *Consumer) run() {
	if !c.replay() {
		c.requestKeyframe(pli.NewConsumer)
	}
	buf := make([]byte, nack.SlotSize)
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
			c.forward(it, buf)
		case now := <-sr.C:
			c.sendSR(now)
			c.flushStats()
		case <-c.done:
			return
		}
	}
}

// forward — 항목 1개 송신(송신 고루틴 전용).
func (c *Consumer) forward(it forward.Item, buf []byte) {
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
	c.send(buf[:n], it, time.Now())
}

// send — decide 를 통과한 패킷 1개 : 출력 순번(M3) → 헤더 재작성·VP8 picture ID(M4) → WriteRTP → 기록(M2·M4). 송신 루프·캐시 재생 공용.
func (c *Consumer) send(raw []byte, it forward.Item, now time.Time) bool {
	out, ok := c.seq.Input(it.ExtSeq)
	if !ok {
		return false // 옛 패킷·버린 순번 재수신(M3)
	}
	ts, size, err := c.write(raw, out)
	if err != nil {
		return false
	}
	if c.fencePend { // 새 구간 첫 순번 — 그 앞(전환 전·Sync 로 비운 칸)은 재전송하지 않는다
		c.meta.Fence(out)
		c.fencePend = false
	}
	c.lastMarker = it.Marker
	c.statSent++
	metrics.Global.PacketsOut.Add(1)
	c.sent.packets++
	c.sent.octets += uint32(size)
	c.sent.lastTS, c.sent.lastAt = ts, now
	c.noteSent(ts)
	c.recordSent(out, it, now)
	return true
}

// flushStats — 마지막 보고 뒤 보낸 수·재전송 수를 할당기에 넘긴다(창 집계·8% 판정은 bwe nackWindow). 송신 고루틴 전용.
func (c *Consumer) flushStats() {
	if c.nackStats == nil || c.statSent == 0 {
		return
	}
	c.nackStats(c.statSent, c.statRtx)
	c.statSent, c.statRtx = 0, 0
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
