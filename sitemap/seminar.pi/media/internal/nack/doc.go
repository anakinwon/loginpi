// Package nack — 손실 복구 : PacketCache(레이어당 본문 1벌 고정 슬롯 링) · LossTracker(상류 NACK) · SendMeta(하류 구독자별 메타 링).
// 소유 : PacketCache 쓰기·LossTracker = santorini 레이어 수신 고루틴, 캐시 읽기 = jeju 송신 고루틴들(RWMutex, PRD_02 4.3 [TBD : M2 벤치마크]),
// SendMeta = jeju 송신 고루틴 1개. 담당 : M2 전부(M1 은 cache.go 기본 동작으로 전달 경로를 만든다). 근거 PRD_02 D-3·D-4.
package nack
