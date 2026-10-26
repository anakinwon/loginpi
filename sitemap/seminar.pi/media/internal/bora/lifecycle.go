// 닫힘 연쇄(Transport→Producer/Consumer, Producer→Consumer + ntf producerClosed), producer 일시정지·재개, consumer.resume,
// 늦은 합류자 상태 전달(현재 producer 목록·일시정지·레이어 활성) — REA_02 5.1(닫힘 전파·새 Consumer 합류), PRD_02 3.3 bora·5.2.
package bora

import (
	"errors"
	"log"
	"slices"
	"strings"
	"time"

	"seminar.pi/media/internal/bwe"
	"seminar.pi/media/internal/jeju"
	"seminar.pi/media/internal/record"
	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

// recording — Producer 1개의 녹화(최고 레이어 고정 Consumer → record.Recorder). 할당기에 넣지 않는다(M5).
type recording struct {
	c   *jeju.Consumer
	rec *record.Recorder
}

// startRecording — 방 고루틴 전용. MEDIA_RECORD_DIR 미설정이면 아무것도 하지 않는다(기본 꺼짐).
// 레이어 구독은 addLayer 가 한다. ponytail: 녹화 중 손실은 Recorder 가 다음 키프레임까지 버린다 — 키프레임 재요청 연결 없음.
func (r *Room) startRecording(pr *santorini.Producer) {
	rec, err := record.Open(r.id, pr.ID(), pr.Kind() == santorini.Video)
	if err != nil {
		if !errors.Is(err, record.ErrDisabled) {
			log.Printf("녹화 시작 실패 %s/%s: %v", r.id, pr.ID(), err)
		}
		return
	}
	c := jeju.New(newID(), pr, rec, 0, false) // 출력 SSRC 는 파일에 쓰이지 않음
	r.recs[pr.ID()] = recording{c: c, rec: rec}
	c.Start()
}

func (r *Room) stopRecording(producerID string) {
	rc, ok := r.recs[producerID]
	if !ok {
		return
	}
	delete(r.recs, producerID)
	rc.c.Close()
	if err := rc.rec.Close(); err != nil { // WriteRTP 와 잠금으로 보호됨
		log.Printf("녹화 마감 실패 %s/%s: %v", r.id, producerID, err)
	}
}

func (r *Room) producerPaused(id string) bool { return r.paused[id] }

// refreshViews — 방 고루틴 전용, ViewInterval 마다. 레이어 활성·비트레이트(santorini, 1초 갱신)를 할당기로(M4).
func (r *Room) refreshViews() {
	for _, p := range r.peers {
		if p.Alloc == nil {
			continue
		}
		for _, c := range p.Consumers {
			p.Alloc.OnConsumerChanged(r.view(c))
		}
	}
	r.publishCaps(time.Now())
}

// rembLayerBps — 발행 허용 레이어별 REMB 상한 기여(bps). [TBD : M4 실측 — 발표자 simulcast 실제 비트레이트]
var rembLayerBps = [santorini.MaxLayers]int64{300_000, 900_000, 2_500_000}

// publishCaps — 방 고루틴 전용, ViewInterval 마다. 영상 producer 별 구독자 요청 최대 레이어(setLayer, 녹화는 최고) → Dynacast(상향 즉시·하향 5초)
// → 바뀌면 발행자에게 ntf publishLayers, 그리고 허용 레이어 합계를 REMB 상한으로(레이어 수신 고루틴이 1초 RR 과 함께 보낸다, PRD_02 3.3 bwe).
func (r *Room) publishCaps(now time.Time) {
	for id, pr := range r.producers {
		if pr.Kind() != santorini.Video {
			continue
		}
		req := int8(0) // 레이어 0 은 늘 켠다(Dynacast)
		if _, ok := r.recs[id]; ok {
			req = santorini.MaxLayers - 1
		}
		for cid := range r.consumers[id] {
			req = max(req, r.maxOf(cid))
		}
		d := r.dyna[id]
		if d == nil {
			d = bwe.NewDynacast()
			r.dyna[id] = d
		}
		pub, changed := d.Set("", req, now) // ponytail: 요청 집계는 위에서 끝냈으니 키 1개로 — 구독자별 표는 쓰지 않는다
		var capBps int64
		for i := int8(0); i <= pub; i++ {
			capBps += rembLayerBps[i]
		}
		pr.SetREMBCap(capBps)
		if o := r.peers[pr.PeerID()]; changed && o != nil && o.Session != nil {
			o.Session.Send(signal.Notification{M: signal.NPublishLayers, D: signal.PublishLayers{ProducerID: id, Rids: bwe.Rids(pub)}})
		}
	}
}

func (r *Room) maxOf(consumerID string) int8 {
	if m, ok := r.maxLayer[consumerID]; ok {
		return m
	}
	return santorini.MaxLayers - 1
}

// view — 할당기용 스냅샷에 setLayer 상한을 채운다.
func (r *Room) view(c *jeju.Consumer) bwe.ConsumerView {
	v := consumerView(c)
	v.MaxLayer = r.maxOf(c.ID())
	return v
}

// ── 공개 메서드(signal 요청 → Manager.Request 가 부른다). 방이 닫혔으면 ROOM_CLOSED ──

// CloseProducer — producer.close. 자기 Producer 만.
func (r *Room) CloseProducer(peerID, producerID string) *signal.Error {
	return r.call(func() *signal.Error {
		if r.ownProducer(peerID, producerID) == nil {
			return signal.Errf(signal.CodeNotFound, "producer 없음: "+producerID)
		}
		r.closeProducer(producerID)
		return nil
	})
}

// PauseProducer — producer.pause(paused=true)·producer.resume(false). 자기 Producer 만.
func (r *Room) PauseProducer(peerID, producerID string, paused bool) *signal.Error {
	return r.call(func() *signal.Error {
		pr := r.ownProducer(peerID, producerID)
		if pr == nil {
			return signal.Errf(signal.CodeNotFound, "producer 없음: "+producerID)
		}
		if !paused && r.paused[producerID] && r.lockedFor(r.peers[peerID], pr.Kind(), pr.Source()) {
			return signal.Errf(signal.CodeLocked, "발표자가 잠금") // v1.2 — 이미 켜져 있으면 성공(잠금은 켜기만 막는다)
		}
		r.setProducerPaused(pr, paused)
		return nil
	})
}

// ResumeConsumer — consumer.resume(클라이언트 수신 준비 끝). Producer 가 일시정지면 producer.resume 때 함께 재개.
func (r *Room) ResumeConsumer(peerID, consumerID string) *signal.Error {
	return r.call(func() *signal.Error {
		p := r.peers[peerID]
		if p == nil || p.Consumers[consumerID] == nil {
			return signal.Errf(signal.CodeNotFound, "consumer 없음: "+consumerID)
		}
		c := p.Consumers[consumerID]
		if !r.producerPaused(c.ProducerID()) {
			c.Resume() // 즉시 키프레임 요청(jeju)
		}
		return nil
	})
}

func (r *Room) call(fn func() *signal.Error) (e *signal.Error) {
	if !r.exec(func() { e = fn() }) {
		return signal.Errf(signal.CodeRoomClosed, "방 종료")
	}
	return e
}

func (r *Room) ownProducer(peerID, producerID string) *santorini.Producer {
	if p := r.peers[peerID]; p != nil {
		return p.Producers[producerID]
	}
	return nil
}

// ── 방 고루틴 전용 ──

// closePeer — Transport 닫힘 연쇄. 순서 : ① 내 Producer(→ 남의 Consumer 정리·알림) ② 내 Consumer(레이어에서 떼고 닫기)
// ③ Transport·할당기 ④ 표에서 제거. 입력을 먼저 끊고 소비자를 닫아 큐·고루틴 누수가 없게 한다.
func (r *Room) closePeer(peerID string) {
	p := r.peers[peerID]
	if p == nil {
		return
	}
	for id := range p.Producers {
		r.closeProducer(id)
	}
	for _, c := range p.Consumers {
		r.detachConsumer(p, c)
	}
	if p.Pub != nil {
		_ = p.Pub.Close()
	}
	if p.Sub != nil {
		_ = p.Sub.Close()
	}
	if p.Alloc != nil {
		p.Alloc.Close()
	}
	if p.offerTimer != nil {
		p.offerTimer.Stop()
	}
	delete(r.peers, peerID)
	r.speaker.forget(peerID)
	r.queueLeft(peerID) // ④ 뒤 200ms 묶음 ntf peerLeft(v1.1)
}

// closeProducer — Producer 닫힘 연쇄. 순서 : ① 표에서 빼 새 Consume 차단 ② Producer 닫기(레이어 수신 고루틴 종료 → 큐 투입 중단)
// ③ 연결 Consumer 전부 정리 ④ 다른 참가자에게 ntf producerClosed(이 시점엔 Consumer 가 모두 닫혀 있음).
func (r *Room) closeProducer(producerID string) {
	pr := r.producers[producerID]
	if pr == nil {
		return
	}
	delete(r.producers, producerID)
	if owner := r.peers[pr.PeerID()]; owner != nil {
		delete(owner.Producers, producerID)
	}
	pr.Close()
	r.stopRecording(producerID)
	for _, p := range r.peers {
		for _, c := range p.Consumers {
			if c.ProducerID() == producerID {
				r.detachConsumer(p, c)
			}
		}
	}
	for _, c := range r.consumers[producerID] { // 주인 없는 것(방어)
		c.Close()
	}
	delete(r.consumers, producerID)
	delete(r.paused, producerID)
	delete(r.dyna, producerID)
	r.notify(pr.PeerID(), signal.NProducerClosed, signal.ProducerRef{ProducerID: producerID})
}

// detachConsumer — 레이어 구독 해제 → 송신 고루틴 종료 → 표·할당기에서 제거 → 구독 PC RemoveTrack + 재협상 예약.
// 참가자 자신이 나가는 중이면(closePeer) 재협상 타이머는 closePeer 가 멈춘다.
func (r *Room) detachConsumer(p *Peer, c *jeju.Consumer) {
	for i := int8(0); i < santorini.MaxLayers; i++ {
		if l := c.Producer().Layer(i); l != nil {
			l.Unsubscribe(c.Queue()) // Producer 가 닫혔으면 즉시 반환
		}
	}
	c.Close()
	delete(p.Consumers, c.ID())
	delete(r.maxLayer, c.ID())
	if m := r.consumers[c.ProducerID()]; m != nil {
		delete(m, c.ID())
	}
	if p.Alloc != nil {
		p.Alloc.Remove(c.ID())
	}
	if s := p.senders[c.ID()]; s != nil {
		delete(p.senders, c.ID())
		if p.Sub != nil && p.Sub.RemoveTrack(s) == nil {
			p.renego = true
			r.scheduleOffer(p)
		}
	}
}

// setProducerPaused — 연결 Consumer 전부 일시정지/재개(재개는 키프레임 요청 포함) + 다른 참가자에게 알림.
// ponytail: Consumer 의 paused 는 1개라 producer.resume 이 아직 consumer.resume 안 한 Consumer 도 재개한다 — 문제되면 Consumer 에 이유별 플래그.
func (r *Room) setProducerPaused(pr *santorini.Producer, paused bool) {
	if r.paused[pr.ID()] == paused {
		return
	}
	m := signal.NProducerResumed
	if paused {
		r.paused[pr.ID()] = true
		m = signal.NProducerPaused
	} else {
		delete(r.paused, pr.ID())
	}
	for _, c := range r.consumers[pr.ID()] {
		if paused {
			c.Pause()
		} else {
			c.Resume()
		}
	}
	r.notify(pr.PeerID(), m, signal.ProducerRef{ProducerID: pr.ID()})
}

// initConsumer — 늦은 합류자 상태 전달(REA_02 5.1 새 Consumer 합류). M1 Consume 이 ntf consumerCreated 직후 부른다.
// Producer 가 일시정지면 Consumer 도 멈추고 producerPaused 를 보내며, 할당기에 레이어 활성·비트레이트를 바로 넘긴다.
func (r *Room) initConsumer(p *Peer, c *jeju.Consumer) {
	if r.producerPaused(c.ProducerID()) {
		c.Pause()
		if p.Session != nil {
			p.Session.Send(signal.Notification{M: signal.NProducerPaused, D: signal.ProducerRef{ProducerID: c.ProducerID()}})
		}
	}
	if p.Alloc != nil {
		p.Alloc.OnConsumerChanged(r.view(c))
	}
}

// producerInfos — join 응답의 현재 producer 목록(자기 것 제외, ID 순).
func (r *Room) producerInfos(except string) []signal.ProducerInfo {
	out := make([]signal.ProducerInfo, 0, len(r.producers))
	for id, pr := range r.producers {
		if pr.PeerID() != except {
			out = append(out, signal.ProducerInfo{ID: id, Kind: pr.Kind().String(), Peer: pr.PeerID(), Source: string(pr.Source())})
		}
	}
	slices.SortFunc(out, func(a, b signal.ProducerInfo) int { return strings.Compare(a.ID, b.ID) })
	return out
}

// consumerView — 할당기용 스냅샷(레이어 활성 = 비활성 감지 결과, santorini Active M4).
func consumerView(c *jeju.Consumer) bwe.ConsumerView {
	pr := c.Producer()
	v := bwe.ConsumerView{ID: c.ID(), Priority: pr.Priority(), MaxLayer: santorini.MaxLayers - 1}
	for i := int8(0); i < santorini.MaxLayers; i++ {
		if l := pr.Layer(i); l != nil {
			v.Active[i], v.Bitrates[i] = l.Active(), l.Bitrate()
		}
	}
	return v
}

// notify — except 를 뺀 참가자 전원에게 알림(Session.Send 는 비차단).
func (r *Room) notify(except, m string, d any) {
	for id, p := range r.peers {
		if id != except && p.Session != nil {
			p.Session.Send(signal.Notification{M: m, D: d})
		}
	}
}
