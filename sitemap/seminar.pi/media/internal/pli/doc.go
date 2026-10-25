// Package pli — 레이어별 키프레임 요청 조절기(KeyframeLimiter). 청중 30명의 PLI 를 발표자에게 레이어당 최소 간격으로 모은다(PRD_02 D-6).
// 소유 고루틴 : santorini 레이어 수신 고루틴 1개(잠금 없음). 다른 고루틴은 santorini.Layer.RequestKeyframe(채널)로만 요청한다.
// 담당 : M2 전부(M1 은 limiter.go 의 최소 동작 — 대기 1개 + 최소 간격 — 을 그대로 쓴다).
package pli
