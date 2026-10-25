// Package signal — WebSocket 시그널링 : 봉투(req/res/ntf JSON)·메시지 이름·세션 상태기계(10초 join·20초 ping·45초 종료·64KB)·입장권(JWT HS256) 검증.
// 소유 고루틴 : WS 연결 1개 = 세션 고루틴 1개(읽기) + 쓰기 직렬화. 방 상태는 갖지 않는다 — Handler(bora.Manager)로 넘긴다(의존 방향 bora → signal).
// 담당 : M1 envelope.go·session.go·server.go · M5 ticket.go · M3 메서드 확정(docs/SIGNAL_API.md). 근거 PRD_02 5절·D-9·D-11.
package signal
