'use client'
// 스키마 생성 사례 화면(설정 서브메뉴) — Pi통신 과금(PTL) 스키마를 계획 → 개념 → 논리 → 물리 → 물리DB구축 → 초기데이터 계획 → 실행 → 결과검증 8단계로 요약
// 본문은 GET /api/areas/[areaId]/pitel(SET_VIEW, 서버 권한 판정)에서 piFetch 로 받는다 — 권한이 없거나 미로그인이면 안내 문구만(redirect 금지), 조회 1회
// 미확정 값 [확인중]·[TBD] 은 빨강(text-danger — 카드 바탕 대비 AA 4.5:1 이상)
// 화면 = 8단계 3D 키 흐름(Icon3D md) + 단계별 패널(2026-11-12 디자인 개편), 단계 배지 'FIXED' 는 화면에서만 '확정'(API 데이터 그대로)
import { piFetch } from '@pi/auth/client'
import { BadgeCheck, ClipboardList, ListChecks, Play, Server, type LucideIcon } from 'lucide-react'
import { use, useEffect, useState } from 'react'
import { Icon3D } from '@/components/icon-3d'
import { PageHead } from '@/components/page-head'
import { MENU_ICON as I } from '@/lib/menu-icons'

type Step = { nm: string; badge: string; summary: string; metrics: { label: string; value: string }[]; notes: string[] }
type Body = { lead: string; steps: Step[]; open: string[]; fixes: string[] }
// 단계 아이콘 — API 단계 순서와 같다(계획·개념·논리·물리·물리DB·초기데이터 계획·실행·결과검증)
const ICONS: LucideIcon[] = [ClipboardList, I.model, I.logical, I.physical, Server, ListChecks, Play, BadgeCheck]
// 상태어 표시(화면 전용) — FIXED → 확정, FIXED(조건부) → 조건부 확정
const badgeNm = (b: string) => (b === 'FIXED' ? '확정' : b === 'FIXED(조건부)' ? '조건부 확정' : b)
// [확인중]·[TBD] 표기만 빨강(규칙 : 미확정 값 눈에 띄게)
const Mark = ({ text }: { text: string }) => <>{text.split(/(\[확인중\]|\[TBD\])/).map((s, i) => (i % 2 ? <span key={i} className="font-medium text-danger">{s}</span> : s))}</>

export default function PitelCasePage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const [body, setBody] = useState<Body | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    piFetch(`/api/areas/${areaId}/pitel`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setBody(j) : setMsg(j.message ?? '불러오지 못했습니다')))
      .catch(() => setMsg('불러오지 못했습니다'))
  }, [areaId])

  const title = '생성 사례 : Pi통신 과금(PTL)'
  // 권한 없음·미로그인·오류는 서버 메시지만 보인다(본문은 API 가 권한 확인 뒤에만 내줌)
  if (!body)
    return (
      <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
        <PageHead title={title} />
        <p role={msg ? 'alert' : 'status'} className={`text-sm ${msg ? 'text-danger' : 'text-ink-3'}`}>
          {msg || '불러오는 중…'}
        </p>
      </main>
    )
  const { lead, open, fixes } = body
  const list = body.steps.map((s, i) => ({ ...s, Icon: ICONS[i] ?? BadgeCheck }))

  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title={title} sub={lead} />

      <ol className="panel relative grid grid-cols-4 gap-x-2 gap-y-5 px-3 py-5 sm:grid-cols-8 sm:before:absolute sm:before:inset-x-[calc(12px+(100%-24px)/16)] sm:before:top-16.5 sm:before:h-px sm:before:bg-line-strong">
        {list.map(({ nm, badge, Icon }, i) => (
          <li key={nm} className="min-w-0">
            <a href={`#step-${i + 1}`} className="group flex flex-col items-center gap-1.5 rounded-control px-1 py-1 text-center transition-colors hover:bg-raised">
              <span className="font-mono text-xs text-ink-3">{String(i + 1).padStart(2, '0')}</span>
              <Icon3D icon={Icon} />
              <span className="w-full truncate text-dense font-medium text-ink">{nm}</span>
              <span className="max-w-full truncate text-xs text-ink-3">{badgeNm(badge)}</span>
            </a>
          </li>
        ))}
      </ol>

      <div className="mt-6 space-y-4">
        {list.map(({ nm, badge, summary, metrics, notes }, i) => (
          <section key={nm} id={`step-${i + 1}`} aria-labelledby={`step-${i + 1}-h`} className="panel scroll-mt-16 break-words">
            <h2 id={`step-${i + 1}-h`} className="panel-head flex-wrap">
              <span className="font-mono text-xs font-normal text-ink-3">{String(i + 1).padStart(2, '0')}</span>
              {nm}
              <span className="badge ms-auto" data-tone={badge.startsWith('FIXED') ? 'ok' : undefined}>
                {badgeNm(badge)}
              </span>
            </h2>
            <div className="panel-body">
              <p className="text-sm text-ink-2">{summary}</p>
              <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {metrics.map((m) => (
                  <div key={m.label} className="rounded-control bg-well px-3 py-2">
                    <dt className="text-xs text-ink-3">{m.label}</dt>
                    <dd className="mt-0.5 text-sm font-medium text-ink tabular-nums">
                      <Mark text={m.value} />
                    </dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-4 mb-1 text-xs font-medium text-ink-2">핵심 결정</h3>
              <ul className="list-disc space-y-1 ps-5 text-sm text-ink">
                {notes.map((t) => (
                  <li key={t}>
                    <Mark text={t} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      <section aria-labelledby="open-h" className="panel mt-6">
        <h2 id="open-h" className="panel-head">
          남은 일
        </h2>
        <ul className="panel-body list-disc space-y-1 ps-9 text-sm text-ink">
          {open.map((t) => (
            <li key={t}>
              <Mark text={t} />
            </li>
          ))}
        </ul>
      </section>

      <details className="panel mt-4">
        <summary className="panel-head cursor-pointer">수치 읽을 때 주의({fixes.length}건)</summary>
        <ul className="panel-body list-disc space-y-1 ps-9 text-sm text-ink">
          {fixes.map((t) => (
            <li key={t}>
              <Mark text={t} />
            </li>
          ))}
        </ul>
      </details>
    </main>
  )
}
