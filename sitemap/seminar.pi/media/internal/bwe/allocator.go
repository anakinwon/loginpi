// Allocator — 구독 PC 당 1개. 1회차 레이어 0 보장 → 우선순위·목표 거리 순 상향, 재상향 1.2배 히스테리시스, 일시정지 기본 끔(PRD_02 3.3 bwe). M4 에서 구현.
package bwe

// AllocState — 할당 상태.
type AllocState uint8

const (
	Stable AllocState = iota
	Deficient
)

// Target — 할당 결과 수신자(*jeju.Consumer 가 구현, 내부는 채널).
type Target interface {
	SetTarget(layer int8, paused bool)
}

// ConsumerView — 트랙 상태 스냅샷(값 복사 — 공유 없음).
type ConsumerView struct {
	ID       string
	Priority uint8    // 화면공유 255 > 발표자 영상 > 패널 영상
	Bitrates [3]int64 // 레이어별 bps(santorini Layer.Bitrate)
	Active   [3]bool  // 레이어 활성(santorini Layer.Active)
	MaxLayer int8     // consumer.setLayer 상한
}

// Allocator — 이벤트 큐 1개.
type Allocator struct{} // M4 에서 구현

// NewAllocator — 구독 PC 생성 시 bora 가 만든다.
func NewAllocator() *Allocator { return &Allocator{} }

// Add — 구독 트랙 등록.
func (a *Allocator) Add(id string, t Target) {}

// Remove — 구독 트랙 해제.
func (a *Allocator) Remove(id string) {}

// OnREMB — 추적 SSRC 1개의 REMB 에만 반응.
func (a *Allocator) OnREMB(bps float32, ssrcs []uint32) {}

// OnNackStats — 2~3초 창 NACK 비율(혼잡 8%).
func (a *Allocator) OnNackStats(sent, repeated uint32) {}

// OnConsumerChanged — 레이어 활성·비트레이트·상한 변경.
func (a *Allocator) OnConsumerChanged(v ConsumerView) {}

// State — 현재 상태. M1~M3 : Stable.
func (a *Allocator) State() AllocState { return Stable }

// Close — 이벤트 고루틴 종료.
func (a *Allocator) Close() {}
