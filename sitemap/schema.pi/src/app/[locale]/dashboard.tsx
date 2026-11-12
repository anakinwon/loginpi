'use client'
// 메인 대시보드(로그인 후, 마스터 지시 2026-10-21) — 마지막에 고른 분류체계 기준(GET /api/home, sys_user.lst_area_id)
// 분류체계 칩(누르면 그 분류체계가 마지막 선택) · 내 차례(역할 ∩ 요금제 권한별 카드) · 표준사전 현황 · 바로가기 · 최근 변경 5건 · 요금제
// 모바일 = 한 열(내 차례 먼저), 데스크톱 = 왼쪽 2칸(할 일·현황) + 오른쪽 1칸(바로가기·최근 변경·요금제). 분류체계 목록·새로 만들기는 맨 아래 접기(AreaHome 재사용)
import { piFetch } from '@pi/auth/client'
import { ChevronDown, ClipboardCheck, DatabaseZap, Send, Waypoints, type LucideIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useCallback, useEffect, useState } from 'react'
import AreaHome from './area-home'
import type { MbrRole, Perm, PlanCd } from '@/lib/roles'
import { MENU_ICON as I } from '@/lib/menu-icons'
import { Icon3D } from '@/components/icon-3d'
import { PageHead } from '@/components/page-head'

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

// 섹션 제목(h2 14/600, 아이콘 없음) — 화면 제목 h1 = PageHead(분류체계명)
const h2 = 'mb-2 flex items-center gap-2 text-sm font-semibold text-ink'
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
    <Link href={href} className="panel flex items-center gap-3 p-4 transition-colors hover:bg-raised">
      <Icon className="h-[18px] w-[18px] shrink-0 text-ink-2" strokeWidth={1.5} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{nm}</span>
        {sub && <span className="block truncate text-xs text-ink-3">{sub}</span>}
      </span>
      <span className={`text-2xl font-semibold tabular-nums ${val ? 'text-accent-ink' : 'text-ink-3'}`}>{val}</span>
    </Link>
  )
}

export default function Dashboard() {
  const [res, setRes] = useState<HomeRes | null>(null)
  const [busy, setBusy] = useState(false)
  const t = useTranslations('dashboard')
  const tn = useTranslations('nav')
  const tc = useTranslations('codes')
  const tm = useTranslations('common') // 로딩 문구 = common.loading(dashboard.loading 키 없음 — 콘솔 MISSING_MESSAGE 해소)
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

  if (!res) return <p className="text-sm text-ink-3">{tm('loading')}</p>
  if (!res.ok) return <p className="text-sm text-danger">{res.message}</p>
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
    <div className="space-y-6">
      {/* 분류체계 칩 — 고르면 그 분류체계가 '마지막 선택'(서버 기록, 기기 공통) */}
      {res.areas.length > 0 && (
        <nav aria-label={t('myAreas')} className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
          {res.areas.map((x) => {
            const on = x.area_id === a?.area_id
            return (
              <button key={x.area_id} type="button" disabled={busy} aria-pressed={on} onClick={() => !on && void load(x.area_id)} className="btn-key btn-sm shrink-0">
                {x.area_nm} <span className="text-xs font-normal text-ink-2">{code('role', x.role)}</span>
              </button>
            )
          })}
        </nav>
      )}

      {a && (
        <div>
          <PageHead
            back={false}
            title={a.area_nm}
            sub={
              <>
                {code('role', a.role)} · {t('planLine', { plan: code('plan', a.plan.plan) })}
                {a.plan.end && t('until', { date: day(a.plan.end, locale) })}
                {a.plan.grace && <span className="ms-1 font-medium text-danger">{t('grace')}</span>}
              </>
            }
            actions={
              <Link href={`${base}/${has('STD_VIEW') ? 'words' : 'plan'}`} className="btn-3d">
                {t('openArea')}
              </Link>
            }
          />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <section aria-labelledby="todo-h">
                <h2 id="todo-h" className={h2}>
                  {t('todoTitle')}
                </h2>
                {todos.length ? <div className="grid gap-2 sm:grid-cols-2">{todos}</div> : <p className="panel p-4 text-sm text-ink-2">{t('todoEmpty')}</p>}
              </section>

              {a.std && (
                <section aria-labelledby="std-h">
                  <h2 id="std-h" className={h2}>
                    {t('stdTitle')} <span className="text-xs font-normal text-ink-3">{t('stdBasis')}</span>
                  </h2>
                  {/* 한 패널 4칸 — 칸 사이 헤어라인 = gap-px 바탕(line) */}
                  <div className="panel grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-4">
                    {(
                      [
                        ['words', a.std.dic],
                        ['domains', a.std.dom],
                        ['terms', a.std.term],
                        ['codes', a.std.cd],
                      ] as const
                    ).map(([seg, v]) => (
                      <Link key={seg} href={`${base}/${seg}`} className="bg-surface p-4 text-center transition-colors hover:bg-raised">
                        <div className="text-xs text-ink-3">{tn(seg)}</div>
                        <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{v.toLocaleString(locale)}</div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-6">
              <section aria-labelledby="go-h">
                <h2 id="go-h" className={h2}>
                  {t('shortcuts')}
                </h2>
                {/* 바로가기 키패드 — 화면에서 유일하게 3D 키캡이 모인 곳 */}
                <div className="key-tray grid-cols-4 sm:grid-cols-6 lg:grid-cols-3">
                  {LINKS.filter((l) => has(l.perm)).map(({ seg, nm, Icon }) => (
                    <Link key={seg} href={`${base}/${seg}`} className="flex min-w-0 flex-col items-center gap-1.5 rounded-control px-1 py-2 text-center text-xs text-ink-2 transition-colors hover:text-ink">
                      <Icon3D icon={Icon} />
                      <span className="max-w-full truncate">{tn(nm)}</span>
                    </Link>
                  ))}
                </div>
              </section>

              {a.recent && (
                <section aria-labelledby="recent-h">
                  <h2 id="recent-h" className={h2}>
                    {t('recentTitle')}
                    <Link href={`${base}/history`} className="ms-auto text-xs font-normal text-accent-ink hover:underline">
                      {t('allHistory')}
                    </Link>
                  </h2>
                  {a.recent.length ? (
                    <ul className="panel divide-y divide-line">
                      {a.recent.map((r) => (
                        <li key={r.log_id} className="px-4 py-2.5 text-sm text-ink-2">
                          <span className="badge me-1.5">{code('tgt', r.tgt_tp_cd)}</span>
                          {r.nm && <span className="font-medium text-ink">{r.nm} </span>}
                          {code('act', r.act_cd)}
                          <span className="mt-0.5 block text-xs text-ink-3">
                            {r.usr ?? '—'} · {ago(r.reg_dtm, t)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="panel p-4 text-sm text-ink-3">{t('noHistory')}</p>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      <details className="panel group [&:not([open])>summary]:border-b-0" open={!res.areas.length}>
        <summary className="panel-head cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {t('areaList')}
          <ChevronDown className="ms-auto h-4 w-4 text-ink-3 transition-transform group-open:rotate-180" strokeWidth={1.5} aria-hidden />
        </summary>
        <div className="panel-body">
          <AreaHome />
        </div>
      </details>
    </div>
  )
}
