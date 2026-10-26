// 수신 품질 점수 → ntf score(SIGNAL_API 3.2·3.4, M4). 송신 고루틴이 ScoreInterval 마다 청중 RR(손실·지터)·RTT·레이어 거리로
// metrics.Scorer 를 갱신하고, 등급이 바뀔 때만 SetScoreSink 콜백을 부른다(bora 가 그 Consumer 주인에게 보낸다).
package jeju

import (
	"time"

	"seminar.pi/media/internal/metrics"
	"seminar.pi/media/internal/santorini"
)

// ScoreInterval — 점수 주기(SIGNAL_API 3.4 : 5초). 시험만 엔진 시작 전에 줄인다.
var ScoreInterval = 5 * time.Second

// rrLostAfter — 보냈는데 RR 이 이만큼 없으면 lost. 주기와 따로 둔다 — Chrome 음성 RR 은 5초 ±50% 라 짧으면 오탐.
const rrLostAfter = 10 * time.Second

// gradeBaseline — 처음 등급. 클라이언트도 알림을 받기 전엔 excellent 로 본다 — 좋은 연결은 알림 0건.
const gradeBaseline = "excellent"

// quality — 등급 변화 판정 상태(송신 고루틴 소유).
type quality struct {
	scorer metrics.Scorer
	grade  string
	pkts   uint32 // 직전 판정 때 누적 송신 패킷
}

// tick — pkts = 지금까지 보낸 패킷 누적, sinceRR = 마지막 RR 뒤 경과(<0 = 아직 RR 없음).
// 이번 창에 보낸 것이 없거나(일시정지·발행 없음) RR 을 받은 적이 없으면 판정 보류(등급 유지).
// 보냈는데 RR 이 rrLostAfter 넘게 없으면 lost(점수 0) — Score 하한이 30 이라 lost 는 이 경로로만 나온다.
func (q *quality) tick(pkts uint32, sinceRR time.Duration, s metrics.Sample) (score float64, grade string, changed bool) {
	if q.grade == "" {
		q.grade = gradeBaseline
	}
	sent := pkts - q.pkts
	q.pkts = pkts
	if sent == 0 || sinceRR < 0 {
		return 0, q.grade, false
	}
	if sinceRR > rrLostAfter {
		score, grade = 0, "lost"
	} else {
		score, grade = q.scorer.Update(s)
	}
	if grade == q.grade {
		return score, grade, false
	}
	q.grade = grade
	return score, grade, true
}

// SetScoreSink — 등급이 바뀔 때 부를 함수(송신 고루틴에서 호출되므로 비차단이어야 한다). Start 전에만 부른다.
func (c *Consumer) SetScoreSink(fn func(score float64, grade string)) { c.onScore = fn }

// scoreTick — 송신 고루틴 전용.
func (c *Consumer) scoreTick(now time.Time) {
	if c.onScore == nil {
		return
	}
	since := time.Duration(-1)
	if !c.lastRR.IsZero() {
		since = now.Sub(c.lastRR)
	}
	if score, grade, ok := c.quality.tick(c.sent.packets, since, c.sample()); ok {
		c.onScore(score, grade)
	}
}

// sample — 점수 입력. 레이어 거리 = 원하는 레이어(setLayer 상한, 발행 안 되는 레이어는 내림) − 현재 레이어. 비트레이트 비율은 [TBD : M4 실측] 계산 안 함.
func (c *Consumer) sample() metrics.Sample {
	s := metrics.Sample{LossRatio: c.rrLoss, RTT: c.rtt, Jitter: c.rrJitter, Audio: c.producer.Kind() == santorini.Audio}
	if s.Audio {
		return s
	}
	cur, _, want := c.policy.State()
	for want > 0 && !c.layerUsable(want) {
		want--
	}
	if want > cur {
		s.LayerDistance = want - cur
	}
	return s
}
