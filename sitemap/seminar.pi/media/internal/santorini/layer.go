// Layer — 레이어 수신 고루틴 1개와 그 소유 상태(캐시 쓰기·LossTracker·Limiter·구독 큐 목록·상류 RR 통계). 근거 PRD_02 4.1 1~5단계.
package santorini

import (
	"errors"
	"io"
	"math/rand/v2"
	"sync/atomic"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtcp"
	"github.com/pion/rtp"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/metrics"
	"seminar.pi/media/internal/nack"
	"seminar.pi/media/internal/pli"
	"seminar.pi/media/internal/rtcpx"
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

	cmd  chan func()        // 다른 고루틴 → 수신 고루틴 명령
	sr   atomic.Pointer[SR] // capri RTCP 고루틴이 쓰고 jeju 가 읽음
	remb *atomic.Int64      // Producer 의 발행 상한(bps, 0 = REMB 안 보냄) — AddLayer 가 Run 전에 연결
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

// readRing — 읽기 고루틴 → 수신 고루틴 전달 채널 크기. 버퍼 링은 이보다 2개 많아(채널 안 + 처리 중 1 + 읽는 중 1) 재사용이 겹치지 않는다.
const readRing = 32

// Run — 수신 고루틴 본문. 4.1 정방향 1~5단계 :
// Read → rtpx Extend → IsVP8Keyframe(키면 limiter.KeyframeSeen) → 헤더 확장 제거(D-12) → cache.Store → loss.Receive → l.observe(M4)
// → sinks 마다 Offer(forward.Item). 틈틈이 cmd 처리, 주기적으로 l.feedback(now)(M2) 결과를 up.WriteRTCP, 상류 RR(rtcpx, 1초).
// Read 는 막히는 호출이라 읽기만 하는 고루틴을 따로 두고, 상태는 전부 이 고루틴이 소유한다(D-10).
func (l *Layer) Run(r Reader, up RTCPWriter) {
	in := make(chan []byte, readRing)
	go l.readLoop(r, in)
	fb := time.NewTicker(FeedbackInterval)
	defer fb.Stop()
	rr := time.NewTicker(rtcpx.RRInterval)
	defer rr.Stop()

	var (
		ssrc    uint32 // 발표자 레이어 원본 SSRC(첫 패킷에서) — 밖으로 내보내지 않는다
		stats   rtcpx.ReceptionStats
		scratch = make([]byte, nack.SlotSize)
		me      = rand.Uint32() // 상류 RTCP 보낸이 SSRC
	)
	for {
		select {
		case fn := <-l.cmd:
			fn()
		case b, ok := <-in:
			if !ok {
				in = nil // 트랙 끝 — 명령은 Producer 닫힘까지 계속 받는다(Subscribe 호출자가 막히지 않게)
				continue
			}
			if s := l.handle(b, scratch, &stats); s != 0 {
				ssrc = s
			}
		case now := <-fb.C:
			if ssrc != 0 {
				// 상류 RTT 는 우리가 SR 을 보내지 않아 아직 모른다 [TBD : M2]
				if pk := l.feedback(now, ssrc, 0); len(pk) > 0 {
					_ = up.WriteRTCP(pk)
				}
			}
		case now := <-rr.C:
			if ssrc != 0 {
				var lsr, dlsr uint32
				if sr, ok := l.LastSR(); ok {
					lsr, dlsr = uint32(sr.NTP>>16), rtcpx.DLSR(sr.At, now)
				}
				pk := []rtcp.Packet{rtcpx.ReceiverReport(me, []rtcp.ReceptionReport{stats.Report(ssrc, lsr, dlsr)})}
				if l.remb != nil && l.kind == Video { // 발행자 방향 1초 RR+REMB(PRD_02 3.3 bwe) — 상한은 bora 가 구독자 요청 레이어로 정한다
					if c := l.remb.Load(); c > 0 {
						pk = append(pk, rtcpx.REMB(me, float32(c), []uint32{ssrc}))
					}
				}
				_ = up.WriteRTCP(pk)
			}
		case <-l.done:
			return
		}
	}
}

// readLoop — Read 만 하는 고루틴. 버퍼 소유권은 채널로 수신 고루틴에 넘어간다.
func (l *Layer) readLoop(r Reader, in chan<- []byte) {
	defer close(in)
	ring := make([][]byte, readRing+2)
	for i := range ring {
		ring[i] = make([]byte, nack.SlotSize)
	}
	for i := 0; ; i = (i + 1) % len(ring) {
		n, _, err := r.Read(ring[i])
		if errors.Is(err, io.ErrShortBuffer) {
			continue // 슬롯보다 큰 패킷 — 캐시에 못 담으므로 버린다
		}
		if err != nil {
			return
		}
		select {
		case in <- ring[i][:n]:
		case <-l.done:
			return
		}
	}
}

// handle — 패킷 1개(수신 고루틴 전용). 원본 SSRC 를 돌려준다(해석 실패면 0).
func (l *Layer) handle(b, scratch []byte, st *rtcpx.ReceptionStats) uint32 {
	var p rtp.Packet
	if p.Unmarshal(b) != nil {
		return 0
	}
	now := time.Now()
	ext := l.ext.Extend(p.SequenceNumber)
	st.Update(ext)
	key := l.kind == Audio || rtpx.IsVP8Keyframe(p.Payload) // 음성은 모든 패킷이 시작점
	metrics.Global.PacketsIn.Add(1)
	if key && l.kind == Video {
		l.limiter.KeyframeSeen()
		metrics.Global.Keyframes.Add(1)
	}
	data := b
	if p.Extension { // 들어온 헤더 확장은 버린다 — 구독자별로 새로 만든다(D-12)
		p.Extension, p.Extensions = false, nil
		if n, err := p.MarshalTo(scratch); err == nil {
			data = scratch[:n]
		}
	}
	idx := l.cache.Store(ext, p.Timestamp, key, p.Marker, data)
	l.loss.Receive(ext, key)
	l.observe(len(b), now)
	it := forward.Item{ExtSeq: ext, Idx: idx, Key: key, Marker: p.Marker, Layer: l.idx, At: now}
	for q := range l.sinks {
		q.Offer(it)
	}
	return p.SSRC
}
