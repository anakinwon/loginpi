// 모니터링 AI 수정 진행 단계·페이지 이동 공용(2026-10-22, 마스터 지시 — AI 원인 분석 패널과 'AI 수정 이력' 보고서가 같은 표시)
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { FixSts } from '@/lib/mon-fix'

//  단계 : 1. 수정안 요청 → 2. 커밋·PR 완료 → 3. 승인·병합 → 4. 운영 배포. 상태 = 끝남(Check)·진행 중(accent 점)·실패(X)·대기
export const STEPS = ['수정안 요청', '커밋·PR 완료', '승인·병합', '운영 배포'] as const
export type Step = { at: number; on: boolean; bad: boolean } // at = 지금 단계 순번(0~3), 4 = 모두 끝남

// sql/072 수정상태코드 → 단계·이름
export const STS: Record<FixSts, { nm: string; st: Step }> = {
  REQ: { nm: '수정안 요청 중', st: { at: 0, on: true, bad: false } },
  REQ_FAIL: { nm: '요청 실패', st: { at: 0, on: false, bad: true } },
  PR: { nm: '승인 대기', st: { at: 2, on: false, bad: false } },
  APV: { nm: '승인 처리 중', st: { at: 2, on: true, bad: false } },
  APV_FAIL: { nm: '승인 실패', st: { at: 2, on: false, bad: true } },
  DPLY: { nm: '운영 배포 중', st: { at: 3, on: true, bad: false } },
  DONE: { nm: '배포 완료', st: { at: 4, on: false, bad: false } },
  DPLY_FAIL: { nm: '배포 실패', st: { at: 3, on: false, bad: true } },
  // 반려 = 승인 단계에서 멈춤(병합 안 함 = 수정 전 코드 유지), 되돌림 = 배포까지 끝난 뒤 수정 전 코드로 다시 배포
  REJ: { nm: '반려 — 수정 전 유지', st: { at: 2, on: false, bad: true } },
  // 되돌림 = 4단계 '운영 배포'를 다시 거침(수정 전 코드 배포) — 진행 중·실패는 4단계에서 표시
  RBK: { nm: '되돌림 배포 중', st: { at: 3, on: true, bad: false } },
  RBK_DONE: { nm: '되돌림 완료 — 수정 전 코드', st: { at: 4, on: false, bad: false } },
  RBK_FAIL: { nm: '되돌림 실패', st: { at: 3, on: false, bad: true } },
}

// 단계 막대 — 배지 4개를 헤어라인으로 잇는다. 끝남 = ok, 실패 = danger, 진행 중 = accent 점 + '진행 중'(깜박임 없음), 대기 = ink-off
export function StepBar({ st }: { st: Step; small?: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="진행 상태">
      {STEPS.map((nm, k) => {
        const done = k < st.at
        const bad = k === st.at && st.bad
        const on = k === st.at && st.on
        return (
          <li key={nm} className="flex items-center gap-1">
            {k > 0 && <span className="h-px w-3 bg-line-strong" aria-hidden />}
            <span aria-current={k === st.at ? 'step' : undefined} className="badge" data-tone={done ? 'ok' : bad ? 'danger' : on ? 'accent' : undefined}>
              {done && <Check className="h-3 w-3" strokeWidth={2} aria-hidden />}
              {bad && <X className="h-3 w-3" strokeWidth={2} aria-hidden />}
              {on && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
              <span className={!done && !bad && !on ? 'text-ink-off' : ''}>
                {k + 1}. {nm}
              </span>
              {on && <span className="sr-only">진행 중</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// 페이지 이동 — 모바일 축약(처음·끝·현재 ±1), 넓은 화면 ±3. '…' 는 각 화면에 보이는 이웃 번호 기준
export function Pager({ cur, pages, onPage, label }: { cur: number; pages: number; onPage: (n: number) => void; label: string }) {
  if (pages <= 1) return null
  return (
    <nav className="mt-2 flex flex-wrap items-center justify-center gap-1" aria-label={label}>
      <button type="button" disabled={cur <= 1} onClick={() => onPage(cur - 1)} aria-label="이전" title="이전" className="btn-ghost btn-icon btn-sm">
        <ChevronLeft className="rtl:rotate-180" aria-hidden />
      </button>
      {Array.from({ length: pages }, (_, i) => i + 1)
        .filter((n) => n === 1 || n === pages || Math.abs(n - cur) <= 3)
        .map((n, i, a) => {
          const mob = (x: number) => x === 1 || x === pages || Math.abs(x - cur) <= 1
          const prevMob = a.slice(0, i).filter(mob).pop()
          const gapD = i > 0 && n - a[i - 1] > 1
          const gapM = mob(n) && prevMob !== undefined && n - prevMob > 1
          const dot = gapD && gapM ? 'inline' : gapM ? 'sm:hidden' : gapD ? 'hidden sm:inline' : ''
          return (
            <span key={n} className={`items-center gap-1 ${mob(n) ? 'flex' : 'hidden sm:flex'}`}>
              {dot && <span className={`text-xs text-ink-3 ${dot}`}>…</span>}
              <button
                type="button"
                onClick={() => onPage(n)}
                aria-current={n === cur ? 'page' : undefined}
                className="btn-ghost btn-sm min-w-7 px-2 tabular-nums"
              >
                {n}
              </button>
            </span>
          )
        })}
      <button type="button" disabled={cur >= pages} onClick={() => onPage(cur + 1)} aria-label="다음" title="다음" className="btn-ghost btn-icon btn-sm">
        <ChevronRight className="rtl:rotate-180" aria-hidden />
      </button>
    </nav>
  )
}
