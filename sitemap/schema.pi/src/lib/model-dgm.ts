// 다이어그램(서버, PRD_PiErd S3 E2) — 프로젝트 × 주제영역(NULL 전체) × 모델단계 다이어그램과 엔터티 배치(좌표·고정·순번) 조회·저장
// 조회는 다이어그램을 만들지 않는다(없으면 dgm null, 좌표 없음 → 화면이 자동 배치). 저장 시 없으면 생성
// 주제영역 다이어그램 = 그 주제영역 엔터티 + 관계로 이어진 다른 주제영역 엔터티(참조 ref = true)
import { db } from './db'
import { loadLogical } from './model-logical'

export type DgmLvl = 'CNCP' | 'LGCL' | 'PHY'
export interface DgmPos {
  ent_id: string
  x: number
  y: number
  fix: boolean
  seq?: number
}
const CHUNK = 20 // 행별 update 동시 실행 묶음

async function findDgm(areaId: string, prjId: string, subjId: string | null, lvl: DgmLvl) {
  let q = db().from('mdl_dgm').select('dgm_id, dgm_nm, ver_no').eq('area_id', areaId).eq('prj_id', prjId).eq('mdl_lvl_cd', lvl).eq('del_yn', 'N')
  q = subjId ? q.eq('subj_id', subjId) : q.is('subj_id', null)
  const r = await q.maybeSingle()
  if (r.error) throw r.error
  return r.data as { dgm_id: string; dgm_nm: string; ver_no: number } | null
}

export async function loadDgm(areaId: string, prjId: string, subjId: string | null, lvl: DgmLvl) {
  const m = await loadLogical(areaId, prjId)
  if (!m) return null
  const own = new Set(m.ents.filter((e) => !subjId || e.subj_id === subjId).map((e) => e.ent_id))
  const rels = m.rels.filter((r) => own.has(r.prnt_ent_id) || own.has(r.chld_ent_id))
  const shown = new Set([...own, ...rels.flatMap((r) => [r.prnt_ent_id, r.chld_ent_id])])
  const ents = m.ents.filter((e) => shown.has(e.ent_id)).map(({ words: _w, ...e }) => ({ ...e, ref: !own.has(e.ent_id) }))
  const dgm = await findDgm(areaId, prjId, subjId, lvl)
  let pos: DgmPos[] = []
  if (dgm) {
    const p = await db().from('mdl_dgm_ent').select('ent_id, xcrd, ycrd, fix_yn, sort_seq').eq('dgm_id', dgm.dgm_id).eq('del_yn', 'N').limit(5000)
    if (p.error) throw p.error
    pos = (p.data as { ent_id: string; xcrd: number; ycrd: number; fix_yn: string; sort_seq: number }[]).filter((x) => shown.has(x.ent_id)).map((x) => ({ ent_id: x.ent_id, x: Number(x.xcrd), y: Number(x.ycrd), fix: x.fix_yn === 'Y', seq: x.sort_seq }))
  }
  return { prj: m.prj, dgm, ents, rels, pos, capped: m.capped }
}

// 좌표 저장 — 다이어그램 없으면 생성, 기존 배치는 update·새 배치는 insert. 화면에 없는(삭제된) 엔터티는 트리거가 거부
// ponytail: 행별 update(CHUNK 동시) — 엔터티 수천 개를 자주 저장하면 DB 함수(JSON 일괄 upsert)로
export async function saveDgm(areaId: string, prjId: string, subjId: string | null, lvl: DgmLvl, nm: string, pos: DgmPos[], uid: string) {
  let dgm = await findDgm(areaId, prjId, subjId, lvl)
  if (!dgm) {
    const c = await db().from('mdl_dgm').insert({ area_id: areaId, prj_id: prjId, subj_id: subjId, mdl_lvl_cd: lvl, dgm_nm: nm, regr_id: uid, modr_id: uid }).select('dgm_id, dgm_nm, ver_no').single()
    if (c.error) {
      if (c.error.code !== '23505') throw c.error
      dgm = await findDgm(areaId, prjId, subjId, lvl) // 동시 생성 경합 — 먼저 만든 것을 사용
      if (!dgm) throw c.error
    } else dgm = c.data as { dgm_id: string; dgm_nm: string; ver_no: number }
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
  return { dgm, ins: ins.length, upd: upd.length }
}
