'use client'
// 메인 대시보드(로그인 후, 마스터 지시 2026-10-21) — 마지막에 고른 분류체계 기준(GET /api/home, sys_user.lst_area_id)
// 분류체계 칩(누르면 그 분류체계가 마지막 선택) · 내 차례(역할 ∩ 요금제 권한별 카드) · 표준사전 현황 · 바로가기 · 최근 변경 5건 · 요금제
// 모바일 = 한 열(내 차례 먼저), 데스크톱 = 왼쪽 2칸(할 일·현황) + 오른쪽 1칸(바로가기·최근 변경·요금제). 분류체계 목록·새로 만들기는 맨 아래 접기(AreaHome 재사용)
import { piFetch } from '@pi/auth/client'
import { ClipboardCheck, DatabaseZap, History, Inbox, Send, Waypoints, type LucideIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useCallback, useEffect, useState } from 'react'
import AreaHome from './area-home'
import type { MbrRole, Perm, PlanCd } from '@/lib/roles'
import { MENU_ICON as I } from '@/lib/menu-icons'

interface Recent {
  log_id: string
  tgt_tp_cd: string
  act_cd: string
  nm: string | null
  usr: string | null
  reg_dtm: string
}
interface AreaDash {
  area_id: string
  area_nm: string
  role: MbrRole
  perms: Perm[]
  plan: { plan: PlanCd; end: string | null; grace: boolean }
  std: { dic: number; dom: number; term: number; cd: number } | null
  apv: number | null
  ddl: number | null
  mine: { wait: number; rjct: number } | null
  model: { prj: number; ent: number } | null
  recent: Recent[] | null
}
interface HomeRes {
  ok: boolean
  message?: string
  areas: { area_id: string; area_nm: string; role: MbrRole }[]
  area: AreaDash | null
}

const card = 'rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] p-4'
const h3 = 'mb-2 flex items-center gap-1.5 font-bold text-[#2c3850]'
// 바로가기 = 하단 메뉴(area-nav)와 같은 경로·아이콘(src/lib/menu-icons)·권한, 이름 = messages nav.<nm>
const LINKS: { seg: string; nm: string; Icon: LucideIcon; perm?: Perm }[] = [
  { seg: 'words', nm: 'words', Icon: I.words, perm: 'STD_VIEW' },
  { seg: 'domains', nm: 'domains', Icon: I.domains, perm: 'STD_VIEW' },
  { seg: 'terms', nm: 'terms', Icon: I.terms, perm: 'STD_VIEW' },
  { seg: 'codes', nm: 'codes', Icon: I.codes, perm: 'STD_VIEW' },
  { seg: 'model?tab=prj', nm: 'model', Icon: I.model, perm: 'MODEL_VIEW' },
  { seg: 'logical', nm: 'logical', Icon: I.logical, perm: 'MODEL_VIEW' },
  { seg: 'physical', nm: 'physical', Icon: I.physical, perm: 'MODEL_VIEW' },
  { seg: 'erd', nm: 'erd', Icon: I.erd, perm: 'MODEL_VIEW' },
  { seg: 'sql', nm: 'sql', Icon: I.sql, perm: 'SQL_QUERY' },
  { seg: 'monitor', nm: 'monitor', Icon: I.monitor, perm: 'MON_VIEW' },
  { seg: 'settings', nm: 'settings', Icon: I.settings, perm: 'SET_VIEW' },
  { seg: 'plan', nm: 'plan', Icon: I.plan },
]
const day = (s: string, locale: string) => new Date(s).toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
const ago = (s: string, t: (k: string, v?: Record<string, number>) => string) => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000)
  return m < 1 ? t('justNow') : m < 60 ? t('minutesAgo', { n: m }) : m < 1440 ? t('hoursAgo', { n: Math.round(m / 60) }) : t('daysAgo', { n: Math.round(m / 1440) })
}

function Todo({ href, Icon, nm, val, sub }: { href: string; Icon: LucideIcon; nm: string; val: number; sub?: string }) {
  return (
    <Link href={href} className={`${card} flex items-center gap-3 transition hover:shadow-md`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${val ? 'bg-[#3b4a66] text-white' : 'bg-white text-[#5b6578] ring-1 ring-[#c9d1df]'}`}>
        <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-[#4a5a78]">{nm}</span>
        {sub && <span className="block text-xs text-[#5b6578]">{sub}</span>}
      </span>
      <span className={`text-2xl font-bold tabular-nums ${val ? 'text-[#1f3a68]' : 'text-[#9aa6bd]'}`}>{val}</span>
    </Link>
  )
}

export default function Dashboard() {
  const [res, setRes] = useState<HomeRes | null>(null)
  const [busy, setBusy] = useState(false)
  const t = useTranslations('dashboard')
  const tn = useTranslations('nav')
  const tc = useTranslations('codes')
  const locale = useLocale()
  // 코드 → 이름(번역 키가 없는 새 코드는 코드 그대로)
  const code = (ns: 'role' | 'plan' | 'act' | 'tgt', v: string) => (tc.has(`${ns}.${v}`) ? tc(`${ns}.${v}`) : v)
  const loadFailed = t('loadFailed')

  const load = useCallback(async (area?: string) => {
    setBusy(true)
    try {
      setRes(await (await piFetch(`/api/home${area ? `?area=${area}` : ''}`)).json())
    } catch {
      setRes({ ok: false, message: loadFailed, areas: [], area: null })
    } finally {
      setBusy(false)
    }
  }, [loadFailed])
  useEffect(() => {
    void load()
  }, [load])

  if (!res) return <p className="mt-6 text-sm text-gray-500">{t('loading')}</p>
  if (!res.ok) return <p className="mt-6 text-sm text-red-700">{res.message}</p>
  const a = res.area
  const base = a ? `/areas/${a.area_id}` : ''
  const has = (p?: Perm) => !p || !!a?.perms.includes(p)
  const todos = a
    ? [
        a.apv !== null && <Todo key="apv" href={`${base}/approvals?sts=REQ`} Icon={ClipboardCheck} nm={t('apvWait')} val={a.apv} sub={t('apvWaitSub')} />,
        a.ddl !== null && <Todo key="ddl" href={`${base}/ddl`} Icon={DatabaseZap} nm={t('ddlWait')} val={a.ddl} />,
        a.mine && <Todo key="mine" href={`${base}/approvals?sts=REQ`} Icon={Send} nm={t('mineWait')} val={a.mine.wait} sub={a.mine.rjct ? t('mineRejected', { count: a.mine.rjct }) : undefined} />,
        a.model && <Todo key="mdl" href={`${base}/model?tab=prj`} Icon={Waypoints} nm={t('model')} val={a.model.prj} sub={t('modelSub', { count: a.model.ent })} />,
      ].filter(Boolean)
    : []

  return (
    <div className="mt-4 space-y-4">
      {/* 분류체계 칩 — 고르면 그 분류체계가 '마지막 선택'(서버 기록, 기기 공통) */}
      {res.areas.length > 0 && (
        <nav aria-label={t('myAreas')} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {res.areas.map((x) => {
            const on = x.area_id === a?.area_id
            return (
              <button
                key={x.area_id}
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() => !on && void load(x.area_id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-60 ${on ? 'border-[#3b4a66] bg-[#3b4a66] font-semibold text-white' : 'border-[#c9d1df] bg-white text-[#2c3850] hover:bg-[#e2e7ef]'}`}
              >
                {x.area_nm} <span className={`text-xs ${on ? 'text-white/70' : 'text-[#5b6578]'}`}>{code('role', x.role)}</span>
              </button>
            )
          })}
        </nav>
      )}

      {a && (
        <>
          <header className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-[#1f3a68]">{a.area_nm}</h2>
              <p className="text-sm text-[#5b6578]">
                {code('role', a.role)} · {t('planLine', { plan: code('plan', a.plan.plan) })}
                {a.plan.end && t('until', { date: day(a.plan.end, locale) })}
                {a.plan.grace && <span className="ms-1 font-semibold text-red-700">{t('grace')}</span>}
              </p>
            </div>
            <Link href={`${base}/${has('STD_VIEW') ? 'words' : 'plan'}`} className="rounded-lg bg-[#3b4a66] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#2c3850]">
              {t('openArea')}
            </Link>
          </header>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <section aria-labelledby="todo-h">
                <h3 id="todo-h" className={h3}>
                  <Inbox className="h-4 w-4" strokeWidth={1.5} aria-hidden /> {t('todoTitle')}
                </h3>
                {todos.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">{todos}</div>
                ) : (
                  <p className={`${card} text-sm text-[#4a5a78]`}>{t('todoEmpty')}</p>
                )}
              </section>

              {a.std && (
                <section aria-labelledby="std-h">
                  <h3 id="std-h" className={h3}>
                    <I.words className="h-4 w-4" strokeWidth={1.5} aria-hidden /> {t('stdTitle')} <span className="text-xs font-normal text-[#5b6578]">{t('stdBasis')}</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        ['words', a.std.dic],
                        ['domains', a.std.dom],
                        ['terms', a.std.term],
                        ['codes', a.std.cd],
                      ] as const
                    ).map(([seg, v]) => (
                      <Link key={seg} href={`${base}/${seg}`} className={`${card} text-center transition hover:shadow-md`}>
                        <div className="text-2xl font-bold tabular-nums text-[#1f3a68]">{v.toLocaleString(locale)}</div>
                        <div className="text-xs text-[#4a5a78]">{tn(seg)}</div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-4">
              <section aria-labelledby="go-h">
                <h3 id="go-h" className={h3}>
                  {t('shortcuts')}
                </h3>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-3">
                  {LINKS.filter((l) => has(l.perm)).map(({ seg, nm, Icon }) => (
                    <Link key={seg} href={`${base}/${seg}`} className="flex flex-col items-center gap-1 rounded-lg border border-[#c9d1df] bg-white px-1 py-2 text-center text-[11px] text-[#2c3850] transition hover:bg-[#e2e7ef]">
                      <Icon className="h-5 w-5 text-[#3b4a66]" strokeWidth={1.5} aria-hidden />
                      {tn(nm)}
                    </Link>
                  ))}
                </div>
              </section>

              {a.recent && (
                <section aria-labelledby="recent-h">
                  <h3 id="recent-h" className={h3}>
                    <History className="h-4 w-4" strokeWidth={1.5} aria-hidden /> {t('recentTitle')}
                    <Link href={`${base}/history`} className="ms-auto text-xs font-normal text-blue-700 underline">
                      {t('allHistory')}
                    </Link>
                  </h3>
                  {a.recent.length ? (
                    <ul className={`${card} divide-y divide-[#d6deeb] p-0`}>
                      {a.recent.map((r) => (
                        <li key={r.log_id} className="px-3 py-2 text-sm">
                          <span className="me-1 rounded bg-white px-1 text-[11px] text-[#4a5a78] ring-1 ring-[#c9d1df]">{code('tgt', r.tgt_tp_cd)}</span>
                          {r.nm && <span className="font-medium text-[#2c3850]">{r.nm} </span>}{code('act', r.act_cd)}
                          <span className="block text-xs text-[#5b6578]">
                            {r.usr ?? '—'} · {ago(r.reg_dtm, t)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={`${card} text-sm text-[#5b6578]`}>{t('noHistory')}</p>
                  )}
                </section>
              )}
            </div>
          </div>
        </>
      )}

      <details className="rounded-xl border border-[#c9d1df] bg-white" open={!res.areas.length}>
        <summary className="cursor-pointer px-4 py-2 font-semibold text-[#2c3850]">{t('areaList')}</summary>
        <div className="px-4 pb-4">
          <AreaHome />
        </div>
      </details>
    </div>
  )
}
