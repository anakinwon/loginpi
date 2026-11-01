// 느린 쿼리 출처 표본 저장·읽기(sql/032 dbm_prf_qry_src) — 보드(fast)·활동 탭이 이미 받은 activity 행을 after() 로 병합(새 대상 DB 조회 없음)
//  저장 = 계정·앱명·마스킹 주소·백엔드유형·표본수만(쿼리문·원 IP 없음, 계약 A3). query_id 미수집 원인은 인스턴스 캐시(best-effort)
import 'server-only'
import { db } from '@/lib/api'
import { cacheGet, cacheSet } from '@/lib/monitor/board-server'
import type { ActRow } from '@/lib/monitor/signals'
import {
  maskAddr,
  qidCause,
  type QidCause,
  type SrcSample,
} from '@/lib/perf/source'

const CAP = 200 // 1회 표본 상한(activity 탭 CAP 과 동일)
const READ_MAX = 1000 // 한 페이지(20건) 표본 읽기 상한
const QID_TTL = 30 * 60_000 // ponytail: 인스턴스 로컬 캐시 — 다른 인스턴스·콜드 스타트면 원인 null(화면은 '표본 없음' 일반 안내)
// linkUsr = 연결 계정명(activity current_user — 권한 안내 GRANT 문에 넣음, schema.pi 구버전이면 null)
export type QidInfo = {
  cause: QidCause
  verNum: number | null
  linkUsr: string | null
}
const qidKey = (linkId: string, connId: string) => `${linkId}:${connId}:qid`

export const readQid = (linkId: string, connId: string) =>
  cacheGet<QidInfo>(qidKey(linkId, connId))

// after() 안에서 호출 — 실패는 로그만(스냅샷 writeSnap 과 같은 정책)
export async function writeQrySrc(
  linkId: string,
  connId: string,
  usrId: string,
  act: ActRow[],
  verNum: number | null,
) {
  const cause = qidCause(act, verNum)
  // 버전을 모르는 채(활동 탭 + 보드 캐시 없음) 'off' 로 단정하지 않는다 — PG13 일 수 있음
  if (cause && (cause !== 'off' || verNum != null))
    cacheSet(qidKey(linkId, connId), QID_TTL, {
      cause,
      verNum,
      linkUsr: act.find((r) => r.linkUsr)?.linkUsr ?? null,
    } satisfies QidInfo)
  const rows = act
    .filter((r) => r.backendType === 'client backend' && r.queryId)
    .slice(0, CAP)
    .map((r) => ({
      lnk_id: linkId,
      conn_id: connId,
      qry_id: r.queryId,
      usr_nm: r.usename ?? '',
      app_nm: r.appNm ?? '',
      clnt_addr_msk: maskAddr(r.clientAddr),
      bknd_tp: r.backendType,
      actv_yn: r.state === 'active',
    }))
  if (!rows.length) return
  const { error } = await db().rpc('fn_dbm_prf_qry_src_merge', {
    p_rows: rows,
    p_usr_id: usrId || 'ADMIN',
  })
  if (error) console.error('[perf] qry src write', error.code, error.message)
}

// 페이지 쿼리ID들의 표본(쿼리ID → 표본[]). 실패(032 미적용 등)는 빈 Map — 느린 쿼리 목록은 막지 않는다
export async function readQrySrc(
  linkId: string,
  connId: string,
  qryIds: string[],
): Promise<Map<string, SrcSample[]>> {
  const out = new Map<string, SrcSample[]>()
  if (!qryIds.length) return out
  const { data, error } = await db()
    .from('dbm_prf_qry_src')
    .select(
      'qry_id, usr_nm, app_nm, clnt_addr_msk, bknd_tp, smp_cnt, actv_smp_cnt, fst_dtm, lst_dtm',
    )
    .eq('lnk_id', linkId)
    .eq('conn_id', connId)
    .eq('del_yn', 'N')
    .in('qry_id', qryIds)
    .order('actv_smp_cnt', { ascending: false })
    .order('smp_cnt', { ascending: false })
    .limit(READ_MAX)
  if (error) {
    console.error('[perf] qry src read', error.code, error.message)
    return out
  }
  for (const r of data) {
    const list = out.get(r.qry_id) ?? []
    list.push({
      usrNm: r.usr_nm || null,
      appNm: r.app_nm || null,
      bkndTp: r.bknd_tp,
      addr: r.clnt_addr_msk,
      smpCnt: Number(r.smp_cnt),
      actvCnt: Number(r.actv_smp_cnt),
      fstDtm: r.fst_dtm,
      lstDtm: r.lst_dtm,
    })
    out.set(r.qry_id, list)
  }
  return out
}
