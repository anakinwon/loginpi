// 상류 피드백 — Layer.Run 이 주기적으로 불러 발표자에게 보낼 NACK·PLI 를 만든다(수신 고루틴 전용). M1 : PLI 만, M2 : NACK·Overflow·FIR.
package santorini

import (
	"time"

	"github.com/pion/rtcp"

	"seminar.pi/media/internal/rtcpx"
)

// FeedbackInterval — Run 이 feedback 을 부르는 주기(첫 NACK 20ms 기준). [TBD : M2]
const FeedbackInterval = 20 * time.Millisecond

// feedback — 지금 보낼 상류 RTCP. ssrc 는 발표자 레이어의 원본 SSRC(Run 이 첫 패킷에서 알아냄), rtt 는 상류 RR 로 잰 값.
func (l *Layer) feedback(now time.Time, ssrc uint32, rtt time.Duration) []rtcp.Packet {
	var out []rtcp.Packet
	// M2 에서 구현 : l.loss.Due(now, rtt) → rtcpx.NACK, l.loss.Overflow() → l.limiter.Need(pli.NackOverflow)
	if l.limiter.Tick(now) {
		out = append(out, rtcpx.PLI(0, ssrc))
	}
	return out
}
