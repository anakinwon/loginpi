'use client'
// 요금제 화면(2026-10-19) — 현재 요금제·만료·유효 기간, 요금제 4종 카드(월/년 Pi·권한·메뉴), Pi 결제(시스템담당자·데이터아키텍트), 결제 이력(페이지 단위)
//  결제 = Pi Browser 에서만(판정 = usePiAuth().isInPiBrowser — authenticate 성공 신호, UA 판정 금지). prepare → createPayment → approve → complete(piFetch)
import { piFetch, usePiAuth } from '@pi/auth/client'
import Link from 'next/link'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import { PLAN_NM, PLAN_PERMS, ROLE_NM, type MbrRole, type PlanCd } from '@/lib/roles'

type Fee = { plan_cd: Exclude<PlanCd, 'FREE'>; prd_cd: 'M' | 'Y'; plan_nm: string; pi_amt: number; use_mon_cnt: number }
type Term = { plan_cd: PlanCd; prd_cd: 'M' | 'Y' | null; strt_dtm: string; end_dtm: string; grnt_rsn_cd: 'PAY' | 'GRACE' }
type Hist = { pymnt_id: string; pi_amt: number; pymnt_sts_cd: string; meta_val: { plan_cd?: string; prd_cd?: string }; apv_dtm: string; cmpl_dtm: string | null }
type Info = {
  plan: { plan: PlanCd; end: string | null; grace: boolean }
  admin: boolean
  role: MbrRole
  can_pay: boolean
  fees: Fee[]
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
  ['MENU_SET', '설정 메뉴'],
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

  async function pay(f: Fee) {
    // Pi SDK 는 일반 브라우저에도 주입되므로 window.Pi 존재로는 부족 — authenticate 가 성공한 세션만 결제
    if (!isInPiBrowser || !window.Pi) return setMsg({ ok: false, text: 'Pi Browser 에서 Pi 계정으로 로그인한 뒤 결제하십시오' })
    setBusy(`${f.plan_cd}${f.prd_cd}`), setMsg(null)
    const prep = await post('/api/payments/prepare', { area_id: areaId, plan_cd: f.plan_cd, prd_cd: f.prd_cd })
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
  const pages = info ? Math.max(1, Math.ceil(info.hist.total / info.hist.size)) : 1
  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-1 text-2xl font-bold">요금제</h1>

      {p && (
        <section className="mt-3 overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] shadow-md">
          <h2 className="bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-5 py-2.5 text-base font-semibold text-white">현재 요금제</h2>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 p-4 text-sm">
            <p className="text-lg font-bold text-[#1f3a68]">
              {p.plan === 'FREE' ? '없음(무료 — 표준사전 조회만)' : `요금제${p.plan.slice(1)} · ${PLAN_NM[p.plan]}`}
              {p.grace && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">유예 기간</span>}
            </p>
            {p.end && <p>{dt(p.end)} 까지</p>}
            <p className="text-gray-600">내 역할 : {ROLE_NM[info.role] ?? info.role}</p>
            {info.admin && <p className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800">전역 관리자 — 결제 없이 요금제4 권한</p>}
          </div>
          {info.terms.length > 1 && (
            <ul className="border-t border-[#d5ddec] px-4 py-2 text-xs text-gray-700">
              {info.terms.map((t, i) => (
                <li key={i}>
                  요금제{t.plan_cd.slice(1)}({t.grnt_rsn_cd === 'GRACE' ? '유예' : t.prd_cd === 'Y' ? '년' : '월'}) : {dt(t.strt_dtm)} ~ {dt(t.end_dtm)}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-[#d5ddec] px-4 py-2 text-xs text-gray-600">
            실제 권한 = 멤버 역할 ∩ 분류체계 요금제. 같은 요금제를 다시 결제하면 남은 기간 뒤로 연장, 다른 요금제는 결제한 때부터 시작(높은 요금제가 우선 적용, 비례 환불 없음).
          </p>
        </section>
      )}

      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 text-sm font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {msg.text}
        </p>
      )}

      {info && (
        <section className="mt-4">
          <h2 className="text-lg font-semibold">요금제 선택</h2>
          {!info.can_pay && <p className="mt-1 text-xs text-gray-600">결제는 이 분류체계의 시스템담당자·데이터아키텍트만 할 수 있습니다.</p>}
          {info.can_pay && !isInPiBrowser && <p className="mt-1 text-xs text-gray-600">결제는 Pi Browser 에서 Pi 계정으로 로그인한 뒤 할 수 있습니다.</p>}
          <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(['P1', 'P2', 'P3', 'P4'] as const).map((cd) => {
              const fs = info.fees.filter((f) => f.plan_cd === cd)
              const on = p?.plan === cd
              return (
                <div key={cd} className={`flex flex-col rounded-xl border bg-white p-4 shadow-sm ${on ? 'border-[#3b5f9e] ring-2 ring-[#3b5f9e]/40' : 'border-gray-200'}`}>
                  <p className="text-xs text-gray-500">요금제{cd.slice(1)}</p>
                  <p className="text-lg font-bold text-[#1f3a68]">{PLAN_NM[cd]}</p>
                  <ul className="mt-2 flex-1 space-y-0.5 text-xs">
                    {COLS.map(([k, nm]) => (
                      <li key={k} className={(PLAN_PERMS[cd] as readonly string[]).includes(k) ? 'text-gray-900' : 'text-gray-300 line-through'}>
                        {(PLAN_PERMS[cd] as readonly string[]).includes(k) ? '● ' : '○ '}
                        {nm}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {fs.map((f) => (
                      <button key={f.prd_cd} type="button" disabled={!info.can_pay || !!busy} onClick={() => void pay(f)} className="btn-3d px-2 py-1.5 text-sm disabled:opacity-50">
                        {busy === `${f.plan_cd}${f.prd_cd}` ? '결제 중…' : `${f.pi_amt} Pi / ${f.prd_cd === 'Y' ? '년' : '월'}`}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-gray-500">요금제 없음·만료 = 표준사전 조회만. 메뉴·기능은 멤버 역할 권한 안에서만 열립니다(멤버 화면 권한표).</p>
        </section>
      )}

      {info && (
        <section className="mt-5">
          <h2 className="text-lg font-semibold">결제 이력 {info.hist.total.toLocaleString()}건</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="thead-3d text-center">
                <th className="border px-2 py-2">결제일시</th>
                <th className="border px-2 py-2">요금제</th>
                <th className="border px-2 py-2">금액</th>
                <th className="border px-2 py-2">상태</th>
                <th className="border px-2 py-2">완료일시</th>
              </tr>
            </thead>
            <tbody>
              {info.hist.items.map((h) => (
                <tr key={h.pymnt_id} className="odd:bg-white even:bg-[#f4f7fc]">
                  <td className="border px-2 py-1 text-center">{dt(h.apv_dtm)}</td>
                  <td className="border px-2 py-1 text-center">
                    {PLAN_NM[h.meta_val.plan_cd as PlanCd] ?? h.meta_val.plan_cd} · {h.meta_val.prd_cd === 'Y' ? '년' : '월'}
                  </td>
                  <td className="border px-2 py-1 text-right tabular-nums">{Number(h.pi_amt)} Pi</td>
                  <td className="border px-2 py-1 text-center">{STS_NM[h.pymnt_sts_cd] ?? h.pymnt_sts_cd}</td>
                  <td className="border px-2 py-1 text-center">{dt(h.cmpl_dtm)}</td>
                </tr>
              ))}
              {!info.hist.items.length && (
                <tr>
                  <td colSpan={5} className="border px-2 py-4 text-center text-gray-500">
                    결제 이력이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="mt-2 flex items-center justify-center gap-2 text-sm">
              <button type="button" disabled={info.hist.page <= 1} onClick={() => void load(info.hist.page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">
                이전
              </button>
              <span>
                {info.hist.page} / {pages}
              </span>
              <button type="button" disabled={info.hist.page >= pages} onClick={() => void load(info.hist.page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">
                다음
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
