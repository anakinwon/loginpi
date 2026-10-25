// 레이어 활성·비트레이트 — 500ms 주기 판정, 레이어 0은 2초·상위는 10초 연속이어야 활성, 비트레이트 1초 갱신(PRD_02 3.3 santorini, M4).
package santorini

import "time"

// activity — observe 는 수신 고루틴, Active·Bitrate 는 jeju·bwe 고루틴이 읽는다 → 읽히는 값은 atomic 으로.
type activity struct{} // M4 에서 구현

// observe — 수신 고루틴이 패킷마다 호출(크기 n). M4 에서 구현.
func (l *Layer) observe(n int, now time.Time) {}

// Active — 레이어 활성 여부. M1~M3 : 항상 true. M4 에서 구현.
func (l *Layer) Active() bool { return true }

// Bitrate — 최근 1초 비트레이트(bps). M1~M3 : 0. M4 에서 구현.
func (l *Layer) Bitrate() int64 { return 0 }
