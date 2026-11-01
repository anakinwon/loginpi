// PiCDC 원천 사전 점검 — POST /api/pipeline/precheck { link, conn, schema? }. PRD 12 §7-1(CDC-R00)
//  카탈로그 3종 + 설정 + 복제 상태를 병렬 조회(R-P1) → 순수 판정(lib/pipeline/precheck). 저장 없음(행 데이터·스냅샷 없음, A3)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { dbRoute, parseBody } from '@/lib/api'
import { linkErrorResponse, linkQuery, requireLink } from '@/lib/link/client'
import { classify, readiness, summarize } from '@/lib/pipeline/precheck'

// schema.pi 이름 붙인 조회 상한(MAX_ROWS) — 이 건수에 닿으면 잘림 표시(스키마를 좁혀 다시)
const ROW_CAP = 500

const Body = z.object({
  link: z.string().uuid(),
  conn: z.string().min(1).max(100),
  schema: z.string().trim().min(1).max(128).optional(),
})

export const POST = withGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, Body)
    if (body instanceof NextResponse) return body
    const ctx = await requireLink(req, body.link)
    if (ctx instanceof Response) return ctx as NextResponse

    const p = body.schema ? { schema: body.schema } : undefined
    try {
      // ponytail: 카탈로그 첫 페이지(500행)만 — 큰 DB 는 schema 로 좁힌다. 전 페이지 순회는 워커 단계에서
      // settings·replication 은 권한 부족 등으로 실패해도 테이블 판정은 가능(준비 상태만 '알 수 없음')
      const [tbls, cols, idxs, settings, repl] = await Promise.all([
        linkQuery(ctx.linkId, body.conn, 'catalog_tables', p),
        linkQuery(ctx.linkId, body.conn, 'catalog_columns', p),
        linkQuery(ctx.linkId, body.conn, 'catalog_indexes', p),
        linkQuery(ctx.linkId, body.conn, 'settings').catch(() => null),
        linkQuery(ctx.linkId, body.conn, 'replication').catch(() => null),
      ])
      const ready = readiness(settings, repl)
      const items = classify(tbls, cols, idxs, ready)
      return NextResponse.json({
        ready,
        summary: summarize(items),
        items,
        truncated: [tbls, cols, idxs].some((r) => r.rows.length >= ROW_CAP),
      })
    } catch (e) {
      return linkErrorResponse(e)
    }
  }),
)
