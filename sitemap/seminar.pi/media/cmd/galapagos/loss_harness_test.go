// M2 로컬 손실 하네스 — Linux tc netem 대신 시험 봇의 UDP 소켓(net.PacketConn)을 감싸 프로세스 안에서 RTP·RTCP 를 버리거나 늦춘다(Windows 실행용).
// 봇(발표자·청중)은 pion 빈 인터셉터 API(S-1)로 만들고 NACK·PLI·RR 은 직접 만든다. 실제 네트워크 netem 이 아니다 — 결과는 M2_TURN_NETEM.md 5절.
// 실행 : go test ./cmd/galapagos -run Loss -v (짧게 : -short 는 T2 만)
package main

import (
	"encoding/json"
	"math"
	"math/rand/v2"
	"net"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtcp"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"

	"seminar.pi/media/internal/bora"
	"seminar.pi/media/internal/capri"
	"seminar.pi/media/internal/metrics"
	"seminar.pi/media/internal/rtcpx"
	"seminar.pi/media/internal/rtpx"
	"seminar.pi/media/internal/signal"
)

// 하네스 상수 — 발표자 송출 모양과 청중 봇의 NACK 동작(브라우저 기본값을 흉내 낸 값).
const (
	pubInterval   = 5 * time.Millisecond // 200 pps(1000B 기준 약 1.6 Mbps)
	pktPerFrame   = 8                    // 25 fps
	keyEvery      = 50                   // 50 프레임(2초)마다 주기 키프레임
	payloadSize   = 1000
	pubHistory    = 2048                   // 발표자 재전송 이력(순번 % 크기)
	botNACKRetry  = 100 * time.Millisecond // 청중 재요청 간격(RTT 를 모르는 브라우저 기본값과 같은 100ms)
	botNACKTries  = 10                     // 순번당 최대 NACK 횟수 — 넘으면 포기
	botTick       = 10 * time.Millisecond
	botRRInterval = time.Second
	drainWait     = 1500 * time.Millisecond // 송출 멈춘 뒤 남은 구멍 회복 대기
)

// shaper — 한 방향 손실·지연. loss 는 시험 중 바꿀 수 있다(T3 버스트).
type shaper struct {
	loss          atomic.Uint64 // float64 비트
	delay, jitter time.Duration // 정규분포 지연(평균·표준편차), FIFO — 순서는 뒤바꾸지 않는다
	dropped       atomic.Uint64
	passed        atomic.Uint64
	mu            sync.Mutex
	rng           *rand.Rand
	lastAt        time.Time
}

func newShaper(loss float64, delay, jitter time.Duration, seed uint64) *shaper {
	s := &shaper{delay: delay, jitter: jitter, rng: rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15))}
	s.setLoss(loss)
	return s
}

func (s *shaper) setLoss(p float64) { s.loss.Store(math.Float64bits(p)) }

// plan — 이 패킷을 버릴지, 언제 내보낼지.
func (s *shaper) plan(now time.Time) (drop bool, at time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.rng.Float64() < math.Float64frombits(s.loss.Load()) {
		s.dropped.Add(1)
		return true, now
	}
	s.passed.Add(1)
	if s.delay == 0 {
		return false, now
	}
	d := s.delay + time.Duration(s.rng.NormFloat64()*float64(s.jitter))
	at = now.Add(max(d, 0))
	if at.Before(s.lastAt) {
		at = s.lastAt // FIFO : netem 기본 jitter 는 순서를 뒤바꾸지만 여기선 막는다(5절 한계)
	}
	s.lastAt = at
	return false, at
}

// isMedia — RFC 7983 : 첫 바이트 128~191 = RTP·RTCP(SRTP). STUN·DTLS 는 건드리지 않아 연결 수립은 손실 없이 된다.
func isMedia(b []byte) bool { return len(b) > 0 && b[0] >= 128 && b[0] <= 191 }

type datagram struct {
	b    []byte
	addr net.Addr
	at   time.Time
}

// lossyConn — 봇 쪽 UDP 소켓. tx = 봇 → 엔진, rx = 엔진 → 봇. 지연은 rx 에만(T6 은 하류 지연).
// net.PacketConn 인터페이스만 임베드해 ICE mux 가 ReadFromAddrPort 우회 경로를 못 쓰게 한다.
type lossyConn struct {
	net.PacketConn
	tx, rx *shaper
	in     chan datagram
	closed chan struct{}
	once   sync.Once
}

func newLossyConn(t *testing.T, tx, rx *shaper) *lossyConn {
	raw, err := net.ListenPacket("udp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	c := &lossyConn{PacketConn: raw, tx: tx, rx: rx, in: make(chan datagram, 4096), closed: make(chan struct{})}
	delayed := make(chan datagram, 4096)
	go c.pump(delayed)
	go c.deliver(delayed)
	t.Cleanup(func() { _ = c.Close() })
	return c
}

// pump — 실제 소켓에서 읽어 rx 규칙 적용.
func (c *lossyConn) pump(delayed chan<- datagram) {
	defer close(delayed)
	for {
		buf := make([]byte, 1600)
		n, addr, err := c.PacketConn.ReadFrom(buf)
		if err != nil {
			return
		}
		d := datagram{b: buf[:n], addr: addr, at: time.Now()}
		if isMedia(d.b) {
			drop, at := c.rx.plan(d.at)
			if drop {
				continue
			}
			d.at = at
		}
		delayed <- d
	}
}

// deliver — 도착 시각 순서대로 ReadFrom 에 넘긴다(FIFO 라 고루틴 1개면 순서 유지).
func (c *lossyConn) deliver(delayed <-chan datagram) {
	for d := range delayed {
		if w := time.Until(d.at); w > 0 {
			time.Sleep(w)
		}
		select {
		case c.in <- d:
		case <-c.closed:
			return
		}
	}
}

func (c *lossyConn) ReadFrom(b []byte) (int, net.Addr, error) {
	select {
	case d := <-c.in:
		return copy(b, d.b), d.addr, nil
	case <-c.closed:
		return 0, nil, net.ErrClosed
	}
}

func (c *lossyConn) WriteTo(b []byte, addr net.Addr) (int, error) {
	if isMedia(b) {
		if drop, _ := c.tx.plan(time.Now()); drop {
			return len(b), nil // 보낸 척
		}
	}
	return c.PacketConn.WriteTo(b, addr)
}

func (c *lossyConn) Close() error {
	c.once.Do(func() { close(c.closed) })
	return c.PacketConn.Close()
}

// botAPI — 봇용 pion API : VP8(nack·pli) 만, 빈 인터셉터(S-1), ICE 는 lossyConn 위 UDP mux 하나.
func botAPI(t *testing.T, conn net.PacketConn) *webrtc.API {
	m := &webrtc.MediaEngine{}
	vp8 := capri.CodecVP8
	vp8.RTCPFeedback = []webrtc.RTCPFeedback{{Type: "nack"}, {Type: "nack", Parameter: "pli"}}
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{RTPCodecCapability: vp8, PayloadType: 96}, webrtc.RTPCodecTypeVideo); err != nil {
		t.Fatal(err)
	}
	se := webrtc.SettingEngine{}
	se.SetICEUDPMux(webrtc.NewICEUDPMux(nil, conn))
	se.SetIncludeLoopbackCandidate(true)
	se.SetNetworkTypes([]webrtc.NetworkType{webrtc.NetworkTypeUDP4})
	return webrtc.NewAPI(webrtc.WithMediaEngine(m), webrtc.WithSettingEngine(se),
		webrtc.WithInterceptorRegistry(&interceptor.Registry{}))
}

// startEngine — 엔진(/signal) 기동, WebSocket URL.
func startEngine(t *testing.T) string {
	t.Setenv("MEDIA_DEV_TICKET", "1")
	t.Setenv("MEDIA_RECORD_DIR", "") // 녹화는 이 시험 범위 밖
	api, err := capri.NewAPI(capri.Config{Loopback: true})
	if err != nil {
		t.Fatal(err)
	}
	m := bora.NewManager()
	m.SetAPI(api, nil)
	srv := httptest.NewServer(newMux(m, nil, nil))
	t.Cleanup(srv.Close)
	return "ws" + strings.TrimPrefix(srv.URL, "http") + "/signal"
}

// pubBot — 발표자 봇 : 200pps VP8 모양 패킷, 엔진 NACK 에 이력에서 같은 순번 재전송, PLI 면 다음 프레임을 키프레임으로.
type pubBot struct {
	track    *webrtc.TrackLocalStaticRTP
	mu       sync.Mutex
	hist     [pubHistory]*rtp.Packet
	plis     []time.Time
	forceKey atomic.Bool
	nacked   atomic.Uint64 // 엔진이 요청한 순번 수
	resent   atomic.Uint64 // 이력에 있어 다시 보낸 수
	stop     chan struct{}
	stopped  sync.WaitGroup
}

func startPublisher(t *testing.T, url string, conn net.PacketConn) *pubBot {
	api := botAPI(t, conn)
	pc, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pc.Close() })
	track, err := webrtc.NewTrackLocalStaticRTP(capri.CodecVP8, "video", "presenter")
	if err != nil {
		t.Fatal(err)
	}
	tr, err := pc.AddTransceiverFromTrack(track, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionSendonly})
	if err != nil {
		t.Fatal(err)
	}
	b := &pubBot{track: track, stop: make(chan struct{})}
	pres := dial(t, url, func(e signal.Envelope) {
		if e.M == signal.MTrickle {
			addCandidate(pc, e.D)
		}
	})
	pc.OnICECandidate(trickleOut(pres, "pub"))
	pres.request(signal.MJoin, map[string]any{"room": "r1", "role": "presenter", "name": "p", "sub": "p"}, nil)
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := pc.SetLocalDescription(offer); err != nil {
		t.Fatal(err)
	}
	var ans signal.SDP
	pres.request(signal.MTransportPublish, signal.SDP{SDP: offer.SDP}, &ans)
	if err := pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: ans.SDP}); err != nil {
		t.Fatal(err)
	}
	var pr signal.ProduceRes
	pres.request(signal.MProduce, signal.ProduceReq{Mid: tr.Mid(), Kind: "video", Source: "camera"}, &pr)

	go b.readRTCP(tr.Sender())
	b.stopped.Add(1)
	go b.send()
	t.Cleanup(b.Stop)
	return b
}

func (b *pubBot) readRTCP(s *webrtc.RTPSender) {
	for {
		pkts, _, err := s.ReadRTCP()
		if err != nil {
			return
		}
		for _, p := range pkts {
			switch v := p.(type) {
			case *rtcp.TransportLayerNack:
				for _, seq := range rtcpx.NACKSeqs(v.Nacks) {
					b.nacked.Add(1)
					b.mu.Lock()
					h := b.hist[int(seq)%pubHistory]
					b.mu.Unlock()
					if h != nil && h.SequenceNumber == seq {
						cp := *h
						if b.track.WriteRTP(&cp) == nil {
							b.resent.Add(1)
						}
					}
				}
			case *rtcp.PictureLossIndication:
				b.mu.Lock()
				b.plis = append(b.plis, time.Now())
				b.mu.Unlock()
				b.forceKey.Store(true)
			}
		}
	}
}

func (b *pubBot) send() {
	defer b.stopped.Done()
	seq, ts := uint16(65000), uint32(0) // 곧 감김
	tk := time.NewTicker(pubInterval)
	defer tk.Stop()
	key := false
	for i := 0; ; i++ {
		select {
		case <-b.stop:
			return
		case <-tk.C:
		}
		first := i%pktPerFrame == 0
		frame := i / pktPerFrame
		if first {
			key = frame%keyEvery == 0 || b.forceKey.Swap(false)
		}
		pl := make([]byte, payloadSize)
		if first {
			pl[0] = 0x10 // S=1 PID=0
			pl[1] = 0x01 // P=1 : 델타 프레임
			if key {
				pl[1] = 0x00
			}
		}
		p := &rtp.Packet{Header: rtp.Header{Version: 2, SequenceNumber: seq, Timestamp: ts, Marker: i%pktPerFrame == pktPerFrame-1}, Payload: pl}
		b.mu.Lock()
		b.hist[int(seq)%pubHistory] = p
		b.mu.Unlock()
		cp := *p // WriteRTP 가 헤더(SSRC·PT)를 고치므로 사본으로
		_ = b.track.WriteRTP(&cp)
		seq++
		if p.Marker {
			ts += 3600
		}
	}
}

// Stop — 송출 중지(재전송 응답은 계속). 여러 번 불러도 된다.
func (b *pubBot) Stop() {
	select {
	case <-b.stop:
	default:
		close(b.stop)
	}
	b.stopped.Wait()
}

// PLIs — 받은 PLI 시각 사본.
func (b *pubBot) PLIs() []time.Time {
	b.mu.Lock()
	defer b.mu.Unlock()
	return slices.Clone(b.plis)
}

type hole struct {
	detected, last time.Time
	tries          int
}

// subBot — 청중 봇 : 출력 순번 구멍 → 즉시 NACK, 100ms 마다 재요청(10회), 1초 RR(LSR·DLSR — 엔진 RTT 입력).
// pliAfter>0 이면 그보다 오래 안 메워진 구멍이 있을 때 PLI(봇당 pliAfter 간격). storm 이 켜지면 100ms 마다 PLI.
type subBot struct {
	name     string
	pliAfter time.Duration
	storm    atomic.Bool

	mu        sync.Mutex
	pc        *webrtc.PeerConnection
	ssrc      uint32
	ext       rtpx.SeqExtender
	started   bool
	max       uint64
	seen      map[uint64]bool
	missing   map[uint64]*hole
	stats     rtcpx.ReceptionStats
	lsr       uint32
	lsrAt     time.Time
	lastRR    time.Time
	lastPLI   time.Time
	received  int
	dups      int // 이미 받은 순번이 또 옴(중복 재전송)
	lost      int // 구멍이 생긴 순번 수
	recovered int
	gaveUp    int
	delays    []time.Duration // 구멍 발견 → 메워짐
	nackSent  int
	pliSent   int
	first     chan struct{}
	firstOnce sync.Once
}

func startSubscriber(t *testing.T, url, name string, conn net.PacketConn, pliAfter time.Duration) *subBot {
	api := botAPI(t, conn)
	pc, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pc.Close() })
	s := &subBot{name: name, pliAfter: pliAfter, pc: pc, seen: map[uint64]bool{}, missing: map[uint64]*hole{}, first: make(chan struct{})}
	var c *client
	c = dial(t, url, func(e signal.Envelope) {
		switch e.M {
		case signal.NTransportSubscribe:
			var sd signal.SDP
			_ = json.Unmarshal(e.D, &sd)
			go func() {
				if err := pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: sd.SDP}); err != nil {
					t.Errorf("%s offer 적용: %v", name, err)
					return
				}
				ans, _ := pc.CreateAnswer(nil)
				_ = pc.SetLocalDescription(ans)
				c.request(signal.MTransportSubscribeAnswer, signal.SDP{SDP: ans.SDP}, nil)
			}()
		case signal.MTrickle:
			addCandidate(pc, e.D)
		}
	})
	pc.OnICECandidate(trickleOut(c, "sub"))
	pc.OnTrack(func(tr *webrtc.TrackRemote, rx *webrtc.RTPReceiver) {
		s.mu.Lock()
		s.ssrc = uint32(tr.SSRC())
		s.mu.Unlock()
		go s.readSR(rx)
		for {
			p, _, err := tr.ReadRTP()
			if err != nil {
				return
			}
			s.onRTP(p.SequenceNumber, time.Now())
		}
	})
	done := make(chan struct{})
	t.Cleanup(func() { close(done) })
	go s.loop(done)
	c.request(signal.MJoin, map[string]any{"room": "r1", "role": "audience", "name": name, "sub": name}, nil)
	return s
}

func (s *subBot) readSR(rx *webrtc.RTPReceiver) {
	for {
		pkts, _, err := rx.ReadRTCP()
		if err != nil {
			return
		}
		for _, p := range pkts {
			if sr, ok := p.(*rtcp.SenderReport); ok {
				s.mu.Lock()
				s.lsr, s.lsrAt = uint32(sr.NTPTime>>16), time.Now()
				s.mu.Unlock()
			}
		}
	}
}

func (s *subBot) onRTP(seq uint16, now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.firstOnce.Do(func() { close(s.first) })
	ext := s.ext.Extend(seq)
	s.stats.Update(ext)
	if s.seen[ext] {
		s.dups++
		return
	}
	s.seen[ext] = true
	s.received++
	if h, ok := s.missing[ext]; ok {
		s.recovered++
		s.delays = append(s.delays, now.Sub(h.detected))
		delete(s.missing, ext)
		return
	}
	if !s.started {
		s.started, s.max = true, ext
		return
	}
	if ext > s.max {
		for x := s.max + 1; x < ext; x++ {
			s.missing[x] = &hole{detected: now}
			s.lost++
		}
		s.max = ext
	}
}

// loop — NACK·PLI·RR 송신(10ms 마다).
func (s *subBot) loop(done <-chan struct{}) {
	tk := time.NewTicker(botTick)
	defer tk.Stop()
	for {
		select {
		case <-done:
			return
		case now := <-tk.C:
			if pk := s.due(now); len(pk) > 0 {
				_ = s.pc.WriteRTCP(pk)
			}
		}
	}
}

func (s *subBot) due(now time.Time) []rtcp.Packet {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ssrc == 0 {
		return nil
	}
	var out []rtcp.Packet
	var seqs []uint16
	oldest := time.Duration(0)
	for x, h := range s.missing {
		oldest = max(oldest, now.Sub(h.detected))
		if h.tries > 0 && now.Sub(h.last) < botNACKRetry {
			continue
		}
		if h.tries >= botNACKTries {
			s.gaveUp++
			delete(s.missing, x)
			continue
		}
		h.tries++
		h.last = now
		seqs = append(seqs, uint16(x))
	}
	if len(seqs) > 0 {
		slices.Sort(seqs) // NackPairsFromSequenceNumbers 는 오름차순 전제(감김 경계는 쌍이 나뉠 뿐)
		out = append(out, rtcpx.NACK(1, s.ssrc, rtcp.NackPairsFromSequenceNumbers(seqs)))
		s.nackSent += len(seqs)
	}
	pli := s.storm.Load() && now.Sub(s.lastPLI) >= 100*time.Millisecond
	if !pli && s.pliAfter > 0 && oldest >= s.pliAfter && now.Sub(s.lastPLI) >= s.pliAfter {
		pli = true
	}
	if pli {
		out = append(out, rtcpx.PLI(1, s.ssrc))
		s.lastPLI = now
		s.pliSent++
	}
	if now.Sub(s.lastRR) >= botRRInterval && s.started {
		var dlsr uint32
		if s.lsr != 0 {
			dlsr = rtcpx.DLSR(s.lsrAt, now)
		}
		out = append(out, rtcpx.ReceiverReport(1, []rtcp.ReceptionReport{s.stats.Report(s.ssrc, s.lsr, dlsr)}))
		s.lastRR = now
	}
	return out
}

// subResult — 청중 1명 결과.
type subResult struct {
	Name                           string
	Received, Dups, Lost           int
	Recovered, GaveUp, StillMiss   int
	NACKSent, PLISent              int
	RecoverP50, RecoverP95, RecMax time.Duration
}

// RecoveredRatio — 구멍 난 순번 중 메워진 비율(구멍이 없으면 1).
func (r subResult) RecoveredRatio() float64 {
	if r.Lost == 0 {
		return 1
	}
	return float64(r.Recovered) / float64(r.Lost)
}

func (s *subBot) result() subResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	d := slices.Clone(s.delays)
	slices.Sort(d)
	q := func(p float64) time.Duration {
		if len(d) == 0 {
			return 0
		}
		return d[min(len(d)-1, int(p*float64(len(d))))]
	}
	var mx time.Duration
	if len(d) > 0 {
		mx = d[len(d)-1]
	}
	return subResult{s.name, s.received, s.dups, s.lost, s.recovered, s.gaveUp, len(s.missing), s.nackSent, s.pliSent, q(0.5), q(0.95), mx}
}

// waitFirst — 첫 패킷 도착까지(연결 실패면 시험 중단).
func (s *subBot) waitFirst(t *testing.T) {
	t.Helper()
	select {
	case <-s.first:
	case <-time.After(15 * time.Second):
		t.Fatalf("%s : 첫 패킷 없음", s.name)
	}
}

// counterDelta — metrics.Global 증가분(시험 시작 시 스냅숏 기준). 전역이라 이 패키지 시험은 병렬로 돌리지 않는다.
type counterDelta map[string]uint64

func snapshot() map[string]uint64 { return metrics.Global.Snapshot() }

func delta(before map[string]uint64) counterDelta {
	d := counterDelta{}
	for k, v := range metrics.Global.Snapshot() {
		d[k] = v - before[k]
	}
	return d
}

func ratio(a, b uint64) float64 {
	if b == 0 {
		return 0
	}
	return float64(a) / float64(b)
}
