// 4분류 판정(Forward/Drop/SilentDrop/Buffer)과 SeqRewriter 반영, 일시정지·재개, 레이어 사용 가능 훅(PRD_02 3.3 jeju, REA_02 5.6·5.9).
package jeju

import (
	"time"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/pli"
	"seminar.pi/media/internal/santorini"
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
// 일시정지 중 패킷은 SilentDrop 과 같다(순번 공간 밖) — 재개 뒤 첫 키프레임에서 Sync 로 이어 붙인다(REA_02 5.1 consume paused→resume).
func (c *Consumer) decide(it forward.Item) (send bool) {
	if c.paused {
		return false
	}
	d, sw := c.policy.Decide(it, c.lastMarker)
	if c.seq.resync && d == Forward {
		if !it.Key && c.producer.Kind() == santorini.Video {
			return false // 재개 후 키프레임 전 — Buffer(음성은 키프레임이 없어 바로 이어 붙임)
		}
		c.seq.resync = false
		if sw == nil {
			sw = &Switch{From: -1, To: it.Layer} // 재개 = 새 시작(프레임 미완료 skip·전환 카운터 없음)
		}
	}
	if sw != nil {
		c.applySwitch(sw, it) // Sync + TS 오프셋·VP8 재기준(M4)
	}
	switch d {
	case Forward:
		return true
	case Drop:
		c.seq.Drop(it.ExtSeq)
	}
	return false
}

// Pause — 청중 수신 일시정지(producer.pause 연쇄, 할당기 일시정지).
func (c *Consumer) Pause() { c.do(c.pause) }

// Resume — 재개 즉시 키프레임 요청(PRD_02 5.2 consumer.resume).
func (c *Consumer) Resume() { c.do(c.resume) }

func (c *Consumer) pause() { c.paused = true }

// resume — 송신 고루틴 전용. 일시정지가 아니면 아무것도 하지 않는다.
func (c *Consumer) resume() {
	if !c.paused {
		return
	}
	c.paused = false
	c.seq.resync = true
	// 일시정지 중엔 청중 RR 이 끊기므로 RR 기준을 비운다 — 재개 직후 옛 RR 시각으로 "10초 RR 없음 = lost" 오판(전원 토스트) 방지.
	// 새 RR 이 올 때까지 품질 판정은 보류된다(score.go tick : sinceRR < 0)
	c.lastRR = time.Time{}
	c.requestKeyframe(pli.NewConsumer)
}

// layerUsable — 레이어 비활성 감지 훅. 없거나 비활성(santorini Active, M4)인 레이어는 전환 후보에서 뺀다(REA_02 5.9 점수 0 제외).
// M4 LayerPolicy·Allocator 가 목표 레이어를 고를 때 쓴다.
func (c *Consumer) layerUsable(i int8) bool {
	l := c.producer.Layer(i)
	return l != nil && l.Active()
}
