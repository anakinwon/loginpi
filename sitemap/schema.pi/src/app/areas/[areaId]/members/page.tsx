'use client'
import { piFetch } from '@pi/auth/client'
// 멤버 화면 — 분류체계 참여자 목록·역할 즉시 변경(PATCH), 멤버 추가(가입된 Pi 사용자명 기준), 역할·요금제 권한표(2026-10-18 마스터 표)
//  변경·추가 = 설정 권한(역할 ∩ 요금제), 본인 역할보다 권한이 많은 역할은 고를 수 없음(canAssign)
import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
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
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">멤버</h1>

      <div className="mt-6 space-y-6">
        {manage && (
          <form onSubmit={add} className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] text-sm shadow-md">
            <h2 className="bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-5 py-2.5 text-base font-semibold text-white">멤버 추가</h2>
            <div className="flex flex-wrap items-center gap-2 p-5">
              <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Pi 사용자명(가입자)" className="flex-1 rounded border border-[#b8c6e0] bg-white px-3 py-2" required maxLength={100} />
              <select value={role} onChange={(e) => setRole(e.target.value as MbrRole)} className="rounded border border-[#b8c6e0] bg-white px-2 py-2" aria-label="역할">
                {ROLES.map((r) => (
                  <option key={r} value={r} disabled={!canAssign(myRole, r)}>
                    {ROLE_NM[r]}
                  </option>
                ))}
              </select>
              <button className="btn-3d px-8">추가</button>
            </div>
          </form>
        )}
        {msg && (
          <p role="status" className="text-sm text-gray-700">
            {msg}
          </p>
        )}

        <section>
          <h2 className="text-lg font-semibold">멤버 목록 {mbrs.length.toLocaleString()}명</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="thead-3d text-center">
                <th className="w-16 border px-2 py-2">번호</th>
                <th className="border px-2 py-2">사용자명</th>
                <th className="border px-2 py-2">표시명</th>
                <th className="w-48 border px-2 py-2">역할</th>
              </tr>
            </thead>
            <tbody>
              {mbrs.map((m, i) => (
                <tr key={m.mbr_id} className="odd:bg-white even:bg-[#f4f7fc]">
                  <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{i + 1}</td>
                  <td className="border px-2 py-1 font-medium">{m.sys_user.pi_usr_nm}</td>
                  <td className="border px-2 py-1">{m.sys_user.dsp_nm}</td>
                  <td className="border px-2 py-1 text-center">
                    <select value={m.mbr_role_cd} onChange={(e) => changeRole(m, e.target.value)} disabled={!manage || !canAssign(myRole, m.mbr_role_cd)} className="w-full rounded border bg-white px-2 py-1 disabled:bg-gray-100" aria-label={`${m.sys_user.pi_usr_nm} 역할`}>
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
        </section>

        <section>
          <h2 className="text-lg font-semibold">역할·요금제 권한표</h2>
          <p className="mt-1 text-xs text-gray-600">실제 권한 = 멤버 역할 ∩ 분류체계 요금제. CRUD = SQL 편집기 DML·DDL(SELECT·INSERT·UPDATE·DELETE·CREATE·ALTER·RENAME) 실행. 요금제 없음·만료 = 표준사전 조회만</p>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="thead-3d text-center">
                <th className="w-36 border px-2 py-2">역할</th>
                <th className="border px-2 py-2">설명</th>
                {PERM_COLS.map(([k, label]) => (
                  <th key={k} className="w-20 border px-2 py-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLES.map((r) => (
                <tr key={r} className="odd:bg-white even:bg-[#f4f7fc]">
                  <td className="border px-2 py-1 font-medium">{ROLE_NM[r]}</td>
                  <td className="border px-2 py-1">{ROLE_DESC[r]}</td>
                  {PERM_COLS.map(([k, , has]) => (
                    <td key={k} className="border px-2 py-1 text-center">
                      {has(ROLE_PERMS[r]) ? '●' : ''}
                    </td>
                  ))}
                </tr>
              ))}
              {PLANS.map((pl) => (
                <tr key={pl} className="bg-[#f3f8ee]">
                  <td className="border px-2 py-1 font-medium">요금제 {pl === 'FREE' ? '없음' : pl.slice(1)}</td>
                  <td className="border px-2 py-1">{PLAN_NM[pl]}</td>
                  {PERM_COLS.map(([k, , has]) => (
                    <td key={k} className="border px-2 py-1 text-center">
                      {has(PLAN_PERMS[pl]) ? '●' : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}
