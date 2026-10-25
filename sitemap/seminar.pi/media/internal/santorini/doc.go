// Package santorini — Producer(송신 원천). 들어오는 트랙 1개 = Producer 1개, simulcast rid l/m/h = 레이어 0/1/2.
// 소유 고루틴 : 레이어마다 수신 고루틴 1개(Layer.Run)가 읽기·64비트 순번·키프레임 판별·확장 제거·캐시 Store·LossTracker·Limiter·forward 투입을 단독 소유.
// 다른 고루틴은 Layer 의 공개 메서드(채널·atomic)로만 접근. 원본 SSRC 는 밖으로 내보내지 않는다(ProducerID, 레이어로 식별).
// 담당 : M1 producer.go·layer.go · M2 feedback.go(상류 NACK·PLI) · M4 activity.go(레이어 활성·비트레이트). 근거 PRD_02 3.3 santorini·4.1.
package santorini
