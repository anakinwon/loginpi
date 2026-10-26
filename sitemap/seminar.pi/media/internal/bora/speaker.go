// 발언자 판정(후속 G, SIGNAL_API 3.5) — 방 고루틴이 SpeakerTick 마다 참가자별 평활 오디오 레벨(santorini.AudioLevel, RFC 6464)을 넣으면
// 지금 말하는 사람(없으면 "")이 바뀌었을 때만 ntf activeSpeaker 를 낸다. 순수 상태 기계 — 시각은 호출자가 준다(표 형식 시험 speaker_test.go).
package bora

import "time"

// 판정 수치 — 레벨은 -dBov(0 = 가장 큼, 127 = 무음). [확인중 : 마스터 실기기 — 마이크·잡음마다 다름, 보정 손잡이]
const (
	SpeakerTick      = 100 * time.Millisecond  // 판정 주기
	speakerThreshold = 50.0                    // 이 레벨 이하(= -50 dBov 보다 큼)면 말하는 중
	speakerMargin    = 6.0                     // 다른 사람이 현재 발언자보다 이만큼(dB) 더 커야 후보(히스테리시스)
	speakerHold      = 300 * time.Millisecond  // 후보가 이만큼 이어져야 전환
	speakerSilence   = 1500 * time.Millisecond // 현재 발언자가 이만큼 조용하면 "없음"
	speakerMinGap    = 500 * time.Millisecond  // 방당 알림 간격 하한
)

// speakerDetector — 방 고루틴 소유(잠금 없음).
type speakerDetector struct {
	cur        string    // 판정된 발언자
	cand       string    // 전환 후보
	candSince  time.Time // 후보가 된 시각
	quietSince time.Time // 현재 발언자가 임계 밑으로 내려간 시각(0 = 말하는 중)
	sent       string    // 마지막으로 알린 값
	sentAt     time.Time
}

// tick — levels = 참가자 peerId → 평활 레벨(소리 없는 참가자는 빼도 된다). 알릴 값이 있으면 (peerId|"", true).
// 판정이 바뀌어도 마지막 알림 뒤 speakerMinGap 이 안 지났으면 미뤘다가 다음 tick 에 보낸다(그사이 되돌아오면 보내지 않음).
func (d *speakerDetector) tick(now time.Time, levels map[string]float64) (string, bool) {
	lv := func(id string) float64 {
		if v, ok := levels[id]; ok {
			return v
		}
		return 127
	}
	loudest, best := "", speakerThreshold
	for id, v := range levels {
		if v < best || (v == best && (loudest == "" || id < loudest)) { // 같은 크기면 peerId 순(결정적)
			loudest, best = id, v
		}
	}
	if d.cur != "" {
		if lv(d.cur) <= speakerThreshold {
			d.quietSince = time.Time{}
		} else if d.quietSince.IsZero() {
			d.quietSince = now
		} else if now.Sub(d.quietSince) >= speakerSilence {
			d.cur, d.quietSince = "", time.Time{}
		}
	}
	switch {
	case loudest == "" || loudest == d.cur:
		d.cand = ""
	case d.cur != "" && d.quietSince.IsZero() && best+speakerMargin > lv(d.cur):
		d.cand = "" // 현재 발언자가 말하는 중이면 확실히 더 커야 넘어간다
	case d.cand != loudest:
		d.cand, d.candSince = loudest, now
	case now.Sub(d.candSince) >= speakerHold:
		d.cur, d.cand, d.quietSince = loudest, "", time.Time{}
	}
	if d.cur == d.sent || now.Sub(d.sentAt) < speakerMinGap {
		return "", false
	}
	d.sent, d.sentAt = d.cur, now
	return d.cur, true
}

// forget — 참가자가 나가면(closePeer) 판정에서 뺀다. 알림은 다음 tick 이 낸다.
func (d *speakerDetector) forget(id string) {
	if d.cur == id {
		d.cur, d.quietSince = "", time.Time{}
	}
	if d.cand == id {
		d.cand = ""
	}
}
