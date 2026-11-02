// 모델↔DB GAP분석 실행 — POST /api/drift/run { link, conn, prjId, prjNm?, schema? }. PRD 12 §5-3(DDL 적용 대조)·§5-4(설계 인덱스 사용 효과)
//  schema.pi 모델·DDL 이력 + 접속 카탈로그·인덱스 통계를 한 번에(병렬) 받아 순수 대조(lib/drift/diff) → 건수만 dbm_drift_run 에 저장(행 데이터 없음, A3)
//  대조 범위 = 지정 스키마(기본 public) — 전 스키마면 Supabase 내부(auth·storage…)가 섞이고 500행 상한에 public 이 잘린다
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { db, dbRoute, parseBody } from '@/lib/api'
import {
  linkErrorResponse,
  linkGet,
  linkQuery,
  requireLink,
} from '@/lib/link/client'
import {
  diffModel,
  dropUncheckedCols,
  pageAll,
  parseColumns,
  parseIdxStats,
  parseIndexes,
  parseStatsReset,
  parseTables,
  projectPrefix,
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
  schema: z.string().trim().min(1).max(128).default('public'),
})

export const POST = withGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, Body)
    if (body instanceof NextResponse) return body
    const ctx = await requireLink(req, body.link, 'DRIFT_RUN')
    if (ctx instanceof Response) return ctx as NextResponse

    const prj = encodeURIComponent(body.prjId)
    let result: DriftResult
    let statsMissing = false
    let truncated: string[] = []
    let colUnchecked = 0
    let prjPfx: string | null = null
    try {
      // R-P1 — 7개 조회는 서로 독립. idx_stats·db_stats 는 없어도 대조 가능(사용 효과만 '통계 없음'·관찰 기간 미상)
      //  ddl-history 는 상한 50건(기본 20건이면 오래된 요청이 빠져 대조 범위가 임의로 바뀜)
      //  카탈로그 4종은 500행 상한을 offset 순회(pageAll) — 큰 스키마에서 잘린 뒤쪽 테이블이 오탐으로 잡히지 않게
      const page = (
        q:
          | 'catalog_tables'
          | 'catalog_columns'
          | 'catalog_indexes'
          | 'idx_stats',
      ) =>
        pageAll((offset) =>
          linkQuery(ctx.linkId, body.conn, q, { schema: body.schema, offset }),
        )
      const [model, ddl, tblP, colP, idxP, statP, dbStats] = await Promise.all([
        linkGet<Model>(ctx.linkId, `/model?prjId=${prj}`),
        linkGet<DdlReq[]>(ctx.linkId, `/ddl-history?prjId=${prj}&limit=50`),
        page('catalog_tables'),
        page('catalog_columns'),
        page('catalog_indexes'),
        page('idx_stats').catch(() => null),
        linkQuery(ctx.linkId, body.conn, 'db_stats').catch(() => null),
      ])
      const [tbls, cols, idxs, stats] = [tblP.r, colP.r, idxP.r, statP?.r]
      statsMissing = !stats
      truncated = Object.entries({
        catalog_tables: tblP,
        catalog_columns: colP,
        catalog_indexes: idxP,
        idx_stats: statP,
      })
        .filter(([, v]) => v?.cut)
        .map(([k]) => k)
      prjPfx = projectPrefix(model)
      result = diffModel({
        model,
        ddl,
        connId: body.conn,
        tables: parseTables(tbls),
        columns: parseColumns(cols),
        indexes: parseIndexes(idxs),
        stats: stats ? parseIdxStats(stats) : [],
        statsReset: parseStatsReset(dbStats),
      })
      if (colP.cut) colUnchecked = dropUncheckedCols(result)
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
    if (error)
      console.error('[drift] 이력 저장 실패', error.code, error.message) // 탐지 결과는 그대로 돌려준다

    const capped = Object.fromEntries(
      Object.entries(result).map(([k, v]) => [
        k,
        (v as unknown[]).slice(0, LIST_CAP),
      ]),
    ) as DriftResult
    return NextResponse.json({
      runId: data?.drift_run_id ?? null,
      runDtm: data?.run_dtm ?? null,
      saved: !error,
      statsMissing,
      truncated, // offset 순회 상한(PAGE_MAX 페이지)에도 잘린 조회 — 화면 경고
      colUnchecked, // 칼럼 조회 절단으로 요약에서 뺀 칼럼 누락·추가 건수(확인 불가)
      schema: body.schema,
      prjPfx,
      summary,
      result: capped,
      cap: LIST_CAP,
    })
  }),
)
