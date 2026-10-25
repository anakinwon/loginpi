// Layer — 레이어 수신 고루틴 1개와 그 소유 상태(캐시 쓰기·LossTracker·Limiter·구독 큐 목록). 수신 루프 본문은 M1 에서 구현.
package santorini

import (
	"sync/atomic"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtcp"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/nack"
	"seminar.pi/media/internal/pli"
	"seminar.pi/media/internal/rtpx"
)

// Reader — 들어오는 RTP(*webrtc.TrackRemote 가 만족). 테스트는 가짜로 대체.
type Reader interface {
	Read(b []byte) (int, interceptor.Attributes, error)
}

// RTCPWriter — 발표자 방향 RTCP 송신(*capri.Transport·*webrtc.PeerConnection 이 만족).
type RTCPWriter interface {
	WriteRTCP(pkts []rtcp.Packet) error
}

// SR — 발표자 레이어의 마지막 SR(NTP↔RTP), 하류 SR 외삽·simulcast TS 정렬(M4)에 쓴다.
type SR struct {
	NTP     uint64
	RTPTime uint32
	At      time.Time
}

// Layer — 레이어 1개.
type Layer struct {
	idx  int8
	kind Kind
	done <-chan struct{} // Producer 닫힘

	// 수신 고루틴 소유(잠금 없음)
	ext     rtpx.SeqExtender
	cache   *nack.PacketCache // 쓰기는 여기서만, 읽기는 jeju(캐시 내부 잠금)
	loss    *nack.LossTracker
	limiter *pli.Limiter
	sinks   map[*forward.Queue]struct{}
	act     activity // M4 activity.go

	cmd chan func()        // 다른 고루틴 → 수신 고루틴 명령
	sr  atomic.Pointer[SR] // capri RTCP 고루틴이 쓰고 jeju 가 읽음
}

func newLayer(i int8, kind Kind, done <-chan struct{}) *Layer {
	slots := nack.AudioSlots
	if kind == Video {
		slots = nack.VideoSlots
	}
	return &Layer{
		idx: i, kind: kind, done: done,
		cache: nack.NewPacketCache(slots), loss: nack.NewLossTracker(), limiter: pli.NewLimiter(i),
		sinks: map[*forward.Queue]struct{}{}, cmd: make(chan func(), 64),
	}
}

func (l *Layer) Index() int8 { return l.idx }

// Cache — 본문 캐시(jeju 가 GetAt·Get 으로 읽음).
func (l *Layer) Cache() *nack.PacketCache { return l.cache }

// LastSR — 마지막 SR. 아직 없으면 ok=false.
func (l *Layer) LastSR() (sr SR, ok bool) {
	if p := l.sr.Load(); p != nil {
		return *p, true
	}
	return SR{}, false
}

// OnSR — capri 가 발행 PC 에서 SR 을 받으면 호출(어느 고루틴이든 안전).
func (l *Layer) OnSR(ntp uint64, rtpTS uint32, at time.Time) {
	l.sr.Store(&SR{NTP: ntp, RTPTime: rtpTS, At: at})
}

// RequestKeyframe — jeju(청중 PLI·새 구독자·전환)가 호출. 비차단 — 명령 큐가 차면 합쳐진 것으로 보고 버린다.
func (l *Layer) RequestKeyframe(r pli.Reason) {
	select {
	case l.cmd <- func() { l.limiter.Need(r) }:
	default:
	}
}

// Subscribe — 구독 큐 추가(bora 고루틴이 호출, 수신 고루틴이 반영).
func (l *Layer) Subscribe(q *forward.Queue) { l.do(func() { l.sinks[q] = struct{}{} }) }

// Unsubscribe — 구독 큐 제거.
func (l *Layer) Unsubscribe(q *forward.Queue) { l.do(func() { delete(l.sinks, q) }) }

func (l *Layer) do(fn func()) {
	select {
	case l.cmd <- fn:
	case <-l.done:
	}
}

// Run — 수신 고루틴 본문. 4.1 정방향 1~5단계 :
// Read → rtpx Extend → IsVP8Keyframe(키면 limiter.KeyframeSeen) → 헤더 확장 제거(D-12) → cache.Store → loss.Receive → l.observe(M4)
// → sinks 마다 Offer(forward.Item). 틈틈이 cmd 처리, 주기적으로 l.feedback(now)(M2) 결과를 up.WriteRTCP, 상류 RR(rtcpx, 1초).
// M1 에서 구현 — 지금은 Producer 닫힘까지 명령만 처리한다.
func (l *Layer) Run(r Reader, up RTCPWriter) {
	for {
		select {
		case fn := <-l.cmd:
			fn()
		case <-l.done:
			return
		}
	}
}
