// 신규 구독자 캐시 재생 — 마지막 키프레임부터 현재까지 40패킷 이내면 캐시에서 순서대로 보내고, 아니면 호출자가 PLI(PRD_02 3.3 pli·D-6, REA_01 5.5).
package jeju

import (
	"time"

	"github.com/pion/rtp"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/nack"
)

// ReplayMax — 캐시 재생 최대 패킷 수.
const ReplayMax = 40

// replay — Run 시작 시 1회(송신 고루틴). 재생했으면 true, 아니면 호출자가 키프레임 요청(pli.NewConsumer).
// paused 로 시작하면 아무것도 하지 않고 true(Resume 이 키프레임을 요청한다).
// 재생 뒤 큐에 이미 들어와 있던 같은 순번은 같은 출력 순번으로 한 번 더 나갈 수 있다 — 수신 측이 중복으로 버린다(M3 옛 패킷 차단으로 정리).
func (c *Consumer) replay() bool {
	if c.paused {
		return true
	}
	cur, l := c.curLayer()
	if l == nil {
		return false
	}
	cache := l.Cache()
	key, ok := cache.LastKeyframe()
	last, ok2 := cache.Last()
	if !ok || !ok2 || last < key || last-key+1 > ReplayMax {
		return false
	}
	buf := make([]byte, nack.SlotSize)
	now := time.Now()
	sent := false
	for ext := key; ext <= last; ext++ {
		n := cache.Get(ext, buf)
		if n == 0 {
			if ext == key {
				return false // 키프레임 첫 조각이 이미 덮임
			}
			continue // 중간 구멍은 청중 NACK 으로 복구
		}
		var p rtp.Packet
		if p.Unmarshal(buf[:n]) != nil {
			continue
		}
		it := forward.Item{ExtSeq: ext, Key: ext == key, Marker: p.Marker, Layer: cur, At: now}
		if !c.decide(it) {
			continue
		}
		if c.send(buf[:n], it, now) {
			sent = true
		}
	}
	return sent
}
