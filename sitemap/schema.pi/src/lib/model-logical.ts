// 논리 모델 로더(서버) — 프로젝트의 엔터티(핵심·논리 단계 전체, 구성 단어·물리명 대문자)·속성(용어·도메인·승인 여부)·관계를 한 번에 읽어 점검 엔진(normalize.ts) 입력으로
// ponytail: 프로젝트 엔터티 상한 500·속성 5,000 — 논리 모델 작업 단위가 이를 넘으면 주제영역 단위 분할 조회로
import { db } from './db'
import { entNames, type EntWord } from './model-name'
import type { LAttr, LEnt, LRel } from './modelpi/normalize'

const ENT_MAX = 500
const ATTR_MAX = 5000

export async function loadLogical(areaId: string, prjId: string) {
  const prj = await db().from('mdl_prj').select('prj_id, prj_nm, tbl_pfx_txt, trgt_dbms_cd, indstry_cd').eq('prj_id', prjId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (prj.error) throw prj.error
  if (!prj.data) return null
  const [e, a, r] = await Promise.all([
    db().from('mdl_ent').select('ent_id, subj_id, ent_log_nm, ent_tp_cd, ent_desc, dic_ids, mdl_lvl_cd, ver_no, reg_dtm, mdl_subj!inner(subj_nm, subj_abbr_nm, sort_seq)').eq('prj_id', prjId).eq('del_yn', 'N').order('reg_dtm').limit(ENT_MAX),
    db()
      .from('mdl_attr')
      .select('attr_id, ent_id, term_id, pk_yn, pk_seq, esntl_yn, fk_rel_id, attr_seq, ver_no, std_term!mdl_attr_std_term_id_fkey(term_log_nm, term_phy_nm, std_sts_cd, del_yn, std_dom!std_term_std_dom_id_fkey(dom_nm))')
      .eq('prj_id', prjId)
      .eq('del_yn', 'N')
      .order('attr_seq')
      .limit(ATTR_MAX),
    db().from('mdl_rel').select('rel_id, prnt_ent_id, chld_ent_id, rel_nm, crdn_cd, idnt_yn, prnt_opt_yn, chld_opt_yn').eq('prj_id', prjId).eq('del_yn', 'N'),
  ])
  for (const x of [e, a, r]) if (x.error) throw x.error
  type ERow = { ent_id: string; subj_id: string; ent_log_nm: string; ent_tp_cd: string; ent_desc: string | null; dic_ids: string[]; mdl_lvl_cd: string; ver_no: number; mdl_subj: { subj_nm: string; subj_abbr_nm: string; sort_seq: number } }
  type ARow = { attr_id: string; ent_id: string; term_id: string; pk_yn: string; pk_seq: number | null; esntl_yn: string; fk_rel_id: string | null; ver_no: number; std_term: { term_log_nm: string; term_phy_nm: string; std_sts_cd: string; del_yn: string; std_dom: { dom_nm: string } | null } | null }
  const er = e.data as unknown as ERow[]
  const ar = a.data as unknown as ARow[]
  const ids = [...new Set(er.flatMap((x) => x.dic_ids))]
  const w = ids.length ? await db().from('std_dic').select('dic_id, dic_log_nm, dic_phy_nm, attr_clss_yn, ent_clss_yn, forbid_yn, tbl_sfx_txt').in('dic_id', ids) : { data: [], error: null }
  if (w.error) throw w.error
  const wb = new Map((w.data as EntWord[]).map((x) => [x.dic_id, x]))
  const pfx = (prj.data as { tbl_pfx_txt: string }).tbl_pfx_txt
  const dbms = (prj.data as { trgt_dbms_cd: string }).trgt_dbms_cd
  // 점검 입력(LEnt) + 편집 폼용(주제영역·단계·설명·구성 단어 ID·버전)
  const ents: (LEnt & { subj_id: string; mdl_lvl_cd: string; ent_desc: string | null; dic_ids: string[]; ver_no: number })[] = er
    .sort((x, y) => x.mdl_subj.sort_seq - y.mdl_subj.sort_seq || x.mdl_subj.subj_nm.localeCompare(y.mdl_subj.subj_nm))
    .map((x) => {
      const words = x.dic_ids.map((id) => wb.get(id)).filter((v): v is EntWord => !!v)
      const attrs: LAttr[] = ar
        .filter((t) => t.ent_id === x.ent_id)
        .sort((p, q) => (p.pk_yn === q.pk_yn ? (p.pk_seq ?? 0) - (q.pk_seq ?? 0) : p.pk_yn === 'Y' ? -1 : 1))
        .map((t) => ({
          attr_id: t.attr_id,
          term_id: t.term_id,
          term_log_nm: t.std_term?.term_log_nm ?? '',
          term_phy_nm: t.std_term?.term_phy_nm ?? '',
          dom_nm: t.std_term?.std_dom?.dom_nm ?? null,
          pk_yn: t.pk_yn,
          pk_seq: t.pk_seq,
          esntl_yn: t.esntl_yn,
          fk_rel_id: t.fk_rel_id,
          ver_no: t.ver_no,
          term_ok: t.std_term?.std_sts_cd === 'CNFM' && t.std_term?.del_yn === 'N',
        }))
      return { ent_id: x.ent_id, ent_log_nm: x.ent_log_nm, tbl_phy_nm: entNames(words, x.mdl_subj.subj_abbr_nm, pfx, dbms).tbl_phy_nm, ent_tp_cd: x.ent_tp_cd, subj_nm: x.mdl_subj.subj_nm, words, attrs, subj_id: x.subj_id, mdl_lvl_cd: x.mdl_lvl_cd, ent_desc: x.ent_desc, dic_ids: x.dic_ids, ver_no: x.ver_no }
    })
  return { prj: prj.data, ents, rels: r.data as LRel[], capped: er.length >= ENT_MAX || ar.length >= ATTR_MAX }
}
