// 연결 API — GET /api/link/v1/ddl-history?prjId=&offset=&limit= : 프로젝트 DDL 실행 요청(최신순, 기본 20·최대 50) + 마지막 시도의 문장별 결과
import { z } from 'zod'
import { db } from '@/lib/db'
import { linkFail, linkOk, linkRoute, pageOf } from '@/lib/link/auth'

type Req = { req_id: string; req_sts_cd: string; conn_id: string; reg_dtm: string; exec_try_no: number }
type Stmt = { req_id: string; exec_try_no: number; stmt_seq: number; stmt_txt: string; rslt_cd: string; reg_dtm: string }

export const GET = linkRoute(async (req, a) => {
  const prjId = new URL(req.url).searchParams.get('prjId')
  if (!z.string().uuid().safeParse(prjId).success) return linkFail('INVALID_INPUT', 400)
  const { off, lim } = pageOf(req, 20, 50)
  const r = await db().from('mdl_ddl_req').select('req_id, req_sts_cd, conn_id, reg_dtm, exec_try_no').eq('area_id', a.areaId).eq('prj_id', prjId!).eq('del_yn', 'N').order('reg_dtm', { ascending: false }).range(off, off + lim - 1)
  if (r.error) throw r.error
  const reqs = r.data as Req[]
  if (!reqs.length) return linkOk([])
  // 문장은 요청 목록이 있어야 조회 가능(직렬 필요) — 요청 50건 이하라 .in() 1회
  const s = await db().from('mdl_ddl_exec_stmt').select('req_id, exec_try_no, stmt_seq, stmt_txt, rslt_cd, reg_dtm').eq('area_id', a.areaId).in('req_id', reqs.map((x) => x.req_id)).eq('del_yn', 'N').order('stmt_seq').limit(10000)
  if (s.error) throw s.error
  const lastTry = new Map(reqs.map((x) => [x.req_id, x.exec_try_no]))
  const by = new Map<string, { seq: number; stmtTxt: string; rsltCd: string; endDtm: string }[]>()
  for (const x of s.data as Stmt[]) if (x.exec_try_no === lastTry.get(x.req_id)) by.set(x.req_id, [...(by.get(x.req_id) ?? []), { seq: x.stmt_seq, stmtTxt: x.stmt_txt, rsltCd: x.rslt_cd, endDtm: x.reg_dtm }])
  return linkOk(reqs.map((x) => ({ reqId: x.req_id, stsCd: x.req_sts_cd, connId: x.conn_id, reqDtm: x.reg_dtm, stmts: by.get(x.req_id) ?? [] })))
})
