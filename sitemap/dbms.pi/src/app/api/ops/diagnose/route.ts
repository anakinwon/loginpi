// DB 운영 안전 진단(PRD 12 §9-1~9-4) — POST /api/ops/diagnose { linkId, connId }
//  이름 붙인 조회 6종(settings·roles·table_privs·archiver·replication·version) 병렬 → 순수 규칙(src/lib/ops/params.ts) 판정 → dbm_ops_run 1행 저장
//  조회 하나가 실패해도 그 절만 오류 코드로 표시, 전부 실패면 연결 오류 응답. 읽기 전용(설정 변경 없음), 행 데이터 저장 없음(계약 A3)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { LinkError, linkQuery, type QueryName, type QueryResult } from '@/lib/link/client'
import {
  auditRoles,
  backupChecks,
  countLevels,
  diagnoseParams,
  replicationStatus,
  type Archiver,
  type Finding,
  type Priv,
  type Replica,
  type Role,
  type Setting,
} from '@/lib/ops/params'
import { linkFail, opsParams, toObjs, type Obj } from '@/lib/ops/server'

const bodySchema = z.object({ linkId: z.string(), connId: z.string() })
const MAX_ROWS = 500 // schema.pi 이름 붙인 조회 1회 상한 — 같으면 잘렸을 수 있음
const QS: QueryName[] = ['settings', 'roles', 'table_privs', 'archiver', 'replication', 'version']

const bool = (v: unknown) => v === true || v === 't' || v === 'true'
const s = (v: unknown) => (v === null || v === undefined ? null : String(v))

export const POST = withGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body
    const p = await opsParams(req, body.linkId, body.connId)
    if (p instanceof NextResponse) return p

    const res = await Promise.all(QS.map((q) => linkQuery(p.linkId, p.connId, q).catch((e: unknown) => e)))
    const errs = res.filter((r): r is LinkError => r instanceof LinkError)
    if (errs.length === res.length) return linkFail(errs[0])
    const other = res.find((r) => r instanceof Error && !(r instanceof LinkError))
    if (other) throw other
    const [setR, roleR, privR, arcR, replR, verR] = res.map((r) => (r instanceof LinkError ? r : (r as QueryResult)))
    const ok = (r: QueryResult | LinkError): r is QueryResult => !(r instanceof LinkError)
    const errOf = (...rs: (QueryResult | LinkError)[]) => (rs.find((r) => r instanceof LinkError) as LinkError | undefined)?.code ?? null

    const settings: Setting[] = ok(setR) ? toObjs(setR).map((o) => ({ name: String(o.name), setting: s(o.setting), unit: s(o.unit) })) : []
    const ver: Obj = ok(verR) ? (toObjs(verR)[0] ?? {}) : {}
    const inRecovery = ok(verR) ? bool(ver.in_recovery) : null

    const params = ok(setR) ? { findings: diagnoseParams(settings) } : { error: errOf(setR) }
    const audit =
      ok(roleR) && ok(privR)
        ? {
            findings: auditRoles(
              toObjs(roleR).map((o) => ({ rolname: String(o.rolname), rolsuper: bool(o.rolsuper), rolcanlogin: bool(o.rolcanlogin), rolbypassrls: bool(o.rolbypassrls), rolvaliduntil: s(o.rolvaliduntil) }) satisfies Role),
              toObjs(privR).map((o) => ({ grantee: String(o.grantee), table_schema: String(o.table_schema), table_name: String(o.table_name), privilege_type: String(o.privilege_type) }) satisfies Priv),
            ),
            truncated: roleR.rows.length >= MAX_ROWS || privR.rows.length >= MAX_ROWS,
          }
        : { error: errOf(roleR, privR) }
    const arcO = ok(arcR) ? toObjs(arcR)[0] : undefined
    const backup =
      ok(arcR) || ok(setR)
        ? {
            findings: backupChecks(
              arcO
                ? ({
                    archived_count: Number(arcO.archived_count ?? 0),
                    last_archived_time: s(arcO.last_archived_time),
                    failed_count: Number(arcO.failed_count ?? 0),
                    last_failed_time: s(arcO.last_failed_time),
                    archive_mode: s(arcO.archive_mode),
                  } satisfies Archiver)
                : null,
              settings,
            ),
            arcError: ok(arcR) ? null : errOf(arcR),
          }
        : { error: errOf(arcR) }
    const repl = ok(replR)
      ? replicationStatus(
          toObjs(replR).map((o) => ({ application_name: s(o.application_name), client_addr: s(o.client_addr), state: s(o.state), sync_state: s(o.sync_state), replay_lag: s(o.replay_lag) }) satisfies Replica),
          // version 실패 시 replication 행의 in_recovery 로 보완(행이 없으면 모름)
          inRecovery ?? (replR.rows.length ? bool(toObjs(replR)[0].in_recovery) : null),
        )
      : { error: errOf(replR) }

    const all: Finding[] = [
      ...(('findings' in params && params.findings) || []),
      ...(('findings' in audit && audit.findings) || []),
      ...(('findings' in backup && backup.findings) || []),
      ...('summary' in repl ? [repl.summary] : []),
    ]
    const cnt = countLevels(all)
    const rslt = { version: s(ver.version), params, audit, backup, repl }

    const ins = await db()
      .from('dbm_ops_run')
      .insert({ lnk_id: p.linkId, conn_id: p.connId, ok_cnt: cnt.ok, warn_cnt: cnt.warn, risk_cnt: cnt.risk, rslt_json: rslt })
      .select('run_id, run_dtm')
      .single()
    if (ins.error) return dbFail(ins.error)
    return NextResponse.json({ runId: ins.data.run_id, runDtm: ins.data.run_dtm, ...cnt, rslt })
  }),
)
