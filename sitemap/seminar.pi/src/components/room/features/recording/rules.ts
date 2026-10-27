// 녹화(SA6) 순수 판정 — 형식 고르기·파일 이름·가운데 맞춤(녹화기), 녹화 고지 받기·배지 판정(화면), 다시 저장 방법.
// import 없는 순수 함수만 둔다(node --test 로 바로 시험 : rules.test.mjs). 녹화기 본체(recorder.ts)는 처음 녹화할 때만 동적 import

// 지원 형식 — 앞에서부터 처음 되는 것(iOS Safari 는 mp4 만). 없으면 '' = 브라우저 기본
export const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
] as const

export function pickMime(isSupported: (m: string) => boolean): string {
  return MIME_CANDIDATES.find((m) => isSupported(m)) ?? ''
}

// seminar-<id>-<YYYYMMDD-HHmmss>.<webm|mp4> — 시각은 기기 현지 시각
export function recFileName(seminarId: string, mime: string, at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const ts = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`
  const id = seminarId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'room'
  return `seminar-${id}-${ts}.${mime.includes('mp4') ? 'mp4' : 'webm'}`
}

// 상자(box) 안에 원본(sw×sh)을 비율 유지로 가운데 맞춤(object-contain) — 그릴 사각형
export function fitRect(box: { x: number; y: number; w: number; h: number }, sw: number, sh: number) {
  if (!sw || !sh || !box.w || !box.h) return null
  const s = Math.min(box.w / sw, box.h / sh)
  const w = sw * s
  const h = sh * s
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

// d 검사 — 엔진은 모양을 보지 않으므로 받는 쪽이 거른다. 다른 키(notes·captions)만 있으면 null(무시)
export function readRecording(d: unknown): boolean | null {
  if (!d || typeof d !== 'object') return null
  const v = (d as { recording?: unknown }).recording
  return typeof v === 'boolean' ? v : null
}

export type RecBy = Readonly<Record<string, true>>

// 받은 state 를 '녹화 중이라고 알린 사람' 표에 반영 — 바뀌었으면 새 표(토스트 낼 때), 같거나 녹화 키가 없으면 null.
// 배지는 명시적 false 로만 내린다(주기 재알림이 늦거나 빠져도 켜진 채 유지 — fail-open 방지, M-4)
export function applyRec(by: RecBy, from: string, d: unknown): RecBy | null {
  const on = readRecording(d)
  if (on === null || on === !!by[from]) return null
  const next: Record<string, true> = { ...by }
  if (on) next[from] = true
  else delete next[from]
  return next
}

// 배지 — 알린 사람이 지금도 방의 발표자일 때만. 나갔거나(종료 신호 없이 끊김) 강등됐으면(강등 뒤 종료 알림은
// 엔진이 ROLE_FORBIDDEN 으로 거절, SIGNAL_API 3.6) 내린다. 수신 측 판정이 정본
export function othersRecording(by: RecBy, peers: readonly { peerId: string; role: string }[]): boolean {
  return peers.some((p) => p.role === 'presenter' && by[p.peerId])
}

// 참가자 구성·역할이 바뀔 때 표 정리 — 지금 방의 발표자가 아닌 사람(강등·퇴장)은 지운다. 바뀐 것이 없으면 null.
// 강등 뒤 끄기 알림은 엔진이 거절하므로 지우지 않으면, 같은 사람이 다시 발표자가 됐을 때 녹화도 안 하는데 배지가 켜진다
export function pruneRec(by: RecBy, peers: readonly { peerId: string; role: string }[]): RecBy | null {
  const keep = Object.keys(by).filter((id) => peers.some((p) => p.peerId === id && p.role === 'presenter'))
  if (keep.length === Object.keys(by).length) return null
  return Object.fromEntries(keep.map((id) => [id, true] as const))
}

// 종료 토스트 — 저장한 파일이 없으면 empty, 자동 종료(브라우저 녹화 중단·메모리 상한)면 이유를 알린다(전에는 '저장했어요'만 떠 왜 멈췄는지 몰랐다)
export function stopToast(size: number, auto: boolean): 'saved' | 'autoStopped' | 'empty' {
  return !size ? 'empty' : auto ? 'autoStopped' : 'saved'
}

// 다시 저장 방법 — 파일 공유(앱 안 브라우저·모바일에서 '파일에 저장' 가능)가 되면 share, 아니면 <a download>. 기능 탐지만(UA 판정 금지)
type ShareNav = { canShare?: (data: { files: File[] }) => boolean; share?: unknown }
export function saveVia(nav: ShareNav | undefined, file: File): 'share' | 'download' {
  try {
    if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] }))
      return 'share'
  } catch {}
  return 'download'
}
