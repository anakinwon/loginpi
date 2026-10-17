// FK 상속 서버 공용(PRD_PiErd S1 L1~L3) — 관계 1건의 상속 상태 조회(fkState)와 계획 단계 적용(applyFkSteps). 규칙은 순수 모듈 modelpi/fk.ts, 이 파일은 DB 읽기·쓰기·감사 이력
// 사용처 : /relations/[relId]/fk-plan(미리보기·적용·역할명), /relations/[relId]/resolve-nm(N:M 해소 후 두 식별 관계 상속)
import { db } from './db'
import { audit } from './api'
import { listAttrs, nextSeq } from './model-attr'
import { fkNeeds, fkPlan, type FkChildIn, type FkRelIn, type FkStep } from './modelpi/fk'

export type FkChildRow = FkChildIn & { ver_no: number; pk_seq: number | null; std_term: { term_log_nm: string } | null }

// 관계·부모 주식별자·자식 속성 → 계획(steps)·역할명 필요(needs). 관계가 없으면 null
export async function fkState(areaId: string, relId: string) {
  const r = await db().from('mdl_rel').select('rel_id, prnt_ent_id, chld_ent_id, idnt_yn, prnt_opt_yn, crdn_cd, rel_nm').eq('rel_id', relId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (r.error) throw r.error
  if (!r.data) return null
  const rel = r.data as FkRelIn & { crdn_cd: string; rel_nm: string | null }
  const [pa, ca] = await Promise.all([listAttrs(areaId, rel.prnt_ent_id), listAttrs(areaId, rel.chld_ent_id)])
  const prnt = (pa as unknown as FkChildRow[]).filter((a) => a.pk_yn === 'Y').map((a) => ({ attr_id: a.attr_id, term_id: a.term_id, term_log_nm: a.std_term?.term_log_nm ?? '' }))
  const child = ca as unknown as FkChildRow[]
  return { rel, child, prntPk: prnt, steps: fkPlan(rel, prnt, child), needs: fkNeeds(rel, prnt, child), no_pk: prnt.length === 0, self: rel.prnt_ent_id === rel.chld_ent_id }
}

// 계획 단계 적용 — add = 새 상속 속성(순서·PK 순서 자동), link·fix = ver_no 잠금 갱신. 실패는 모아서 돌려줌(부분 적용)
export async function applyFkSteps(areaId: string, st: NonNullable<Awaited<ReturnType<typeof fkState>>>, steps: FkStep[], uid: string) {
  const relId = st.rel.rel_id
  const done: FkStep[] = []
  const fail: { term_log_nm: string; reason: string }[] = []
  for (const s of steps) {
    if (s.kind === 'add') {
      const seq = await nextSeq(st.rel.chld_ent_id)
      const row = { area_id: areaId, ent_id: st.rel.chld_ent_id, term_id: s.term_id, attr_seq: seq.attr, pk_yn: s.pk ? 'Y' : 'N', pk_seq: s.pk ? seq.pk : null, esntl_yn: s.pk || s.esntl ? 'Y' : 'N', fk_rel_id: relId, src_attr_id: s.src_attr_id, regr_id: uid, modr_id: uid }
      const { data, error } = await db().from('mdl_attr').insert(row).select('attr_id').single()
      if (error) {
        fail.push({ term_log_nm: s.term_log_nm, reason: error.code === '23505' ? 'ATTR_DUP' : (error.code ?? 'DB') })
        continue
      }
      await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: data.attr_id, act_cd: 'INS', aftr_val: { ...row, fk_plan: 'add' }, usr_id: uid })
    } else {
      const cur = st.child.find((a) => a.attr_id === s.attr_id)
      if (!cur) continue
      const pkSeq = s.pk ? (cur.pk_seq ?? (await nextSeq(st.rel.chld_ent_id)).pk) : null
      const set = { fk_rel_id: relId, src_attr_id: s.src_attr_id, pk_yn: s.pk ? 'Y' : 'N', pk_seq: pkSeq, esntl_yn: s.pk || s.esntl ? 'Y' : 'N', ver_no: cur.ver_no + 1, modr_id: uid }
      const { data, error } = await db().from('mdl_attr').update(set).eq('attr_id', s.attr_id).eq('ver_no', cur.ver_no).eq('del_yn', 'N').select('attr_id')
      if (error || !data.length) {
        fail.push({ term_log_nm: s.term_log_nm, reason: error ? (error.code ?? 'DB') : 'VERSION_CONFLICT' })
        continue
      }
      await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: s.attr_id, act_cd: 'UPD', bfr_val: cur, aftr_val: { ...cur, ...set, fk_plan: s.kind }, usr_id: uid })
    }
    done.push(s)
  }
  return { done, fail }
}
