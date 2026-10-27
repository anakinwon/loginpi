// 주기 호출(영상 효과·녹화 그리기 공용) — 워커 타이머를 먼저 쓴다. 숨은 탭(발표자가 다른 탭·창을 화면 공유)에서는 창 타이머가 초당 1회로 늦춰져
// 프레임이 멈추기 때문(REA_04_UI_EXT R-E2). 워커를 못 만들면 창 타이머로. 반환 = 멈추기 함수. 시험 ticker.test.mjs
export function ticker(ms: number, fn: () => void): () => void {
  let stop = () => {}
  const windowTimer = () => {
    const id = setInterval(fn, ms)
    stop = () => clearInterval(id)
  }
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${ms})`], { type: 'text/javascript' }))
    const w = new Worker(url)
    URL.revokeObjectURL(url)
    w.onmessage = fn
    w.onerror = () => {
      w.terminate()
      windowTimer()
    }
    stop = () => w.terminate()
  } catch {
    windowTimer()
  }
  return () => stop()
}
