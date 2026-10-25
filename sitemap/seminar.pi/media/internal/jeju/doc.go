// Package jeju — Consumer(청중 수신). 구독자 × 트랙 1개. 출력 SSRC 는 Consumer 수명 동안 고정.
// 소유 고루틴 : Consumer 마다 송신 고루틴 1개(Run)가 LayerPolicy·SeqRewriter·SendMeta·TS 오프셋을 단독 소유. RTCP·명령은 cmd 채널로만 들어온다(D-10).
// 경로 : forward.Queue → cache.GetAt → decide(4분류) → SeqRewriter·TS·VP8 재작성 → 새 헤더로 Writer.WriteRTP → SendMeta.Push(PRD_02 4.1 6~10).
// 담당 : M1 consumer.go·rtcp.go · M2 replay.go·retransmit.go · M3 decision.go·seqrewriter.go · M4 layerpolicy.go. 근거 PRD_02 3.3 jeju.
package jeju
