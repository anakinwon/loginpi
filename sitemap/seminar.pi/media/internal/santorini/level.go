// 음성 레이어 소리 크기 — RTP 오디오 레벨 확장(RFC 6464, rtpx.AudioLevel)을 패킷마다 읽어 평활값을 atomic 으로 공개한다(후속 G 발언자 판정 입력).
// observeLevel 은 수신 고루틴 전용(Layer.handle), AudioLevel 은 bora 방 고루틴이 읽는다. 담당 : 후속 G(SIGNAL_API 3.5).
package santorini

import (
	"sync/atomic"
	"time"

	"seminar.pi/media/internal/rtpx"
)

const (
	// levelSmooth — 지수 평활 분모(새 값 1/levelSmooth 반영). 20ms 패킷 기준 약 160ms 시간 상수. [확인중 : 마스터 실기기]
	levelSmooth = 8
	// LevelStale — 마지막 레벨 뒤 이만큼 조용하면(DTX·끊김) 무음으로 본다.
	LevelStale = 500 * time.Millisecond
)

// level — 수신 고루틴 소유 평활값 + 공개 atomic.
type level struct {
	avg    float64 // 평활 레벨(0 = 가장 큼, 127 = 무음)
	seen   bool
	pub    atomic.Int32 // 평활값 ×10(반올림)
	lastAt atomic.Int64 // UnixNano
}

// SetAudioLevelID — 발행 PC 에 협상된 ssrc-audio-level 확장 ID(0 = 협상 안 됨·읽지 않음). bora 가 AddLayer 전에 부른다.
func (p *Producer) SetAudioLevelID(id uint8) { p.levelID.Store(uint32(id)) }

// observeLevel — 수신 고루틴 전용. ext = 확장 원소 데이터(없으면 nil → 무시).
func (l *Layer) observeLevel(ext []byte, now time.Time) {
	v, _, ok := rtpx.AudioLevel(ext)
	if !ok {
		return
	}
	lv := &l.lvl
	if !lv.seen {
		lv.avg, lv.seen = float64(v), true
	} else {
		lv.avg += (float64(v) - lv.avg) / levelSmooth
	}
	lv.pub.Store(int32(lv.avg*10 + 0.5))
	lv.lastAt.Store(now.UnixNano())
}

// AudioLevel — 음성 Producer 의 평활 레벨(0~127, 작을수록 큼). 레벨을 받은 적이 없거나 LevelStale 이 지났으면 무음(127)·ok=false.
func (p *Producer) AudioLevel(now time.Time) (lvl float64, ok bool) {
	l := p.Layer(0)
	if l == nil || p.kind != Audio {
		return rtpx.AudioLevelSilent, false
	}
	at := l.lvl.lastAt.Load()
	if at == 0 || now.UnixNano()-at >= int64(LevelStale) {
		return rtpx.AudioLevelSilent, false
	}
	return float64(l.lvl.pub.Load()) / 10, true
}
