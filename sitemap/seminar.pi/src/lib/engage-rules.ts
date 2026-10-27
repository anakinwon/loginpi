// 설문·Q&A·출석 순수 규칙(SubAgent4) — 서버 라우트와 화면이 같이 쓰고, node:test(engage-rules.test.mjs)로 확인한다.
// 실행 : node src/lib/engage-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)

export const POLL = { Q_MAX: 500, OPT_MIN: 2, OPT_MAX: 10, OPT_LEN: 200 } as const // sql/008 smn_pll·smn_pll_opt 칼럼 길이와 같게
export const QNA_MAX = 500
export const POLL_PAGE = 5
export const QNA_PAGE = 20 // 설계서 15.3 '20개 단위'
export const ATD_PAGE = 50
export const ATD_CSV_MAX = 1000 // CSV 한 번에 내보내는 상한 = PostgREST max-rows. 정원 상한 100명(+발표자)이라 넉넉하다
export const HB_MS = 60_000 // 출석 하트비트 간격
export const ONLINE_MS = 150_000 // 하트비트 2번 + 여유를 놓치면 '나감'

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '')

// 설문 입력 정리 — 앞뒤 공백 제거, 선택지 2~10개·중복 금지(대소문자 무시). 맞지 않으면 null
export function cleanPoll(q: unknown, opts: unknown): { q: string; opts: string[] } | null {
  const qq = clean(q)
  if (!qq || qq.length > POLL.Q_MAX || !Array.isArray(opts)) return null
  const oo = opts.map(clean)
  if (oo.length < POLL.OPT_MIN || oo.length > POLL.OPT_MAX) return null
  if (oo.some((o) => !o || o.length > POLL.OPT_LEN)) return null
  if (new Set(oo.map((o) => o.toLowerCase())).size !== oo.length) return null
  return { q: qq, opts: oo }
}

export function cleanQuestion(q: unknown): string | null {
  const qq = clean(q)
  return qq && qq.length <= QNA_MAX ? qq : null
}

// 설문 결과 — 선택지 순서대로 표 수·비율(정수 %, 막대와 함께 글자로 보인다 15.3). 총 0표면 모두 0%
export function tally(
  opts: readonly { id: string; text: string }[],
  counts: Readonly<Record<string, number>>,
): { id: string; text: string; n: number; pct: number }[] {
  const total = opts.reduce((a, o) => a + (counts[o.id] ?? 0), 0)
  return opts.map((o) => {
    const n = counts[o.id] ?? 0
    return { ...o, n, pct: total ? Math.round((n * 100) / total) : 0 }
  })
}

// 설문 카드가 투표 화면(라디오)인가 — 청중은 투표 전·[다시 투표] 중, 개최자·ADMIN 은 [투표]를 누른 때만.
//  개최자는 평소 실시간 결과를 본다 — 결과를 보려고 직접 투표해 집계가 오염되던 결함(E2E r1, 야간 시험 T04 r2)
export const pollVoting = (p: { open: boolean; mine: string | null; staff: boolean; change: boolean }) =>
  p.open && (p.change || (!p.staff && !p.mine))

// 출석 시간(초) — 첫 입장 ~ 마지막 하트비트. 시계가 거꾸로면 0
// ponytail: 중간에 나갔다 온 공백도 포함(사용자당 1행 설계, sql/008), 구간별 합이 필요하면 입퇴장 로그 테이블로
export function attendSec(ent: string | number | Date, hb: string | number | Date): number {
  const s = (new Date(hb).getTime() - new Date(ent).getTime()) / 1000
  return Number.isFinite(s) && s > 0 ? Math.floor(s) : 0
}

// 하트비트를 멈출 응답 — 다시 보내도 같은 거절(유료 미등록 402·세미나 없음 404·종료 409). 401·429·5xx·네트워크는 다음 주기에 다시 시도
export const beatStops = (status: number) => status === 402 || status === 404 || status === 409

// 화면이 다시 보일 때 하트비트를 당겨 보낼까 — 모바일 백그라운드는 타이머를 늦춰 '나감'으로 보이다 늦게 돌아온다.
//  마지막 전송 뒤 30초(간격 절반) 이상이면 바로 보낸다 — 탭을 빨리 껐다 켜도 요청이 몰리지 않게
export const beatDue = (lastMs: number, now: number) => now - lastMs >= HB_MS / 2

export const isOnline = (hb: string | number | Date, now: number) => now - new Date(hb).getTime() < ONLINE_MS

// 1시간 2분 → '1:02:00', 5분 3초 → '5:03'
export function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`
}

// CSV 한 칸 — 따옴표·쉼표·줄바꿈은 따옴표로 감싸고, 수식 주입(= + - @ 탭 CR 로 시작)은 앞에 ' 를 붙여 글자로(OWASP CSV Injection)
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// 표 → CSV(엑셀이 UTF-8 로 읽게 BOM, 줄 끝 CRLF — RFC 4180)
export const toCsv = (rows: readonly (readonly unknown[])[]) =>
  '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

// refresh 신호 d 모양(SIGNAL_API 3.6 주제표) — {what:'polls'|'qna', kind?:'new'}. 맞지 않으면 null(받는 쪽이 버린다)
export type RefreshWhat = 'polls' | 'qna'
export function parseRefresh(d: unknown): { what: RefreshWhat; isNew: boolean } | null {
  if (!d || typeof d !== 'object') return null
  const { what, kind } = d as { what?: unknown; kind?: unknown }
  if (what !== 'polls' && what !== 'qna') return null
  return { what, isNew: kind === 'new' }
}
