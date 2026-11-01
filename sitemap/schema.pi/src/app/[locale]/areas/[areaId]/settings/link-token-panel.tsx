'use client'
// 설정 > 사이트 연결(2026-11-01, sql/077) — dbms.pi 등 다른 사이트가 이 분류체계를 읽을 토큰(slk_…) 발급·폐기. 원문은 발급 직후 1번만 표시
// 권한 = 접속 관리(SYS·DA ∩ 요금제) — 그 밖 역할은 API 가 403, 안내 문구만
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useState } from 'react'

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

  if (deny) return <p className="text-sm text-gray-500">{deny} — 사이트 연결 토큰은 접속 관리 권한(SYS·DA)만 발급합니다</p>
  if (!items) return <p className="text-sm text-gray-500">불러오는 중</p>
  return (
    <div className="space-y-4 text-sm">
      <p className="text-gray-600">dbms.pi 의 &apos;연결&apos; 화면에 이 토큰을 등록하면 그 사이트가 이 분류체계의 접속 목록·모델·표준도메인과 PostgreSQL 통계(읽기 전용, 정해진 조회만)를 읽습니다. 사용자 계정은 연결되지 않습니다.</p>
      <form onSubmit={issue} className="flex flex-wrap items-end gap-2">
        <label className="block">
          토큰명
          <input value={nm} onChange={(e) => setNm(e.target.value)} className="mt-1 block w-48 rounded border px-3 py-2" required maxLength={100} />
        </label>
        <label className="block">
          유효 일수
          <input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 block w-24 rounded border px-3 py-2" min={1} max={365} required />
        </label>
        <button disabled={busy} className="rounded bg-gray-800 px-4 py-2 text-white disabled:opacity-50">
          발급
        </button>
      </form>
      {msg && (
        <p role="status" className="text-gray-700">
          {msg}
        </p>
      )}
      {raw && (
        <div className="rounded border border-amber-400 bg-amber-50 p-3">
          <code className="block break-all font-mono text-xs text-gray-900">{raw}</code>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(raw).then(() => setMsg('복사했습니다'))} className="mt-2 rounded border px-3 py-1">
            복사
          </button>
          <button type="button" onClick={() => setRaw('')} className="ml-2 mt-2 rounded border px-3 py-1">
            닫기
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-1">토큰명</th>
              <th>접두</th>
              <th>만료</th>
              <th>최종 사용</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.tkn_id} className="border-b">
                <td className="py-1">{t.tkn_nm}</td>
                <td className="font-mono">{t.tkn_pfx}…</td>
                <td className={new Date(t.exp_dtm).getTime() < Date.now() ? 'text-red-600' : ''}>{dt(t.exp_dtm)}</td>
                <td>{dt(t.lst_use_dtm)}</td>
                <td className="text-right">
                  <button type="button" onClick={() => void revoke(t)} className="rounded border px-2 py-0.5 text-red-700">
                    폐기
                  </button>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={5} className="py-2 text-gray-500">
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
