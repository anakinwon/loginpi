// 엔터티 속성(MD3, sql/025 mdl_attr) 서버 공용 — 목록 조회, 추천 입력 수집(엔터티 단어·업종 템플릿·식별/비식별 부모 PK·후보 용어), 순서 계산
// 추천 규칙은 순수 모듈 src/lib/modelpi/logical.ts, 이 파일은 DB 조회만
import { db } from './db'
import { inChunks } from './paging'
import type { EntTp, EntWord } from './model-name'
import { TEMPLATES, entKey, isIndstry } from './modelpi/template'
import { GENERIC_TERMS, entCore, type ParentKey, type TermRow } from './modelpi/logical'

export const ATTR_COLS = 'attr_id, ent_id, term_id, attr_seq, pk_yn, pk_seq, esntl_yn, fk_rel_id, src_attr_id, attr_desc, attr_asst_nm, ver_no, regr_id, reg_dtm, std_term!mdl_attr_std_term_id_fkey(term_log_nm, term_phy_nm, syn_txt, std_dom!std_term_std_dom_id_fkey(dom_nm, lgc_tp_cd, data_len, data_scale, std_lgc_tp(lgc_tp_nm)))'

type TermJoin = { term_id: string; std_term: { term_log_nm: string; term_phy_nm: string; std_dom: { dom_nm: string } | null } | null }
const toRow = (x: TermJoin): TermRow => ({ term_id: x.term_id, term_log_nm: x.std_term?.term_log_nm ?? '', term_phy_nm: x.std_term?.term_phy_nm ?? '', dom_nm: x.std_term?.std_dom?.dom_nm ?? null })

// 엔터티 속성 목록 — PK(순서) 먼저, 그다음 표시 순서
export async function listAttrs(areaId: string, entId: string) {
  const { data, error } = await db().from('mdl_attr').select(ATTR_COLS).eq('area_id', areaId).eq('ent_id', entId).eq('del_yn', 'N').order('pk_yn', { ascending: false }).order('pk_seq', { nullsFirst: false }).order('attr_seq')
  if (error) throw error
  return data as unknown as (Record<string, unknown> & TermJoin)[]
}

// 활성 엔터티(같은 분류체계) — 없으면 null
export async function getEnt(areaId: string, entId: string) {
  const { data, error } = await db().from('mdl_ent').select('ent_id, prj_id, ent_log_nm, ent_tp_cd, dic_ids').eq('ent_id', entId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (error) throw error
  return data as { ent_id: string; prj_id: string; ent_log_nm: string; ent_tp_cd: EntTp; dic_ids: string[] } | null
}

// 추천 입력 — 엔터티 구성 단어, 업종 템플릿 속성, 부모 관계와 부모 PK, 후보 용어(핵심 첫 단어 접두 + 공통 후보), 등록된 속성
export async function attrSuggestInput(areaId: string, ent: NonNullable<Awaited<ReturnType<typeof getEnt>>>) {
  const [w, prj, rels, mine] = await Promise.all([
    inChunks(ent.dic_ids, (p) => db().from('std_dic').select('dic_id, dic_log_nm, dic_phy_nm, attr_clss_yn, ent_clss_yn, forbid_yn, tbl_sfx_txt').in('dic_id', p)),
    db().from('mdl_prj').select('indstry_cd').eq('prj_id', ent.prj_id).maybeSingle(),
    db().from('mdl_rel').select('rel_id, prnt_ent_id, idnt_yn, prnt_opt_yn, prnt:mdl_ent!mdl_rel_prnt_ent_id_fkey(ent_log_nm)').eq('chld_ent_id', ent.ent_id).eq('del_yn', 'N').neq('prnt_ent_id', ent.ent_id),
    listAttrs(areaId, ent.ent_id),
  ])
  for (const r of [w, prj, rels]) if (r.error) throw r.error
  const by = new Map((w.data as EntWord[]).map((x) => [x.dic_id, x]))
  const words = ent.dic_ids.map((id) => by.get(id)).filter((x): x is EntWord => !!x)
  // 업종 템플릿 속성(엔터티 키 = 단어 + 분류어 일치)
  const cd = (prj.data as { indstry_cd: string | null } | null)?.indstry_cd
  const t = isIndstry(cd) ? TEMPLATES[cd] : null
  const te = t?.entities.find((e) => entKey(e) === ent.ent_log_nm)
  const ta = te ? t!.attrs.find((a) => a.ent === entKey(te)) : undefined
  // 부모 PK 속성
  const rl = rels.data as unknown as { rel_id: string; prnt_ent_id: string; idnt_yn: string; prnt_opt_yn: string; prnt: { ent_log_nm: string } | null }[]
  const ppk = await inChunks([...new Set(rl.map((r) => r.prnt_ent_id))], (p) =>
    db().from('mdl_attr').select('ent_id, term_id, pk_seq, std_term!mdl_attr_std_term_id_fkey(term_log_nm, term_phy_nm, std_dom!std_term_std_dom_id_fkey(dom_nm))').in('ent_id', p).eq('pk_yn', 'Y').eq('del_yn', 'N').order('pk_seq'),
  )
  if (ppk.error) throw ppk.error
  const parents: ParentKey[] = rl.map((r) => ({
    rel_id: r.rel_id,
    idnt_yn: r.idnt_yn,
    prnt_opt_yn: r.prnt_opt_yn,
    prnt_nm: r.prnt?.ent_log_nm ?? '',
    pk: (ppk.data as unknown as (TermJoin & { ent_id: string })[]).filter((a) => a.ent_id === r.prnt_ent_id).map(toRow),
  }))
  // 후보 용어 : 핵심 첫 단어 접두(승인완료, 상한 300) + 공통 후보 + 템플릿 속성 이름
  const { head } = entCore(words)
  const exact = [...GENERIC_TERMS, ...(ta?.terms ?? [])]
  const [pre, ex] = await Promise.all([
    head ? db().from('std_term').select('term_id, term_log_nm, term_phy_nm, std_dom!std_term_std_dom_id_fkey(dom_nm)').eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').ilike('term_log_nm', `${head.replace(/[%_]/g, '')}%`).limit(300) : Promise.resolve({ data: [], error: null }),
    db().from('std_term').select('term_id, term_log_nm, term_phy_nm, std_dom!std_term_std_dom_id_fkey(dom_nm)').eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').in('term_log_nm', exact),
  ])
  if (pre.error) throw pre.error
  if (ex.error) throw ex.error
  const flat = (rows: unknown[]) => (rows as { term_id: string; term_log_nm: string; term_phy_nm: string; std_dom: { dom_nm: string } | null }[]).map((x) => ({ term_id: x.term_id, term_log_nm: x.term_log_nm, term_phy_nm: x.term_phy_nm, dom_nm: x.std_dom?.dom_nm ?? null }))
  return {
    words,
    tp: ent.ent_tp_cd,
    tmpl: ta ? { terms: ta.terms, pk: ta.pk } : null,
    parents,
    terms: [...flat(pre.data), ...flat(ex.data)],
    have: new Set(mine.map((a) => toRow(a).term_log_nm)),
    havePk: mine.some((a) => a.pk_yn === 'Y'),
  }
}

// 다음 표시 순서·PK 순서
export async function nextSeq(entId: string) {
  const { data, error } = await db().from('mdl_attr').select('attr_seq, pk_seq').eq('ent_id', entId).eq('del_yn', 'N')
  if (error) throw error
  const rows = data as { attr_seq: number; pk_seq: number | null }[]
  return { attr: Math.max(0, ...rows.map((r) => r.attr_seq)) + 1, pk: Math.max(0, ...rows.map((r) => r.pk_seq ?? 0)) + 1 }
}
