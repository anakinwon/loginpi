// 소음 줄이기 제약 맞추기(순수 비동기, React 없음) — 마이크 트랙 applyConstraints 를 한 줄로 세워 차례로 실행한다.
// 결함(T03 r4) : 스위치를 빠르게 껐다 켜면 두 번째 요청이 '아직 켜져 있음'(앞 요청 진행 중)을 보고 건너뛰고, 그 뒤 앞 요청이 끝나
//  스위치는 켜짐인데 마이크 소음 줄이기는 꺼진 채로 남았다. → 요청을 줄 세우고, 실행 시점의 최신 희망값(want())으로 판단한다.
// 시험 : node --test src/components/room/features/media-fx/media-fx.test.mjs

export type NoiseTrack = {
  readyState: string
  getSettings: () => { noiseSuppression?: boolean }
  applyConstraints: (c: MediaTrackConstraints) => Promise<void>
}

let chain: Promise<unknown> = Promise.resolve()

// 반환 = 브라우저가 희망값을 무시했을 때 실제 값(호출부가 스위치를 되돌리고 알림), 그 밖엔 null.
//  alive() 가 false 면(더 새 요청·트랙 교체·언마운트) 결과를 버린다 — 줄 뒤의 새 요청이 최신 값으로 다시 맞춘다
export function syncNoise(t: NoiseTrack, want: () => boolean, alive: () => boolean): Promise<boolean | null> {
  const run = chain.then(async () => {
    const on = want()
    if (!alive() || t.readyState !== 'live' || t.getSettings().noiseSuppression === on) return null
    // echoCancellation 은 늘 켠다(끄면 하울링). applyConstraints 는 이전 제약을 통째로 바꾸므로 세 값을 함께 보낸다
    await t.applyConstraints({ echoCancellation: true, noiseSuppression: on, autoGainControl: on }).catch(() => {})
    const real = t.getSettings().noiseSuppression
    return !alive() || real === undefined || real === on ? null : real
  })
  chain = run.catch(() => {})
  return run
}
