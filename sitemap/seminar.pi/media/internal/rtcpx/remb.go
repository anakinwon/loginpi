// REMB 생성(발표자 방향 1초)·파싱(청중 REMB → bwe.Allocator). TWCC 는 협상하지 않는다(PRD_02 D-7).
package rtcpx

import (
	"math"

	"github.com/pion/rtcp"
)

// REMB — 발표자에게 보낼 REMB. bps 상한은 구독자 요청 최대 레이어 합계(PRD_02 3.3 bwe 발행자 방향 — 값 계산은 통합 단계).
func REMB(sender uint32, bps float32, ssrcs []uint32) *rtcp.ReceiverEstimatedMaximumBitrate {
	return &rtcp.ReceiverEstimatedMaximumBitrate{SenderSSRC: sender, Bitrate: bps, SSRCs: ssrcs}
}

// ParseREMB — REMB 패킷이면 값을 꺼낸다. 청중이 보낸 값이라 신뢰 경계 — 음수·NaN·Inf·SSRC 없음은 거부.
func ParseREMB(p rtcp.Packet) (bps float32, ssrcs []uint32, ok bool) {
	r, ok := p.(*rtcp.ReceiverEstimatedMaximumBitrate)
	if !ok || len(r.SSRCs) == 0 || r.Bitrate < 0 || math.IsNaN(float64(r.Bitrate)) || math.IsInf(float64(r.Bitrate), 0) {
		return 0, nil, false
	}
	return r.Bitrate, r.SSRCs, true
}
