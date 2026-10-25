// Package rtpx — RTP 공용 도우미 : 16비트 순번 비교·64비트 확장, VP8 페이로드 해석(키프레임 판별), [M4] abs-send-time 기록.
// 소유 고루틴 : 없음(순수 함수). SeqExtender 값은 그것을 가진 고루틴(santorini 레이어 수신 고루틴) 하나만 쓴다.
// 담당 : M1 전부. 근거 PRD_02 3.1·3.3, REA_01 8절(순번 감김 경계 조건을 한곳에 모음).
package rtpx
