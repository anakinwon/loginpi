// 4분류 판정(Forward/Drop/SilentDrop/Buffer)과 SeqRewriter 반영, 일시정지·재개(PRD_02 3.3 jeju, REA_02 5.6). M3 에서 정밀화.
package jeju

import (
	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/pli"
)

// Decision — 항목 하나의 처리 결과.
type Decision uint8

const (
	Forward    Decision = iota // 보낸다
	Drop                       // 보내지 않고 출력 순번 공간에서 메움(SeqRewriter.Drop)
	SilentDrop                 // 다른 레이어 — 순번에 흔적 없이 무시
	Buffer                     // 첫 키프레임 전 — 보내지 않고 기다림
)

func (d Decision) String() string {
	return [...]string{"Forward", "Drop", "SilentDrop", "Buffer"}[d]
}

// Switch — 레이어 전환(키프레임 경계). 적용 시 SeqRewriter.Sync + TS 오프셋 재계산(M4).
type Switch struct {
	From, To int8
}

// LayerPolicy — 레이어 선택 정책(구현 M4 layerpolicy.go). 송신 고루틴 전용, 다른 고루틴은 Consumer.SetTarget(채널)로.
type LayerPolicy interface {
	Decide(it forward.Item, lastMarker bool) (Decision, *Switch) // Switch != nil 이면 전환 + 재동기화
	SetTarget(layer int8, paused bool)                           // bwe.Allocator 결정 반영
	SetMax(layer int8)                                           // consumer.setLayer 상한(클라이언트 화면 크기)
	State() (current, target, max int8)
}

// decide — 정책 판정 + 일시정지 + 순번 반영. send=true 면 보낸다(송신 고루틴 전용).
func (c *Consumer) decide(it forward.Item) (send bool) {
	if c.paused {
		return false // M3 : paused 중 순번 처리(Drop 여부) 확정
	}
	d, sw := c.policy.Decide(it, c.lastMarker)
	if sw != nil {
		c.seq.Sync(it.ExtSeq)
	}
	switch d {
	case Forward:
		return true
	case Drop:
		c.seq.Drop(it.ExtSeq)
	}
	return false
}

// Pause — 청중 수신 일시정지.
func (c *Consumer) Pause() { c.do(func() { c.paused = true }) }

// Resume — 재개 즉시 키프레임 요청(PRD_02 5.2 consumer.resume).
func (c *Consumer) Resume() {
	c.do(func() {
		c.paused = false
		c.requestKeyframe(pli.NewConsumer)
	})
}
