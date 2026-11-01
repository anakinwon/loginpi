// 모델↔DB 정합 탐지 실행 — POST /api/drift/run { link, conn, prjId, prjNm? }. PRD 12 §5-3(DDL 적용 대조)·§5-4(설계 인덱스 사용 효과)
//  schema.pi 모델·DDL 이력 + 접속 카탈로그·인덱스 통계를 한 번에(병렬) 받아 순수 대조(lib/drift/diff) → 건수만 dbm_drift_run 에 저장(행 데이터 없음, A3)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { db, dbRoute, parseBody } from '@/lib/api'
import { linkErrorResponse, linkGet, linkQuery, requireLink } from '@/lib/link/client'
import {
  diffModel,
  parseColumns,
  parseIdxStats,
  parseIndexes,
  parseTables,
  summarize,
  type DdlReq,
  type DriftResult,
  type Model,
} from '@/lib/drift/diff'

// 화면에 보내는 항목 상한(건수는 요약에 전부) — 큰 스키마에서 응답 비대 방지
const LIST_CAP = 300

const Body = z.object({
  link: z.string().uuid(),
  conn: z.string().min(1).max(100),
  prjId: z.string().min(1).max(100),
  prjNm: z.string().max(200).optional(),
})

export const POST = withGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, Body)
    if (body instanceof NextResponse) return body
    const ctx = await requireLink(req, body.link)
    if (ctx instanceof Response) return ctx as NextResponse

    const prj = encodeURIComponent(body.prjId)
    let result: DriftResult
    let statsMissing = false
    try {
      // R-P1 — 6개 조회는 서로 독립. idx_stats 는 없어도 대조 가능(사용 효과만 '통계 없음')
      const [model, ddl, tbls, cols, idxs, stats] = await Promise.all([
        linkGet<Model>(ctx.linkId, `/model?prjId=${prj}`),
        linkGet<DdlReq[]>(ctx.linkId, `/ddl-history?prjId=${prj}`),
        linkQuery(ctx.linkId, body.conn, 'catalog_tables'),
        linkQuery(ctx.linkId, body.conn, 'catalog_columns'),
        linkQuery(ctx.linkId, body.conn, 'catalog_indexes'),
        linkQuery(ctx.linkId, body.conn, 'idx_stats').catch(() => null),
      ])
      statsMissing = !stats
      result = diffModel({
        model,
        ddl,
        connId: body.conn,
        tables: parseTables(tbls),
        columns: parseColumns(cols),
        indexes: parseIndexes(idxs),
        stats: stats ? parseIdxStats(stats) : [],
      })
    } catch (e) {
      return linkErrorResponse(e)
    }

    const summary = summarize(result)
    // 등록자·변경자 = 세션 사용자(requireLink 가 돌려준 usrId — 세션 재조회 없음, R-P2)
    const { data, error } = await db()
      .from('dbm_drift_run')
      .insert({
        lnk_id: ctx.linkId,
        conn_id: body.conn,
        prj_id: body.prjId,
        prj_nm: body.prjNm ?? null,
        smry_json: summary,
        regr_id: ctx.usrId || 'ADMIN',
        modr_id: ctx.usrId || 'ADMIN',
      })
      .select('drift_run_id, run_dtm')
      .maybeSingle()
    if (error) console.error('[drift] 이력 저장 실패', error.code, error.message) // 탐지 결과는 그대로 돌려준다

    const capped = Object.fromEntries(
      Object.entries(result).map(([k, v]) => [k, (v as unknown[]).slice(0, LIST_CAP)]),
    ) as DriftResult
    return NextResponse.json({
      runId: data?.drift_run_id ?? null,
      runDtm: data?.run_dtm ?? null,
      saved: !error,
      statsMissing,
      summary,
      result: capped,
      cap: LIST_CAP,
    })
  }),
)
