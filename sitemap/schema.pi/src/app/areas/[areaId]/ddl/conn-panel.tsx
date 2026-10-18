'use client'
// DB 접속 프로파일 관리(2026-10-18, DDL 생성 화면 탭) — 등록·수정·삭제·연결 시험. 접속 관리 권한(DA)만 편집, 비밀번호는 입력만(다시 보이지 않음)
// 서버 직접(SRV) = PostgreSQL·Oracle 공인 주소, Tibero·사내망 = 로컬 에이전트(AGT)
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useState } from 'react'
import { dbmsList } from '@/lib/modelpi/dbms'

export interface Conn {
  conn_id: string
  conn_nm: string
  dbms_cd: string
  exec_mthd_cd: 'SRV' | 'AGT'
  host_nm?: string | null
  port_no?: number | null
  db_nm?: string | null
  usr_nm?: string | null
  has_pwd?: boolean
  agt_id?: string | null
  conn_desc?: string | null
  lst_test_dtm?: string | null
  ver_no?: number
}
const PORT: Record<string, number> = {
  '0014': 5432,
  '0001': 1521,
  '0013': 8629,
}
const EMPTY = {
  conn_nm: '',
  dbms_cd: '0014',
  exec_mthd_cd: 'SRV' as 'SRV' | 'AGT',
  host_nm: '',
  port_no: 5432,
  db_nm: '',
  usr_nm: '',
  pwd: '',
  conn_desc: '',
}

export default function ConnPanel({
  api,
  onChange,
}: {
  api: string
  onChange: () => void
}) {
  const [items, setItems] = useState<Conn[]>([])
  const [admin, setAdmin] = useState(false)
  const [keySet, setKeySet] = useState(true)
  const [edit, setEdit] = useState<{ id: string | null; ver: number } | null>(
    null,
  )
  const [f, setF] = useState(EMPTY)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const j = await (await piFetch(`${api}/db-conns`)).json()
    if (!j.ok) return setMsg(j.message)
    setItems(j.items)
    setAdmin(j.admin)
    setKeySet(j.key_set)
  }, [api])
  useEffect(() => void load(), [load])

  const open = (c?: Conn) => {
    setMsg('')
    setEdit({ id: c?.conn_id ?? null, ver: c?.ver_no ?? 1 })
    setF(
      c
        ? {
            conn_nm: c.conn_nm,
            dbms_cd: c.dbms_cd,
            exec_mthd_cd: c.exec_mthd_cd,
            host_nm: c.host_nm ?? '',
            port_no: c.port_no ?? PORT[c.dbms_cd],
            db_nm: c.db_nm ?? '',
            usr_nm: c.usr_nm ?? '',
            pwd: '',
            conn_desc: c.conn_desc ?? '',
          }
        : EMPTY,
    )
  }
  const save = async () => {
    if (!edit) return
    const srv = f.exec_mthd_cd === 'SRV'
    const body = {
      conn_nm: f.conn_nm,
      dbms_cd: f.dbms_cd,
      exec_mthd_cd: f.exec_mthd_cd,
      conn_desc: f.conn_desc || null,
      ...(srv
        ? {
            host_nm: f.host_nm,
            port_no: Number(f.port_no),
            db_nm: f.db_nm,
            usr_nm: f.usr_nm,
            ...(f.pwd ? { pwd: f.pwd } : {}),
          }
        : {}),
      ...(edit.id ? { ver_no: edit.ver } : {}),
    }
    setBusy(true)
    const j = await (
      await piFetch(
        edit.id ? `${api}/db-conns/${edit.id}` : `${api}/db-conns`,
        {
          method: edit.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
    ).json()
    setBusy(false)
    if (!j.ok) return setMsg(j.message)
    setEdit(null)
    setMsg(`접속 '${j.item.conn_nm}' 저장`)
    await load()
    onChange()
  }
  // 저장 전 연결 시험 — 입력 중인 값으로(저장 안 함), 수정 중 비밀번호를 비우면 저장된 비밀번호
  const tryDraft = async () => {
    if (!edit) return
    setBusy(true)
    setMsg('입력한 정보로 연결 시험 중…')
    const j = await (
      await piFetch(`${api}/db-conns/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conn_nm: f.conn_nm || '시험',
          dbms_cd: f.dbms_cd,
          exec_mthd_cd: f.exec_mthd_cd,
          host_nm: f.host_nm,
          port_no: Number(f.port_no),
          db_nm: f.db_nm,
          usr_nm: f.usr_nm,
          ...(f.pwd ? { pwd: f.pwd } : {}),
          ...(edit.id ? { conn_id: edit.id } : {}),
        }),
      })
    ).json()
    setBusy(false)
    setMsg(
      j.ok
        ? '연결 성공 — 저장할 수 있습니다'
        : `연결 실패 : ${j.message}${j.detail ? ` — ${j.detail}` : ''}`,
    )
  }
  const del = async (c: Conn) => {
    if (!window.confirm(`접속 '${c.conn_nm}' 을 삭제할까요?`)) return
    const j = await (
      await piFetch(`${api}/db-conns/${c.conn_id}?ver_no=${c.ver_no}`, {
        method: 'DELETE',
      })
    ).json()
    setMsg(j.ok ? '삭제했습니다' : j.message)
    await load()
    onChange()
  }
  const test = async (c: Conn) => {
    setBusy(true)
    setMsg(`'${c.conn_nm}' 연결 시험 중…`)
    const j = await (
      await piFetch(`${api}/db-conns/${c.conn_id}/test`, { method: 'POST' })
    ).json()
    setBusy(false)
    setMsg(
      j.ok
        ? `'${c.conn_nm}' 연결 성공`
        : `${j.message}${j.detail ? ` — ${j.detail}` : ''}`,
    )
    await load()
  }
  const inp = 'w-full rounded border px-2 py-1'
  const tib = f.dbms_cd === '0013'

  return (
    <div className="text-sm">
      {!keySet && (
        <p className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          서버 암호화 키(DB_PROFILE_KEY)가 없어 서버 직접 접속을
          저장·시험·실행할 수 없습니다(에이전트 접속만). 운영 환경변수를
          설정하십시오.
        </p>
      )}
      {msg && (
        <p role="status" className="mb-2 font-medium text-[#1f3a68]">
          {msg}
        </p>
      )}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-gray-50">
            <th className="border px-2 py-1 text-left">접속</th>
            <th className="border px-2 py-1">DBMS·방법</th>
            {admin && <th className="border px-2 py-1 text-left">대상</th>}
            {admin && <th className="border px-2 py-1">관리</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.conn_id}>
              <td className="border px-2 py-1">{c.conn_nm}</td>
              <td className="border px-2 py-1 text-center">
                {dbmsList().find((d) => d.cd === c.dbms_cd)?.nm} ·{' '}
                {c.exec_mthd_cd === 'SRV' ? '서버 직접' : '에이전트'}
              </td>
              {admin && (
                <td className="border px-2 py-1 font-mono">
                  {c.exec_mthd_cd === 'SRV'
                    ? `${c.usr_nm}@${c.host_nm}:${c.port_no}/${c.db_nm}${c.has_pwd ? '' : ' (비밀번호 없음)'}`
                    : '로컬 에이전트'}
                  {c.lst_test_dtm && (
                    <span className="ml-1 text-green-700">
                      시험 성공 {c.lst_test_dtm.slice(0, 16).replace('T', ' ')}
                    </span>
                  )}
                </td>
              )}
              {admin && (
                <td className="border px-2 py-1 text-center whitespace-nowrap">
                  {c.exec_mthd_cd === 'SRV' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void test(c)}
                      className="mr-1 rounded border px-1 disabled:opacity-40"
                    >
                      연결 시험
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => open(c)}
                    className="mr-1 rounded border px-1"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => void del(c)}
                    className="rounded border px-1 text-red-700"
                  >
                    삭제
                  </button>
                </td>
              )}
            </tr>
          ))}
          {!items.length && (
            <tr>
              <td colSpan={4} className="p-3 text-center text-gray-500">
                등록된 접속이 없습니다
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {admin && !edit && (
        <button
          type="button"
          onClick={() => open()}
          className="mt-2 rounded border px-2 py-1 text-xs"
        >
          ＋ 접속 추가
        </button>
      )}
      {!admin && (
        <p className="mt-2 text-xs text-gray-500">
          접속 등록·수정은 데이터아키텍트만 할 수 있습니다.
        </p>
      )}
      {edit && (
        <form
          className="mt-3 grid grid-cols-2 gap-2 rounded border p-2"
          onSubmit={(e) => (e.preventDefault(), void save())}
          aria-label="접속 편집"
        >
          <label className="col-span-2">
            접속명
            <input
              className={inp}
              value={f.conn_nm}
              onChange={(e) => setF({ ...f, conn_nm: e.target.value })}
              required
              maxLength={100}
            />
          </label>
          <label>
            DBMS
            <select
              className={inp}
              value={f.dbms_cd}
              onChange={(e) =>
                setF({
                  ...f,
                  dbms_cd: e.target.value,
                  port_no: PORT[e.target.value],
                  exec_mthd_cd:
                    e.target.value === '0013' ? 'AGT' : f.exec_mthd_cd,
                })
              }
            >
              {dbmsList().map((d) => (
                <option key={d.cd} value={d.cd}>
                  {d.nm}
                </option>
              ))}
            </select>
          </label>
          <label>
            실행 방법
            <select
              className={inp}
              value={f.exec_mthd_cd}
              onChange={(e) =>
                setF({ ...f, exec_mthd_cd: e.target.value as 'SRV' | 'AGT' })
              }
            >
              {!tib && <option value="SRV">서버 직접(공인 주소)</option>}
              <option value="AGT">로컬 에이전트(JDBC·JNDI)</option>
            </select>
          </label>
          {f.exec_mthd_cd === 'SRV' ? (
            <>
              <label>
                호스트
                <input
                  className={inp}
                  value={f.host_nm}
                  onChange={(e) => setF({ ...f, host_nm: e.target.value })}
                  required
                  placeholder="db.example.com"
                />
              </label>
              <label>
                포트
                <input
                  className={inp}
                  type="number"
                  value={f.port_no}
                  onChange={(e) =>
                    setF({ ...f, port_no: Number(e.target.value) })
                  }
                  required
                  min={1}
                  max={65535}
                />
              </label>
              <label>
                {f.dbms_cd === '0001' ? '서비스명' : 'DB명'}
                <input
                  className={inp}
                  value={f.db_nm}
                  onChange={(e) => setF({ ...f, db_nm: e.target.value })}
                  required
                />
              </label>
              <label>
                사용자
                <input
                  className={inp}
                  value={f.usr_nm}
                  onChange={(e) => setF({ ...f, usr_nm: e.target.value })}
                  required
                  autoComplete="off"
                />
              </label>
              <label className="col-span-2">
                비밀번호{' '}
                <span className="text-xs text-gray-500">
                  {edit.id ? '(바꿀 때만 입력)' : ''} — 서버 키로 암호화 저장,
                  다시 표시되지 않음
                </span>
                <input
                  className={inp}
                  type="password"
                  value={f.pwd}
                  onChange={(e) => setF({ ...f, pwd: e.target.value })}
                  required={!edit.id}
                  autoComplete="new-password"
                />
              </label>
            </>
          ) : (
            <p className="col-span-2 text-xs text-gray-600">
              사내망·Tibero 는 로컬 에이전트가 실행합니다 — 에이전트 설정 파일에
              이 접속 ID 의 JDBC URL 또는 JNDI 이름을 적습니다(접속 저장 후 ID
              표시).
            </p>
          )}
          <label className="col-span-2">
            설명
            <input
              className={inp}
              value={f.conn_desc}
              onChange={(e) => setF({ ...f, conn_desc: e.target.value })}
              maxLength={2000}
            />
          </label>
          {edit.id && f.exec_mthd_cd === 'AGT' && (
            <p className="col-span-2 font-mono text-xs">접속 ID : {edit.id}</p>
          )}
          <div className="col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-[#1f3a68] px-3 py-1 text-white disabled:opacity-40"
            >
              저장
            </button>
            {f.exec_mthd_cd === 'SRV' && (
              <button
                type="button"
                disabled={
                  busy ||
                  !f.host_nm ||
                  !f.db_nm ||
                  !f.usr_nm ||
                  (!f.pwd && !edit.id)
                }
                onClick={() => void tryDraft()}
                className="rounded border border-emerald-600 px-3 py-1 text-emerald-700 disabled:opacity-40"
                title="저장하지 않고 입력한 정보로 접속해 봅니다"
              >
                연결 시험
              </button>
            )}
            <button
              type="button"
              onClick={() => setEdit(null)}
              className="rounded border px-3 py-1"
            >
              취소
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
