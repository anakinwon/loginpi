// 백업·복구 수동 점검표(PRD 12 §9-3) — GET /api/ops/checks?link=&conn= / POST { linkId, connId, chkCd, doneYn, memoTxt? } (연결·접속·점검코드 1행 upsert)
//  점검코드 = src/lib/ops/params.ts MANUAL_CHECKS(고정 6개라 목록 페이지 없음)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { MANUAL_CHECKS } from '@/lib/ops/params'
import { opsParams } from '@/lib/ops/server'

type ChkRow = { chk_cd: string; done_yn: string; memo_txt: string | null; mod_dtm: string }
const toItem = (r: ChkRow) => ({ chkCd: r.chk_cd, done: r.done_yn === 'Y', memoTxt: r.memo_txt, modDtm: r.mod_dtm })

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const p = await opsParams(req, sp.get('link'), sp.get('conn'))
    if (p instanceof NextResponse) return p
    const { data, error } = await db()
      .from('dbm_ops_chk')
      .select('chk_cd, done_yn, memo_txt, mod_dtm')
      .eq('lnk_id', p.linkId)
      .eq('conn_id', p.connId)
      .eq('del_yn', 'N')
      .in('chk_cd', [...MANUAL_CHECKS])
    if (error) return dbFail(error)
    return NextResponse.json({ items: (data as ChkRow[]).map(toItem) })
  }),
)

const bodySchema = z.object({
  linkId: z.string(),
  connId: z.string(),
  chkCd: z.enum(MANUAL_CHECKS),
  done: z.boolean(),
  memoTxt: z.string().trim().max(500).nullish(),
})

export const POST = withGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body
    const p = await opsParams(req, body.linkId, body.connId)
    if (p instanceof NextResponse) return p
    const { data, error } = await db()
      .from('dbm_ops_chk')
      .upsert(
        {
          lnk_id: p.linkId,
          conn_id: p.connId,
          chk_cd: body.chkCd,
          done_yn: body.done ? 'Y' : 'N',
          memo_txt: body.memoTxt || null,
          del_yn: 'N',
          del_dtm: null,
          modr_id: p.usrId,
          mod_dtm: new Date().toISOString(),
        },
        { onConflict: 'lnk_id,conn_id,chk_cd' },
      )
      .select('chk_cd, done_yn, memo_txt, mod_dtm')
      .single()
    if (error) return dbFail(error)
    return NextResponse.json({ item: toItem(data as ChkRow) })
  }),
)
