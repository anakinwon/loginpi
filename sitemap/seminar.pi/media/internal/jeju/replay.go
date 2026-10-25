// 신규 구독자 캐시 재생 — 마지막 키프레임부터 현재까지 40패킷 이내면 캐시에서 순서대로 보내고, 아니면 PLI(PRD_02 3.3 pli, Galène 5.5 개념).
package jeju

// ReplayMax — 캐시 재생 최대 패킷 수.
const ReplayMax = 40

// replay — Run 시작 시 1회(송신 고루틴). 재생했으면 true, 아니면 호출자가 키프레임 요청. M2 에서 구현.
func (c *Consumer) replay() bool { return false }
