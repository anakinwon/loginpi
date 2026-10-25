// 청중 RTCP 수신 — capri RTCP 고루틴이 OnRTCP 로 넘기면 송신 고루틴에서 분배(NACK → retransmit.go, PLI·FIR, RR).
package jeju

import (
	"time"

	"github.com/pion/rtcp"

	"seminar.pi/media/internal/pli"
)

// OnRTCP — capri.RTCPSink 구현. 어느 고루틴이든 안전(채널).
func (c *Consumer) OnRTCP(pkts []rtcp.Packet) {
	c.do(func() {
		for _, p := range pkts {
			switch v := p.(type) {
			case *rtcp.TransportLayerNack:
				c.onNACK(v)
			case *rtcp.PictureLossIndication:
				c.requestKeyframe(pli.SubscriberPLI)
			case *rtcp.FullIntraRequest:
				c.requestKeyframe(pli.SubscriberFIR)
			case *rtcp.ReceiverReport:
				for _, r := range v.Reports {
					if r.SSRC == c.outSSRC {
						c.onRR(r, time.Now())
					}
				}
			}
		}
	})
}

// requestKeyframe — 현재 레이어의 Limiter 로 요청(송신 고루틴 전용). M2 : PLI 후 재전송 중단 표시 추가.
func (c *Consumer) requestKeyframe(r pli.Reason) {
	cur, _, _ := c.policy.State()
	if l := c.producer.Layer(cur); l != nil {
		l.RequestKeyframe(r)
	}
}

// onRR — RTT·손실·지터(SendMeta 억제 간격·품질 점수 입력). M1 에서 구현(RTT = rtcpx.RTT).
func (c *Consumer) onRR(r rtcp.ReceptionReport, now time.Time) {}
