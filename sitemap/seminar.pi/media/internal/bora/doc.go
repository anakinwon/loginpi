// Package bora — Router(방). producer→consumers 표·참가자 목록·정원·역할 검사. 새 Producer 면 기존 청중 전원에게 Consumer 자동 생성,
// Producer 닫힘 → 연결 Consumer 전부 닫고 producerClosed 알림, 늦은 합류자에게 일시정지·레이어 활성 전달(M3).
// 소유 고루틴 : 방 1개 = 고루틴 1개(loop). 상태 변경은 명령 채널(cmd)로만(D-10). Manager(방 목록)도 고루틴 1개.
// 담당 : M1 room.go·manager.go · M3 lifecycle.go(닫힘 연쇄·늦은 합류자) · M5 admin.go(방 관리 API). 근거 PRD_02 3.3 bora·5절.
package bora
