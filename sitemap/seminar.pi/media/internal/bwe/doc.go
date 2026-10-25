// Package bwe — 대역폭 추정·분배 : REMB 하락 추세(Kendall)·NACK 비율 혼잡 판정, Allocator(구독 PC 당 1개, STABLE/DEFICIENT), 회복 탐침(PRD_02 D-7·D-8).
// 소유 고루틴 : Allocator 마다 이벤트 고루틴 1개(이벤트 큐로 직렬 처리). 트랙 정보는 ConsumerView 값 복사로만 받고, 결과는 Target.SetTarget(채널)으로 보낸다.
// 의존 : 내부 패키지 없음(jeju 가 Target 을 구현). 담당 : M4 전부.
package bwe
