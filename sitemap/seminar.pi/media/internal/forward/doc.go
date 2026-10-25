// Package forward — 팬아웃 큐. 레이어 수신 고루틴이 구독자별 크기 제한 큐에 (extSeq, 캐시 idx, flags)만 넣는다(데이터 복사 없음).
// 소유 : Offer 는 santorini 레이어 수신 고루틴(simulcast 면 레이어 3개가 동시에 부름), C() 수신은 jeju(Consumer) 송신 고루틴 1개.
// 큐가 차면 그 구독자만 버린다(PRD_02 D-10, REA_01 검증 정정 3). 담당 : M1 queue.go(기본) · M2 congest.go(프레임 단위 버림).
package forward
