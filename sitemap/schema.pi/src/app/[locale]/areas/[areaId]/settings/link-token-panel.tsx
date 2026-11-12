'use client'
// 설정 > 사이트 연결(2026-11-01, sql/077) — dbms.pi 등 다른 사이트가 이 분류체계를 읽을 토큰(slk_…) 발급·폐기. 원문은 발급 직후 1번만 표시
// 권한 = 연결 토큰 관리(LINK_ADMIN = SYS·DA ∩ 유료 요금제) — 그 밖 역할은 API 가 403, 안내 문구만
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { InfoTip } from '@/components/page-head'
import { TD } from '../words/word-board'

type Tkn = { tkn_id: string; tkn_nm: string; tkn_pfx: string; exp_dtm: string; lst_use_dtm: string | null; reg_dtm: string }
const API = '/api/link/tokens'
const dt = (s: string | null) => (s ? new Date(s).toLocaleString() : '-')

export default function LinkTokenPanel({ areaId }: { areaId: string }) {
  const [items, setItems] = useState<Tkn[] | null>(null)
  const [deny, setDeny] = useState('')
  const [nm, setNm] = useState('dbms.pi')
  const [days, setDays] = useState(90)
  const [raw, setRaw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const j = await (await piFetch(`${API}?area=${areaId}`)).json().catch(() => ({ ok: false, message: '불러오지 못했습니다' }))
    if (!j.ok) return setDeny(j.message ?? '불러오지 못했습니다')
    setItems(j.items)
  }, [areaId])
  useEffect(() => {
    void load()
  }, [load])

  const issue = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const j = await (await piFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area: areaId, tkn_nm: nm, days }) })).json().catch(() => ({ ok: false }))
    setBusy(false)
    setMsg(j.ok ? '발급했습니다 — 아래 토큰은 지금 한 번만 보입니다' : (j.message ?? '발급하지 못했습니다'))
    if (j.ok) {
      setRaw(j.token)
      void load()
    }
  }
  const revoke = async (t: Tkn) => {
    if (!confirm(`${t.tkn_nm}(${t.tkn_pfx}…) 토큰을 폐기합니다 — 이 토큰을 쓰는 사이트는 즉시 연결이 끊깁니다`)) return
    const j = await (await piFetch(`${API}/${t.tkn_id}?area=${areaId}`, { method: 'DELETE' })).json().catch(() => ({ ok: false }))
    setMsg(j.ok ? '폐기했습니다' : (j.message ?? '폐기하지 못했습니다'))
    if (j.ok) void load()
  }

  if (deny) return <p className="text-sm text-ink-2">{deny} — 사이트 연결 토큰은 유료 요금제의 SYS·DA 역할만 발급합니다</p>
  if (!items) return <p className="text-sm text-ink-3">불러오는 중</p>
  return (
    <div className="space-y-6 text-sm">
      <form onSubmit={issue} className="panel">
        <div className="panel-head">
          <h2 className="truncate">연결 토큰 발급</h2>
          <InfoTip align="end">dbms.pi 의 &apos;연결&apos; 화면에 이 토큰을 등록하면 그 사이트가 이 분류체계의 접속 목록·모델·표준도메인과 PostgreSQL 통계(읽기 전용, 정해진 조회만)를 읽습니다. 사용자 계정은 연결되지 않습니다.</InfoTip>
        </div>
        <div className="panel-body">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="field-label req">토큰명</span>
              <input value={nm} onChange={(e) => setNm(e.target.value)} className="input w-48" aria-required="true" required maxLength={100} />
            </label>
            <label className="block">
              <span className="field-label req">유효 일수</span>
              <input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} className="input w-24 tabular-nums" aria-required="true" min={1} max={365} required />
            </label>
            <button disabled={busy} className="btn-3d">
              발급
            </button>
          </div>
          {msg && (
            <p role="status" className="mt-3 text-dense text-ink">
              {msg}
            </p>
          )}
          {raw && (
            <div className="mt-3 rounded-card bg-warn-soft p-3">
              <code className="block font-mono text-xs break-all text-ink">{raw}</code>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void navigator.clipboard?.writeText(raw).then(() => setMsg('복사했습니다'))} className="btn-key btn-sm">
                  <Copy aria-hidden />
                  복사
                </button>
                <button type="button" onClick={() => setRaw('')} className="btn-ghost btn-sm">
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
      </form>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[520px] border-collapse text-dense [&_td]:whitespace-nowrap">
          <thead>
            <tr className="thead-3d text-start">
              <th className="px-3 py-2">토큰명</th>
              <th className="px-3 py-2">접두</th>
              <th className="px-3 py-2">만료</th>
              <th className="px-3 py-2">최종 사용</th>
              <th className="px-3 py-2">처리</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.tkn_id}>
                <td className={`${TD} font-medium`}>{t.tkn_nm}</td>
                <td className={TD}>
                  <span className="chip-phy">{t.tkn_pfx}…</span>
                </td>
                <td className={`${TD} font-mono text-xs tabular-nums ${new Date(t.exp_dtm).getTime() < Date.now() ? 'text-danger' : 'text-ink-3'}`}>{dt(t.exp_dtm)}</td>
                <td className={`${TD} font-mono text-xs text-ink-3 tabular-nums`}>{dt(t.lst_use_dtm)}</td>
                <td className={`${TD} w-px`}>
                  <button type="button" onClick={() => void revoke(t)} className="btn-danger btn-sm">
                    폐기
                  </button>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-3">
                  발급한 토큰이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
