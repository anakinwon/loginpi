# TROUBLESHOOT: seminar.pi

> 장애·결함의 원인과 결과를 남겨 같은 문제를 재발시키지 않는다(R-P0). 공통 사례 = [BUILD_DEFECTS](../../../docs/BUILD_DEFECTS.md)

| 날짜 | 증상 | 원인 | 조치 | 재발 방지 |
|---|---|---|---|---|
| 2026-10-25 | M1 착수 골격의 S-1 점검 테스트 실패 — offer SDP 에 `transport-cc`(TWCC) 피드백이 붙음 | pion v4 `webrtc.NewAPI` 는 `WithInterceptorRegistry` 를 넘기지 않으면 기본 인터셉터(NACK·TWCC·SR/RR 등)를 **자동 등록**한다(pion/webrtc v4.2.25 api.go `NewAPI`) — '레지스트리를 안 넘기면 인터셉터 없음'이라는 가정이 틀림 | `webrtc.WithInterceptorRegistry(&interceptor.Registry{})` 로 빈 레지스트리를 명시 (media/cmd/galapagos/main.go `newAPI`) | `main_test.go` 가 offer 에 transport-cc 가 없음을 검사 — 회귀 시 테스트 실패. PRD_02 M1 ① 에 명시 |
