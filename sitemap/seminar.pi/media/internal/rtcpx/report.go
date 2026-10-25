// SR(하류 0.5초)·RR(상류 1초) 생성과 NTP 시각·RTT 계산. SR NTP/RTP 외삽(립싱크)은 M1 이 jeju 쪽에서 이 함수들로 만든다.
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
