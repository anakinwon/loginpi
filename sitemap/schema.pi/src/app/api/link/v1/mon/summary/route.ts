// 연결 API — GET /api/link/v1/mon/summary?min= : schema.pi 모니터링 요약(읽기 연계, 결정 D7) — 저장된 이력만 읽음(대상 DB·URL 에 새로 접속하지 않음, R-P4)
//  app = schema.pi 앱 트래픽 합계(경로별 상세 없음) / db = 이 분류체계 접속별 구간 마지막 지표 + 구간 캐시 적중률 / url = 이 분류체계 URL 별 마지막 상태·오류 수
import { db as sb } from '@/lib/db'
import { linkOk, linkRoute } from '@/lib/link/auth'
import { hitPct } from '@/lib/mon'
import { appView, urlView } from '@/lib/mon-srv'

type DbRow = { conn_id: string; bkt_dtm: string; sess_cnt: number; lock_wait_cnt: number; blks_hit_cnt: number | string | null; blks_read_cnt: number | string | null; db_sz: number | string | null }
const n = (v: number | string | null) => (v == null ? 0 : Number(v))

export const GET = linkRoute(async (req, a) => {
  const min = Math.min(1440, Math.max(5, Number(new URL(req.url).searchParams.get('min')) || 60))
  const since = new Date(Date.now() - min * 60000).toISOString()
  const [app, d, u] = await Promise.all([
    appView(min),
    sb().from('mon_db_hist').select('conn_id, bkt_dtm, sess_cnt, lock_wait_cnt, blks_hit_cnt, blks_read_cnt, db_sz').eq('area_id', a.areaId).gte('bkt_dtm', since).order('bkt_dtm').limit(5000),
    urlView(a.areaId, min),
  ])
  if (d.error) throw d.error
  const tot = app.reduce((s, x) => ({ req: s.req + x.req_cnt, err: s.err + x.err_cnt, slow: s.slow + x.slow_cnt, rsp: s.rsp + Number(x.rsp_sum_val), max: Math.max(s.max, x.rsp_max_val) }), { req: 0, err: 0, slow: 0, rsp: 0, max: 0 })
  const byConn = new Map<string, DbRow[]>()
  for (const x of d.data as DbRow[]) byConn.set(x.conn_id, [...(byConn.get(x.conn_id) ?? []), x])
  const dbs = [...byConn].map(([connId, rs]) => {
    const f = rs[0], l = rs[rs.length - 1]
    return { connId, bktDtm: l.bkt_dtm, sessCnt: l.sess_cnt, lockWaitCnt: l.lock_wait_cnt, cacheHitPct: rs.length > 1 ? hitPct(n(f.blks_hit_cnt), n(f.blks_read_cnt), n(l.blks_hit_cnt), n(l.blks_read_cnt)) : null, dbSz: l.db_sz == null ? null : String(l.db_sz) }
  })
  type UH = { url_id: string; bkt_dtm: string; sts_no: number; rsp_val: number; err_txt: string | null }
  const hist = u.hist as UH[]
  const url = (u.urls as { url_id: string; url_nm: string; use_yn: string }[]).map((x) => {
    const hs = hist.filter((h) => h.url_id === x.url_id)
    const l = hs[hs.length - 1]
    return { urlId: x.url_id, urlNm: x.url_nm, useYn: x.use_yn, lstDtm: l?.bkt_dtm ?? null, lstSts: l?.sts_no ?? null, lstRspMs: l?.rsp_val ?? null, chkCnt: hs.length, errCnt: hs.filter((h) => h.sts_no === 0 || h.sts_no >= 400).length }
  })
  return linkOk({ min, app: { reqCnt: tot.req, errCnt: tot.err, slowCnt: tot.slow, avgRspMs: tot.req ? Math.round(tot.rsp / tot.req) : null, maxRspMs: tot.max }, db: dbs, url })
})
