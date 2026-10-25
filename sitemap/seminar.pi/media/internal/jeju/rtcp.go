// 청중 RTCP 수신 — capri RTCP 고루틴이 OnRTCP 로 넘기면 송신 고루틴에서 분배(NACK → retransmit.go, PLI·FIR, RR).
package jeju

import (
	"time"

	"github.com/pion/rtcp"

	"seminar.pi/media/internal/pli"
	"seminar.pi/media/internal/rtcpx"
	"seminar.pi/media/internal/santorini"
)

// OnRTCP — capri.RTCPSink 구현. 어느 고루틴이든 안전(채널).
func (c *Consumer) OnRTCP(pkts []rtcp.Packet) {
	c.do(func() {
		for _, p := range pkts {
			switch v := p.(type) {
			case *rtcp.TransportLayerNack:
				c.onNACK(v)
			case *rtcp.PictureLossIndication:
				if v.MediaSSRC == c.outSSRC {
					c.stopRTX() // 키프레임이 나갈 때까지 재전송 중단(M2)
					c.requestKeyframe(pli.SubscriberPLI)
				}
			case *rtcp.FullIntraRequest:
				if seq, ok := rtcpx.ParseFIR(v, c.outSSRC); ok && !c.fir.Duplicate(seq) {
					c.stopRTX()
					c.requestKeyframe(pli.SubscriberFIR)
				}
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

// requestKeyframe — 현재 레이어의 Limiter 로 요청(송신 고루틴 전용).
func (c *Consumer) requestKeyframe(r pli.Reason) {
	if _, l := c.curLayer(); l != nil {
		l.RequestKeyframe(r)
	}
}

// curLayer — 현재(시작 전이면 목표) 레이어. 그 레이어가 아직 없으면 그 아래 있는 레이어로 내려간다(단일 레이어 발행 시 목표 h → l).
func (c *Consumer) curLayer() (int8, *santorini.Layer) {
	cur, _, _ := c.policy.State()
	for i := cur; i >= 0; i-- {
		if l := c.producer.Layer(i); l != nil {
			return i, l
		}
	}
	return cur, nil
}

// onRR — RTT(우리 SR 의 LSR·DLSR 기준) → SendMeta 재전송 억제 간격(M2).
func (c *Consumer) onRR(r rtcp.ReceptionReport, now time.Time) {
	if d := rtcpx.RTT(r.LastSenderReport, r.Delay, now); d > 0 {
		c.rtt = d
		c.meta.SetRTT(d)
	}
}
