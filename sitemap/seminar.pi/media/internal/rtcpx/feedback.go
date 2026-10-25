// NACK·PLI·FIR 생성과 파싱 — 상류(발표자에게) 손실 복구·키프레임 요청, 청중이 보낸 피드백 해석. 직렬화는 pion rtcp(S-1 범위).
// FIR 순번은 호출자가 반드시 갱신한다(REA_01 5.5 결함 수정, 청중 쪽 중복 제거는 pli.FIRFilter).
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

// NACKSeqs — NACK 쌍을 순번 목록으로 펼친다(PID 다음 BLP 비트 순, 감김 그대로).
func NACKSeqs(pairs []rtcp.NackPair) []uint16 {
	var out []uint16
	for i := range pairs {
		pairs[i].Range(func(s uint16) bool {
			out = append(out, s)
			return true
		})
	}
	return out
}

// ParseNACK — NACK 패킷이면 대상 SSRC 와 순번 목록.
func ParseNACK(p rtcp.Packet) (media uint32, seqs []uint16, ok bool) {
	n, ok := p.(*rtcp.TransportLayerNack)
	if !ok {
		return 0, nil, false
	}
	return n.MediaSSRC, NACKSeqs(n.Nacks), true
}

// ParsePLI — PLI 패킷이면 대상 SSRC.
func ParsePLI(p rtcp.Packet) (media uint32, ok bool) {
	v, ok := p.(*rtcp.PictureLossIndication)
	if !ok {
		return 0, false
	}
	return v.MediaSSRC, true
}

// ParseFIR — FIR 패킷에서 ssrc 대상 항목의 순번. 해당 항목이 없으면 ok=false.
func ParseFIR(p rtcp.Packet, ssrc uint32) (seq uint8, ok bool) {
	v, isFIR := p.(*rtcp.FullIntraRequest)
	if !isFIR {
		return 0, false
	}
	for _, e := range v.FIR {
		if e.SSRC == ssrc {
			return e.SequenceNumber, true
		}
	}
	return 0, false
}
