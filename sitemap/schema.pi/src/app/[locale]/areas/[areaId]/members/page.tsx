'use client'
import { piFetch } from '@pi/auth/client'
// 멤버 화면 — 분류체계 참여자 목록·역할 즉시 변경(PATCH), 멤버 추가(가입된 Pi 사용자명 기준), 역할·요금제 권한표(2026-10-18 마스터 표)
//  변경·추가 = 설정 권한(역할 ∩ 요금제), 본인 역할보다 권한이 많은 역할은 고를 수 없음(canAssign)
import { use, useCallback, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { InfoTip, PageHead } from '@/components/page-head'
import { TD } from '../words/word-board'
import { canAssign, PLAN_NM, PLAN_PERMS, PLANS, ROLE_DESC, ROLE_NM, ROLE_PERMS, ROLES, type MbrRole, type Perm } from '@/lib/roles'

interface Mbr {
  mbr_id: string
  mbr_role_cd: string
  sys_user: { pi_usr_nm: string; dsp_nm: string }
}
// 권한표 열 순서(마스터 표) — CRUD = SQL 편집기 DML·DDL 쓰기
//  메뉴4 설정은 하단 서브메뉴 순서대로 8칸(설정 > 이력 > 금칙어 > 금칙어 일괄등록 > 표준 점검 > 리버스 > 멤버 > 승인, 2026-10-19)
//  칸 판정 = 그 행(역할·요금제)의 표 권한 목록 → 금칙어 일괄등록만 금칙어 메뉴 ∧ 일괄등록(roles.ts BAN_EDIT)
type Col = [string, string, (ps: readonly string[]) => boolean]
const one = (p: Perm) => (ps: readonly string[]) => ps.includes(p)
const PERM_COLS: Col[] = [
  ['APPROVE', '승인', one('APPROVE')],
  ['SELF_APPROVE', '즉시 승인', one('SELF_APPROVE')],
  ['SETTINGS', '설정', one('SETTINGS')],
  ['BULK', '일괄등록', one('BULK')],
  ['REQUEST', '신청', one('REQUEST')],
  ['CRUD', 'CRUD', one('CRUD')],
  ['MENU_SQL', '메뉴1 SQL편집기', one('MENU_SQL')],
  ['MENU_STD', '메뉴2 표준', one('MENU_STD')],
  ['MENU_MODEL', '메뉴3 모델링', one('MENU_MODEL')],
  ['SUB_SET', '메뉴4 설정', one('MENU_SET')],
  ['SUB_HIST', '메뉴4 이력', one('MENU_SET')],
  ['SUB_BAN', '메뉴4 금칙어', one('MENU_BAN')],
  ['SUB_BAN_BULK', '메뉴4 금칙어 일괄등록', (ps) => ps.includes('MENU_BAN') && ps.includes('BULK')],
  ['SUB_CHK', '메뉴4 표준 점검', one('MENU_CHK')],
  ['SUB_RVS', '메뉴4 리버스', one('MENU_CHK')],
  ['SUB_MBR', '메뉴4 멤버', one('MENU_ADM')],
  ['SUB_APV', '메뉴4 승인', one('MENU_ADM')],
]
const roleNm = (r: string) => ROLE_NM[r as MbrRole] ?? r

export default function MembersPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const base = `/api/areas/${areaId}/members`
  const [mbrs, setMbrs] = useState<Mbr[]>([])
  const [myRole, setMyRole] = useState<string | null>(null)
  const [myPerms, setMyPerms] = useState<Perm[]>([])
  const [nm, setNm] = useState('')
  const [role, setRole] = useState<MbrRole>('MDL')
  const [msg, setMsg] = useState('')
  const manage = myPerms.includes('MBR_ADMIN')

  const load = useCallback(async () => {
    const [jm, ja] = await Promise.all([(await piFetch(base)).json(), (await piFetch(`/api/areas/${areaId}`)).json()])
    if (jm.ok) setMbrs(jm.members)
    else setMsg(jm.message)
    if (ja.ok) (setMyRole(ja.role), setMyPerms(ja.perms ?? []))
  }, [base, areaId])
  useEffect(() => {
    load()
  }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const j = await (await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pi_usr_nm: nm, mbr_role_cd: role }) })).json()
    setMsg(j.ok ? `${nm} 추가` : j.message)
    if (j.ok) {
      setNm('')
      load()
    }
  }

  const changeRole = async (m: Mbr, next: string) => {
    const j = await (await piFetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mbr_id: m.mbr_id, mbr_role_cd: next }) })).json()
    setMsg(j.ok ? `${m.sys_user.pi_usr_nm} 역할 변경 : ${roleNm(m.mbr_role_cd)} → ${roleNm(next)}` : j.message)
    load()
  }

  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="멤버" />

      <div className="space-y-6">
        {manage && (
          <form onSubmit={add} className="panel text-sm">
            <div className="panel-head">
              <h2 className="truncate">멤버 추가</h2>
            </div>
            <div className="panel-body flex flex-wrap items-end gap-3">
              <label className="block min-w-48 flex-1">
                <span className="field-label req">Pi 사용자명</span>
                <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="사용자명" className="input" aria-required="true" required maxLength={100} />
              </label>
              <label className="block">
                <span className="field-label req">역할</span>
                <select value={role} onChange={(e) => setRole(e.target.value as MbrRole)} className="input w-auto">
                  {ROLES.map((r) => (
                    <option key={r} value={r} disabled={!canAssign(myRole, r)}>
                      {ROLE_NM[r]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn-3d">추가</button>
            </div>
          </form>
        )}
        {msg && (
          <p role="status" className="text-dense text-ink">
            {msg}
          </p>
        )}

        <section>
          <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">
            멤버 목록 <span className="font-mono text-xs font-normal text-ink-3 tabular-nums">{mbrs.length.toLocaleString()}명</span>
          </h2>
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-dense">
              <thead>
                <tr className="thead-3d text-start">
                  <th className="w-12 px-3 py-2">#</th>
                  <th className="px-3 py-2">사용자명</th>
                  <th className="px-3 py-2">표시명</th>
                  <th className="w-48 px-3 py-2">역할</th>
                </tr>
              </thead>
              <tbody>
                {mbrs.map((m, i) => (
                  <tr key={m.mbr_id}>
                    <td className={`${TD} text-right font-mono text-xs text-ink-3 tabular-nums`}>{i + 1}</td>
                    <td className={`${TD} font-medium`}>{m.sys_user.pi_usr_nm}</td>
                    <td className={`${TD} text-ink-2`}>{m.sys_user.dsp_nm}</td>
                    <td className={TD}>
                      <select value={m.mbr_role_cd} onChange={(e) => changeRole(m, e.target.value)} disabled={!manage || !canAssign(myRole, m.mbr_role_cd)} className="input-sm w-full disabled:bg-raised disabled:text-ink-2" aria-label={`${m.sys_user.pi_usr_nm} 역할`}>
                        {ROLES.map((r) => (
                          <option key={r} value={r} disabled={!canAssign(myRole, r)}>
                            {ROLE_NM[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-1">
            <h2 className="text-sm font-semibold text-ink">역할·요금제 권한표</h2>
            <InfoTip>실제 권한 = 멤버 역할 ∩ 분류체계 요금제. CRUD = SQL 편집기 DML·DDL(SELECT·INSERT·UPDATE·DELETE·CREATE·ALTER·RENAME) 실행. 요금제 없음·만료 = 표준사전 조회만</InfoTip>
          </div>
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-dense">
              <thead>
                <tr className="thead-3d text-start">
                  <th className="px-3 py-2">역할</th>
                  <th className="px-3 py-2">설명</th>
                  {PERM_COLS.map(([k, label]) => (
                    <th key={k} className="px-3 py-2 text-center">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLES.map((r) => (
                  <tr key={r}>
                    <td className="border-b px-3 py-1.5 font-medium whitespace-nowrap">{ROLE_NM[r]}</td>
                    <td className="min-w-60 border-b px-3 py-1.5 text-ink-2">{ROLE_DESC[r]}</td>
                    {PERM_COLS.map(([k, , has]) => (
                      <td key={k} className="border-b px-3 py-1.5 text-center">
                        {has(ROLE_PERMS[r]) && <Check className="mx-auto h-3.5 w-3.5 text-ok" strokeWidth={2} aria-label="있음" />}
                      </td>
                    ))}
                  </tr>
                ))}
                {PLANS.map((pl, i) => (
                  <tr key={pl} className={`bg-well ${i === 0 ? '[&>td]:border-t [&>td]:border-t-line-strong' : ''}`}>
                    <td className="border-b px-3 py-1.5 font-medium whitespace-nowrap">요금제 {pl === 'FREE' ? '없음' : pl.slice(1)}</td>
                    <td className="min-w-60 border-b px-3 py-1.5 text-ink-2">{PLAN_NM[pl]}</td>
                    {PERM_COLS.map(([k, , has]) => (
                      <td key={k} className="border-b px-3 py-1.5 text-center">
                        {has(PLAN_PERMS[pl]) && <Check className="mx-auto h-3.5 w-3.5 text-ok" strokeWidth={2} aria-label="있음" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
