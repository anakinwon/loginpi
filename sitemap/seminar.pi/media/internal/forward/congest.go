// 혼잡 시 프레임 단위 버림 — 영상은 marker 까지 버리고 키프레임 필요 표시, 음성은 그 패킷만 버림(PRD_02 3.3 forward, REA_01 5.6).
package forward

import (
	"sync/atomic"

	"seminar.pi/media/internal/metrics"
)

const maxLayers = 3 // rid l/m/h

// congestion — 큐 혼잡 상태. Offer 를 레이어 고루틴 여럿이 동시에 부르므로 레이어별로 나눈 atomic.
// 레이어 i 의 표시는 그 레이어 수신 고루틴만 바꾼다.
type congestion struct {
	audio    atomic.Bool            // 음성 큐 — marker 를 프레임 끝으로 쓰지 않는다(Opus marker = 발화 시작)
	dropping [maxLayers]atomic.Bool // 이 레이어는 현재 프레임 marker 까지 버리는 중
}

// SetAudio — 음성 큐로 표시(Consumer 생성 직후 1회, 송신 시작 전). 기본은 영상.
func (q *Queue) SetAudio(audio bool) { q.cong.audio.Store(audio) }

func layerSlot(l int8) int {
	if l < 0 || l >= maxLayers {
		return 0
	}
	return int(l)
}

// dropping — 이미 버리는 중인 프레임의 나머지 조각인가. marker 조각까지 버리고 표시를 내린다.
// 새 키프레임 첫 조각이 오면(앞 프레임 marker 가 상류에서 유실된 경우) 버림을 끝내고 그 조각부터 받는다.
func (q *Queue) dropping(it Item) bool {
	d := &q.cong.dropping[layerSlot(it.Layer)]
	if !d.Load() {
		return false
	}
	if it.Key {
		d.Store(false)
		return false
	}
	if it.Marker {
		d.Store(false)
	}
	q.drop()
	return true
}

// onFull — 큐가 찼을 때 이 패킷을 버린다. 영상이고 프레임 중간이면 marker 까지 이어서 버리도록 표시. 키프레임 필요 표시.
func (q *Queue) onFull(it Item) bool {
	q.drop()
	if !q.cong.audio.Load() {
		q.needKey.Store(true)
		if !it.Marker {
			q.cong.dropping[layerSlot(it.Layer)].Store(true)
		}
	}
	return true
}

func (q *Queue) drop() {
	q.dropped.Add(1)
	metrics.Global.QueueDrops.Add(1)
}
