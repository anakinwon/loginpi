// Consumer 본체 — 생성·송신 고루틴·명령 채널·닫힘. 송신 루프 본문(4.1 6~10단계)은 M1 에서 구현.
package jeju

import (
	"sync"

	"github.com/pion/rtp"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/nack"
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

	// 송신 고루틴 소유(잠금 없음)
	policy     LayerPolicy // M4 layerpolicy.go 가 만든다
	seq        SeqRewriter // M3
	meta       *nack.SendMeta
	paused     bool
	lastMarker bool
	tsOffset   uint32 // M1 단일 레이어 : 0, M4 전환 시 재계산

	cmd  chan func()
	once sync.Once
	done chan struct{}
}

// New — 출력 SSRC 는 호출자(bora)가 정한 무작위 값. paused 면 resume 전까지 보내지 않는다(M3).
func New(id string, p *santorini.Producer, out Writer, outSSRC uint32, paused bool) *Consumer {
	return &Consumer{
		id: id, producer: p, q: forward.NewQueue(forward.QueueSize), out: out, outSSRC: outSSRC,
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

// Close — 송신 고루틴 종료. 레이어 Unsubscribe·Transport RemoveTrack 은 bora(lifecycle.go)가 한다.
func (c *Consumer) Close() { c.once.Do(func() { close(c.done) }) }

// do — 다른 고루틴 → 송신 고루틴 명령. 닫혔으면 버린다.
func (c *Consumer) do(fn func()) {
	select {
	case c.cmd <- fn:
	case <-c.done:
	}
}

// Run — 송신 고루틴. 시작 시 c.replay()(M2) 가 false 면 키프레임 요청(pli.NewConsumer).
// 루프 : cmd 처리 / q.C() 항목 → c.decide(M3) → cache.GetAt → 출력 헤더(OutSSRC·seq.Input·ts−tsOffset, 확장 새로 — D-12) → out.WriteRTP → c.recordSent(M2).
// q.TakeKeyframeNeed() 면 키프레임 요청. 하류 SR(rtcpx, 0.5초)은 Transport 쪽 송신으로 M1 이 연결. M1 에서 구현 — 지금은 명령만 처리.
func (c *Consumer) Run() {
	for {
		select {
		case fn := <-c.cmd:
			fn()
		case <-c.done:
			return
		}
	}
}
