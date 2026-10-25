// Dynacast — 발행 트랙 1개의 구독자 요청 최대 레이어를 모아 "이 위 레이어는 보내지 마" 신호(ntf publishLayers)를 정한다. 상향 즉시·하향 5초 디바운스(REA_03 5.9, PRD_02 3.3 bwe).
// 소유 : bora(방) 고루틴 전용(잠금 없음). 레이어 0(l)은 늘 켠다 — 구독자 0명이어도 녹화·늦은 합류자 첫 화면용.
package bwe

import "time"

const dynacastDownDelay = 5 * time.Second

// Dynacast — 0값은 쓰지 말고 NewDynacast 로.
type Dynacast struct {
	req     map[string]int8 // 구독자(Consumer ID) → 요청 최대 레이어(setLayer·할당 목표)
	pub     int8            // 지금 발행 허용 최대 레이어
	downAt  time.Time       // 하향 대기 시작
	pending bool
}

// NewDynacast — 처음엔 전 레이어 허용.
func NewDynacast() *Dynacast { return &Dynacast{req: map[string]int8{}, pub: 2} }

// Set — 구독자 요청 갱신. 발행 상한이 바뀌었으면 changed=true(그때 publishLayers 알림).
func (d *Dynacast) Set(sub string, layer int8, now time.Time) (pub int8, changed bool) {
	d.req[sub] = layer
	return d.Tick(now)
}

// Remove — 구독자 해제.
func (d *Dynacast) Remove(sub string, now time.Time) (pub int8, changed bool) {
	delete(d.req, sub)
	return d.Tick(now)
}

// Tick — 하향 디바운스 확인(bora 가 주기적으로, 예 1초).
func (d *Dynacast) Tick(now time.Time) (pub int8, changed bool) {
	want := int8(0)
	for _, l := range d.req {
		want = max(want, l)
	}
	want = min(want, 2)
	switch {
	case want > d.pub:
		d.pub, d.pending = want, false
		return d.pub, true
	case want == d.pub:
		d.pending = false
	case !d.pending:
		d.pending, d.downAt = true, now
	case now.Sub(d.downAt) >= dynacastDownDelay:
		d.pub, d.pending = want, false
		return d.pub, true
	}
	return d.pub, false
}

// Rids — signal.PublishLayers.Rids 값.
func Rids(pub int8) map[string]bool {
	return map[string]bool{"l": true, "m": pub >= 1, "h": pub >= 2}
}
