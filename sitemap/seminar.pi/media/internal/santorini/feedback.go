// 상류 피드백 — Layer.Run 이 주기적으로 불러 발표자에게 보낼 NACK·PLI 를 만든다(수신 고루틴 전용, PRD_02 4.1 3~4단계).
// 하류 캐시 미스 묶음(jeju)은 RequestNACK 로 명령 채널을 거쳐 같은 LossTracker 에 합쳐진다(REA_01 5.4 개념).
package santorini

import (
	"time"

	"github.com/pion/rtcp"

	"seminar.pi/media/internal/metrics"
	"seminar.pi/media/internal/pli"
	"seminar.pi/media/internal/rtcpx"
)

// FeedbackInterval — Run 이 feedback 을 부르는 주기(첫 NACK 20ms 기준, REA_01 5.3). [TBD : M2 실측]
const FeedbackInterval = 20 * time.Millisecond

// feedback — 지금 보낼 상류 RTCP. ssrc 는 발표자 레이어의 원본 SSRC(Run 이 첫 패킷에서 알아냄), rtt 는 상류 RR 로 잰 값.
func (l *Layer) feedback(now time.Time, ssrc uint32, rtt time.Duration) []rtcp.Packet {
	var out []rtcp.Packet
	if pairs := l.loss.Due(now, rtt); len(pairs) > 0 {
		out = append(out, rtcpx.NACK(0, ssrc, pairs))
		metrics.Global.NACKOut.Add(uint64(len(rtcpx.NACKSeqs(pairs))))
	}
	if l.loss.Overflow() {
		l.limiter.Need(pli.NackOverflow)
	}
	if l.limiter.Tick(now) {
		out = append(out, rtcpx.PLI(0, ssrc))
		metrics.Global.PLIOut.Add(1)
	}
	return out
}

// RequestNACK — jeju 송신 고루틴이 50ms 묶은 캐시 미스를 넘긴다(비차단 — 명령 큐가 차면 버림, 청중이 다시 NACK 한다).
// 수신 고루틴에서 마지막 키프레임 이전 순번(복구해도 쓸모없음)과 이미 도착한 순번을 빼고 LossTracker 에 넣는다.
func (l *Layer) RequestNACK(exts []uint64) {
	select {
	case l.cmd <- func() { l.requestNACK(exts) }:
	default:
	}
}

func (l *Layer) requestNACK(exts []uint64) {
	key, hasKey := l.cache.LastKeyframe()
	for _, e := range exts {
		if (hasKey && e < key) || l.cache.Has(e) {
			continue
		}
		l.loss.Request(e)
	}
}
