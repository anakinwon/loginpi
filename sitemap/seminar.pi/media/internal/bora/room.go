// Room — 방 1개 = 고루틴 1개. 공개 메서드는 명령 채널로 loop 고루틴에 넘긴다(D-10). 참가자·역할·정원, 발행(produce)·자동 구독(consume)·구독 PC 재협상(200ms 묶음).
package bora

import (
	"crypto/rand"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v4"

	"seminar.pi/media/internal/bwe"
	"seminar.pi/media/internal/capri"
	"seminar.pi/media/internal/jeju"
	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

// 계약 고정 — 구현이 바뀌어도 이 관계는 깨지면 안 된다.
var (
	_ capri.RTCPSink       = (*jeju.Consumer)(nil)
	_ bwe.Target           = (*jeju.Consumer)(nil)
	_ santorini.RTCPWriter = (*capri.Transport)(nil)
	_ signal.Handler       = (*Manager)(nil)
)

// OfferBatch — 구독 PC 재협상 묶음 시간(PRD_02 5.2 transport.subscribe).
const OfferBatch = 200 * time.Millisecond

// Peer — 참가자 1명. 필드는 방 고루틴 소유.
type Peer struct {
	ID        string
	Ticket    signal.Ticket
	Session   signal.Session
	Pub       *capri.Transport // presenter·panel 만
	Sub       *capri.Transport
	Alloc     *bwe.Allocator // 구독 PC 당 1개(M4)
	Producers map[string]*santorini.Producer
	Consumers map[string]*jeju.Consumer

	pubMids    map[string]*santorini.Producer // 발행 m-line mid → Producer(produce 요청과 OnTrack 짝)
	pendTracks map[string][]remoteTrack       // produce 전에 도착한 트랙
	senders    map[string]*webrtc.RTPSender   // consumerID → 구독 PC sender

	// 구독 PC 재협상 상태
	offerTimer   *time.Timer
	awaiting     bool // 서버 offer 를 보내고 answer 대기 중
	dirty        bool // 대기 중에 새 트랙이 생김 → answer 뒤 다시 offer
	subConnected bool
	announce     []*jeju.Consumer // 다음 offer 와 함께 consumerCreated 를 보낼 것
	offered      []*jeju.Consumer // offer 에 실렸고 answer 대기
	ready        []*jeju.Consumer // answer 적용됨, 연결 뒤 시작
}

type remoteTrack struct {
	tr *webrtc.TrackRemote
	rx *webrtc.RTPReceiver
}

// Room — 방.
type Room struct {
	id  string
	cap int
	end time.Time // 0 이면 종료 시각 없음

	api *webrtc.API // Manager 가 NewRoom 직후 설정(이후 읽기만)
	ice []webrtc.ICEServer

	// loop 고루틴 소유
	peers     map[string]*Peer
	producers map[string]*santorini.Producer
	consumers map[string]map[string]*jeju.Consumer // producerID → consumerID → Consumer

	cmd  chan func()
	once sync.Once
	done chan struct{}
}

// NewRoom — 첫 입장 때 Manager 가 만든다(cap·end 는 입장권 기준으로 고정).
func NewRoom(id string, cap int, end time.Time) *Room {
	r := &Room{
		id: id, cap: cap, end: end,
		peers: map[string]*Peer{}, producers: map[string]*santorini.Producer{},
		consumers: map[string]map[string]*jeju.Consumer{},
		cmd:       make(chan func(), 64), done: make(chan struct{}),
	}
	go r.loop()
	return r
}

func (r *Room) ID() string            { return r.id }
func (r *Room) Done() <-chan struct{} { return r.done }

func (r *Room) loop() {
	for {
		select {
		case fn := <-r.cmd:
			fn()
		case <-r.done:
			return
		}
	}
}

// exec — fn 을 방 고루틴에서 실행하고 끝날 때까지 기다린다. 방이 닫혔으면 false.
func (r *Room) exec(fn func()) bool {
	ok := make(chan struct{})
	select {
	case r.cmd <- func() { fn(); close(ok) }:
	case <-r.done:
		return false
	}
	select {
	case <-ok:
		return true
	case <-r.done:
		return false
	}
}

// do — 기다리지 않는 명령(pion 콜백 고루틴 → 방 고루틴).
func (r *Room) do(fn func()) {
	select {
	case r.cmd <- fn:
	case <-r.done:
	}
}

// call — 오류를 돌려주는 명령. 방이 닫혔으면 ROOM_CLOSED.
func (r *Room) call(fn func() *signal.Error) *signal.Error {
	var e *signal.Error
	if !r.exec(func() { e = fn() }) {
		return signal.Errf(signal.CodeRoomClosed, "방이 닫힘")
	}
	return e
}

func newID() string { return rand.Text()[:16] }

// Join — 정원·역할·중복 sub(기존 세션 DUPLICATE_SESSION 종료) 검사 후 Peer 생성. 구독 PC 를 만들고 기존 Producer 를 자동 구독한다.
func (r *Room) Join(t signal.Ticket, s signal.Session) (*Peer, *signal.Error) {
	var p *Peer
	e := r.call(func() (e *signal.Error) { p, e = r.join(t, s); return })
	return p, e
}

func (r *Room) join(t signal.Ticket, s signal.Session) (*Peer, *signal.Error) {
	if !r.end.IsZero() && time.Now().After(r.end) {
		return nil, signal.Errf(signal.CodeRoomClosed, "방 종료 시각이 지남")
	}
	switch t.Role {
	case signal.RolePresenter, signal.RolePanel, signal.RoleAudience:
	default:
		return nil, signal.Errf(signal.CodeRoleForbidden, "알 수 없는 역할")
	}
	if t.Sub != "" {
		for id, old := range r.peers {
			if old.Ticket.Sub == t.Sub {
				old.Session.Close(signal.CodeDuplicateSession)
				r.closePeer(id)
			}
		}
	}
	if r.cap > 0 && len(r.peers) >= r.cap {
		return nil, signal.Errf(signal.CodeRoomFull, "정원 초과")
	}
	if r.api == nil {
		return nil, signal.Errf(signal.CodeInternal, "엔진 API 미설정")
	}
	sub, err := capri.New(r.api, capri.Subscribe, r.ice)
	if err != nil {
		return nil, signal.Errf(signal.CodeInternal, err.Error())
	}
	p := &Peer{
		ID: newID(), Ticket: t, Session: s, Sub: sub, Alloc: bwe.NewAllocator(),
		Producers: map[string]*santorini.Producer{}, Consumers: map[string]*jeju.Consumer{},
		pubMids: map[string]*santorini.Producer{}, pendTracks: map[string][]remoteTrack{}, senders: map[string]*webrtc.RTPSender{},
	}
	r.peers[p.ID] = p
	sub.OnCandidate(trickleSender(s, "sub"))
	sub.OnREMB(p.Alloc.OnREMB)
	sub.OnConnected(func() {
		r.do(func() {
			if q := r.peers[p.ID]; q == p {
				p.subConnected = true
				r.startReady(p)
			}
		})
	})
	for _, pr := range r.producers {
		if e := r.consume(p, pr, false); e != nil {
			r.closePeer(p.ID)
			return nil, e
		}
	}
	return p, nil
}

// producerList — 방 고루틴 전용. join 응답의 producers.
func (r *Room) producerList() []signal.ProducerInfo {
	out := make([]signal.ProducerInfo, 0, len(r.producers))
	for _, pr := range r.producers {
		out = append(out, signal.ProducerInfo{ID: pr.ID(), Kind: pr.Kind().String(), Peer: pr.PeerID()})
	}
	return out
}

// trickleSender — 서버 ICE 후보 → ntf trickle.
func trickleSender(s signal.Session, pc string) func(webrtc.ICECandidateInit) {
	return func(c webrtc.ICECandidateInit) {
		b, err := json.Marshal(c)
		if err != nil {
			return
		}
		s.Send(signal.Notification{M: signal.MTrickle, D: signal.Trickle{PC: pc, Candidate: b}})
	}
}

// Leave — 연쇄 정리(lifecycle.go closePeer).
func (r *Room) Leave(peerID string) { r.exec(func() { r.closePeer(peerID) }) }

// publish — 발행 PC offer → answer. presenter·panel 만(역할 2차 검사).
func (r *Room) publish(peerID, sdp string) (string, *signal.Error) {
	var ans string
	e := r.call(func() *signal.Error {
		p := r.peers[peerID]
		if p == nil {
			return signal.Errf(signal.CodeNotFound, "참가자 없음")
		}
		if !p.Ticket.Role.CanProduce() {
			return signal.Errf(signal.CodeRoleForbidden, "발행 권한 없음")
		}
		if p.Pub == nil {
			pub, err := capri.New(r.api, capri.Publish, r.ice)
			if err != nil {
				return signal.Errf(signal.CodeInternal, err.Error())
			}
			p.Pub = pub
			pub.OnCandidate(trickleSender(p.Session, "pub"))
			pub.OnTrack(func(tr *webrtc.TrackRemote, rx *webrtc.RTPReceiver) {
				mid := pub.ReceiverMid(rx)
				r.do(func() { r.attachTrack(p, mid, remoteTrack{tr, rx}) })
			})
		}
		var err error
		if ans, err = p.Pub.ApplyOffer(sdp); err != nil {
			return signal.Errf(signal.CodeSDPInvalid, err.Error())
		}
		return nil
	})
	return ans, e
}

// attachTrack — 방 고루틴 전용. produce 가 먼저 왔으면 레이어로 붙이고, 아니면 보관.
func (r *Room) attachTrack(p *Peer, mid string, t remoteTrack) {
	if r.peers[p.ID] != p {
		return
	}
	if pr := p.pubMids[mid]; pr != nil {
		r.addLayer(p, pr, t)
		return
	}
	p.pendTracks[mid] = append(p.pendTracks[mid], t)
}

// addLayer — 방 고루틴 전용. 레이어 수신 고루틴을 띄우고, 이미 시작한 Consumer 들을 구독시키고, 발표자 SR 을 읽는다.
func (r *Room) addLayer(p *Peer, pr *santorini.Producer, t remoteTrack) {
	rid := t.tr.RID()
	l := pr.AddLayer(rid, t.tr, p.Pub)
	for _, c := range r.consumers[pr.ID()] {
		if c.Started() {
			l.Subscribe(c.Queue())
		}
	}
	go func() { // 발표자 RTCP(SR → 하류 SR 외삽 기준). 수신기가 멈추면 끝
		for {
			var pkts []rtcp.Packet
			var err error
			if rid == "" {
				pkts, _, err = t.rx.ReadRTCP()
			} else {
				pkts, _, err = t.rx.ReadSimulcastRTCP(rid)
			}
			if err != nil {
				return
			}
			for _, x := range pkts {
				if sr, ok := x.(*rtcp.SenderReport); ok {
					l.OnSR(sr.NTPTime, sr.RTPTime, time.Now())
				}
			}
		}
	}()
}

// Produce — presenter·panel 만(역할 2차 검사). Producer 생성 후 기존 참가자 전원 Consume. mid 짝은 Manager 의 produce 요청이 맞춘다.
func (r *Room) Produce(peerID string, kind santorini.Kind, src santorini.Source) (*santorini.Producer, *signal.Error) {
	return r.produce(peerID, "", kind, src)
}

func (r *Room) produce(peerID, mid string, kind santorini.Kind, src santorini.Source) (*santorini.Producer, *signal.Error) {
	var pr *santorini.Producer
	e := r.call(func() *signal.Error {
		p := r.peers[peerID]
		if p == nil {
			return signal.Errf(signal.CodeNotFound, "참가자 없음")
		}
		if !p.Ticket.Role.CanProduce() {
			return signal.Errf(signal.CodeRoleForbidden, "발행 권한 없음")
		}
		if p.Pub == nil {
			return signal.Errf(signal.CodeNotFound, "transport.publish 먼저")
		}
		if mid != "" && p.pubMids[mid] != nil {
			pr = p.pubMids[mid] // 같은 mid 재요청 — 기존 것
			return nil
		}
		pr = santorini.New(newID(), peerID, kind, src)
		r.producers[pr.ID()] = pr
		p.Producers[pr.ID()] = pr
		if mid != "" {
			p.pubMids[mid] = pr
			for _, t := range p.pendTracks[mid] {
				r.addLayer(p, pr, t)
			}
			delete(p.pendTracks, mid)
		}
		for _, q := range r.peers {
			if q != p {
				if e := r.consume(q, pr, false); e != nil {
					return e
				}
			}
		}
		return nil
	})
	return pr, e
}

// Consume — 구독 PC 에 출력 트랙 추가 + ntf consumerCreated(다음 offer 때) + 연결 뒤 레이어 Subscribe.
func (r *Room) Consume(peerID, producerID string, paused bool) (*jeju.Consumer, *signal.Error) {
	var c *jeju.Consumer
	e := r.call(func() *signal.Error {
		p, pr := r.peers[peerID], r.producers[producerID]
		if p == nil || pr == nil {
			return signal.Errf(signal.CodeNotFound, "참가자 또는 producer 없음")
		}
		if err := r.consume(p, pr, paused); err != nil {
			return err
		}
		c = p.announce[len(p.announce)-1]
		return nil
	})
	return c, e
}

// lateSink — sender 를 먼저 만들어야 출력 SSRC 를 알 수 있어서, Consumer 를 나중에 꽂는 RTCP 수신자.
type lateSink struct{ c atomic.Pointer[jeju.Consumer] }

func (s *lateSink) OnRTCP(pkts []rtcp.Packet) {
	if c := s.c.Load(); c != nil {
		c.OnRTCP(pkts)
	}
}

// consume — 방 고루틴 전용.
func (r *Room) consume(p *Peer, pr *santorini.Producer, paused bool) *signal.Error {
	codec := capri.CodecOpus
	if pr.Kind() == santorini.Video {
		codec = capri.CodecVP8
	}
	track, err := webrtc.NewTrackLocalStaticRTP(codec, pr.Kind().String()+"-"+pr.ID(), pr.PeerID())
	if err != nil {
		return signal.Errf(signal.CodeInternal, err.Error())
	}
	sink := &lateSink{}
	sender, err := p.Sub.AddTrack(track, sink)
	if err != nil {
		return signal.Errf(signal.CodeInternal, err.Error())
	}
	// 출력 SSRC = sender SSRC(TrackLocalStaticRTP 가 바인딩 SSRC 로 덮어쓰므로 이 값이 Consumer 수명 동안 고정)
	c := jeju.New(newID(), pr, track, uint32(sender.GetParameters().Encodings[0].SSRC), paused)
	c.SetReporter(p.Sub)
	sink.c.Store(c)
	if r.consumers[pr.ID()] == nil {
		r.consumers[pr.ID()] = map[string]*jeju.Consumer{}
	}
	r.consumers[pr.ID()][c.ID()] = c
	p.Consumers[c.ID()] = c
	p.senders[c.ID()] = sender
	p.Alloc.Add(c.ID(), c)
	p.announce = append(p.announce, c)
	r.scheduleOffer(p)
	return nil
}

// scheduleOffer — 방 고루틴 전용. OfferBatch 안에 생긴 트랙을 offer 1번으로 묶는다.
func (r *Room) scheduleOffer(p *Peer) {
	if p.offerTimer != nil {
		return
	}
	p.offerTimer = time.AfterFunc(OfferBatch, func() {
		r.do(func() {
			if r.peers[p.ID] != p {
				return
			}
			p.offerTimer = nil
			r.negotiate(p)
		})
	})
}

// negotiate — 방 고루틴 전용. answer 대기 중이면 미룬다(dirty).
func (r *Room) negotiate(p *Peer) {
	if p.awaiting {
		p.dirty = true
		return
	}
	if len(p.announce) == 0 {
		return
	}
	sdp, err := p.Sub.CreateOffer()
	if err != nil {
		p.Session.Send(signal.Notification{M: signal.NError, D: signal.Errf(signal.CodeInternal, "구독 offer 실패: "+err.Error())})
		return
	}
	for _, c := range p.announce {
		p.Session.Send(signal.Notification{M: signal.NConsumerCreated, D: signal.ConsumerCreated{
			ConsumerID: c.ID(), ProducerID: c.ProducerID(), Mid: p.Sub.SenderMid(p.senders[c.ID()]),
			Kind: c.Producer().Kind().String(),
		}})
	}
	p.offered = append(p.offered, p.announce...)
	p.announce = nil
	p.awaiting = true
	p.Session.Send(signal.Notification{M: signal.NTransportSubscribe, D: signal.SDP{SDP: sdp}})
}

// subAnswer — 구독 PC answer 적용 → 연결돼 있으면 Consumer 시작, 미뤄 둔 재협상 진행.
func (r *Room) subAnswer(peerID, sdp string) *signal.Error {
	return r.call(func() *signal.Error {
		p := r.peers[peerID]
		if p == nil {
			return signal.Errf(signal.CodeNotFound, "참가자 없음")
		}
		if !p.awaiting {
			return signal.Errf(signal.CodeSDPInvalid, "대기 중인 서버 offer 없음")
		}
		if err := p.Sub.ApplyAnswer(sdp); err != nil {
			return signal.Errf(signal.CodeSDPInvalid, err.Error())
		}
		p.awaiting = false
		p.ready = append(p.ready, p.offered...)
		p.offered = nil
		r.startReady(p)
		if p.dirty {
			p.dirty = false
			r.scheduleOffer(p)
		}
		return nil
	})
}

// startReady — 방 고루틴 전용. 구독 PC 가 연결됐고 answer 가 적용된 Consumer 를 시작한다(연결 전 키프레임 요청은 버려지므로, REA_01 5.9).
func (r *Room) startReady(p *Peer) {
	if !p.subConnected {
		return
	}
	for _, c := range p.ready {
		select {
		case <-c.Done():
			continue // 그 사이 닫힘
		default:
		}
		for i := int8(0); i < santorini.MaxLayers; i++ {
			if l := c.Producer().Layer(i); l != nil {
				l.Subscribe(c.Queue())
			}
		}
		c.Start()
	}
	p.ready = nil
}

// trickle — 클라이언트 후보 → 발행/구독 PC.
func (r *Room) trickle(peerID string, t signal.Trickle) *signal.Error {
	var c webrtc.ICECandidateInit
	if err := json.Unmarshal(t.Candidate, &c); err != nil {
		return signal.Errf(signal.CodeSDPInvalid, "후보 해석 실패")
	}
	return r.call(func() *signal.Error {
		p := r.peers[peerID]
		if p == nil {
			return signal.Errf(signal.CodeNotFound, "참가자 없음")
		}
		tr := p.Sub
		if t.PC == "pub" {
			tr = p.Pub
		}
		if tr == nil {
			return signal.Errf(signal.CodeNotFound, "PC 없음: "+t.PC)
		}
		if err := tr.AddCandidate(c); err != nil {
			return signal.Errf(signal.CodeSDPInvalid, err.Error())
		}
		return nil
	})
}

// consumerOf — 방 고루틴 밖에서 Consumer 를 찾는다(Consumer 메서드는 자체 채널이라 어느 고루틴이든 안전).
func (r *Room) consumerOf(peerID, consumerID string) (*jeju.Consumer, *signal.Error) {
	var c *jeju.Consumer
	e := r.call(func() *signal.Error {
		if p := r.peers[peerID]; p != nil {
			c = p.Consumers[consumerID]
		}
		if c == nil {
			return signal.Errf(signal.CodeNotFound, "consumer 없음")
		}
		return nil
	})
	return c, e
}

// closeOwnProducer — producer.close(본인 것만).
func (r *Room) closeOwnProducer(peerID, producerID string) *signal.Error {
	return r.call(func() *signal.Error {
		p := r.peers[peerID]
		if p == nil || p.Producers[producerID] == nil {
			return signal.Errf(signal.CodeNotFound, "producer 없음")
		}
		r.closeProducer(producerID)
		return nil
	})
}

// SetPriority — 화면공유 255 > 발표자 영상 > 패널 영상.
func (r *Room) SetPriority(producerID string, p uint8) {
	r.exec(func() {
		if pr := r.producers[producerID]; pr != nil {
			pr.SetPriority(p)
		}
	})
}

// Close — 방 종료(모든 참가자 연쇄 정리 후 고루틴 종료).
func (r *Room) Close() {
	r.exec(func() {
		for id := range r.peers {
			r.closePeer(id)
		}
	})
	r.once.Do(func() { close(r.done) })
}
