// KeyframeLimiter — 대기 요청 1개로 합침 + 키프레임 도착 시 해제 + 최소 간격(l 500ms, m·h 1s). M2 : 1초 무응답 재시도·FIR 순번 갱신.
package pli

import "time"

// Reason — 키프레임 요청 사유(metrics·로그 구분).
type Reason uint8

const (
	SubscriberPLI Reason = iota // 청중이 PLI 보냄
	SubscriberFIR               // 청중이 FIR 보냄
	NewConsumer                 // 새 구독자 첫 화면(캐시 재생 실패 시)
	LayerSwitch                 // simulcast 전환(M4)
	NackOverflow                // 상류 NACK 상한 초과(M2)
	QueueDrop                   // 구독자 큐 혼잡 버림(forward)
)

// Limiter — 레이어당 1개.
type Limiter struct {
	interval time.Duration
	pending  bool
	last     time.Time
}

// NewLimiter — 레이어 0(l)은 500ms, 1·2(m·h)는 1s(PRD_02 D-6).
func NewLimiter(layer int8) *Limiter {
	iv := time.Second
	if layer <= 0 {
		iv = 500 * time.Millisecond
	}
	return &Limiter{interval: iv}
}

// Need — 요청 등록. 대기 중이면 합친다.
func (l *Limiter) Need(r Reason) { l.pending = true }

// KeyframeSeen — 키프레임이 도착하면 대기 해제.
func (l *Limiter) KeyframeSeen() { l.pending = false }

// Tick — 지금 발표자에게 PLI 를 보내야 하면 true. 대기 중이고 최소 간격이 지났을 때만.
func (l *Limiter) Tick(now time.Time) (sendPLI bool) {
	if !l.pending || now.Sub(l.last) < l.interval {
		return false
	}
	l.last = now
	return true
}
