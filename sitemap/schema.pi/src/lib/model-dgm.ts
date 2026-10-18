// 다이어그램(서버, PRD_PiErd S3 E2) — 프로젝트 × 주제영역(NULL 전체) × 모델단계 다이어그램과 엔터티 배치(좌표·고정·순번) 조회·저장
// 조회는 다이어그램을 만들지 않는다(없으면 dgm null, 좌표 없음 → 화면이 자동 배치). 저장 시 없으면 생성
// 주제영역 다이어그램 = 그 주제영역 엔터티 + 관계로 이어진 다른 주제영역 엔터티(참조 ref = true)
// 순서 원칙(마스터 지시 2026-10-17) : 엔터티 작성완료 → 물리 전환 → 테이블 작성완료 → ERD — 작성완료 테이블이 있는 엔터티만 그린다(없으면 빈 ERD + 안내)
import { db } from './db'
import { loadLogical } from './model-logical'
import type { RelLyt } from './modelpi/edge-geo'

export type DgmLvl = 'CNCP' | 'LGCL' | 'PHY'
export interface DgmPos {
  ent_id: string
  x: number
  y: number
  fix: boolean
  seq?: number
}
const CHUNK = 20 // 행별 update 동시 실행 묶음
// dgm_sts_cd : WRT 작성중 / CMPTN ERD 작성완료(sql/037 — 배치·관계선 잠금, DDL 대상)
export type DgmRow = { dgm_id: string; dgm_nm: string; dgm_sts_cd: 'WRT' | 'CMPTN'; dgm_cmptn_dtm: string | null; ver_no: number }
// 관계선 배치(sql/034, 2026-10-18) — 사용자가 끝점·꺾임점을 옮긴 관계만, 행 없음 = 자동
export type DgmRel = RelLyt & { rel_id: string }

export async function findDgm(areaId: string, prjId: string, subjId: string | null, lvl: DgmLvl) {
  let q = db().from('mdl_dgm').select('dgm_id, dgm_nm, dgm_sts_cd, dgm_cmptn_dtm, ver_no').eq('area_id', areaId).eq('prj_id', prjId).eq('mdl_lvl_cd', lvl).eq('del_yn', 'N')
  q = subjId ? q.eq('subj_id', subjId) : q.is('subj_id', null)
  const r = await q.maybeSingle()
  if (r.error) throw r.error
  return r.data as DgmRow | null
}

export async function loadDgm(areaId: string, prjId: string, subjId: string | null, lvl: DgmLvl, phyId: string | null = null) {
  const m = await loadLogical(areaId, prjId)
  if (!m) return null
  // 기준 물리 모델(DBMS별) — 지정 없으면 먼저 만든 것
  const pm = await db().from('mdl_phy_mdl').select('phy_mdl_id, dbms_cd').eq('area_id', areaId).eq('prj_id', prjId).eq('del_yn', 'N').order('reg_dtm')
  if (pm.error) throw pm.error
  const phyModels = pm.data as { phy_mdl_id: string; dbms_cd: string }[]
  const phy = phyModels.find((x) => x.phy_mdl_id === phyId) ?? phyModels[0] ?? null
  let phyEnts = new Set<string>()
  if (phy) {
    // 작성완료 테이블만(마스터 지시 : 물리모델도 테이블별 작성완료 상태일 때 ERD 확인)
    const t = await db().from('mdl_phy_tbl').select('ent_id').eq('phy_mdl_id', phy.phy_mdl_id).eq('phy_sts_cd', 'CMPTN').eq('del_yn', 'N').limit(5000)
    if (t.error) throw t.error
    phyEnts = new Set((t.data as { ent_id: string }[]).map((x) => x.ent_id))
  }
  const inSubj = m.ents.filter((e) => !subjId || e.subj_id === subjId)
  const hidden = inSubj.filter((e) => !phyEnts.has(e.ent_id)).length // 물리 미전환 엔터티 수(안내용)
  const own = new Set(inSubj.filter((e) => phyEnts.has(e.ent_id)).map((e) => e.ent_id))
  const rels = m.rels.filter((r) => phyEnts.has(r.prnt_ent_id) && phyEnts.has(r.chld_ent_id) && (own.has(r.prnt_ent_id) || own.has(r.chld_ent_id)))
  const shown = new Set([...own, ...rels.flatMap((r) => [r.prnt_ent_id, r.chld_ent_id])])
  const ents = m.ents.filter((e) => shown.has(e.ent_id)).map(({ words: _w, ...e }) => ({ ...e, ref: !own.has(e.ent_id) }))
  const dgm = await findDgm(areaId, prjId, subjId, lvl)
  let pos: DgmPos[] = []
  let relLyt: DgmRel[] = []
  if (dgm) {
    const shownRel = new Set(rels.map((r) => r.rel_id))
    const q = await db().from('mdl_dgm_rel').select('rel_id, prnt_side_cd, prnt_pstn_rt, chld_side_cd, chld_pstn_rt, mid_xcrd, mid_ycrd').eq('dgm_id', dgm.dgm_id).eq('del_yn', 'N').limit(5000)
    if (q.error) throw q.error
    relLyt = (q.data as Record<string, unknown>[])
      .filter((x) => shownRel.has(x.rel_id as string))
      .map((x) => ({ rel_id: x.rel_id as string, ps: x.prnt_side_cd as RelLyt['ps'], pr: Number(x.prnt_pstn_rt), cs: x.chld_side_cd as RelLyt['cs'], cr: Number(x.chld_pstn_rt), mx: x.mid_xcrd == null ? null : Number(x.mid_xcrd), my: x.mid_ycrd == null ? null : Number(x.mid_ycrd) }))
    const p = await db().from('mdl_dgm_ent').select('ent_id, xcrd, ycrd, fix_yn, sort_seq').eq('dgm_id', dgm.dgm_id).eq('del_yn', 'N').limit(5000)
    if (p.error) throw p.error
    pos = (p.data as { ent_id: string; xcrd: number; ycrd: number; fix_yn: string; sort_seq: number }[]).filter((x) => shown.has(x.ent_id)).map((x) => ({ ent_id: x.ent_id, x: Number(x.xcrd), y: Number(x.ycrd), fix: x.fix_yn === 'Y', seq: x.sort_seq }))
  }
  return { prj: m.prj, dgm, ents, rels, pos, rel_lyt: relLyt, capped: m.capped, phy_models: phyModels, phy_mdl_id: phy?.phy_mdl_id ?? null, hidden, phy_done: own.size > 0 }
}

// 좌표 저장 — 다이어그램 없으면 생성, 기존 배치는 update·새 배치는 insert. 화면에 없는(삭제된) 엔터티는 트리거가 거부
// ponytail: 행별 update(CHUNK 동시) — 엔터티 수천 개를 자주 저장하면 DB 함수(JSON 일괄 upsert)로
// relLyt·relScope(선택) : 화면에 보인 관계(scope) 중 relLyt 에 있는 것은 저장, 없는 것은 자동으로 되돌림(논리 삭제). scope 밖(숨긴 참조 관계)은 그대로
export async function saveDgm(areaId: string, prjId: string, subjId: string | null, lvl: DgmLvl, nm: string, pos: DgmPos[], uid: string, relLyt?: DgmRel[], relScope?: string[]) {
  let dgm = await findDgm(areaId, prjId, subjId, lvl)
  if (!dgm) {
    const c = await db().from('mdl_dgm').insert({ area_id: areaId, prj_id: prjId, subj_id: subjId, mdl_lvl_cd: lvl, dgm_nm: nm, regr_id: uid, modr_id: uid }).select('dgm_id, dgm_nm, dgm_sts_cd, dgm_cmptn_dtm, ver_no').single()
    if (c.error) {
      if (c.error.code !== '23505') throw c.error
      dgm = await findDgm(areaId, prjId, subjId, lvl) // 동시 생성 경합 — 먼저 만든 것을 사용
      if (!dgm) throw c.error
    } else dgm = c.data as DgmRow
  }
  const cur = await db().from('mdl_dgm_ent').select('dgm_ent_id, ent_id').eq('dgm_id', dgm.dgm_id).eq('del_yn', 'N').limit(5000)
  if (cur.error) throw cur.error
  const have = new Map((cur.data as { dgm_ent_id: string; ent_id: string }[]).map((x) => [x.ent_id, x.dgm_ent_id]))
  const row = (p: DgmPos) => ({ xcrd: Math.round(p.x * 10) / 10, ycrd: Math.round(p.y * 10) / 10, fix_yn: p.fix ? 'Y' : 'N', sort_seq: p.seq ?? 1, modr_id: uid })
  const ins = pos.filter((p) => !have.has(p.ent_id)).map((p) => ({ area_id: areaId, dgm_id: dgm!.dgm_id, ent_id: p.ent_id, ...row(p), regr_id: uid }))
  if (ins.length) {
    const r = await db().from('mdl_dgm_ent').insert(ins)
    if (r.error) throw r.error
  }
  const upd = pos.filter((p) => have.has(p.ent_id))
  for (let i = 0; i < upd.length; i += CHUNK) {
    const rs = await Promise.all(upd.slice(i, i + CHUNK).map((p) => db().from('mdl_dgm_ent').update(row(p)).eq('dgm_ent_id', have.get(p.ent_id)!)))
    for (const r of rs) if (r.error) throw r.error
  }
  if (relLyt && relScope) await saveRelLyt(areaId, dgm.dgm_id, relLyt, relScope, uid)
  return { dgm, ins: ins.length, upd: upd.length }
}

async function saveRelLyt(areaId: string, dgmId: string, lyt: DgmRel[], scope: string[], uid: string) {
  const cur = await db().from('mdl_dgm_rel').select('dgm_rel_id, rel_id').eq('dgm_id', dgmId).eq('del_yn', 'N').limit(5000)
  if (cur.error) throw cur.error
  const have = new Map((cur.data as { dgm_rel_id: string; rel_id: string }[]).map((x) => [x.rel_id, x.dgm_rel_id]))
  const keep = new Set(lyt.map((l) => l.rel_id))
  const row = (l: DgmRel) => ({ prnt_side_cd: l.ps, prnt_pstn_rt: l.pr, chld_side_cd: l.cs, chld_pstn_rt: l.cr, mid_xcrd: l.mx == null ? null : Math.round(l.mx * 10) / 10, mid_ycrd: l.my == null ? null : Math.round(l.my * 10) / 10, modr_id: uid })
  const ins = lyt.filter((l) => !have.has(l.rel_id)).map((l) => ({ area_id: areaId, dgm_id: dgmId, rel_id: l.rel_id, ...row(l), regr_id: uid }))
  if (ins.length) {
    const r = await db().from('mdl_dgm_rel').insert(ins)
    if (r.error) throw r.error
  }
  const upd = lyt.filter((l) => have.has(l.rel_id))
  for (let i = 0; i < upd.length; i += CHUNK) {
    const rs = await Promise.all(upd.slice(i, i + CHUNK).map((l) => db().from('mdl_dgm_rel').update(row(l)).eq('dgm_rel_id', have.get(l.rel_id)!)))
    for (const r of rs) if (r.error) throw r.error
  }
  // 화면에 보였는데 저장 목록에 없음 = 자동으로 되돌림
  const off = scope.filter((id) => have.has(id) && !keep.has(id)).map((id) => have.get(id)!)
  if (off.length) {
    const r = await db().from('mdl_dgm_rel').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid }).in('dgm_rel_id', off)
    if (r.error) throw r.error
  }
}
