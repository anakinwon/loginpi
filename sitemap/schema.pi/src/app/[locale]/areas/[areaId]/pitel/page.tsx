'use client'
// 스키마 생성 사례 화면(설정 서브메뉴) — Pi통신 과금(PTL) 스키마를 계획 → 개념 → 논리 → 물리 → 물리DB구축 → 초기데이터 계획 → 실행 → 결과검증 8단계로 요약
// 본문은 GET /api/areas/[areaId]/pitel(SET_VIEW, 서버 권한 판정)에서 piFetch 로 받는다 — 권한이 없거나 미로그인이면 안내 문구만(redirect 금지), 조회 1회
// 미확정 값 [확인중]·[TBD] 은 빨강(text-red-700 — 카드 바탕 대비 AA 4.5:1 이상)
import { piFetch } from '@pi/auth/client'
import { ArrowRight, BadgeCheck, ClipboardList, ListChecks, Play, Server, type LucideIcon } from 'lucide-react'
import { use, useEffect, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { MENU_ICON as I } from '@/lib/menu-icons'

type Step = { nm: string; badge: string; summary: string; metrics: { label: string; value: string }[]; notes: string[] }
type Body = { lead: string; steps: Step[]; open: string[]; fixes: string[] }
// 단계 아이콘 — API 단계 순서와 같다(계획·개념·논리·물리·물리DB·초기데이터 계획·실행·결과검증)
const ICONS: LucideIcon[] = [ClipboardList, I.model, I.logical, I.physical, Server, ListChecks, Play, BadgeCheck]
const card = 'rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] p-4 break-words'
// [확인중]·[TBD] 표기만 빨강(규칙 : 미확정 값 눈에 띄게)
const Mark = ({ text }: { text: string }) => <>{text.split(/(\[확인중\]|\[TBD\])/).map((s, i) => (i % 2 ? <span key={i} className="font-semibold text-red-700">{s}</span> : s))}</>

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

  const head = (
    <>
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">스키마 생성 사례 : Pi통신 과금(PTL)</h1>
    </>
  )
  // 권한 없음·미로그인·오류는 서버 메시지만 보인다(본문은 API 가 권한 확인 뒤에만 내줌)
  if (!body)
    return (
      <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
        {head}
        <p role={msg ? 'alert' : 'status'} className={`mt-3 text-sm ${msg ? 'text-red-700' : 'text-[#5b6578]'}`}>
          {msg || '불러오는 중…'}
        </p>
      </main>
    )
  const { lead, open, fixes } = body
  const list = body.steps.map((s, i) => ({ ...s, Icon: ICONS[i] ?? BadgeCheck }))

  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      {head}
      <p className="mt-1 text-sm text-[#5b6578]">{lead}</p>

      <ol className="mt-4 flex flex-col gap-2 lg:grid lg:grid-cols-8">
        {list.map(({ nm, badge, Icon }, i) => (
          <li key={nm} className="relative">
            <a href={`#step-${i + 1}`} className={`${card} flex h-full items-center gap-2 p-3 hover:border-[#3b4a66] lg:flex-col lg:items-start lg:gap-1`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#3b4a66] text-white">
                <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="text-xs text-[#5b6578]">{i + 1}단계</span>
              <span className="flex-1 text-sm font-semibold text-[#2c3850]">{nm}</span>
              <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#3b4a66] ring-1 ring-[#c7d2e6]">{badge}</span>
            </a>
            {i < list.length - 1 && <ArrowRight className="absolute -end-2 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-[#9aa6bd] lg:block rtl:rotate-180" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="mt-5 space-y-4">
        {list.map(({ nm, badge, Icon, summary, metrics, notes }, i) => (
          <section key={nm} id={`step-${i + 1}`} aria-labelledby={`step-${i + 1}-h`} className={`${card} scroll-mt-3`}>
            <h2 id={`step-${i + 1}-h`} className="flex flex-wrap items-center gap-2 font-bold text-[#2c3850]">
              <Icon className="h-5 w-5 text-[#3b4a66]" strokeWidth={1.5} aria-hidden />
              {i + 1}. {nm}
              <span className="rounded bg-[#3b4a66] px-1.5 py-0.5 text-xs font-normal text-white">{badge}</span>
            </h2>
            <p className="mt-1 text-sm text-[#2c3850]">{summary}</p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-[#d6deec]">
                  <dt className="text-xs text-[#5b6578]">{m.label}</dt>
                  <dd className="text-sm font-semibold text-[#2c3850]">
                    <Mark text={m.value} />
                  </dd>
                </div>
              ))}
            </dl>
            <h3 className="mt-3 text-xs font-bold text-[#5b6578]">핵심 결정</h3>
            <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm text-[#2c3850]">
              {notes.map((t) => (
                <li key={t}>
                  <Mark text={t} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section aria-labelledby="open-h" className={`${card} mt-5`}>
        <h2 id="open-h" className="font-bold text-[#2c3850]">
          남은 일
        </h2>
        <ul className="mt-2 list-disc space-y-0.5 ps-5 text-sm text-[#2c3850]">
          {open.map((t) => (
            <li key={t}>
              <Mark text={t} />
            </li>
          ))}
        </ul>
      </section>

      <details className={`${card} mt-3`}>
        <summary className="cursor-pointer font-bold text-[#2c3850]">수치 읽을 때 주의({fixes.length}건)</summary>
        <ul className="mt-2 list-disc space-y-0.5 ps-5 text-sm text-[#2c3850]">
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
