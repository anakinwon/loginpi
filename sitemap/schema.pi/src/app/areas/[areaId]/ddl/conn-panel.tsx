'use client'
// DB 접속 프로파일·로컬 에이전트 관리(2026-10-18, DDL 생성 화면 탭) — 등록·수정·삭제·저장 전 연결 시험, 에이전트 발급·폐기. 접속 관리 권한(DA)만 편집
// 접속 URL(마스터 질의 "접속 URL 입력 없이 어떻게 접속하지?") : JDBC URL 을 붙여 넣으면 DBMS·호스트·포트·DB 칸을 채움
//  서버 직접(SRV) = PostgreSQL·Oracle 공인 주소, 비밀번호는 서버 키로 암호화 저장 / 에이전트(AGT) = 사내망·Tibero, URL 또는 JNDI 이름은 서버에, 비밀번호는 에이전트 PC 환경변수
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useState } from 'react'
import { buildJdbcUrl, parseJdbcUrl } from '@/lib/modelpi/jdbc-url'
import { dbmsList } from '@/lib/modelpi/dbms'
import { KNOWN_CA } from '@/lib/modelpi/known-ca'

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
  conn_url_txt?: string | null
  jndi_nm?: string | null
  conn_desc?: string | null
  ca_cert_txt?: string | null
  rdonly_acct_yn?: 'Y' | 'N'
  lst_test_dtm?: string | null
  agt_test_end_dtm?: string | null // 에이전트 접속 시험(sql/041)
  agt_test_rslt_cd?: 'OK' | 'ERR' | null
  agt_test_msg?: string | null
  ver_no?: number
}
interface Agt {
  agt_id: string
  agt_nm: string
  tkn_pfx: string
  exp_dtm: string
  lst_seen_dtm: string | null
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
  url: '',
  host_nm: '',
  port_no: 5432,
  db_nm: '',
  usr_nm: '',
  pwd: '',
  agt_id: '',
  agt_ref: 'URL' as 'URL' | 'JNDI',
  conn_url_txt: '',
  jndi_nm: '',
  conn_desc: '',
  ca: '', // 서버 CA 인증서(PEM, sql/042)
  rdonly: false, // 조회 전용 계정(sql/046)
}
// 에이전트 PC 의 비밀번호 환경변수 이름(접속 ID 앞 8자) — README 와 같은 규칙
export const pwdEnv = (connId: string) =>
  `SCHEMAPI_PWD_${connId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
const dt = (s: string | null | undefined) =>
  s ? s.slice(0, 16).replace('T', ' ') : ''

export default function ConnPanel({
  api,
  onChange,
}: {
  api: string
  onChange: () => void
}) {
  const [items, setItems] = useState<Conn[]>([])
  const [agts, setAgts] = useState<Agt[]>([])
  const [admin, setAdmin] = useState(false)
  const [keySet, setKeySet] = useState(true)
  const [block, setBlock] = useState<string | null>(null) // 접속 기능 꺼짐 사유(서버 진단, 값 노출 없음)
  const [edit, setEdit] = useState<{ id: string | null; ver: number } | null>(
    null,
  )
  const [f, setF] = useState(EMPTY)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [newAgt, setNewAgt] = useState({ nm: '', days: 90 })
  const [token, setToken] = useState<{ nm: string; tkn: string } | null>(null) // 발급 직후 한 번만
  // 저장 전 시험(마스터 지시 "접속정보 저장 전 접속테스트 필요") : 시험이 통과한 접속 대상 값 — 값이 바뀌면 다시 시험해야 저장
  const [okKey, setOkKey] = useState<string | null>(null)
  const [agtLater, setAgtLater] = useState<string | null>(null) // 사내망이라 서버가 시험 못 함 → 저장 뒤 에이전트 시험
  const load = useCallback(async () => {
    const j = await (await piFetch(`${api}/db-conns`)).json()
    if (!j.ok) return setMsg(j.message)
    setItems(j.items)
    setAdmin(j.admin)
    setKeySet(j.key_set)
    setBlock(j.block ?? null)
    if (j.admin) {
      const g = await (await piFetch(`${api}/db-agts`)).json()
      if (g.ok) setAgts(g.items)
    }
  }, [api])
  useEffect(() => void load(), [load])
  const fail = (j: { message?: string; detail?: unknown }) =>
    setMsg(
      `${j.message ?? '실패'}${typeof j.detail === 'string' ? ` — ${j.detail}` : ''}`,
    )

  const open = (c?: Conn) => {
    setMsg('')
    setEdit({ id: c?.conn_id ?? null, ver: c?.ver_no ?? 1 })
    setF(
      c
        ? {
            ...EMPTY,
            conn_nm: c.conn_nm,
            dbms_cd: c.dbms_cd,
            exec_mthd_cd: c.exec_mthd_cd,
            host_nm: c.host_nm ?? '',
            port_no: c.port_no ?? PORT[c.dbms_cd],
            db_nm: c.db_nm ?? '',
            usr_nm: c.usr_nm ?? '',
            agt_id: c.agt_id ?? '',
            agt_ref: c.jndi_nm ? 'JNDI' : 'URL',
            conn_url_txt: c.conn_url_txt ?? '',
            jndi_nm: c.jndi_nm ?? '',
            conn_desc: c.conn_desc ?? '',
            ca: c.ca_cert_txt ?? '',
            rdonly: c.rdonly_acct_yn === 'Y',
          }
        : { ...EMPTY, agt_id: agts[0]?.agt_id ?? '' },
    )
    setOkKey(null)
    setAgtLater(null)
  }
  // JDBC URL 붙여 넣기 → 칸 채움(서버 직접은 주소 칸, 에이전트는 URL 칸 그대로). 비밀번호가 들어 있으면 비밀번호 칸으로만
  const pasteUrl = (u: string) => {
    const p = parseJdbcUrl(u)
    if (!p) return setF({ ...f, url: u })
    const tib = p.dbms === '0013'
    setF({
      ...f,
      url: u,
      dbms_cd: p.dbms,
      exec_mthd_cd: tib ? 'AGT' : f.exec_mthd_cd,
      host_nm: p.host,
      port_no: p.port,
      db_nm: p.db,
      usr_nm: p.usr ?? f.usr_nm,
      pwd: p.pwd ?? f.pwd,
      agt_ref: 'URL',
      conn_url_txt:
        buildJdbcUrl(p.dbms, p.host, p.port, p.db) +
        (p.dbms === '0014' && u.includes('?') ? `?${u.split('?')[1]}` : ''),
    })
    setMsg(
      `URL 을 읽었습니다 — ${dbmsList().find((d) => d.cd === p.dbms)?.nm} ${p.host}:${p.port}/${p.db}${p.pwd ? ' (비밀번호는 비밀번호 칸으로 옮김)' : ''}`,
    )
  }
  const srv = f.exec_mthd_cd === 'SRV'
  // 접속 대상 값(이름·설명 제외) — 시험 통과 판정 키. 수정 중 비밀번호를 비우면 저장된 비밀번호로 시험한 것
  const tKey = JSON.stringify([
    f.dbms_cd,
    f.exec_mthd_cd,
    f.host_nm,
    f.port_no,
    f.db_nm,
    f.usr_nm,
    f.pwd,
    f.agt_ref,
    f.conn_url_txt,
    f.jndi_nm,
    f.ca.trim(),
  ])
  const jndi = !srv && f.agt_ref === 'JNDI'
  const canSave = okKey === tKey || jndi || (!srv && agtLater === tKey)
  const canTry = srv
    ? !!(f.host_nm && f.db_nm && f.usr_nm && (f.pwd || edit?.id))
    : f.agt_ref === 'URL' && !!(f.conn_url_txt && f.usr_nm && f.pwd)
  const body = () => ({
    conn_nm: f.conn_nm,
    dbms_cd: f.dbms_cd,
    exec_mthd_cd: f.exec_mthd_cd,
    conn_desc: f.conn_desc || null,
    usr_nm: f.usr_nm || null,
    ca_cert_txt: f.ca.trim() || null,
    rdonly_acct_yn: f.rdonly ? 'Y' : 'N',
    ...(srv
      ? {
          host_nm: f.host_nm,
          port_no: Number(f.port_no),
          db_nm: f.db_nm,
          ...(f.pwd ? { pwd: f.pwd } : {}),
        }
      : {
          agt_id: f.agt_id || null,
          conn_url_txt: f.agt_ref === 'URL' ? f.conn_url_txt || null : null,
          jndi_nm: f.agt_ref === 'JNDI' ? f.jndi_nm || null : null,
        }),
  })
  const save = async () => {
    if (!edit) return
    setBusy(true)
    const j = await (
      await piFetch(
        edit.id ? `${api}/db-conns/${edit.id}` : `${api}/db-conns`,
        {
          method: edit.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body(),
            ...(edit.id ? { ver_no: edit.ver } : {}),
          }),
        },
      )
    ).json()
    setBusy(false)
    if (!j.ok) return fail(j)
    setEdit(null)
    setOkKey(null)
    setMsg(
      j.item.exec_mthd_cd === 'AGT'
        ? `접속 '${j.item.conn_nm}' 저장 — 에이전트 PC 에 환경변수 ${pwdEnv(j.item.conn_id)} = DB 비밀번호 를 설정하십시오`
        : `접속 '${j.item.conn_nm}' 저장`,
    )
    await load()
    onChange()
  }
  // 저장 전 연결 시험 — 입력 중인 값으로(저장 안 함). 수정 중 비밀번호를 비우면 대상이 그대로일 때만 저장된 비밀번호
  const tryDraft = async () => {
    if (!edit) return
    setBusy(true)
    setMsg('입력한 정보로 연결 시험 중…')
    const j = await (
      await piFetch(`${api}/db-conns/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body(),
          conn_nm: f.conn_nm || '시험',
          ...(f.pwd ? { pwd: f.pwd } : {}), // 에이전트 : 시험용(저장 안 함)
          ...(edit.id ? { conn_id: edit.id } : {}),
        }),
      })
    ).json()
    setBusy(false)
    if (j.ok) {
      setOkKey(tKey)
      return setMsg('연결 성공 — 저장할 수 있습니다')
    }
    setOkKey(null)
    if (!srv && j.code === 'DB_CONN_BLOCKED') {
      setAgtLater(tKey)
      return setMsg(`${j.detail ?? j.message}`)
    }
    fail({ message: `연결 실패 : ${j.message}`, detail: j.detail })
  }
  const del = async (c: Conn) => {
    if (!window.confirm(`접속 '${c.conn_nm}' 을 삭제할까요?`)) return
    const j = await (
      await piFetch(`${api}/db-conns/${c.conn_id}?ver_no=${c.ver_no}`, {
        method: 'DELETE',
      })
    ).json()
    if (j.ok) setMsg('삭제했습니다')
    else fail(j)
    await load()
    onChange()
  }
  const test = async (c: Conn) => {
    setBusy(true)
    setMsg(`'${c.conn_nm}' 연결 시험 중…`)
    const j = await (
      await piFetch(`${api}/db-conns/${c.conn_id}/test`, { method: 'POST' })
    ).json()
    if (!j.ok) {
      setBusy(false)
      fail(j)
      return void (await load())
    }
    if (!j.queued) {
      setBusy(false)
      setMsg(`'${c.conn_nm}' 연결 성공`)
      return void (await load())
    }
    // 에이전트 접속 : 에이전트가 다음 확인(기본 15초) 때 시험 → 3초마다 결과 확인, 최대 60초
    setMsg(
      `'${c.conn_nm}' 시험 요청 — 에이전트가 확인하면 결과가 표시됩니다(에이전트가 실행 중이어야 함)`,
    )
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const l = await (await piFetch(`${api}/db-conns`)).json()
      const x = (l.items as Conn[] | undefined)?.find(
        (y) => y.conn_id === c.conn_id,
      )
      if (x?.agt_test_end_dtm) {
        setItems(l.items)
        setBusy(false)
        return setMsg(
          x.agt_test_rslt_cd === 'OK'
            ? `'${c.conn_nm}' 에이전트 연결 성공 — ${x.agt_test_msg ?? ''}`
            : `'${c.conn_nm}' 에이전트 연결 실패 — ${x.agt_test_msg ?? ''}`,
        )
      }
    }
    setBusy(false)
    setMsg(
      `'${c.conn_nm}' 60초 안에 에이전트 응답이 없습니다 — 에이전트 PC 에서 schemapi-agent 가 실행 중인지·토큰이 유효한지 확인하십시오(요청은 10분 동안 유지)`,
    )
    await load()
  }
  const issue = async () => {
    setBusy(true)
    const j = await (
      await piFetch(`${api}/db-agts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agt_nm: newAgt.nm, days: Number(newAgt.days) }),
      })
    ).json()
    setBusy(false)
    if (!j.ok) return fail(j)
    setToken({ nm: j.item.agt_nm, tkn: j.token })
    setNewAgt({ nm: '', days: 90 })
    await load()
  }
  const revoke = async (g: Agt) => {
    if (
      !window.confirm(
        `에이전트 '${g.agt_nm}' 를 폐기할까요? 토큰이 즉시 무효가 됩니다.`,
      )
    )
      return
    const j = await (
      await piFetch(`${api}/db-agts/${g.agt_id}`, { method: 'DELETE' })
    ).json()
    if (j.ok) setMsg('폐기했습니다')
    else fail(j)
    await load()
  }
  const inp = 'w-full rounded border px-2 py-1'
  const tib = f.dbms_cd === '0013'

  return (
    <div className="text-sm">
      {(!keySet || block) && (
        <p className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          서버 직접 접속을 {keySet ? '시험·실행' : '저장·시험·실행'}할 수 없습니다(에이전트 접속만) — {block ?? '서버 암호화 키(DB_PROFILE_KEY) 확인'}
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
                <td className="border px-2 py-1 font-mono break-all">
                  {c.exec_mthd_cd === 'SRV'
                    ? `${c.usr_nm}@${c.host_nm}:${c.port_no}/${c.db_nm}${c.has_pwd ? '' : ' (비밀번호 없음)'}`
                    : `${c.conn_url_txt ?? `JNDI ${c.jndi_nm}`} · ${agts.find((g) => g.agt_id === c.agt_id)?.agt_nm ?? '에이전트'} · 비밀번호 ${pwdEnv(c.conn_id)}`}
                  {c.lst_test_dtm && (
                    <span className="ml-1 text-green-700">
                      시험 성공 {dt(c.lst_test_dtm)}
                    </span>
                  )}
                  {c.agt_test_rslt_cd === 'ERR' && (
                    <span className="ml-1 text-red-700">
                      최근 시험 실패 {dt(c.agt_test_end_dtm)} : {c.agt_test_msg}
                    </span>
                  )}
                </td>
              )}
              {admin && (
                <td className="border px-2 py-1 text-center whitespace-nowrap">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void test(c)}
                    className="mr-1 rounded border px-1 disabled:opacity-40"
                    title={
                      c.exec_mthd_cd === 'AGT'
                        ? '에이전트가 사내망에서 접속해 봅니다(에이전트 실행 중이어야 함)'
                        : '서버에서 저장된 정보로 접속해 봅니다'
                    }
                  >
                    연결 시험
                  </button>
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
          접속·에이전트 등록은 데이터아키텍트만 할 수 있습니다.
        </p>
      )}

      {edit && (
        <form
          className="mt-3 grid grid-cols-2 gap-2 rounded border p-2"
          onSubmit={(e) => (e.preventDefault(), void save())}
          aria-label="접속 편집"
        >
          <label className="col-span-2">
            JDBC 접속 URL 붙여 넣기{' '}
            <span className="text-xs text-gray-500">
              (선택 — 아래 칸을 자동으로 채움)
            </span>
            <input
              className={`${inp} font-mono text-xs`}
              value={f.url}
              onChange={(e) => pasteUrl(e.target.value)}
              placeholder="jdbc:postgresql://host:5432/db · jdbc:oracle:thin:@//host:1521/서비스 · jdbc:tibero:thin:@host:8629:DB"
              autoComplete="off"
            />
          </label>
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
                setF({
                  ...f,
                  exec_mthd_cd: e.target.value as 'SRV' | 'AGT',
                  conn_url_txt:
                    f.conn_url_txt ||
                    (f.host_nm && f.db_nm
                      ? buildJdbcUrl(
                          f.dbms_cd,
                          f.host_nm,
                          Number(f.port_no),
                          f.db_nm,
                        )
                      : ''),
                  // 에이전트 → 서버 직접 전환 : 저장된 JDBC URL 에서 호스트·포트·DB 채움
                  ...(e.target.value === 'SRV' &&
                  !f.host_nm &&
                  parseJdbcUrl(f.conn_url_txt)
                    ? (({ host, port, db }) => ({
                        host_nm: host,
                        port_no: port,
                        db_nm: db,
                      }))(parseJdbcUrl(f.conn_url_txt)!)
                    : {}),
                })
              }
            >
              {!tib && <option value="SRV">서버 직접(공인 주소)</option>}
              <option value="AGT">
                로컬 에이전트(사내망·Tibero, JDBC·JNDI)
              </option>
            </select>
          </label>
          {srv ? (
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
                  {edit.id
                    ? '(바꿀 때만 입력 — 주소·계정을 바꾸면 다시 입력)'
                    : ''}{' '}
                  서버 키로 암호화 저장, 다시 표시되지 않음
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
              {f.host_nm && f.db_nm && (
                <p className="col-span-2 font-mono text-xs text-gray-600">
                  접속 URL :{' '}
                  {buildJdbcUrl(
                    f.dbms_cd,
                    f.host_nm,
                    Number(f.port_no),
                    f.db_nm,
                  )}
                </p>
              )}
            </>
          ) : (
            <>
              <label className="col-span-2">
                에이전트
                <select
                  className={inp}
                  value={f.agt_id}
                  onChange={(e) => setF({ ...f, agt_id: e.target.value })}
                  required
                >
                  <option value="">에이전트 선택(아래에서 먼저 발급)</option>
                  {agts.map((g) => (
                    <option key={g.agt_id} value={g.agt_id}>
                      {g.agt_nm} ({g.tkn_pfx}…)
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="col-span-2 flex gap-3 text-xs">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={f.agt_ref === 'URL'}
                    onChange={() => setF({ ...f, agt_ref: 'URL' })}
                  />{' '}
                  JDBC URL
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={f.agt_ref === 'JNDI'}
                    onChange={() => setF({ ...f, agt_ref: 'JNDI' })}
                  />{' '}
                  JNDI 이름(WAS DataSource)
                </label>
              </fieldset>
              {f.agt_ref === 'URL' ? (
                <label className="col-span-2">
                  JDBC URL{' '}
                  <span className="text-xs text-gray-500">
                    (사용자·비밀번호 넣지 않음)
                  </span>
                  <input
                    className={`${inp} font-mono text-xs`}
                    value={f.conn_url_txt}
                    onChange={(e) =>
                      setF({ ...f, conn_url_txt: e.target.value })
                    }
                    required
                    placeholder={buildJdbcUrl(
                      f.dbms_cd,
                      '10.0.0.5',
                      PORT[f.dbms_cd],
                      tib ? 'tibero' : 'db',
                    )}
                  />
                </label>
              ) : (
                <label className="col-span-2">
                  JNDI 이름
                  <input
                    className={`${inp} font-mono text-xs`}
                    value={f.jndi_nm}
                    onChange={(e) => setF({ ...f, jndi_nm: e.target.value })}
                    required
                    placeholder="java:comp/env/jdbc/TiberoDS"
                  />
                </label>
              )}
              <label className="col-span-2">
                사용자{' '}
                <span className="text-xs text-gray-500">
                  (JNDI 는 비워 두면 WAS 설정 계정)
                </span>
                <input
                  className={inp}
                  value={f.usr_nm}
                  onChange={(e) => setF({ ...f, usr_nm: e.target.value })}
                  autoComplete="off"
                />
              </label>
              {f.agt_ref === 'URL' && (
                <label className="col-span-2">
                  시험용 비밀번호{' '}
                  <span className="text-xs text-gray-500">
                    (저장 전 연결 시험에만 사용, 저장하지 않음)
                  </span>
                  <input
                    className={inp}
                    type="password"
                    value={f.pwd}
                    onChange={(e) => setF({ ...f, pwd: e.target.value })}
                    autoComplete="new-password"
                  />
                </label>
              )}
              <p className="col-span-2 text-xs text-gray-600">
                비밀번호는 서버에 저장하지 않습니다 — 저장 뒤 표시되는 환경변수
                이름으로 에이전트 PC 에 설정합니다.
              </p>
            </>
          )}
          <label className="col-span-2 flex items-start gap-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs">
            <input type="checkbox" checked={f.rdonly} onChange={(e) => setF({ ...f, rdonly: e.target.checked })} className="mt-0.5" />
            <span>
              <b>조회 전용 계정</b> — 이 계정은 SELECT 권한만 있습니다(DB 에서 확인한 뒤 체크). 체크한 접속만 데이터아키텍트가 아닌 역할이 SQL 편집기로 조회할 수 있습니다.
            </span>
          </label>
          {!jndi && (
            <fieldset className="col-span-2 rounded border p-2 text-xs">
              <legend className="px-1">
                서버 CA 인증서(선택 — 인증서 검증 TLS)
              </legend>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={f.ca.trim() === KNOWN_CA.SUPABASE_2021.pem.trim()}
                  onChange={(e) =>
                    setF({
                      ...f,
                      ca: e.target.checked ? KNOWN_CA.SUPABASE_2021.pem : '',
                    })
                  }
                />
                Supabase DB·풀러({KNOWN_CA.SUPABASE_2021.nm}) — Supabase 는 자체
                CA 라 이것이 있어야 접속됩니다
              </label>
              <textarea
                className={`${inp} mt-1 h-16 font-mono text-[10px]`}
                value={f.ca}
                onChange={(e) => setF({ ...f, ca: e.target.value })}
                placeholder="-----BEGIN CERTIFICATE----- … (다른 자체 CA 는 PEM 붙여 넣기, 공인 인증서 서버는 비움)"
                spellCheck={false}
              />
            </fieldset>
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
          <div className="col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={busy || !canSave}
              title={
                canSave
                  ? '저장'
                  : '연결 시험을 통과해야 저장할 수 있습니다(값을 바꾸면 다시 시험)'
              }
              className="rounded bg-[#1f3a68] px-3 py-1 text-white disabled:opacity-40"
            >
              저장
            </button>
            {!jndi && (
              <button
                type="button"
                disabled={busy || !canTry}
                onClick={() => void tryDraft()}
                className="rounded border border-emerald-600 px-3 py-1 text-emerald-700 disabled:opacity-40"
                title="저장하지 않고 입력한 정보로 접속해 봅니다"
              >
                연결 시험
              </button>
            )}
            <span className="self-center text-xs text-gray-600">
              {canSave
                ? okKey === tKey
                  ? '✓ 시험 통과'
                  : jndi
                    ? 'JNDI 는 저장 뒤 에이전트가 시험'
                    : '사내망 — 저장 뒤 에이전트가 시험'
                : '연결 시험 통과 후 저장'}
            </span>
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

      {admin && (
        <section className="mt-4 rounded border p-2" aria-label="로컬 에이전트">
          <h3 className="font-semibold text-[#1f3a68]">
            로컬 에이전트(사내망·Tibero 실행)
          </h3>
          <p className="text-xs text-gray-600">
            사내 PC 에서 schemapi-agent.jar 를 실행하면 승인된 작업을 가져가
            JDBC·JNDI 로 실행합니다(바깥으로만 접속, 인바운드 포트 없음).
          </p>
          {token && (
            <div
              className="mt-2 rounded border border-amber-400 bg-amber-50 p-2 text-xs"
              role="alert"
            >
              <p className="font-semibold">
                에이전트 '{token.nm}' 토큰 — 지금 한 번만 보입니다. 에이전트 PC
                의 환경변수 SCHEMAPI_AGENT_TOKEN 에 넣으십시오.
              </p>
              <code className="mt-1 block font-mono break-all select-all">
                {token.tkn}
              </code>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(token.tkn)
                      .then(() => setMsg('토큰을 복사했습니다'))
                  }
                  className="rounded border px-2"
                >
                  복사
                </button>
                <button
                  type="button"
                  onClick={() => setToken(null)}
                  className="rounded border px-2"
                >
                  닫기(다시 볼 수 없음)
                </button>
              </div>
            </div>
          )}
          <table className="mt-2 w-full border-collapse text-xs">
            <tbody>
              {agts.map((g) => (
                <tr key={g.agt_id}>
                  <td className="border px-2 py-1">{g.agt_nm}</td>
                  <td className="border px-2 py-1 font-mono">{g.tkn_pfx}…</td>
                  <td className="border px-2 py-1">만료 {dt(g.exp_dtm)}</td>
                  <td className="border px-2 py-1">
                    {g.lst_seen_dtm
                      ? `최근 접속 ${dt(g.lst_seen_dtm)}`
                      : '접속 기록 없음'}
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => void revoke(g)}
                      className="rounded border px-1 text-red-700"
                    >
                      폐기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <input
              className="rounded border px-2 py-1"
              value={newAgt.nm}
              onChange={(e) => setNewAgt({ ...newAgt, nm: e.target.value })}
              placeholder="에이전트 이름(예: 본사 DB 서버)"
              maxLength={100}
              aria-label="에이전트 이름"
            />
            <label className="flex items-center gap-1">
              유효
              <input
                className="w-16 rounded border px-1 py-1"
                type="number"
                min={1}
                max={365}
                value={newAgt.days}
                onChange={(e) =>
                  setNewAgt({ ...newAgt, days: Number(e.target.value) })
                }
              />
              일
            </label>
            <button
              type="button"
              disabled={busy || !newAgt.nm.trim()}
              onClick={() => void issue()}
              className="rounded border border-[#1f3a68] px-2 py-1 text-[#1f3a68] disabled:opacity-40"
            >
              에이전트 발급
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
