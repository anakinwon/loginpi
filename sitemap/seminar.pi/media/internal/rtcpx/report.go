// SR(하류 0.5초)·RR(상류 1초) 생성과 NTP 시각·RTT 계산·RTP 시각 외삽·수신 통계. 하류 SR 은 jeju, 상류 RR 은 santorini 가 이 함수들로 만든다.
package rtcpx

import (
	"time"

	"github.com/pion/rtcp"
)

const (
	SRInterval = 500 * time.Millisecond // 하류 SR 주기(PRD_02 3.3 rtcpx)
	RRInterval = time.Second            // 상류 RR 주기
)

const ntpEpochOffset = 2208988800 // 1900→1970 초

// NTPTime — 64비트 NTP 시각(상위 32비트 초, 하위 32비트 소수).
func NTPTime(t time.Time) uint64 {
	s := uint64(t.Unix()) + ntpEpochOffset
	f := uint64(t.Nanosecond()) << 32 / uint64(time.Second)
	return s<<32 | f
}

// RTT — RR 블록의 LSR·DLSR(1/65536초 단위)로 왕복 시간 계산. LSR=0 이거나 음수면 0.
func RTT(lsr, dlsr uint32, now time.Time) time.Duration {
	if lsr == 0 {
		return 0
	}
	mid := uint32(NTPTime(now) >> 16)
	if mid-lsr < dlsr || mid-lsr > 1<<31 {
		return 0
	}
	return time.Duration(uint64(mid-lsr-dlsr) * uint64(time.Second) >> 16)
}

// SenderReport — 출력 SSRC 의 SR.
func SenderReport(ssrc uint32, now time.Time, rtpTS, packets, octets uint32) *rtcp.SenderReport {
	return &rtcp.SenderReport{SSRC: ssrc, NTPTime: NTPTime(now), RTPTime: rtpTS, PacketCount: packets, OctetCount: octets}
}

// ReceiverReport — 상류 RR(발표자 레이어별 수신 보고).
func ReceiverReport(ssrc uint32, reports []rtcp.ReceptionReport) *rtcp.ReceiverReport {
	return &rtcp.ReceiverReport{SSRC: ssrc, Reports: reports}
}

// ExtrapolateRTP — 기준 시각 at 의 RTP 시각 ts 에서 now 까지 흐른 만큼 더한 RTP 시각(clock Hz). 하류 SR 의 RTPTime 에 쓴다.
// [TBD : M2] 발표자 SR 도착 시각(우리 시계) 기준 — 편도 지연만큼 어긋나지만 음성·영상이 같은 경로라 립싱크 상대값은 유지된다.
func ExtrapolateRTP(ts uint32, at, now time.Time, clock uint32) uint32 {
	return ts + uint32(int64(now.Sub(at))*int64(clock)/int64(time.Second))
}

// DLSR — 마지막 SR 수신 뒤 경과 시간(1/65536초 단위).
func DLSR(at, now time.Time) uint32 {
	return uint32(uint64(now.Sub(at)) << 16 / uint64(time.Second))
}

// ReceptionStats — 상류 RR 한 블록을 만들기 위한 수신 통계(64비트 확장 순번 기준). 레이어 수신 고루틴 전용(잠금 없음).
type ReceptionStats struct {
	started            bool
	base, max          uint64
	received           uint64
	expPrior, recPrior uint64
}

// Update — 확장 순번 1개 수신(순서 뒤바뀜·중복 허용).
func (s *ReceptionStats) Update(ext uint64) {
	switch {
	case !s.started:
		s.started, s.base, s.max = true, ext, ext
	case ext > s.max:
		s.max = ext
	case ext < s.base:
		s.base = ext
	}
	s.received++
}

// Report — RR 블록(RFC 3550 6.4.1·A.3). lsr·dlsr 는 마지막 SR 의 NTP 중간 32비트와 그 뒤 경과(1/65536초). 지터는 [TBD : M2].
func (s *ReceptionStats) Report(ssrc, lsr, dlsr uint32) rtcp.ReceptionReport {
	if !s.started {
		return rtcp.ReceptionReport{SSRC: ssrc, LastSenderReport: lsr, Delay: dlsr}
	}
	expected := s.max - s.base + 1
	lost := max(min(int64(expected)-int64(s.received), 0x7FFFFF), 0)
	expInt, recInt := expected-s.expPrior, s.received-s.recPrior
	s.expPrior, s.recPrior = expected, s.received
	var frac uint8
	if lostInt := int64(expInt) - int64(recInt); expInt > 0 && lostInt > 0 {
		frac = uint8(lostInt << 8 / int64(expInt))
	}
	return rtcp.ReceptionReport{
		SSRC: ssrc, FractionLost: frac, TotalLost: uint32(lost),
		LastSequenceNumber: uint32(s.max - 1<<16), // 확장 순번은 1<<16 위에서 시작(rtpx.SeqExtender) → 감김 횟수<<16 | 순번
		LastSenderReport:   lsr, Delay: dlsr,
	}
}
