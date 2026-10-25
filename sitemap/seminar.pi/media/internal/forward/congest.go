// 혼잡 시 프레임 단위 버림 — 영상은 marker 까지 버리고 키프레임 필요 표시, 음성은 그 패킷만 버림(PRD_02 3.3 forward).
package forward

// congestion — 큐 혼잡 상태. Offer 를 여러 레이어 고루틴이 동시에 부르므로 필드는 atomic 이거나 레이어별로 나눈다.
type congestion struct{} // M2 에서 구현(레이어별 "marker 까지 버리는 중" 표시)

// dropping — 이미 버리는 중인 프레임의 나머지 조각인가. M1 : 항상 false. M2 에서 구현.
func (q *Queue) dropping(it Item) bool { return false }

// onFull — 큐가 찼을 때. M1 : 이 패킷만 버리고 키프레임 필요 표시. M2 : marker 까지 버림 + 음성 구분.
func (q *Queue) onFull(it Item) bool {
	q.dropped.Add(1)
	q.needKey.Store(true)
	return true
}
