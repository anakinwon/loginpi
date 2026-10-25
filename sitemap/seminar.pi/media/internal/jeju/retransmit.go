// 하류 재전송 — 청중 NACK → SendMeta.Resolve(억제·3회) → cache.Get → 같은 SSRC 재전송(D-5), 캐시 미스는 50ms 모아 상류 NACK(PRD_02 4.2).
package jeju

import (
	"time"

	"github.com/pion/rtcp"

	"seminar.pi/media/internal/forward"
)

// onNACK — 송신 고루틴 전용. M2 에서 구현.
func (c *Consumer) onNACK(n *rtcp.TransportLayerNack) {}

// recordSent — 보낸 패킷 기록(Run 이 WriteRTP 성공 후 호출).
func (c *Consumer) recordSent(out uint16, it forward.Item, now time.Time) {
	c.meta.Push(out, it.ExtSeq, it.Layer, now)
}
