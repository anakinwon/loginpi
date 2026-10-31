'use client'

// 사용자관리 화면(관리자 메뉴, 2026-10-31) — 사용자 목록(검색·쪽 나눔)과 요금제별(무료·월간·연간) 남은 시간·만료,
//  [시간 관리] = 서비스권 지급(1시간권·1일권·1개월권 = 무료 시간)·축소(각각 2단계 확인) + 최근 조정 이력. 조회·저장 = piFetch(X-Pi-Token — Pi Browser 는 쿠키가 없다),
//  비로그인 = LoginGate, ADMIN 아님 = 안내(redirect 없음). 서버(api/admin/users)가 ADMIN 을 다시 확인
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import { useDuration } from '@/components/plan/plan-board'
import { Pagination } from '@/components/seminar/pagination'
import { BTN, useStartText } from '@/components/seminar/shared'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import { ADJ_MAX_MIN, ADJ_PLANS, pageCount, SVC_CDS, type AdjPlan, type PlanTime, type SvcCd } from '@/lib/seminar-rules'

const INPUT = 'bg-surface w-full rounded-lg border border-white/10 px-3 py-2'

type Row = {
  id: string
  name: string
  piName: string | null
  admin: boolean
  lastLogin: string | null
  times: Record<AdjPlan, PlanTime>
}
type Res = { rows: Row[]; total: number; page: number }
type Hist = { id: string; plan: AdjPlan; sec: number; before: number; after: number; svc: SvcCd | null; reason: string | null; by: string; at: string }
type Ask = { op: 'svc'; svc: SvcCd } | { op: 'sub' }

export function AdminUsers() {
  const t = useTranslations('adminUsers')
  return (
    <LoginGate>
      {(user) =>
        user.role === 'ADMIN' || user.role === 'MASTER' ? (
          <Users />
        ) : (
          <p role="alert" className="bg-surface rounded-xl p-4 text-sm">
            {t('adminOnly')}
          </p>
        )
      }
    </LoginGate>
  )
}

function Users() {
  const t = useTranslations('adminUsers')
  const tl = useTranslations('list')
  const dur = useDuration()
  const when = useStartText()
  const errText = useApiErrorText()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('') // 적용된 검색어
  const [draft, setDraft] = useState('')
  const [tries, setTries] = useState(0) // [새로고침]·조정 뒤 다시 읽기
  const [res, setRes] = useState<Res | null>(null)
  const [err, setErr] = useState<ApiErrorBody | null>(null)
  const [open, setOpen] = useState<string | null>(null) // 시간 관리 펼친 사용자

  useEffect(() => {
    let live = true
    const qs = new URLSearchParams({ page: String(page) })
    if (q) qs.set('q', q)
    void readApi<Res>(piFetch(`/api/admin/users?${qs}`, { cache: 'no-store' })).then((r) => {
      if (!live) return
      if (r.ok) {
        setRes(r.data)
        setErr(null)
      } else setErr(r.body)
    })
    return () => {
      live = false
    }
  }, [page, q, tries])

  function search(e: FormEvent) {
    e.preventDefault()
    const v = draft.trim()
    setQ(v.length >= 2 ? v : '')
    setPage(1)
    setOpen(null)
  }

  const refresh = (
    <button type="button" className={BTN} onClick={() => setTries((n) => n + 1)}>
      {t('refresh')}
    </button>
  )

  return (
    <div className="space-y-6">
      <form onSubmit={search} role="search" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={40}
          placeholder={t('search')}
          aria-label={t('search')}
          className={`${INPUT} max-w-xs`}
        />
        <button type="submit" className={BTN}>
          {t('searchBtn')}
        </button>
        {refresh}
      </form>

      {/* 다시 읽기 실패는 목록·열린 시간 관리(저장 결과 문구)를 지우지 않고 위에 알린다 — 성공을 못 보고 두 번 지급하지 않게 */}
      {err && (
        <p role="alert" className="text-sm">
          {errText(err)}
        </p>
      )}
      {!res ? (
        !err && <p className="text-muted-foreground text-sm">{tl('loading')}</p>
      ) : (
        <>
          <p className="text-sm">{t('count', { n: res.total })}</p>
          {res.rows.length ? (
            <ul className="bg-surface divide-y divide-white/5 rounded-xl">
              {res.rows.map((u) => (
                <li key={u.id} className="space-y-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{u.name || u.id}</span>
                    {u.piName && u.piName !== u.name && <span className="text-muted-foreground text-xs">@{u.piName}</span>}
                    {u.admin && <span className="bg-accent/20 rounded px-1.5 text-xs">{t('admin')}</span>}
                    <span className="text-muted-foreground text-xs">
                      {u.lastLogin ? t('lastLogin', { time: when(u.lastLogin) }) : t('never')}
                    </span>
                  </div>
                  <p className="text-xs">
                    {ADJ_PLANS.map((p) => {
                      const x = u.times[p]
                      return (
                        <span key={p} className="mr-3 inline-block">
                          {t(`plan.${p}`)} <b className="tabular-nums">{dur(x.sec)}</b>
                          {x.sec > 0 && x.endAt && <span className="text-muted-foreground"> {t('until', { time: when(x.endAt) })}</span>}
                        </span>
                      )
                    })}
                  </p>
                  <button
                    type="button"
                    className={BTN}
                    aria-expanded={open === u.id}
                    onClick={() => setOpen(open === u.id ? null : u.id)}
                  >
                    {open === u.id ? t('close') : t('manage')}
                  </button>
                  {open === u.id && <TimePanel row={u} onDone={() => setTries((n) => n + 1)} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t('empty')}</p>
          )}
          <Pagination page={page} pages={pageCount(res.total)} onPage={setPage} />
        </>
      )}
    </div>
  )
}

// 시간 관리 — 서비스권(무료 시간) 지급 또는 요금제·시간(시·분) 축소 → 확인 → 저장(사유는 둘 다 선택). 저장 뒤 목록·이력을 다시 읽는다
function TimePanel({ row, onDone }: { row: Row; onDone: () => void }) {
  const t = useTranslations('adminUsers')
  const dur = useDuration()
  const when = useStartText()
  const errText = useApiErrorText()
  const [plan, setPlan] = useState<AdjPlan>('FREE')
  const [h, setH] = useState('1')
  const [m, setM] = useState('0')
  const [reason, setReason] = useState('')
  const [ask, setAsk] = useState<Ask | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [hist, setHist] = useState<Hist[] | null>(null)
  const [histErr, setHistErr] = useState<ApiErrorBody | null>(null)
  const [tries, setTries] = useState(0)

  useEffect(() => {
    let live = true
    void readApi<{ rows: Hist[] }>(piFetch(`/api/admin/users/${row.id}/time`, { cache: 'no-store' })).then((r) => {
      if (!live) return
      if (r.ok) {
        setHist(r.data.rows)
        setHistErr(null)
      } else setHistErr(r.body)
    })
    return () => {
      live = false
    }
  }, [row.id, tries])

  // 시·분은 정수만(소수·음수 = 잘못된 입력)
  const hn = Number(h)
  const mn = Number(m)
  const min = hn * 60 + mn
  const valid = Number.isInteger(hn) && Number.isInteger(mn) && hn >= 0 && mn >= 0 && mn < 60 && min >= 1 && min <= ADJ_MAX_MIN

  async function save(a: Ask) {
    setBusy(true)
    setMsg(null)
    const why = reason.trim() || undefined
    const r = await readApi<{ ok: true; plan: AdjPlan; remain: number; endAt: string | null }>(
      piFetch(`/api/admin/users/${row.id}/time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a.op === 'svc' ? { op: 'svc', svc: a.svc, reason: why } : { op: 'sub', plan, min, reason: why }),
      }),
    )
    setBusy(false)
    setAsk(null)
    if (r.ok) {
      setMsg(
        a.op === 'svc' && r.data.endAt
          ? t('doneSvc', { svc: t(`svc.${a.svc}`), time: dur(r.data.remain), end: when(r.data.endAt) })
          : t('done', { plan: t(`plan.${r.data.plan}`), time: dur(r.data.remain) }),
      )
      setReason('')
      setTries((n) => n + 1)
      onDone()
    } else setMsg(errText(r.body))
  }

  return (
    <div className="bg-surface-raised/40 space-y-4 rounded-lg p-3">
      <label className="block space-y-1 text-xs">
        <span>{t('reason')}</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={INPUT} />
      </label>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold">{t('svcTitle')}</h3>
        <div className="flex flex-wrap gap-2">
          {SVC_CDS.map((s) => (
            <button key={s} type="button" disabled={busy || !!ask} className={BTN} onClick={() => setAsk({ op: 'svc', svc: s })}>
              {t(`svc.${s}`)}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{t('svcNote')}</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold">{t('subTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs">
            <span>{t('planLabel')}</span>
            <select value={plan} onChange={(e) => setPlan(e.target.value as AdjPlan)} className={INPUT}>
              {ADJ_PLANS.map((p) => (
                <option key={p} value={p}>
                  {t(`plan.${p}`)} ({dur(row.times[p].sec)})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span>{t('hours')}</span>
            <input type="number" inputMode="numeric" min={0} max={1000} step={1} value={h} onChange={(e) => setH(e.target.value)} className={INPUT} />
          </label>
          <label className="space-y-1 text-xs">
            <span>{t('minutes')}</span>
            <input type="number" inputMode="numeric" min={0} max={59} step={1} value={m} onChange={(e) => setM(e.target.value)} className={INPUT} />
          </label>
        </div>
        {!valid && <p className="text-danger text-xs">{t('invalid')}</p>}
        <button type="button" disabled={!valid || busy || !!ask || !row.times[plan].sec} className={BTN} onClick={() => setAsk({ op: 'sub' })}>
          {t('sub')}
        </button>
        <p className="text-muted-foreground text-xs">{t('subNote')}</p>
      </section>

      {ask && (
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" className="text-xs">
            {ask.op === 'svc'
              ? t('confirmSvc', { svc: t(`svc.${ask.svc}`) })
              : t('confirmSub', { plan: t(`plan.${plan}`), time: dur(min * 60) })}
          </span>
          {/* 확인 버튼으로 포커스 이동 — 누른 버튼이 비활성화돼 포커스를 잃지 않게 */}
          <button
            type="button"
            autoFocus
            disabled={busy}
            className={`${BTN} ${ask.op === 'sub' ? 'bg-danger text-white' : 'bg-accent text-white'}`}
            onClick={() => void save(ask)}
          >
            {busy ? t('saving') : t('confirmYes')}
          </button>
          <button type="button" disabled={busy} className={BTN} onClick={() => setAsk(null)}>
            {t('cancel')}
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className="text-xs">
          {msg}
        </p>
      )}

      <section className="space-y-1">
        <h3 className="text-xs font-semibold">{t('history')}</h3>
        {histErr ? (
          <p role="alert" className="text-xs">
            {errText(histErr)}
          </p>
        ) : !hist ? null : hist.length ? (
          <ul className="space-y-1 text-xs">
            {hist.map((x) => (
              <li key={x.id} className="text-muted-foreground">
                {t('histRow', {
                  at: when(x.at),
                  plan: x.svc ? t(`svc.${x.svc}`) : t(`plan.${x.plan}`),
                  delta: `${x.sec > 0 ? '+' : '−'}${dur(Math.abs(x.sec))}`,
                  before: dur(x.before),
                  after: dur(x.after),
                  by: x.by || '—',
                })}
                {x.reason && ` · ${x.reason}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">{t('noHistory')}</p>
        )}
      </section>
    </div>
  )
}
