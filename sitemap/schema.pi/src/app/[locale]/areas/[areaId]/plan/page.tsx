'use client'
// 요금제 화면(2026-10-19) — 현재 요금제·만료·유효 기간, 요금제 4종 카드(월/년 Pi·권한·메뉴·업그레이드 일할계산), Pi 결제(시스템담당자·데이터아키텍트), 결제 이력(페이지 단위)
//  결제 = Pi Browser 에서만(판정 = usePiAuth().isInPiBrowser — authenticate 성공 신호, UA 판정 금지). prepare → createPayment → approve → complete(piFetch)
import { piFetch, usePiAuth } from '@pi/auth/client'
import { Check, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import { InfoTip, PageHead } from '@/components/page-head'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import { PLAN_NM, PLAN_PERMS, ROLE_NM, type MbrRole, type PlanCd } from '@/lib/roles'

type Fee = { plan_cd: Exclude<PlanCd, 'FREE'>; prd_cd: 'M' | 'Y'; plan_nm: string; pi_amt: number; use_mon_cnt: number }
type Term = { plan_cd: PlanCd; prd_cd: 'M' | 'Y' | null; strt_dtm: string; end_dtm: string; grnt_rsn_cd: 'PAY' | 'UPG' | 'GRACE' }
type Upg = { plan_cd: PlanCd; amount: number; credit: number; prepaid: number; terms: number; used: number; prd: 'M' | 'Y' }
type Hist = { pymnt_id?: string; pi_amt: number; pymnt_sts_cd: string; meta_val: { plan_cd?: string; prd_cd?: string; from_plan?: string; prd?: string }; apv_dtm: string; cmpl_dtm: string | null }
type Info = {
  plan: { plan: PlanCd; end: string | null; grace: boolean }
  role: MbrRole
  can_pay: boolean
  fees: Fee[]
  upgrades: Upg[]
  terms: Term[]
  hist: { items: Hist[]; total: number; page: number; size: number }
}

const CALLBACK_TIMEOUT_MS = 120_000 // 서명 대기 포함 상한
const COLS: [string, string][] = [
  ['APPROVE', '승인'],
  ['SELF_APPROVE', '즉시 승인'],
  ['SETTINGS', '설정'],
  ['BULK', '일괄등록'],
  ['REQUEST', '신청'],
  ['CRUD', 'SQL 쓰기(CRUD)'],
  ['MENU_SQL', 'SQL 편집기'],
  ['MENU_STD', '표준'],
  ['MENU_MODEL', '모델링'],
  ['MENU_SET', '설정·이력'],
  ['MENU_BAN', '금칙어'],
  ['MENU_CHK', '점검·리버스'],
  ['MENU_ADM', '멤버·승인'],
]
const STS_NM: Record<string, string> = { APPROVED: '진행 중', COMPLETED: '완료', CANCELED: '취소' }
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '-')
const post = async (path: string, body: unknown) => (await piFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()

export default function PlanPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const { isInPiBrowser } = usePiAuth()
  const [info, setInfo] = useState<Info | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // 결제 중인 요금제·주기
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(
    async (page = 1) => {
      const j = await (await piFetch(`/api/areas/${areaId}/plan?page=${page}`)).json()
      if (j.ok) setInfo(j)
      else setMsg({ ok: false, text: j.message })
    },
    [areaId],
  )
  useEffect(() => {
    void load()
  }, [load])

  const finish = (m: { ok: boolean; text: string }) => {
    if (timer.current) clearTimeout(timer.current)
    setMsg(m), setBusy(null)
  }

  async function pay(f: { plan_cd: PlanCd; prd_cd: 'M' | 'Y' | 'U'; prd?: 'M' | 'Y' }) {
    // Pi SDK 는 일반 브라우저에도 주입되므로 window.Pi 존재로는 부족 — authenticate 가 성공한 세션만 결제
    if (!isInPiBrowser || !window.Pi) return setMsg({ ok: false, text: 'Pi Browser 에서 Pi 계정으로 로그인한 뒤 결제하십시오' })
    setBusy(`${f.plan_cd}${f.prd_cd}${f.prd ?? ''}`), setMsg(null)
    const prep = await post('/api/payments/prepare', { area_id: areaId, plan_cd: f.plan_cd, prd_cd: f.prd_cd, prd: f.prd })
    if (!prep.ok) return finish({ ok: false, text: prep.message })
    let cur: string | null = null
    timer.current = setTimeout(() => finish({ ok: false, text: '결제 응답이 없습니다 — 잠시 뒤 화면을 새로 고쳐 결과를 확인하십시오' }), CALLBACK_TIMEOUT_MS)
    try {
      window.Pi.createPayment(
        { amount: prep.amount, memo: prep.memo, metadata: prep.metadata },
        {
          onReadyForServerApproval: async (paymentId: string) => {
            cur = paymentId
            const r = await post('/api/payments/approve', { paymentId })
            if (!r.ok) finish({ ok: false, text: r.message })
          },
          onReadyForServerCompletion: async (paymentId: string, txid: string) => {
            const r = await post('/api/payments/complete', { paymentId, txid })
            if (r.ok) {
              finish({ ok: true, text: `결제 완료 — ${PLAN_NM[r.plan_cd as PlanCd] ?? r.plan_cd} 요금제, ${dt(r.end_dtm)} 까지` })
              void load()
            } else finish({ ok: false, text: r.message })
          },
          onCancel: (paymentId: string) => {
            void post('/api/payments/cancel', { paymentId: paymentId || cur })
            finish({ ok: false, text: '결제를 취소했습니다' })
          },
          onError: (e: Error, p?: { identifier?: string }) => {
            const id = p?.identifier || cur
            if (id) void post('/api/payments/cancel', { paymentId: id })
            finish({ ok: false, text: e.message || '결제에 실패했습니다' })
          },
        },
      )
    } catch (e) {
      finish({ ok: false, text: e instanceof Error ? e.message : '결제에 실패했습니다' })
    }
  }

  const p = info?.plan
  const sub = !!p && p.plan !== 'FREE' && !p.grace // 구독 중 = 업그레이드 + 현재 요금제 선결제 버튼만, 무료·만료 = 일반 요금제 버튼만(마스터 지시 2026-10-19)
  // 최종 만료일 = 현재·상위 요금제 기간 중 가장 늦은 종료(선결제 포함 — sql/054 연장 기준과 같음)
  const finalEnd = info?.terms.filter((t) => p && t.plan_cd >= p.plan).reduce<string | null>((m, t) => (!m || t.end_dtm > m ? t.end_dtm : m), null) ?? p?.end ?? null
  const pages = info ? Math.max(1, Math.ceil(info.hist.total / info.hist.size)) : 1
  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="결제" />

      <div className="space-y-6">
        {p && (
          <section className="panel">
            <h2 className="panel-head">현재 요금제</h2>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm text-ink-2">
              <p className="flex items-center gap-2 text-base font-semibold text-ink">
                {p.plan === 'FREE' ? '없음(무료 — 표준사전 조회만)' : `요금제${p.plan.slice(1)} · ${PLAN_NM[p.plan]}`}
                {p.grace && (
                  <span className="badge" data-tone="warn">
                    7일 체험
                  </span>
                )}
              </p>
              {p.end && <p>{dt(p.end)} 까지{finalEnd && finalEnd !== p.end && <span className="ms-1 font-medium text-ink">(선결제 포함 최종 {dt(finalEnd)} 까지)</span>}</p>}
              <p className="text-ink-3">내 역할 : {ROLE_NM[info.role] ?? info.role}</p>
            </div>
            {info.terms.length > 1 && (
              <ul className="space-y-0.5 border-t border-line px-4 py-2 text-xs text-ink-2">
                {info.terms.map((t, i) => (
                  <li key={i}>
                    요금제{t.plan_cd.slice(1)}({t.grnt_rsn_cd === 'GRACE' ? '체험' : t.grnt_rsn_cd === 'UPG' ? `업그레이드·${t.prd_cd === 'Y' ? '년' : '월'}` : t.prd_cd === 'Y' ? '년' : '월'}) : {dt(t.strt_dtm)} ~ {dt(t.end_dtm)}
                  </li>
                ))}
              </ul>
            )}
            {/* 계산식 = 접힘(기본 닫힘) */}
            <details className="group border-t border-line px-4 py-2 text-xs text-ink-2">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90 rtl:-scale-x-100" aria-hidden />
                계산 방법
              </summary>
              <p className="mt-2">
                실제 권한 = 멤버 역할 ∩ 분류체계 요금제. 구독 중에는 업그레이드와 현재 요금제 선결제(만료일 뒤로 1개월·1년 연장)만 결제할 수 있고(무료·만료면 일반 결제), 업그레이드 = 상위 요금제(같은 요금제는 월 → 연) 가격 − 현재 가격 × (기준 일수 − 사용 일수) ÷ 기준 일수(월 30·년 365, 결제한 날 = 1일), 0.01 Pi 올림 — 결제한 때부터 새 1개월·1년. 선결제 기간이 있으면 기간마다 (상위 가격 − 현재 가격) 차액을 더해 선결제 기간도 함께 업그레이드합니다(새 주기 뒤로 이어짐).
              </p>
            </details>
          </section>
        )}

        {msg && (
          <p role={msg.ok ? 'status' : 'alert'} className={`flex items-center gap-1.5 text-dense ${msg.ok ? 'text-ok' : 'text-danger'}`}>
            {msg.ok ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {msg.text}
          </p>
        )}

        {info && (
          <section>
            <div className="mb-2 flex items-center gap-1">
              <h2 className="text-sm font-semibold text-ink">요금제 선택</h2>
              <InfoTip>요금제 없음·만료 = 표준사전 조회만. 메뉴·기능은 멤버 역할 권한 안에서만 열립니다(멤버 화면 권한표).</InfoTip>
            </div>
            {!info.can_pay && <p className="mb-2 text-xs text-ink-3">결제는 이 분류체계의 시스템담당자·데이터아키텍트만 할 수 있습니다.</p>}
            {info.can_pay && !isInPiBrowser && <p className="mb-2 text-xs text-ink-3">결제는 Pi Browser 에서 Pi 계정으로 로그인한 뒤 할 수 있습니다.</p>}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(['P1', 'P2', 'P3', 'P4'] as const).map((cd) => {
                const fs = info.fees.filter((f) => f.plan_cd === cd)
                const on = p?.plan === cd
                const ups = info.upgrades.filter((u) => u.plan_cd === cd)
                const mon = fs.find((f) => f.prd_cd === 'M') // 표시용 월 가격(결제 단추 금액과 같은 값)
                return (
                  // 현재 요금제 = 남색 옅은 바탕 + '현재' 배지(이 화면의 빛나는 요소), 나머지 = 흰 패널
                  <div key={cd} className={`${on ? 'rounded-card border border-transparent bg-accent-soft' : 'panel'} flex flex-col p-4`}>
                    <p className={`flex h-5 items-center gap-2 text-xs ${on ? 'text-ink-2' : 'text-ink-3'}`}>
                      요금제{cd.slice(1)}
                      {on && (
                        <span className="badge bg-surface" data-tone="accent">
                          현재
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-base font-semibold text-ink">{PLAN_NM[cd]}</p>
                    {mon && (
                      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                        {mon.pi_amt} Pi<span className={`ms-1 text-xs font-normal ${on ? 'text-ink-2' : 'text-ink-3'}`}>/ 월</span>
                      </p>
                    )}
                    <ul className="mt-3 flex-1 space-y-1 text-dense text-ink-2">
                      {COLS.map(([k, nm]) => (
                        <li key={k} className={(PLAN_PERMS[cd] as readonly string[]).includes(k) ? 'flex items-center gap-1.5' : 'hidden'}>
                          <Check className="h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
                          {nm}
                        </li>
                      ))}
                    </ul>
                    {(!sub || on) && (
                      <div className="mt-3 grid gap-2">
                        {fs.map((f) => (
                          <button key={f.prd_cd} type="button" disabled={!info.can_pay || !!busy} onClick={() => void pay(f)} className="btn-key btn-sm" title={sub ? `선결제 — 최종 만료일 ${dt(finalEnd)} 뒤로 1${f.prd_cd === 'Y' ? '년' : '개월'} 연장` : undefined}>
                            {busy === `${f.plan_cd}${f.prd_cd}` ? '결제 중…' : `${sub ? '선결제 ' : ''}${f.pi_amt} Pi / ${f.prd_cd === 'Y' ? '년' : '월'}`}
                          </button>
                        ))}
                      </div>
                    )}
                    {sub && ups.length > 0 && (
                      <div className="mt-3 grid gap-2">
                        {ups.map((up) => (
                          <button key={up.prd} type="button" disabled={!info.can_pay || !!busy} onClick={() => void pay({ plan_cd: cd, prd_cd: 'U', prd: up.prd })} className="btn-key btn-sm" title={`사용 ${up.used}일 · 미사용분 ${up.credit} Pi 차감 · 결제한 때부터 새 1${up.prd === 'Y' ? '년' : '개월'}${up.terms ? ` · 선결제 ${up.terms}건 차액 ${up.prepaid} Pi 포함(선결제 기간도 이 요금제로)` : ''}`}>
                            {busy === `${cd}U${up.prd}` ? '결제 중…' : `업그레이드 ${up.amount} Pi / ${up.prd === 'Y' ? '년' : '월'}`}
                          </button>
                        ))}
                      </div>
                    )}
                    {sub && ups[0]?.terms > 0 && <p className={`mt-1 text-xs ${on ? 'text-ink-2' : 'text-ink-3'}`}>선결제 {ups[0].terms}건 차액 {ups[0].prepaid} Pi 포함 — 선결제 기간도 이 요금제로 바뀝니다</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {info && (
          <section>
            <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">
              결제 이력 <span className="font-mono text-xs font-normal text-ink-3">{info.hist.total.toLocaleString()}건</span>
            </h2>
            <div className="overflow-x-auto rounded-card border border-line bg-surface">
              <table className="w-full border-collapse text-dense text-ink">
                <thead>
                  <tr className="thead-3d">
                    <th className="px-3 py-2 text-start">결제일시</th>
                    <th className="px-3 py-2 text-start">요금제</th>
                    <th className="px-3 py-2 text-end">금액</th>
                    <th className="px-3 py-2 text-center">상태</th>
                    <th className="px-3 py-2 text-start">완료일시</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {info.hist.items.map((h, i) => (
                    <tr key={h.pymnt_id ?? i}>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs tabular-nums text-ink-3">{dt(h.apv_dtm)}</td>
                      <td className="px-3 py-1.5">
                        {PLAN_NM[h.meta_val.plan_cd as PlanCd] ?? h.meta_val.plan_cd} · {h.meta_val.prd_cd === 'U' ? `업그레이드(${PLAN_NM[h.meta_val.from_plan as PlanCd] ?? h.meta_val.from_plan}에서, ${h.meta_val.prd === 'Y' ? '년' : '월'})` : h.meta_val.prd_cd === 'Y' ? '년' : '월'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-end tabular-nums">{Number(h.pi_amt)} Pi</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className="badge" data-tone={h.pymnt_sts_cd === 'COMPLETED' ? 'ok' : h.pymnt_sts_cd === 'APPROVED' ? 'warn' : undefined}>
                          {STS_NM[h.pymnt_sts_cd] ?? h.pymnt_sts_cd}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs tabular-nums text-ink-3">{dt(h.cmpl_dtm)}</td>
                    </tr>
                  ))}
                  {!info.hist.items.length && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-dense text-ink-3">
                        결제 이력 없음
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="mt-2 flex items-center justify-center gap-1">
                <button type="button" disabled={info.hist.page <= 1} onClick={() => void load(info.hist.page - 1)} className="btn-ghost btn-icon btn-sm" aria-label="이전" title="이전">
                  <ChevronLeft className="rtl:rotate-180" aria-hidden />
                </button>
                <span className="font-mono text-xs tabular-nums text-ink-3">
                  {info.hist.page} / {pages}
                </span>
                <button type="button" disabled={info.hist.page >= pages} onClick={() => void load(info.hist.page + 1)} className="btn-ghost btn-icon btn-sm" aria-label="다음" title="다음">
                  <ChevronRight className="rtl:rotate-180" aria-hidden />
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
