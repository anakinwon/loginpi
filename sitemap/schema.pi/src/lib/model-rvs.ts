// 리버스(서버, PRD_PiErd S4) — DDL·카탈로그 CSV 해석 → 표준 용어 역매핑 → 스테이징(mdl_rvs_*) 저장·조회, 반영 출처 기록
// 모델 반영은 화면이 기존 엔터티·속성·관계 API 를 순서대로 호출(표준 검증 그대로 재사용)하고, 결과 ID 를 출처로 되돌려 기록한다
// 선언 FK 와 이름 기반 후보 구분 : 스테이징 칼럼의 fk_nm·ref_tbl_nm 이 있으면 선언 FK, 이름 후보는 화면에서 계산(relCands)해 반영 시 rel_id 만 남김
import { db } from './db'
import { parseDdl, type RvsResult } from './modelpi/ddl-parse'
import { csvToRvs, mapCol, relCands, tblWords, type MapTerm, type MapWord } from './modelpi/rvs'
import type { DbmsCd } from './modelpi/dbms'

const PAGE = 1000
const CHUNK = 500

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const r = await q(from, from + PAGE - 1)
    if (r.error) throw r.error
    const d = (r.data ?? []) as T[]
    out.push(...d)
    if (d.length < PAGE) return out
  }
}

export async function stdDict(areaId: string) {
  const [terms, words] = await Promise.all([
    all<MapTerm>((a, b) => db().from('std_term').select('term_id, term_log_nm, term_phy_nm').eq('area_id', areaId).eq('std_sts_cd', 'CNFM').eq('del_yn', 'N').order('term_id').range(a, b)),
    all<MapWord>((a, b) => db().from('std_dic').select('dic_id, dic_log_nm, dic_phy_nm, tbl_sfx_txt').eq('area_id', areaId).eq('std_sts_cd', 'CNFM').eq('del_yn', 'N').eq('forbid_yn', 'N').order('dic_id').range(a, b)),
  ])
  return { terms, words }
}

export function parseSrc(src: 'DDL' | 'CSV', text: string): RvsResult | { missing: string[] } {
  return src === 'DDL' ? parseDdl(text) : csvToRvs(text)
}

// 스테이징 저장 — 테이블·칼럼 행과 매핑. 실패 시 작업을 논리 삭제
export async function stageRvs(areaId: string, prjId: string, o: { src: 'DDL' | 'CSV'; dbms: DbmsCd; fileNm: string | null }, r: RvsResult, uid: string) {
  const { terms, words } = await stdDict(areaId)
  // 접두·주제영역 약어 — 테이블명 분해 전에 뗀다(약어가 표준단어 물리명과 겹치는 경우 방지)
  const [pj, sj] = await Promise.all([
    db().from('mdl_prj').select('tbl_pfx_txt').eq('prj_id', prjId).maybeSingle(),
    db().from('mdl_subj').select('subj_abbr_nm').eq('prj_id', prjId).eq('del_yn', 'N'),
  ])
  if (pj.error) throw pj.error
  if (sj.error) throw sj.error
  const skip = new Set([(pj.data as { tbl_pfx_txt: string } | null)?.tbl_pfx_txt, 'TB', ...(sj.data as { subj_abbr_nm: string }[]).map((x) => x.subj_abbr_nm)].filter((v): v is string => !!v).map((v) => v.toUpperCase()))
  const fkOf = new Map<string, { fk_nm: string | null; ref_tbl_nm: string; ref_col_nm: string }>()
  for (const f of r.fks) f.cols.forEach((c, i) => fkOf.set(`${f.table}|${c}`, { fk_nm: f.name, ref_tbl_nm: f.ref_table, ref_col_nm: f.ref_cols[i] ?? c }))
  const colCnt = r.tables.reduce((n, t) => n + t.cols.length, 0)
  const maps = r.tables.map((t) => t.cols.map((c) => mapCol(c, terms, words)))
  const mapped = maps.flat().filter((m) => m.term_id).length
  const sys = { regr_id: uid, modr_id: uid }
  const j = await db()
    .from('mdl_rvs_job')
    .insert({ area_id: areaId, prj_id: prjId, src_cd: o.src, dbms_cd: o.dbms, file_nm: o.fileNm, tbl_cnt: r.tables.length, col_cnt: colCnt, map_pct: colCnt ? Math.round((mapped / colCnt) * 1000) / 10 : 0, ...sys })
    .select('rvs_job_id')
    .single()
  if (j.error) throw j.error
  const jobId = (j.data as { rvs_job_id: string }).rvs_job_id
  try {
    for (let i = 0; i < r.tables.length; i += CHUNK) {
      const part = r.tables.slice(i, i + CHUNK)
      const t = await db()
        .from('mdl_rvs_tbl')
        .insert(part.map((x) => ({ area_id: areaId, rvs_job_id: jobId, tbl_nm: x.name, tbl_desc: x.comment, dic_ids: tblWords(x.name, words, skip)?.map((w) => w.dic_id) ?? null, ...sys })))
        .select('rvs_tbl_id, tbl_nm')
      if (t.error) throw t.error
      const tid = new Map((t.data as { rvs_tbl_id: string; tbl_nm: string }[]).map((x) => [x.tbl_nm, x.rvs_tbl_id]))
      const rows = part.flatMap((x, k) => {
        const pkPos = new Map(x.pk.map((nm, i) => [nm, i])) // 주키 위치 O(1)
        return x.cols.map((c, n) => {
          const m = maps[i + k][n]
          const pk = pkPos.get(c.name) ?? -1
          return {
            area_id: areaId,
            rvs_tbl_id: tid.get(x.name),
            col_nm: c.name,
            col_seq: n + 1,
            data_tp_nm: c.type.slice(0, 100),
            data_len: c.len,
            data_scale: c.scale,
            null_yn: c.nullable ? 'Y' : 'N',
            bsc_val_txt: c.dflt?.slice(0, 200) ?? null,
            pk_seq: pk >= 0 ? pk + 1 : null,
            col_desc: c.comment,
            ...(fkOf.get(`${x.name}|${c.name}`) ?? {}),
            map_cd: m.map_cd,
            term_id: m.term_id,
            cand_nm: m.cand_nm,
            ...sys,
          }
        })
      })
      for (let s = 0; s < rows.length; s += CHUNK) {
        const c = await db().from('mdl_rvs_col').insert(rows.slice(s, s + CHUNK))
        if (c.error) throw c.error
      }
    }
  } catch (e) {
    await db().from('mdl_rvs_job').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid }).eq('rvs_job_id', jobId)
    throw e
  }
  return { rvs_job_id: jobId, tbl_cnt: r.tables.length, col_cnt: colCnt, mapped }
}

export async function listRvs(areaId: string, prjId: string) {
  const r = await db().from('mdl_rvs_job').select('rvs_job_id, src_cd, dbms_cd, file_nm, job_sts_cd, tbl_cnt, col_cnt, map_pct, reg_dtm').eq('area_id', areaId).eq('prj_id', prjId).eq('del_yn', 'N').order('reg_dtm', { ascending: false }).limit(50)
  if (r.error) throw r.error
  return r.data
}

export interface RvsColRow {
  rvs_col_id: string
  rvs_tbl_id: string
  col_nm: string
  col_seq: number
  data_tp_nm: string
  data_len: number | null
  data_scale: number | null
  null_yn: string
  bsc_val_txt: string | null
  pk_seq: number | null
  col_desc: string | null
  ref_tbl_nm: string | null
  ref_col_nm: string | null
  fk_nm: string | null
  map_cd: string
  term_id: string | null
  cand_nm: string | null
  attr_id: string | null
  rel_id: string | null
}
export interface RvsTblRow {
  rvs_tbl_id: string
  tbl_nm: string
  tbl_desc: string | null
  dic_ids: string[] | null
  ent_id: string | null
}

export async function loadRvs(areaId: string, prjId: string, jobId: string) {
  const j = await db().from('mdl_rvs_job').select('rvs_job_id, src_cd, dbms_cd, file_nm, job_sts_cd, tbl_cnt, col_cnt, map_pct, reg_dtm').eq('area_id', areaId).eq('prj_id', prjId).eq('rvs_job_id', jobId).eq('del_yn', 'N').maybeSingle()
  if (j.error) throw j.error
  if (!j.data) return null
  const tbls = await all<RvsTblRow>((a, b) => db().from('mdl_rvs_tbl').select('rvs_tbl_id, tbl_nm, tbl_desc, dic_ids, ent_id').eq('rvs_job_id', jobId).eq('del_yn', 'N').order('tbl_nm').range(a, b))
  const cols: RvsColRow[] = []
  for (let i = 0; i < tbls.length; i += 100) {
    const ids = tbls.slice(i, i + 100).map((t) => t.rvs_tbl_id)
    cols.push(...(await all<RvsColRow>((a, b) => db().from('mdl_rvs_col').select('rvs_col_id, rvs_tbl_id, col_nm, col_seq, data_tp_nm, data_len, data_scale, null_yn, bsc_val_txt, pk_seq, col_desc, ref_tbl_nm, ref_col_nm, fk_nm, map_cd, term_id, cand_nm, attr_id, rel_id').in('rvs_tbl_id', ids).eq('del_yn', 'N').order('rvs_col_id').range(a, b))))
  }
  // 관계 후보는 스테이징에서 다시 계산(선언 FK + 이름 기반)
  const byT = new Map(tbls.map((t) => [t.rvs_tbl_id, t.tbl_nm]))
  const res: RvsResult = {
    tables: tbls.map((t) => {
      const cs = cols.filter((c) => c.rvs_tbl_id === t.rvs_tbl_id).sort((a, b) => a.col_seq - b.col_seq)
      return { name: t.tbl_nm, comment: t.tbl_desc, cols: cs.map((c) => ({ name: c.col_nm, type: c.data_tp_nm, len: c.data_len, scale: c.data_scale, nullable: c.null_yn === 'Y', dflt: c.bsc_val_txt, comment: c.col_desc })), pk: cs.filter((c) => c.pk_seq).sort((a, b) => a.pk_seq! - b.pk_seq!).map((c) => c.col_nm) }
    }),
    fks: [],
    skipped: 0,
    warnings: [],
  }
  const fkG = new Map<string, { name: string | null; table: string; cols: string[]; ref_table: string; ref_cols: string[] }>()
  for (const c of cols.filter((x) => x.ref_tbl_nm)) {
    const tn = byT.get(c.rvs_tbl_id)!
    const k = `${tn}|${c.fk_nm ?? c.col_nm}`
    const f = fkG.get(k) ?? { name: c.fk_nm, table: tn, cols: [], ref_table: c.ref_tbl_nm!, ref_cols: [] }
    f.cols.push(c.col_nm)
    f.ref_cols.push(c.ref_col_nm ?? c.col_nm)
    fkG.set(k, f)
  }
  res.fks = [...fkG.values()]
  return { job: j.data, tbls, cols, rels: relCands(res) }
}

// 반영 출처 기록 — 화면이 만든 엔터티·속성·관계 ID. 작업 소유(같은 분류체계·작업)를 조건으로만 갱신
export async function markRvs(areaId: string, jobId: string, o: { tbls: { rvs_tbl_id: string; ent_id: string }[]; cols: { rvs_col_id: string; attr_id?: string | null; rel_id?: string | null }[] }, uid: string) {
  const tids = new Set((await all<{ rvs_tbl_id: string }>((a, b) => db().from('mdl_rvs_tbl').select('rvs_tbl_id').eq('rvs_job_id', jobId).eq('area_id', areaId).eq('del_yn', 'N').range(a, b))).map((x) => x.rvs_tbl_id))
  for (const t of o.tbls) {
    if (!tids.has(t.rvs_tbl_id)) continue
    const r = await db().from('mdl_rvs_tbl').update({ ent_id: t.ent_id, modr_id: uid }).eq('rvs_tbl_id', t.rvs_tbl_id)
    if (r.error) throw r.error
  }
  // 칼럼 소유 = 이 작업 테이블의 칼럼(테이블 100개씩 조회 — in() URL 한도)
  const owned = new Set<string>()
  const tl = [...tids]
  for (let i = 0; i < tl.length && o.cols.length; i += 100)
    for (const x of await all<{ rvs_col_id: string }>((a, b) => db().from('mdl_rvs_col').select('rvs_col_id').in('rvs_tbl_id', tl.slice(i, i + 100)).eq('del_yn', 'N').order('rvs_col_id').range(a, b))) owned.add(x.rvs_col_id)
  const todo = o.cols.filter((c) => owned.has(c.rvs_col_id) && (c.attr_id || c.rel_id))
  for (let i = 0; i < todo.length; i += 20) {
    const rs = await Promise.all(
      todo.slice(i, i + 20).map((c) => db().from('mdl_rvs_col').update({ modr_id: uid, ...(c.attr_id ? { attr_id: c.attr_id } : {}), ...(c.rel_id ? { rel_id: c.rel_id } : {}) }).eq('rvs_col_id', c.rvs_col_id)),
    )
    for (const r of rs) if (r.error) throw r.error
  }
  const r = await db().from('mdl_rvs_job').update({ job_sts_cd: 'APPLIED', modr_id: uid }).eq('rvs_job_id', jobId).eq('area_id', areaId)
  if (r.error) throw r.error
}
