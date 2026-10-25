// 닫힘 연쇄(Transport→Producer/Consumer, Producer→Consumer + ntf producerClosed), producer 일시정지·재개, consumer.resume,
// 늦은 합류자 상태 전달(현재 producer 목록·일시정지·레이어 활성) — REA_02 5.1(닫힘 전파·새 Consumer 합류), PRD_02 3.3 bora·5.2.
package bora

import (
	"slices"
	"strings"
	"sync"

	"seminar.pi/media/internal/bwe"
	"seminar.pi/media/internal/jeju"
	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

// pausedProducers — 일시정지된 producerID 집합. 쓰기는 그 방 고루틴에서만, 방이 여러 개라 sync.Map.
// ponytail: Room 구조체가 M1 파일이라 여기 둔다 — 통합 때 Room.paused map 으로 옮기면 잠금 불필요.
var pausedProducers sync.Map

func producerPaused(id string) bool { _, ok := pausedProducers.Load(id); return ok }

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
		if !producerPaused(c.ProducerID()) {
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
	delete(r.peers, peerID)
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
	pausedProducers.Delete(producerID)
	r.notify(pr.PeerID(), signal.NProducerClosed, signal.ProducerRef{ProducerID: producerID})
}

// detachConsumer — 레이어 구독 해제 → 송신 고루틴 종료 → 표·할당기에서 제거.
// [TBD : M1 통합] 구독 PC RemoveTrack + 재협상(ntf transport.subscribe) — Consumer 별 RTPSender 를 M1 이 보관해야 한다.
func (r *Room) detachConsumer(p *Peer, c *jeju.Consumer) {
	for i := int8(0); i < santorini.MaxLayers; i++ {
		if l := c.Producer().Layer(i); l != nil {
			l.Unsubscribe(c.Queue()) // Producer 가 닫혔으면 즉시 반환
		}
	}
	c.Close()
	delete(p.Consumers, c.ID())
	if m := r.consumers[c.ProducerID()]; m != nil {
		delete(m, c.ID())
	}
	if p.Alloc != nil {
		p.Alloc.Remove(c.ID())
	}
}

// setProducerPaused — 연결 Consumer 전부 일시정지/재개(재개는 키프레임 요청 포함) + 다른 참가자에게 알림.
// ponytail: Consumer 의 paused 는 1개라 producer.resume 이 아직 consumer.resume 안 한 Consumer 도 재개한다 — 문제되면 Consumer 에 이유별 플래그.
func (r *Room) setProducerPaused(pr *santorini.Producer, paused bool) {
	if producerPaused(pr.ID()) == paused {
		return
	}
	m := signal.NProducerResumed
	if paused {
		pausedProducers.Store(pr.ID(), struct{}{})
		m = signal.NProducerPaused
	} else {
		pausedProducers.Delete(pr.ID())
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
	if producerPaused(c.ProducerID()) {
		c.Pause()
		if p.Session != nil {
			p.Session.Send(signal.Notification{M: signal.NProducerPaused, D: signal.ProducerRef{ProducerID: c.ProducerID()}})
		}
	}
	if p.Alloc != nil {
		p.Alloc.OnConsumerChanged(consumerView(c))
	}
}

// producerInfos — join 응답의 현재 producer 목록(자기 것 제외, ID 순).
func (r *Room) producerInfos(except string) []signal.ProducerInfo {
	out := make([]signal.ProducerInfo, 0, len(r.producers))
	for id, pr := range r.producers {
		if pr.PeerID() != except {
			out = append(out, signal.ProducerInfo{ID: id, Kind: pr.Kind().String(), Peer: pr.PeerID()})
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
