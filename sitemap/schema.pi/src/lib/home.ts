// 메인 대시보드 로더(서버, 마스터 지시 2026-10-21) — 로그인 사용자가 마지막에 고른 분류체계(sys_user.lst_area_id, sql/067)를 기준으로
// 내 분류체계 목록 + 그 분류체계의 역할·권한·요금제 + 권한별 건수(승인 대기·내 신청·표준 현황·모델)·최근 변경 5건
// 건수는 head 조회(count 만, 행 전송 없음). 권한이 없는 항목은 조회하지 않고 null(화면이 카드를 숨김)
import 'server-only'
import { db } from './db'
import { requireAreaRole, type CurrentUser } from './api'
import { AUDIT_NM_KEYS } from './roles'

// 분류체계 화면 진입·대시보드 선택 때 기록 — 같은 값이면 쓰지 않음(mod_dtm 갱신 최소화)
//  GET 에서 쓰기를 하는 이유 : 하단 메뉴가 화면마다 GET /api/areas/[areaId] 를 부르므로 별도 호출·버튼 없이 '마지막으로 연 분류체계'가 남음(값이 같으면 0행 갱신)
export async function rememberArea(usrId: string, areaId: string) {
  const { error } = await db().from('sys_user').update({ lst_area_id: areaId }).eq('usr_id', usrId).or(`lst_area_id.is.null,lst_area_id.neq.${areaId}`)
  if (error) console.error('[home] rememberArea', error.code, error.message) // 기록 실패가 화면을 막지 않게
}

type Cnt = PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>
const n = async (q: Cnt) => {
  const r = await q
  if (r.error) throw r.error
  return r.count ?? 0
}
const head = (tbl: string) => db().from(tbl).select('*', { count: 'exact', head: true })

export async function loadHome(user: CurrentUser, want: string | null) {
  // 멤버십과 마지막 선택 분류체계는 서로 독립 — 동시 조회(R-P1, 2026-10-24 전수 점검)
  const [m, u] = await Promise.all([
    db().from('std_area_mbr').select('mbr_role_cd, std_area!inner(area_id, area_nm, del_yn)').eq('usr_id', user.usr_id).eq('del_yn', 'N').eq('std_area.del_yn', 'N'),
    db().from('sys_user').select('lst_area_id').eq('usr_id', user.usr_id).maybeSingle(),
  ])
  if (m.error) throw m.error
  const areas = (m.data ?? []).map((r) => {
    const a = r.std_area as unknown as { area_id: string; area_nm: string }
    return { area_id: a.area_id, area_nm: a.area_nm, role: r.mbr_role_cd as string }
  })
  areas.sort((a, b) => a.area_nm.localeCompare(b.area_nm, 'ko'))
  if (!areas.length) return { areas, area: null }
  // 고르는 순서 : 요청한 분류체계 → 마지막 선택 → 이름순 첫 번째(멤버가 아닌 값은 무시)
  if (u.error) throw u.error
  const mine = new Set(areas.map((a) => a.area_id))
  const last = (u.data as { lst_area_id: string | null } | null)?.lst_area_id ?? null
  const areaId = [want, last].find((x): x is string => !!x && mine.has(x)) ?? areas[0].area_id
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (!('perms' in auth)) return { areas, area: null }
  if (areaId !== last) await rememberArea(user.usr_id, areaId)
  const has = (p: string) => (auth.perms as string[]).includes(p)

  const std = has('STD_VIEW')
    ? Promise.all(
        (['std_dic', 'std_dom', 'std_term', 'std_cd_bas'] as const).map((t) => n(head(t).eq('area_id', areaId).eq('std_sts_cd', 'CNFM').eq('del_yn', 'N'))),
      ).then(([dic, dom, term, cd]) => ({ dic, dom, term, cd }))
    : null
  const apv = has('APPROVE') ? n(head('std_apv_req').eq('area_id', areaId).eq('apv_sts_cd', 'REQ').eq('del_yn', 'N')) : null
  const ddl = has('DDL_APPROVE') ? n(head('mdl_ddl_req').eq('area_id', areaId).eq('req_sts_cd', 'REQ').eq('del_yn', 'N')) : null
  // 내 신청 : 대기 전체 + 최근 30일 반려(오래된 반려는 할 일이 아님)
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const mineReq = has('REQUEST')
    ? Promise.all([
        n(head('std_apv_req').eq('area_id', areaId).eq('req_usr_id', user.usr_id).eq('apv_sts_cd', 'REQ').eq('del_yn', 'N')),
        n(head('std_apv_req').eq('area_id', areaId).eq('req_usr_id', user.usr_id).eq('apv_sts_cd', 'RJCT').eq('del_yn', 'N').gte('mod_dtm', since)),
      ]).then(([wait, rjct]) => ({ wait, rjct }))
    : null
  const model = has('MODEL_VIEW')
    ? Promise.all([n(head('mdl_prj').eq('area_id', areaId).eq('del_yn', 'N')), n(head('mdl_ent').eq('area_id', areaId).eq('del_yn', 'N'))]).then(([prj, ent]) => ({ prj, ent }))
    : null
  // 최근 변경 5건 — 이력 화면(history API)과 같은 숨김 규칙(DB 접속·에이전트 = DB_CONN_ADMIN, 멤버 = ADM_VIEW)
  const recent = has('SET_VIEW')
    ? (async () => {
        let q = db().from('std_audit_log').select('log_id, tgt_tp_cd, act_cd, aftr_val, bfr_val, reg_dtm, sys_user(pi_usr_nm)').eq('area_id', areaId)
        const hide = [...(has('DB_CONN_ADMIN') ? [] : ['DBCN', 'AGT']), ...(has('ADM_VIEW') ? [] : ['MBR'])]
        if (hide.length) q = q.not('tgt_tp_cd', 'in', `(${hide.join(',')})`)
        const r = await q.order('reg_dtm', { ascending: false }).limit(5)
        if (r.error) throw r.error
        return (r.data as unknown as { log_id: string; tgt_tp_cd: string; act_cd: string; aftr_val: Record<string, unknown> | null; bfr_val: Record<string, unknown> | null; reg_dtm: string; sys_user: { pi_usr_nm: string } | null }[]).map((x) => ({
          log_id: x.log_id,
          tgt_tp_cd: x.tgt_tp_cd,
          act_cd: x.act_cd,
          nm: label(x.aftr_val ?? x.bfr_val),
          usr: x.sys_user?.pi_usr_nm ?? null,
          reg_dtm: x.reg_dtm,
        }))
      })()
    : null
  const [s, a, d, r, mo, rc] = await Promise.all([std, apv, ddl, mineReq, model, recent])
  const area = areas.find((x) => x.area_id === areaId)!
  return { areas, area: { ...area, role: auth.role, perms: auth.perms, plan: auth.plan, std: s, apv: a, ddl: d, mine: r, model: mo, recent: rc } }
}

// 이력 행의 대상 이름 — 이력 화면과 같은 이름 칸(roles.ts AUDIT_NM_KEYS) 중 처음 나오는 값(없으면 null)
const label = (v: Record<string, unknown> | null) => {
  for (const k of AUDIT_NM_KEYS) if (v && typeof v[k] === 'string' && v[k]) return v[k] as string
  return null
}

export type Home = Awaited<ReturnType<typeof loadHome>>
