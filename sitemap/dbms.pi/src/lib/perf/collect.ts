// 성능 수집 1회 본체(PRD 12 §3-1, ANL-R02, sql/020) — 수동(POST /api/perf/collect)·자동(크론 GET /api/cron/perf-collect) 공용
//  이름 붙인 조회 5종(top_sql·tbl_stats·idx_stats·sizes·db_stats) 병렬 → dbm_prf_clct 1행 + 쿼리·테이블·인덱스 자식 행. 통계 수치만(행 데이터 없음, 계약 A3)
//  top_sql 만 PGSS_MISSING 허용(pgss_yn='N'로 저장). 연결 실패 = LinkError throw, DB 실패 = { ok:false, dbErr }(자식 저장 실패 시 수집 행 논리삭제)
//  actor = 등록자(수동 = 세션 사용자, 자동 = AUTO_ACTOR 'SYSTEM' — 무료 하루 수동 수집 횟수에서 제외)
import 'server-only'
import { db } from '@/lib/api'
import { LinkError, linkQuery } from '@/lib/link/client'
import { maskLiterals } from './calc'
import { isNoCol, num, numOrNull, pick, str, toObjs, type Obj } from './server'

const MAX_QRY = 100 // 저장할 쿼리 상위 건수(조회 상한 500행 안)

export type CollectRes =
  | { ok: true; clctId: string; clctDtm: string; pgss: boolean; qryCnt: number; tblCnt: number; idxCnt: number }
  | { ok: false; dbErr: { code?: string; message?: string } }

const toDtm = (v: unknown) => {
  const d = v ? new Date(String(v)) : null
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
}

// sql/034(블록)·033(max_ms)·032(usr_nm) 미적용 DB 에 코드가 먼저 배포돼도 수집은 계속 — 칼럼 없음(42703·PGRST204)이면 새 칼럼부터 빼고 재시도
const NEW_COLS = [
  ['blks_hit_cnt', 'blks_read_cnt', 'tmp_blks_wrt_cnt'],
  ['max_ms'],
  ['usr_nm'],
]
async function insQry(rows: Record<string, unknown>[]) {
  const ins = (rs: Record<string, unknown>[]) => db().from('dbm_prf_qry').insert(rs)
  let rs = rows
  let r = await ins(rs)
  for (const cols of NEW_COLS) {
    if (!isNoCol(r.error)) return r
    rs = rs.map((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !cols.includes(k))))
    r = await ins(rs)
  }
  return r
}

export async function collectOnce(linkId: string, connId: string, actor: string): Promise<CollectRes> {
  const [topR, tblR, idxR, szR, dbR] = await Promise.all([
    linkQuery(linkId, connId, 'top_sql').catch((e: unknown) => {
      if (e instanceof LinkError && e.code === 'PGSS_MISSING') return null
      throw e
    }),
    linkQuery(linkId, connId, 'tbl_stats'),
    linkQuery(linkId, connId, 'idx_stats'),
    linkQuery(linkId, connId, 'sizes'),
    linkQuery(linkId, connId, 'db_stats'),
  ])
  const qrys = topR ? toObjs(topR) : []
  const sizes = toObjs(szR)
  const dbRow: Obj = toObjs(dbR)[0] ?? {}

  // sizes : 테이블별 크기(relname·total_bytes) 또는 DB 전체 크기 행 — 둘 다 받는다
  const tblSz = new Map<string, number>()
  let dbSz = numOrNull(pick(dbRow, 'db_size', 'db_sz_byte', 'database_size', 'size_bytes'))
  for (const s of sizes) {
    const nm = str(pick(s, 'relname', 'tbl_nm', 'table_name'))
    const b = numOrNull(pick(s, 'total_bytes', 'total_size', 'tot_sz_byte', 'size_bytes', 'bytes'))
    if (nm && b !== null) tblSz.set(nm, b)
    else if (dbSz === null) dbSz = numOrNull(pick(s, 'db_size', 'database_size', 'db_sz_byte'))
  }
  if (dbSz === null && tblSz.size) dbSz = [...tblSz.values()].reduce((a, b) => a + b, 0)

  const ins = await db()
    .from('dbm_prf_clct')
    .insert({
      lnk_id: linkId,
      conn_id: connId,
      stat_reset_dtm: toDtm(pick(qrys[0] ?? {}, 'stats_reset') ?? pick(dbRow, 'stats_reset', 'stat_reset_dtm')),
      pgss_yn: topR ? 'Y' : 'N',
      db_sz_byte: dbSz,
      regr_id: actor,
      modr_id: actor,
    })
    .select('clct_id, clct_dtm')
    .single()
  if (ins.error) return { ok: false, dbErr: ins.error }
  const clctId = ins.data.clct_id as string

  const qryRows = qrys.slice(0, MAX_QRY).map((o, i) => {
    const calls = num(pick(o, 'calls', 'call_cnt'))
    const totalMs = num(pick(o, 'total_exec_time', 'total_time', 'total_ms'))
    const txt = str(pick(o, 'query', 'qry_txt'))
    return {
      clct_id: clctId,
      qry_seq: i + 1,
      qry_id: str(pick(o, 'queryid', 'qry_id')) ?? `#${i + 1}`,
      usr_nm: str(pick(o, 'usr_nm')), // 계정(schema.pi top_sql — 미승격이면 null, sql/032)
      qry_txt: txt ? maskLiterals(txt).slice(0, 4000) : null,
      call_cnt: calls,
      tot_ms: totalMs,
      avg_ms: num(pick(o, 'mean_exec_time', 'mean_time', 'mean_ms')) || (calls ? totalMs / calls : 0),
      row_cnt: num(pick(o, 'rows', 'row_cnt')),
      // 1회 최고(리셋 이후 누적 최고치 그대로 — 증감 불가, sql/033). 값이 없으면 null
      max_ms: numOrNull(pick(o, 'max_exec_time', 'max_time', 'max_ms')),
      // 블록 수(누적치 그대로 — 증감은 조회 때, sql/034). 원인 진단의 디스크 읽기·임시 파일 넘침 근거
      blks_hit_cnt: numOrNull(pick(o, 'shared_blks_hit')),
      blks_read_cnt: numOrNull(pick(o, 'shared_blks_read')),
      tmp_blks_wrt_cnt: numOrNull(pick(o, 'temp_blks_written')),
    }
  })
  const tblRows = toObjs(tblR).map((o, i) => {
    const nm = str(pick(o, 'relname', 'tbl_nm', 'table_name')) ?? '?'
    return {
      clct_id: clctId,
      tbl_seq: i + 1,
      schm_nm: str(pick(o, 'schemaname', 'schm_nm')),
      tbl_nm: nm,
      full_scan_cnt: num(pick(o, 'seq_scan', 'full_scan_cnt')),
      idx_scan_cnt: num(pick(o, 'idx_scan', 'idx_scan_cnt')),
      live_tup_cnt: num(pick(o, 'n_live_tup', 'live_tup_cnt')),
      dead_tup_cnt: num(pick(o, 'n_dead_tup', 'dead_tup_cnt')),
      tot_sz_byte: numOrNull(pick(o, 'total_bytes', 'tot_sz_byte')) ?? tblSz.get(nm) ?? null,
    }
  })
  const idxRows = toObjs(idxR).map((o, i) => ({
    clct_id: clctId,
    idx_seq: i + 1,
    schm_nm: str(pick(o, 'schemaname', 'schm_nm')),
    tbl_nm: str(pick(o, 'relname', 'tbl_nm', 'table_name')) ?? '?',
    idx_nm: str(pick(o, 'indexrelname', 'idx_nm', 'index_name')) ?? '?',
    idx_scan_cnt: num(pick(o, 'idx_scan', 'idx_scan_cnt')),
    idx_sz_byte: numOrNull(pick(o, 'idx_size', 'index_bytes', 'idx_sz_byte', 'size_bytes')),
  }))

  const results = await Promise.all([
    qryRows.length ? insQry(qryRows) : null,
    tblRows.length ? db().from('dbm_prf_tbl').insert(tblRows) : null,
    idxRows.length ? db().from('dbm_prf_idx').insert(idxRows) : null,
  ])
  const failed = results.find((r) => r?.error)?.error
  if (failed) {
    await db()
      .from('dbm_prf_clct')
      .update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: actor })
      .eq('clct_id', clctId)
    return { ok: false, dbErr: failed }
  }
  return {
    ok: true,
    clctId,
    clctDtm: ins.data.clct_dtm as string,
    pgss: !!topR,
    qryCnt: qryRows.length,
    tblCnt: tblRows.length,
    idxCnt: idxRows.length,
  }
}
