// 닫힘 연쇄 — Transport 닫힘 → Producer/Consumer, Producer 닫힘 → 연결 Consumer 전부 + ntf producerClosed. 늦은 합류자 상태 전달도 여기(M3).
package bora

// closePeer — 방 고루틴 전용. M1 기본 : 자원 닫기·표에서 제거. M3 : 알림·늦은 합류자·순서 정밀화.
func (r *Room) closePeer(peerID string) {
	p := r.peers[peerID]
	if p == nil {
		return
	}
	for id := range p.Producers {
		r.closeProducer(id)
	}
	for id, c := range p.Consumers {
		c.Close()
		delete(r.consumers[c.ProducerID()], id)
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

// closeProducer — 방 고루틴 전용. 연결 Consumer 를 모두 닫는다. M3 : 레이어 Unsubscribe·RemoveTrack·ntf producerClosed.
func (r *Room) closeProducer(producerID string) {
	pr := r.producers[producerID]
	if pr == nil {
		return
	}
	pr.Close()
	for _, c := range r.consumers[producerID] {
		c.Close()
	}
	delete(r.consumers, producerID)
	delete(r.producers, producerID)
	if owner := r.peers[pr.PeerID()]; owner != nil {
		delete(owner.Producers, producerID)
	}
}
