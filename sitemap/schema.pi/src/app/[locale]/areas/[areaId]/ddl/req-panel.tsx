'use client'
// DDL 실행 요청·승인·실행 결과(2026-10-18, DDL 생성 화면 탭) — 목록(페이지) → 상세(DDL·문장별 결과) → 승인(다른 DA)·반려·취소·실행
// 승인은 화면에 보인 DDL 해시(expect_hash)로 — 그 사이 모델이 바뀌면 서버가 거부(DDL_CHANGED)
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Req {
  req_id: string
  conn_nm: string
  exec_mthd_cd: 'SRV' | 'AGT'
  tbl_ids: string[]
  stmt_cnt: number
  ddl_hash: string
  req_sts_cd: string
  mine: boolean
  rjct_rsn: string | null
  exec_try_no: number
  reg_dtm: string
}
interface Stmt {
  exec_try_no: number
  stmt_seq: number
  stmt_txt: string
  rslt_cd: string
  err_cd: string | null
  err_msg: string | null
  elapsed_ms: number | null
}
export const REQ_STS_NM: Record<string, string> = {
  REQ: '승인대기',
  APV: '승인(실행 대기)',
  RJCT: '반려',
  CNCL: '취소',
  RUN: '실행중',
  DONE: '완료',
  FAIL: '실패',
  PART: '일부 실행',
}
const RSLT_NM: Record<string, string> = {
  OK: '성공',
  ERR: '오류',
  SKIP: '건너뜀',
  RBK: '되돌림',
}
// 상태 배지 톤(표시만) — 대기·일부 = warn, 반려·실패 = danger, 완료 = ok, 승인·실행중 = accent, 취소 = 기본
const STS_TONE: Record<string, string | undefined> = { REQ: 'warn', APV: 'accent', RJCT: 'danger', RUN: 'accent', DONE: 'ok', FAIL: 'danger', PART: 'warn' }
const SIZE = 10

export default function ReqPanel({
  api,
  prjId,
  rev,
}: {
  api: string
  prjId: string
  rev: number
}) {
  const base = `${api}/projects/${prjId}/ddl-reqs`
  const [items, setItems] = useState<Req[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState<string | null>(null)
  const [det, setDet] = useState<{
    item: Req & { ddl_txt: string }
    stmts: Stmt[]
    can_approve: boolean
    self_approve?: boolean // DA 1명 분류체계 — 본인 승인(사유 필수)
    mine: boolean
  } | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (!prjId) return
    const j = await (await piFetch(`${base}?page=${page}&size=${SIZE}`)).json()
    if (!j.ok) return setMsg(j.message)
    setItems(j.items)
    setTotal(j.total)
  }, [base, page, prjId])
  useEffect(() => void load(), [load, rev])
  const loadDet = useCallback(
    async (id: string) => {
      const j = await (await piFetch(`${base}/${id}`)).json()
      if (!j.ok) return setMsg(j.message)
      setDet(j)
    },
    [base],
  )
  useEffect(() => {
    setDet(null)
    if (sel) void loadDet(sel)
  }, [sel, loadDet])

  const act = async (body: Record<string, unknown>, done: string) => {
    if (!det) return
    setBusy(true)
    const j = await (
      await piFetch(`${base}/${det.item.req_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    ).json()
    setBusy(false)
    setMsg(j.ok ? done : j.message)
    await Promise.all([load(), loadDet(det.item.req_id)])
  }
  const run = async () => {
    if (
      !det ||
      !window.confirm(
        `대상 DB 에 DDL 문장 ${det.item.stmt_cnt}개를 실행합니다.\n주의 : DDL 이 테이블마다 CREATE 직전 DROP … CASCADE 를 포함합니다 — 대상 DB 의 같은 이름 테이블과 데이터가 삭제되며 되돌릴 수 없습니다.\n계속할까요?`,
      )
    )
      return
    setBusy(true)
    setMsg('실행 중…')
    const j = await (
      await piFetch(`${base}/${det.item.req_id}/run`, { method: 'POST' })
    ).json()
    setBusy(false)
    setMsg(
      j.ok
        ? `실행 ${REQ_STS_NM[j.item.req_sts_cd]}`
        : `${j.message}${j.detail ? ` — ${j.detail}` : ''}`,
    )
    await Promise.all([load(), loadDet(det.item.req_id)])
  }
  const pages = Math.max(1, Math.ceil(total / SIZE))
  const sts = det?.item.req_sts_cd
  const tries = det
    ? [...new Set(det.stmts.map((s) => s.exec_try_no))].sort((a, b) => b - a)
    : []
  const TD = 'border-b px-3 py-1.5'

  return (
    <div className="text-dense">
      {msg && (
        <p role="status" className="mb-2 text-ink-2">
          {msg}
        </p>
      )}
      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full border-collapse text-dense">
          <thead>
            <tr className="thead-3d text-start">
              <th className="px-3 py-2 text-start">요청 일시</th>
              <th className="px-3 py-2 text-start">접속</th>
              <th className="px-3 py-2 text-end">테이블·문장</th>
              <th className="px-3 py-2 text-start">상태</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr
                key={r.req_id}
                onClick={() => setSel(r.req_id)}
                aria-selected={sel === r.req_id}
                className="cursor-pointer"
              >
                <td className={`${TD} whitespace-nowrap font-mono text-xs tabular-nums`}>
                  {r.reg_dtm.slice(0, 16).replace('T', ' ')}
                  {r.mine && (
                    <span className="ms-1 font-sans text-ink-3">(내 요청)</span>
                  )}
                </td>
                <td className={TD}>{r.conn_nm}</td>
                <td className={`${TD} text-end tabular-nums`}>
                  {r.tbl_ids.length} · {r.stmt_cnt}
                </td>
                <td className={TD}>
                  <span className="badge" data-tone={STS_TONE[r.req_sts_cd]}>
                    {REQ_STS_NM[r.req_sts_cd] ?? r.req_sts_cd}
                  </span>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-ink-3">
                  실행 요청 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1">
        <span className="me-auto font-mono text-xs text-ink-3 tabular-nums">
          총 {total.toLocaleString()}건 · {page} / {pages}
        </span>
        <button
          type="button"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          aria-label="이전"
          title="이전"
          className="btn-ghost btn-icon btn-sm"
        >
          <ChevronLeft className="rtl:rotate-180" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setPage(page + 1)}
          disabled={page >= pages}
          aria-label="다음"
          title="다음"
          className="btn-ghost btn-icon btn-sm"
        >
          <ChevronRight className="rtl:rotate-180" aria-hidden />
        </button>
      </div>

      {det && (
        <section
          className="mt-3 rounded-card border border-line p-3"
          aria-label="실행 요청 상세"
        >
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
            <span className="badge" data-tone={STS_TONE[det.item.req_sts_cd]}>
              {REQ_STS_NM[det.item.req_sts_cd]}
            </span>
            {det.item.exec_mthd_cd === 'SRV'
              ? '서버 직접 실행'
              : '로컬 에이전트 실행'}{' '}
            · 해시{' '}
            <span className="font-mono">{det.item.ddl_hash.slice(0, 8)}</span> ·
            시도 {det.item.exec_try_no}회
            {det.item.rjct_rsn && (
              <span className="text-danger">
                반려 사유 : {det.item.rjct_rsn}
              </span>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {sts === 'REQ' && det.can_approve && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (det.self_approve) {
                    // 데이터아키텍트 1명 분류체계 — 본인 승인은 사유를 남김(감사 이력)
                    const r = window.prompt(
                      '본인 승인 사유(5자 이상) — 이 분류체계의 데이터아키텍트가 1명이라 본인이 승인합니다',
                    )
                    if (r && r.trim().length >= 5)
                      void act(
                        {
                          act: 'approve',
                          expect_hash: det.item.ddl_hash,
                          self_rsn: r.trim(),
                        },
                        '본인 승인했습니다(사유 기록)',
                      )
                    else if (r !== null)
                      setMsg('본인 승인 사유를 5자 이상 입력하십시오')
                    return
                  }
                  if (window.confirm('표시된 DDL 그대로 실행을 승인할까요?\n주의 : DDL 이 테이블마다 CREATE 직전 DROP … CASCADE 를 포함합니다 — 대상 DB 의 같은 이름 테이블과 데이터가 삭제되며 되돌릴 수 없습니다.'))
                    void act(
                      { act: 'approve', expect_hash: det.item.ddl_hash },
                      '승인했습니다',
                    )
                }}
                className="btn-3d btn-sm"
              >
                {det.self_approve ? '본인 승인' : '승인'}
              </button>
            )}
            {sts === 'REQ' && det.mine && !det.can_approve && (
              <span className="text-xs text-ink-3">
                본인 요청은 다른 승인권자(시스템담당자·데이터아키텍트)가 승인합니다
              </span>
            )}
            {sts === 'REQ' && det.self_approve && (
              <span className="text-xs text-warn">
                데이터아키텍트가 1명인 분류체계라 본인 승인 가능(사유 필수·감사
                기록)
              </span>
            )}
            {(sts === 'REQ' || sts === 'APV') && det.can_approve && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const r = window.prompt('반려 사유')
                  if (r?.trim())
                    void act(
                      { act: 'reject', rjct_rsn: r.trim() },
                      '반려했습니다',
                    )
                }}
                className="btn-danger btn-sm"
              >
                반려
              </button>
            )}
            {(sts === 'REQ' || sts === 'APV') && det.mine && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void act({ act: 'cancel' }, '취소했습니다')}
                className="btn-key btn-sm"
              >
                요청 취소
              </button>
            )}
            {det.item.exec_mthd_cd === 'SRV' &&
              (sts === 'APV' || sts === 'FAIL' || sts === 'PART') && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run()}
                  className="btn-danger btn-sm"
                >
                  {sts === 'APV' ? 'DB 에 실행' : '다시 실행'}
                </button>
              )}
            {det.item.exec_mthd_cd === 'AGT' && sts === 'APV' && (
              <span className="text-xs text-ink-3">
                로컬 에이전트가 가져가 실행합니다(에이전트 실행 중이어야 함)
              </span>
            )}
            {det.item.exec_mthd_cd === 'AGT' &&
              (sts === 'FAIL' || sts === 'PART') && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      { act: 'retry' },
                      '다시 실행 대기 — 에이전트가 다음 확인 때 가져갑니다',
                    )
                  }
                  className="btn-key btn-sm"
                >
                  에이전트로 다시 실행
                </button>
              )}
            {sts === 'RUN' && (
              <span className="text-xs text-ink-3">
                실행 중 — 잠시 뒤 다시 불러오십시오
              </span>
            )}
          </div>
          {tries.map((t) => (
            <details key={t} open={t === tries[0]} className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-ink-2">
                시도 {t} 결과
              </summary>
              <div className="mt-1 overflow-x-auto rounded-card border border-line">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {det.stmts
                      .filter((s) => s.exec_try_no === t)
                      .map((s) => (
                        <tr
                          key={s.stmt_seq}
                          className={s.rslt_cd === 'ERR' ? 'bg-danger-soft' : ''}
                        >
                          <td className="border-b px-2 py-1 text-end font-mono text-ink-3 tabular-nums">
                            {s.stmt_seq}
                          </td>
                          <td className="border-b px-2 py-1 font-mono">
                            {s.stmt_txt.split('\n')[0].slice(0, 80)}
                          </td>
                          <td className={`border-b px-2 py-1 whitespace-nowrap ${s.rslt_cd === 'OK' ? 'text-ok' : s.rslt_cd === 'ERR' ? 'text-danger' : 'text-ink-3'}`}>
                            {RSLT_NM[s.rslt_cd] ?? s.rslt_cd}
                          </td>
                          <td className="border-b px-2 py-1 text-ink-2">
                            {s.err_msg
                              ? `${s.err_cd ?? ''} ${s.err_msg}`
                              : s.elapsed_ms != null
                                ? `${s.elapsed_ms}ms`
                                : ''}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-accent-ink hover:underline">요청 DDL 보기</summary>
            <pre className="paper mt-1 max-h-[40vh] overflow-auto rounded-card border border-line bg-well p-3 font-mono text-xs">
              {det.item.ddl_txt}
            </pre>
          </details>
        </section>
      )}
    </div>
  )
}
