// PacketCache — 레이어당 1개, 고정 슬롯(1504B) 링. 전달·재전송·첫 화면(캐시 재생)이 같은 본문을 쓴다(PRD_02 D-3).
package nack

import "sync"

const (
	SlotSize   = 1504 // 슬롯 1개 최대 RTP 패킷 크기
	VideoSlots = 512  // 영상 레이어 슬롯 수(PRD_02 6절 M2 ①) [TBD : M2 실측]
	AudioSlots = 64   // 음성 슬롯 수
)

type slot struct {
	extSeq      uint64
	ts          uint32
	key, marker bool
	n           int
	buf         [SlotSize]byte
}

// PacketCache — 쓰기는 레이어 수신 고루틴 1개, 읽기는 여러 jeju 송신 고루틴.
type PacketCache struct {
	mu      sync.RWMutex // [TBD : M2 벤치마크로 잠금 방식 확정] PRD_02 4.3
	slots   []slot
	lastKey uint64
	hasKey  bool
}

// NewPacketCache — slots 개 슬롯(VideoSlots 또는 AudioSlots).
func NewPacketCache(slots int) *PacketCache {
	if slots <= 0 {
		slots = VideoSlots
	}
	return &PacketCache{slots: make([]slot, slots)}
}

// Store — 패킷을 슬롯 extSeq % 슬롯수 에 복사하고 그 위치를 돌려준다. SlotSize 를 넘는 패킷은 저장하지 않는다(GetAt 이 0).
func (c *PacketCache) Store(extSeq uint64, ts uint32, key, marker bool, pkt []byte) (idx uint16) {
	idx = uint16(extSeq % uint64(len(c.slots)))
	c.mu.Lock()
	s := &c.slots[idx]
	s.extSeq, s.ts, s.key, s.marker = extSeq, ts, key, marker
	s.n = 0
	if len(pkt) <= SlotSize {
		s.n = copy(s.buf[:], pkt)
	}
	if key {
		c.lastKey, c.hasKey = extSeq, true
	}
	c.mu.Unlock()
	return idx
}

// GetAt — 슬롯 idx 가 아직 extSeq 를 담고 있으면 dst 에 복사해 길이를 돌려준다. 덮였거나 dst 가 작으면 0.
func (c *PacketCache) GetAt(extSeq uint64, idx uint16, dst []byte) int {
	if int(idx) >= len(c.slots) {
		return 0
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	s := &c.slots[idx]
	if s.extSeq != extSeq || s.n == 0 || len(dst) < s.n {
		return 0
	}
	return copy(dst, s.buf[:s.n])
}

// Get — 재전송용(위치를 모를 때).
func (c *PacketCache) Get(extSeq uint64, dst []byte) int {
	return c.GetAt(extSeq, uint16(extSeq%uint64(len(c.slots))), dst)
}

// LastKeyframe — 마지막 키프레임 첫 조각의 확장 순번(캐시 재생 시작점).
func (c *PacketCache) LastKeyframe() (extSeq uint64, ok bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.lastKey, c.hasKey
}
