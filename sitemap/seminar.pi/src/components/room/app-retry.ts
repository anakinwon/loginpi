// 전원 고지 신호(app 'state' — 녹화·AI 기록, M-4) 재시도 보내기 — 한 번 보내고 결과를 안 보면 고지가 조용히 빠진다(fail-open).
// 엔진 속도 한도(RATE_LIMITED)·응답 없음(TIMEOUT)·서버 내부 오류만 짧게 다시 보내고, 역할 박탈·퇴장 같은 영구 오류는 그대로 돌려준다.
// 순수 함수 — 시험 app-retry.test.mjs (node --test)

export const APP_RETRY = {
  delays: [600, 1500, 3000], // 재시도 간격(ms) — 초당 2건 창(SIGNAL_API 3.6)을 넘겨 다시 시도
  heartbeatMs: 10_000, // 고지 중 현재 상태 재방송 주기 — 늦은 입장자·묶음 재알림이 한도에 걸려 빠진 경우를 메운다
} as const

const RETRYABLE = new Set(['RATE_LIMITED', 'TIMEOUT', 'INTERNAL'])

export const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))

// send = 1회 보내기(반환 = 오류 코드, 성공 null). live = 아직 보낼 이유가 있는지 — 매 시도 전에 본다(false 면 'CANCELLED')
// 반환 = 마지막 오류 코드(성공 null)
export async function sendRetry(
  send: () => Promise<string | null>,
  live: () => boolean = () => true,
  wait: (ms: number) => Promise<void> = sleep,
  delays: readonly number[] = APP_RETRY.delays,
): Promise<string | null> {
  for (let i = 0; ; i++) {
    if (!live()) return 'CANCELLED'
    const err = await send()
    if (!err || !RETRYABLE.has(err) || i >= delays.length) return err
    await wait(delays[i])
  }
}
