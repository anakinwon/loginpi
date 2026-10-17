// 모델 단계 상태(서버, 마스터 지시 2026-10-17) — 엔터티별 논리 작성중/작성완료, 물리 테이블별 작성중/작성완료
// 순서 : 엔터티 작성완료(관문 통과) → 엔터티 선택 물리 전환 → 테이블 작성완료(남은 동기화 0) → ERD. 완료 = DB 트리거 편집 잠금(sql/032), 수정은 완료 취소 후
import { db } from './db'
import { loadLogical } from './model-logical'
import { loadPhy, syncPlan } from './model-phy'
import { checkLogical } from './modelpi/normalize'
import { scopeWhy, type Sts } from './modelpi/stage'

export interface EntStage {
  ent_id: string
  ent_log_nm: string
  tbl_phy_nm: string
  subj_id: string
  subj_nm: string
  lgc_sts_cd: Sts
  why: string[] // 작성완료를 막는 사유(작성중일 때)
}

export async function stageInfo(areaId: string, prjId: string) {
  const m = await loadLogical(areaId, prjId)
  if (!m) return null
  const st = await db().from('mdl_ent').select('ent_id, lgc_sts_cd').eq('prj_id', prjId).eq('del_yn', 'N').limit(5000)
  if (st.error) throw st.error
  const sts = new Map((st.data as { ent_id: string; lgc_sts_cd: Sts }[]).map((x) => [x.ent_id, x.lgc_sts_cd]))
  const chk = checkLogical(m.ents, m.rels, { dbms: (m.prj as { trgt_dbms_cd: string }).trgt_dbms_cd })
  const ents: EntStage[] = m.ents.map((e) => ({ ent_id: e.ent_id, ent_log_nm: e.ent_log_nm, tbl_phy_nm: e.tbl_phy_nm, subj_id: e.subj_id, subj_nm: e.subj_nm, lgc_sts_cd: sts.get(e.ent_id) ?? 'WRT', why: scopeWhy(chk, m.rels, new Set([e.ent_id])) }))
  const pm = await db().from('mdl_phy_mdl').select('phy_mdl_id, dbms_cd, ver_no').eq('area_id', areaId).eq('prj_id', prjId).eq('del_yn', 'N').order('reg_dtm')
  if (pm.error) throw pm.error
  const ids = (pm.data as { phy_mdl_id: string }[]).map((x) => x.phy_mdl_id)
  const tb = ids.length ? await db().from('mdl_phy_tbl').select('phy_tbl_id, phy_mdl_id, ent_id, tbl_nm, phy_sts_cd').in('phy_mdl_id', ids).eq('del_yn', 'N').limit(5000) : { data: [], error: null }
  if (tb.error) throw tb.error
  const rows = tb.data as { phy_tbl_id: string; phy_mdl_id: string; ent_id: string; tbl_nm: string; phy_sts_cd: Sts }[]
  const phy = (pm.data as { phy_mdl_id: string; dbms_cd: string; ver_no: number }[]).map((x) => ({ ...x, tables: rows.filter((r) => r.phy_mdl_id === x.phy_mdl_id) }))
  return { ents, phy, capped: m.capped }
}

export interface StageRes {
  done: string[]
  fail: { id: string; nm: string; why: string[] }[]
}

// 엔터티 논리 상태(여러 건) — 작성완료는 엔터티 관문 통과(주식별자·FK 상속·N:M·수정 필요 0)일 때만
export async function setLgc(areaId: string, prjId: string, entIds: string[], sts: Sts, uid: string): Promise<StageRes | null> {
  const info = await stageInfo(areaId, prjId)
  if (!info) return null
  const res: StageRes = { done: [], fail: [] }
  for (const id of entIds) {
    const e = info.ents.find((x) => x.ent_id === id)
    if (!e) {
      res.fail.push({ id, nm: id, why: ['이 프로젝트의 엔터티가 아닙니다'] })
      continue
    }
    if (e.lgc_sts_cd === sts) continue
    if (sts === 'CMPTN' && e.why.length) {
      res.fail.push({ id, nm: e.ent_log_nm, why: e.why })
      continue
    }
    // 완료 취소는 물리 테이블이 작성완료가 아닐 때만(순서 : 테이블 완료 취소 → 엔터티 완료 취소)
    if (sts === 'WRT' && info.phy.some((p) => p.tables.some((t) => t.ent_id === id && t.phy_sts_cd === 'CMPTN'))) {
      res.fail.push({ id, nm: e.ent_log_nm, why: ['물리 테이블이 작성완료입니다 — 테이블 완료 취소 후 엔터티 완료 취소'] })
      continue
    }
    const r = await db().from('mdl_ent').update({ lgc_sts_cd: sts, lgc_cmptn_dtm: sts === 'CMPTN' ? new Date().toISOString() : null, modr_id: uid }).eq('ent_id', id).eq('area_id', areaId).eq('lgc_sts_cd', e.lgc_sts_cd).select('ent_id')
    if (r.error) throw r.error
    if (!r.data.length) {
      res.fail.push({ id, nm: e.ent_log_nm, why: ['다른 사용자가 먼저 상태를 바꿨습니다 — 다시 불러오십시오'] })
      continue
    }
    res.done.push(id)
  }
  return res
}

// 테이블 물리 상태(여러 건) — 작성완료는 엔터티 작성완료 + 남은 동기화(칼럼·FK 차이) 0 일 때만
export async function setPhy(areaId: string, prjId: string, mdlId: string, tblIds: string[], sts: Sts, uid: string): Promise<StageRes | null> {
  const p = await loadPhy(areaId, mdlId)
  if (!p || p.mdl.prj_id !== prjId) return null
  const lg = await db().from('mdl_ent').select('ent_id, lgc_sts_cd').in('ent_id', p.tables.filter((t) => tblIds.includes(t.phy_tbl_id)).map((t) => t.ent_id).slice(0, 1000))
  if (lg.error) throw lg.error
  const lgc = new Map((lg.data as { ent_id: string; lgc_sts_cd: string }[]).map((x) => [x.ent_id, x.lgc_sts_cd]))
  const res: StageRes = { done: [], fail: [] }
  for (const id of tblIds) {
    const t = p.tables.find((x) => x.phy_tbl_id === id)
    if (!t) {
      res.fail.push({ id, nm: id, why: ['이 물리 모델의 테이블이 아닙니다'] })
      continue
    }
    if (t.phy_sts_cd === sts) continue
    if (sts === 'CMPTN') {
      if (lgc.get(t.ent_id) !== 'CMPTN') {
        res.fail.push({ id, nm: t.tbl_nm, why: ['엔터티가 작성완료가 아닙니다(논리 모델에서 작성완료)'] })
        continue
      }
      const sp = await syncPlan(areaId, prjId, p, 'sync', id)
      const n = sp ? sp.ops.length + sp.addFk.length + sp.delFk.length : 0
      if (n) {
        res.fail.push({ id, nm: t.tbl_nm, why: [`논리 변경 ${n}건이 아직 반영되지 않았습니다 — '논리 변경 반영' 후 완료`] })
        continue
      }
    }
    const r = await db().from('mdl_phy_tbl').update({ phy_sts_cd: sts, phy_cmptn_dtm: sts === 'CMPTN' ? new Date().toISOString() : null, modr_id: uid }).eq('phy_tbl_id', id).eq('phy_sts_cd', t.phy_sts_cd).select('phy_tbl_id')
    if (r.error) throw r.error
    if (!r.data.length) {
      res.fail.push({ id, nm: t.tbl_nm, why: ['다른 사용자가 먼저 상태를 바꿨습니다 — 다시 불러오십시오'] })
      continue
    }
    res.done.push(id)
  }
  return res
}
