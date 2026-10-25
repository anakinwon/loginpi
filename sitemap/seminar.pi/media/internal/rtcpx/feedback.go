// NACK·PLI·FIR 생성 — 상류(발표자에게) 손실 복구·키프레임 요청. FIR 순번은 호출자가 반드시 갱신한다(REA_01 5.5 결함 수정).
package rtcpx

import "github.com/pion/rtcp"

// NACK — 상류 NACK(LossTracker.Due 결과).
func NACK(sender, media uint32, pairs []rtcp.NackPair) *rtcp.TransportLayerNack {
	return &rtcp.TransportLayerNack{SenderSSRC: sender, MediaSSRC: media, Nacks: pairs}
}

// PLI — 상류 키프레임 요청(pli.Limiter.Tick 이 true 일 때만).
func PLI(sender, media uint32) *rtcp.PictureLossIndication {
	return &rtcp.PictureLossIndication{SenderSSRC: sender, MediaSSRC: media}
}

// FIR — 상류 FIR. seq 는 요청마다 1 증가시켜 넘긴다.
func FIR(sender, media uint32, seq uint8) *rtcp.FullIntraRequest {
	return &rtcp.FullIntraRequest{SenderSSRC: sender, MediaSSRC: media, FIR: []rtcp.FIREntry{{SSRC: media, SequenceNumber: seq}}}
}
