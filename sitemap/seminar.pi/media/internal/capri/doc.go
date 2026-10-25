// Package capri — Transport(연결). 참가자당 발행 PC 1개(클라이언트 offer)·구독 PC 1개(서버 offer)(PRD_02 D-2), 빈 인터셉터 API(S-1),
// remote SDP 전 도착 후보 보관, connected 이후 구독 트랙 연결, RTCP 읽기·분배(RR·NACK·PLI → RTCPSink, REMB → OnREMB).
// 소유 : pion 콜백 고루틴 → 상태 변경은 자기 이벤트 고루틴 또는 잠금. 담당 : M1 전부(M4 는 abs-send-time 확장 등록만 협의 추가). 근거 PRD_02 3.3 capri.
package capri
