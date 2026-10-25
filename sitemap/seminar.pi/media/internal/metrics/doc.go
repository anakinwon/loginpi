// Package metrics — 카운터·이벤트·품질 점수(LiveKit 식, REA_03 5.10). K-5 비교 지표 Q7~Q10 의 원천.
// 소유 : 카운터는 atomic(어느 고루틴이든 Add), 점수 계산은 순수 함수. 담당 : M2 counters.go(수집 시작) · M4 score.go · M5 내보내기(schema.pi, 새 파일 export.go).
package metrics
