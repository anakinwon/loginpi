// REMB 생성(발표자 방향 1초)·파싱(청중 REMB → bwe.Allocator). TWCC 는 협상하지 않는다(PRD_02 D-7).
package rtcpx

import "github.com/pion/rtcp"

// REMB — 발표자에게 보낼 REMB. bps 는 구독자 요청 최대 레이어 합계가 상한(Galène 5.7 개념, M4).
func REMB(sender uint32, bps float32, ssrcs []uint32) *rtcp.ReceiverEstimatedMaximumBitrate {
	return &rtcp.ReceiverEstimatedMaximumBitrate{SenderSSRC: sender, Bitrate: bps, SSRCs: ssrcs}
}

// ParseREMB — REMB 패킷이면 값을 꺼낸다.
func ParseREMB(p rtcp.Packet) (bps float32, ssrcs []uint32, ok bool) {
	r, ok := p.(*rtcp.ReceiverEstimatedMaximumBitrate)
	if !ok {
		return 0, nil, false
	}
	return r.Bitrate, r.SSRCs, true
}
