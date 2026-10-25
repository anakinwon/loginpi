// LayerPolicy 구현 — M1 : 단일 레이어(첫 키프레임 전 Buffer). M4 : simulcast 전환(키프레임 경계·SR TS 정렬·75ms 상한·프레임 미완료 skip, PRD_02 D-8).
package jeju

import (
	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/santorini"
)

// newPolicy — Consumer 생성 시 정책 선택. M4 : 영상 simulcast 면 전환 정책.
func newPolicy(p *santorini.Producer) LayerPolicy { return &singleLayer{} }

// singleLayer — 레이어 0 만, 첫 키프레임부터 보낸다.
type singleLayer struct{ started bool }

func (s *singleLayer) Decide(it forward.Item, lastMarker bool) (Decision, *Switch) {
	if it.Layer != 0 {
		return SilentDrop, nil
	}
	if !s.started {
		if !it.Key {
			return Buffer, nil
		}
		s.started = true
	}
	return Forward, nil
}

func (s *singleLayer) SetTarget(layer int8, paused bool)  {}
func (s *singleLayer) SetMax(layer int8)                  {}
func (s *singleLayer) State() (current, target, max int8) { return 0, 0, 0 }

// SetTarget — bwe.Target 구현(Allocator 고루틴 → 채널).
func (c *Consumer) SetTarget(layer int8, paused bool) {
	c.do(func() { c.policy.SetTarget(layer, paused) })
}

// SetMax — consumer.setLayer 상한(signal → bora → 여기). 100ms 디바운스는 M4.
func (c *Consumer) SetMax(layer int8) { c.do(func() { c.policy.SetMax(layer) }) }
