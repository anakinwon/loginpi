// KeyframeLimiter — 대기 요청 1개로 합침 + 키프레임 도착 시 해제 + 최소 간격(l 500ms, m·h 1s) + 1초 무응답 재시도 1회(PRD_02 D-6).
// FIRFilter — 청중 FIR 중복 제거(순번을 반드시 갱신 — REA_01 5.5 결함 수정).
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

// RetryAfter — PLI 를 보낸 뒤 키프레임이 이만큼 오지 않으면 1회 재요청(REA_02 5.5).
const RetryAfter = time.Second

// Limiter — 레이어당 1개. 레이어 수신 고루틴 전용(잠금 없음).
type Limiter struct {
	interval time.Duration
	pending  bool      // 보낼 요청 대기
	inflight bool      // PLI 를 보내고 키프레임 기다리는 중
	again    bool      // 기다리는 중에 또 요청이 옴(재시도 때 합쳐짐)
	retried  bool      // 이번 요청에서 재시도를 이미 함
	sentAt   time.Time // 마지막 PLI 송신 시각
}

// NewLimiter — 레이어 0(l)은 500ms, 1·2(m·h)는 1s(PRD_02 D-6, REA_03 5.4).
func NewLimiter(layer int8) *Limiter {
	iv := time.Second
	if layer <= 0 {
		iv = 500 * time.Millisecond
	}
	return &Limiter{interval: iv}
}

// Need — 요청 등록. 대기·응답 기다림 중이면 합친다.
func (l *Limiter) Need(r Reason) {
	if l.inflight {
		l.again = true
		return
	}
	l.pending = true
}

// KeyframeSeen — 키프레임이 도착하면 모든 대기 해제.
func (l *Limiter) KeyframeSeen() {
	l.pending, l.inflight, l.again, l.retried = false, false, false, false
}

// Tick — 지금 발표자에게 PLI 를 보내야 하면 true.
// 대기 중이고 마지막 PLI 뒤 최소 간격이 지났을 때 1건. 보낸 뒤 1초 무응답이면 1회 재요청, 그래도 없으면 포기
// (그 사이 새 요청이 있었으면 새 대기로 이어 간다).
func (l *Limiter) Tick(now time.Time) (sendPLI bool) {
	if l.inflight {
		if now.Sub(l.sentAt) < RetryAfter {
			return false
		}
		if !l.retried {
			l.retried, l.again, l.sentAt = true, false, now
			return true
		}
		l.inflight, l.retried = false, false
		l.pending, l.again = l.again, false
	}
	if !l.pending || (!l.sentAt.IsZero() && now.Sub(l.sentAt) < l.interval) {
		return false
	}
	l.pending, l.inflight, l.sentAt = false, true, now
	return true
}

// FIRFilter — 청중 1명(Consumer)당 1개. 같은 FIR 순번이 반복되면 중복.
type FIRFilter struct {
	seen bool
	last uint8
}

// Duplicate — seq 가 직전 FIR 순번과 같으면 true. 아니면 순번을 갱신하고 false.
func (f *FIRFilter) Duplicate(seq uint8) bool {
	if f.seen && f.last == seq {
		return true
	}
	f.seen, f.last = true, seq
	return false
}
