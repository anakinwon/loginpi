// 세션·핸들러 계약과 시간 상수 — signal 은 연결·봉투만, 방 로직은 Handler 구현(bora.Manager)이 맡는다.
package signal

import (
	"encoding/json"
	"time"
)

const (
	JoinTimeout = 10 * time.Second // 연결 후 이 안에 join(입장권)
	PingIdle    = 20 * time.Second // 무수신이면 ping
	DeadIdle    = 45 * time.Second // 무수신이면 종료
	MaxMessage  = 64 << 10         // 메시지 최대 크기 [TBD : M1 실측 — Galène 1MB]
)

// Notification — 서버가 보내는 알림(ntf).
type Notification struct {
	M string
	D any
}

// Session — WS 연결 1개. Send 는 비차단·여러 고루틴 안전(내부 송신 큐), Close 는 ntf error 후 종료.
type Session interface {
	ID() string
	Send(n Notification)
	Close(code ErrCode)
}

// Handler — 방 쪽(bora.Manager)이 구현. signal 세션 고루틴이 부른다.
type Handler interface {
	// Join — 입장권 검증을 통과한 세션의 입장. 정원·역할·중복 sub 는 방이 다시 검사한다(R-P5 2회 검사).
	Join(s Session, t Ticket) (JoinRes, *Error)
	// Request — join 이후 요청. 반환값은 응답 d 로 직렬화된다.
	Request(s Session, method string, d json.RawMessage) (any, *Error)
	// Left — 연결 종료(leave·끊김·시간 초과). 연쇄 정리는 방이 한다.
	Left(s Session)
}
