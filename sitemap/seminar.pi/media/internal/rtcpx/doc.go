// Package rtcpx — pion 인터셉터 대체 RTCP 생성기(S-1) : SR·RR(M1) · NACK·PLI·FIR(M2) · REMB 생성·파싱(M4), RTT(LSR/DLSR) 계산.
// 소유 고루틴 : 없음(순수 함수 — 패킷 값만 만든다. 보내는 쪽은 santorini·jeju 고루틴).
// 담당 : M1 report.go · M2 feedback.go · M4 remb.go. 근거 PRD_02 3.3 rtcpx·4.2, REA_02 8절(인터셉터를 끄면 SR/RR 이 사라짐).
package rtcpx
