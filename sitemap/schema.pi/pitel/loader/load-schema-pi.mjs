#!/usr/bin/env node
// Pi통신 과금 설계(sitemap/schema.pi/pitel/model/*.json)를 schema.pi 앱 DB 에 넣는 멱등 적재기(D12) — 분류체계·표준·프로젝트·주제영역·엔터티·속성·관계·물리·ERD·상태
// 실행 : node load-schema-pi.mjs --db-url <URL> --owner <pi_username> [--dry-run] [--replace]
//   --dry-run = 전부 넣어 본 뒤 롤백(제약·트리거까지 검증) / --replace = 같은 이름 분류체계를 논리 삭제 후 새로(없으면 그냥 새로)
// 이름·관문 규칙은 schema.pi 앱의 순수 함수(src/lib/*.ts)를 그대로 불러 쓴다 — 앱과 다르게 판정하지 않기 위해(Node 22.18+ 타입 제거 실행)
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MODEL = path.resolve(HERE, '../model')
const APP = path.resolve(HERE, '../..') // pitel 은 schema.pi 하위(2026-11-08 이동)
const C = {
  areaNm: 'Pi통신 과금 데이터 표준화',
  areaDesc: 'Pi통신(가상 이동통신사) 과금 시스템 데이터 표준화 — 표준(단어·도메인·용어·공통코드)·개념·논리·물리 모델·ERD. 원천 = 저장소 sitemap/schema.pi/pitel/model(2026-11-07), 적재 = sitemap/schema.pi/pitel/loader',
  prjNm: 'Pi통신 과금 시스템',
  dbms: '0014', // std_dbms PostgreSQL
  sep: '_',
  trialMs: 7 * 86_400_000, // 앱 분류체계 생성과 같은 7일 체험(P4 GRACE)
  maxParams: 60000, // 한 INSERT 의 바인드 변수 상한(PostgreSQL 65535) — 자기참조 FK(src_attr_id)가 한 문장 안에서 풀리도록 크게
  grid: { w: 300, gapX: 60, gapY: 60, head: 48, row: 20, refGap: 200 },
}
const AREAS = ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM']

// ── 인자 ──
const argv = process.argv.slice(2)
const arg = (k) => {
  const i = argv.indexOf(k)
  return i >= 0 ? argv[i + 1] : undefined
}
const DB_URL = arg('--db-url')
const OWNER = arg('--owner')
const DRY = argv.includes('--dry-run')
const REPLACE = argv.includes('--replace')
if (!DB_URL || !OWNER) {
  console.error('사용법 : node load-schema-pi.mjs --db-url <URL> --owner <pi_username> [--dry-run] [--replace]')
  process.exit(2)
}

// ── 앱 순수 함수 ──
process.removeAllListeners('warning') // .ts 를 ESM 으로 다시 읽는다는 경고(MODULE_TYPELESS_PACKAGE_JSON) 숨김
const lib = (f) => import(pathToFileURL(path.join(APP, 'src/lib', f)).href)
const [nmMod, domMod, termMod, normMod, phyMod, stageMod, syncMod, cdMod, chkMod] = await Promise.all(
  ['model-name.ts', 'dom-name.ts', 'term-split.ts', 'modelpi/normalize.ts', 'modelpi/phy.ts', 'modelpi/stage.ts', 'modelpi/phy-sync.ts', 'std-code-rule.ts', 'std-check.ts'].map(lib),
)
const { entNames, entNameError } = nmMod
const { domName } = domMod
const { termNames, termRuleError, splitTerm } = termMod
const { checkLogical } = normMod
const { toPhysical } = phyMod
const { scopeWhy, dgmWhy } = stageMod
const { planSync } = syncMod
const { cdKind, DIV_MAX, valTooLong } = cdMod
const { runCheck } = chkMod

const require = createRequire(import.meta.url)
const postgres = require(require.resolve('postgres', { paths: [HERE, APP, path.resolve(HERE, '../../../..')] }))

const json = (f) => JSON.parse(readFileSync(path.join(MODEL, f), 'utf8'))
const yn = (b) => (b ? 'Y' : 'N')
const fail = (m) => {
  throw new Error(m)
}

// ── 계획(순수) : JSON + 기준 데이터(논리 타입·타입 매핑) → 넣을 행 전부(ID 미리 생성) ──
function buildPlan(ref) {
  const notes = [] // 결정·미반영 기록(출력·리뷰용)
  const W = json('std/words.json'), D = json('std/domains.json'), T = json('std/terms.json'), CD = json('std/codes.json')
  const areasJ = json('areas.json')

  // 단어
  const words = W.map((w) => ({ dic_id: randomUUID(), dic_log_nm: w.wordNm, dic_phy_nm: w.abbr, dic_eng_nm: w.engNm ?? null, ent_clss_yn: yn(w.entClss), attr_clss_yn: yn(w.attrClss), forbid_yn: 'N', tbl_sfx_txt: w.entClss ? (w.tblSfx ?? null) : null, dic_desc: w.def ?? null, key_dom_yn: 'N' }))
  const wByNm = new Map(words.map((w) => [w.dic_log_nm, w]))
  const wByAbbr = new Map(words.map((w) => [w.dic_phy_nm, w]))

  // 도메인 — 이름은 앱 규칙(대표도메인명 + 논리타입 약어 + 길이[,소수점])으로 다시 만든다(D01). 용어 끝 단어 ≠ 대표도메인이면 끝 단어 대표도메인으로 파생(T05·D02, 결정 L2)
  const lgcOf = (nm) => ref.lgc.get(nm) ?? fail(`논리 타입 없음 : ${nm}`)
  const doms = new Map() // dom_nm → 행
  const domOf = (src, key) => {
    const t = lgcOf(src.lgcTp)
    const nm = domName(key, t.abbr, src.len, src.scale)
    if (!doms.has(nm)) {
      const derived = key !== src.keyDom
      doms.set(nm, { dom_id: randomUUID(), key_dom_nm: key, dom_nm: nm, dom_tp_cd: src.grp === '코드' ? 'CD' : src.grp === '번호' ? 'NO' : 'GNRL', grp: src.grp, lgc_tp_cd: t.cd, data_len: src.len ?? null, data_scale: src.scale ?? null, dom_desc: derived ? `${src.def} — 끝 단어 '${key}' 대표도메인(설계 도메인 ${src.domNm}에서 파생, 타입 동일)` : src.def, src: src.domNm })
    }
    return doms.get(nm)
  }
  const dByNm = new Map(D.map((d) => [d.domNm, d]))

  // 용어 — 구성 단어로 이름을 다시 만들어 설계값과 대조(T04), 단어 1개 용어(합성어 단어)는 비표준 수용(nstd, T01 면제 — 결정 L3)
  const terms = T.map((t) => {
    const ws = t.words.map((n) => wByNm.get(n) ?? fail(`용어 ${t.termNm} : 단어 없음 ${n}`))
    const nm = termNames(ws, C.sep)
    if (nm.term_log_nm !== t.termNm || nm.term_phy_nm !== t.phyNm) fail(`용어 이름 불일치 ${t.termNm} : 기대 ${nm.term_log_nm}/${nm.term_phy_nm} ≠ ${t.phyNm}`)
    const src = dByNm.get(t.domNm) ?? fail(`용어 ${t.termNm} : 도메인 없음 ${t.domNm}`)
    const nstd = ws.length < 2
    const last = ws[ws.length - 1]
    const dom = nstd ? domOf(src, src.keyDom) : domOf(src, last.dic_log_nm)
    const bad = nstd ? null : termRuleError(ws)
    if (bad) fail(`용어 ${t.termNm} 규칙 위반 ${bad}`)
    return { term_id: randomUUID(), term_log_nm: nm.term_log_nm, term_phy_nm: nm.term_phy_nm, dom_id: dom.dom_id, dom, term_desc: t.def ?? null, nstd_yn: yn(nstd), dic_ids: ws.map((w) => w.dic_id) }
  })
  for (const d of doms.values()) {
    const k = wByNm.get(d.key_dom_nm) ?? fail(`대표도메인 단어 없음 : ${d.key_dom_nm}`)
    if (k.attr_clss_yn !== 'Y') fail(`대표도메인 단어가 속성 분류어 아님 : ${d.key_dom_nm}`)
    k.key_dom_yn = 'Y'
  }
  const unused = D.filter((d) => ![...doms.values()].some((x) => x.src === d.domNm && x.key_dom_nm === d.keyDom))
  if (unused.length) notes.push(`설계 도메인 중 그대로 쓰는 용어가 없어 등록 안 함 ${unused.length}개 : ${unused.map((d) => d.domNm).join(', ')}`)
  const derived = [...doms.values()].filter((d) => d.key_dom_nm !== dByNm.get(d.src).keyDom)
  if (derived.length) notes.push(`끝 단어 대표도메인 파생 ${derived.length}개(T05) : ${derived.map((d) => d.dom_nm).join(', ')}`)
  const nstdN = terms.filter((t) => t.nstd_yn === 'Y')
  if (nstdN.length) notes.push(`단어 1개 용어 비표준 수용(nstd) ${nstdN.length}개 : ${nstdN.map((t) => t.term_log_nm).join(', ')}`)
  const tByNm = new Map(terms.map((t) => [t.term_log_nm, t]))

  // 공통코드(코드기본·코드상세) — 코드ID = 용어 물리명, 이름 3종(구분·종류·유형)·구분 3개 이하·코드값 길이는 앱 규칙
  const codes = []
  for (const c of CD) {
    const t = tByNm.get(c.termNm) ?? fail(`코드 용어 없음 : ${c.termNm}`)
    const k = cdKind(c.termNm)
    if (!k) fail(`공통코드 이름 3종 아님 : ${c.termNm}`)
    if (k === 'DIV' && c.vals.length > DIV_MAX) fail(`구분코드 값 ${c.vals.length}개 > ${DIV_MAX} : ${c.termNm}`)
    for (const v of c.vals) if (valTooLong(v.cd, t.dom.data_len)) fail(`코드값 길이 초과 ${c.termNm}.${v.cd}`)
    codes.push({ cd_id: t.term_phy_nm, term_id: t.term_id, cd_cls_nm: `${c.kind}코드`, cd_desc: t.term_desc, vals: c.vals.map((v, i) => ({ cd_val: v.cd, cd_val_nm: v.nm, cd_val_desc: v.def ?? null, sort_seq: i + 1 })) })
  }

  // 주제영역 — 이름은 표준단어로만 분해돼야 함(앱 SUBJ_NOT_WORD)
  const dict = words.map((w) => ({ dic_id: w.dic_id, dic_log_nm: w.dic_log_nm, dic_phy_nm: w.dic_phy_nm, attr_clss_yn: w.attr_clss_yn, forbid_yn: w.forbid_yn }))
  const subjs = AREAS.map((code, i) => {
    const a = areasJ.areas.find((x) => x.code === code) ?? fail(`areas.json 주제영역 없음 ${code}`)
    const segs = splitTerm(a.nm, dict)[0]
    if (!segs?.length || !segs.every((s) => 'word' in s)) fail(`주제영역명이 표준단어 아님 : ${a.nm}`)
    const stl = a.moduleCd && Object.keys(a.moduleCd).length ? ` [업무 모듈 정산(STL) 엔터티 ${Object.keys(a.moduleCd).length}개 : ${Object.keys(a.moduleCd).join('·')}]` : ''
    return { subj_id: randomUUID(), subj_nm: a.nm, subj_abbr_nm: code, subj_desc: a.def + stl, sort_seq: i + 1 }
  })
  const sByCd = new Map(subjs.map((s) => [s.subj_abbr_nm, s]))

  // 엔터티·속성
  const L = Object.fromEntries(AREAS.map((a) => [a, json(`logical/${a}.json`)]))
  const ents = []
  const eByKey = new Map() // 'AREA.엔터티명' → ent
  for (const a of AREAS)
    for (const e of L[a].entities) {
      const ws = e.phyNm.split('_').map((ab) => wByAbbr.get(ab) ?? fail(`엔터티 ${e.entNm} : 약어 단어 없음 ${ab}`))
      const ew = ws.map((w) => ({ dic_id: w.dic_id, dic_log_nm: w.dic_log_nm, dic_phy_nm: w.dic_phy_nm, attr_clss_yn: w.attr_clss_yn, ent_clss_yn: w.ent_clss_yn, forbid_yn: w.forbid_yn, tbl_sfx_txt: w.tbl_sfx_txt }))
      const bad = entNameError(ew, e.tp)
      if (bad) fail(`엔터티 ${e.entNm} 이름 규칙 위반 ${bad}`)
      const nm = entNames(ew, a, 'PTL', C.dbms)
      if (nm.ent_log_nm !== e.entNm || nm.tbl_phy_nm !== e.tblNm) fail(`엔터티 이름 불일치 ${e.entNm}/${e.tblNm} : 앱 ${nm.ent_log_nm}/${nm.tbl_phy_nm}`)
      const pkSeq = new Map(e.attrs.filter((x) => x.pk).sort((x, y) => x.seq - y.seq).map((x, i) => [x.attrNm, i + 1]))
      const ent = {
        ent_id: randomUUID(), key: `${a}.${e.entNm}`, src: e, area: a, subj_id: sByCd.get(a).subj_id, subj_nm: sByCd.get(a).subj_nm, ent_log_nm: nm.ent_log_nm, tbl_phy_nm: nm.tbl_phy_nm, words: ew, dic_ids: ew.map((w) => w.dic_id),
        ent_tp_cd: e.tp, mdl_lvl_cd: e.stg, ent_desc: (e.moduleCd ? `[업무 모듈 정산(${e.moduleCd})] ` : '') + (e.def ?? ''),
        attrs: e.attrs.map((x) => {
          const t = tByNm.get(x.attrNm) ?? fail(`속성 용어 없음 ${e.entNm}.${x.attrNm}`)
          if (t.term_phy_nm !== x.phyNm) fail(`속성 물리명 불일치 ${e.entNm}.${x.attrNm}`)
          const pk = !!x.pk
          return { attr_id: randomUUID(), term_id: t.term_id, term_log_nm: t.term_log_nm, term_phy_nm: t.term_phy_nm, dom_nm: t.dom.dom_nm, attr_seq: x.seq, pk_yn: yn(pk), pk_seq: pk ? pkSeq.get(x.attrNm) : null, esntl_yn: yn(pk || x.nullYn === false), fk_rel_id: null, src_attr_id: null, attr_desc: x.def ?? null, fkSrc: x.fk, term_ok: true, dom: { dom_id: t.dom.dom_id, ver_no: 1, lgc_tp_cd: t.dom.lgc_tp_cd, data_len: t.dom.data_len, data_scale: t.dom.data_scale } }
        }),
      }
      if (eByKey.has(ent.key)) fail(`엔터티 중복 ${ent.key}`)
      eByKey.set(ent.key, ent)
      ents.push(ent)
    }

  // 관계 — 엔터티별 rels 를 모아 (부모·자식·관계명) 중복 제거. 1:N → 1N, 1:1 → 11. opt = 부모 선택(자식이 부모 없이 존재), 식별·자기참조는 DB CHECK 에 맞춤
  const rels = []
  const rKey = new Set()
  for (const e of ents)
    for (const r of e.src.rels ?? []) {
      const p = eByKey.get(r.parent) ?? fail(`관계 부모 없음 ${r.parent}`), c = eByKey.get(r.child) ?? fail(`관계 자식 없음 ${r.child}`)
      const k = `${p.ent_id}|${c.ent_id}|${r.relNm ?? ''}`
      if (rKey.has(k)) continue
      rKey.add(k)
      const crdn = { '1:N': '1N', '1:1': '11', 'N:M': 'NM' }[r.card] ?? fail(`관계 차수 ${r.card}`)
      const self = p === c
      rels.push({ rel_id: randomUUID(), prnt_ent_id: p.ent_id, chld_ent_id: c.ent_id, p, c, rel_nm: r.relNm ?? null, crdn_cd: crdn, idnt_yn: yn(r.idn && !self), prnt_opt_yn: self ? 'Y' : r.idn ? 'N' : yn(r.opt), chld_opt_yn: 'Y', rel_desc: null, fkAttrs: r.fkAttrs ?? [] })
    }
  // 속성 FK — 자식 = 이 엔터티, 부모 = fk.ent, 관계 여러 개면 fkAttrs 로 고름. 원천 = 부모의 fk.attr 속성(역할명 상속 포함)
  for (const e of ents)
    for (const x of e.attrs.filter((y) => y.fkSrc)) {
      const pk = `${x.fkSrc.area}.${x.fkSrc.ent}`
      const p = eByKey.get(pk) ?? fail(`FK 부모 없음 ${e.ent_log_nm}.${x.term_log_nm} → ${pk}`)
      let cand = rels.filter((r) => r.c === e && r.p === p)
      if (cand.length > 1) cand = cand.filter((r) => r.fkAttrs.includes(x.term_log_nm))
      if (cand.length !== 1) fail(`FK 관계 판정 불가(${cand.length}) ${e.ent_log_nm}.${x.term_log_nm} → ${pk}`)
      const sa = p.attrs.find((y) => y.term_log_nm === x.fkSrc.attr) ?? fail(`FK 원천 속성 없음 ${pk}.${x.fkSrc.attr}`)
      x.fk_rel_id = cand[0].rel_id
      x.src_attr_id = sa.attr_id
    }

  // 논리 관문(앱 checkLogical·scopeWhy 그대로) — 통과 엔터티만 작성완료
  const lEnts = ents.map((e) => ({ ...e, attrs: [...e.attrs].sort((x, y) => (x.pk_yn === y.pk_yn ? (x.pk_yn === 'Y' ? x.pk_seq - y.pk_seq : x.attr_seq - y.attr_seq) : x.pk_yn === 'Y' ? -1 : 1)) }))
  const chk = checkLogical(lEnts, rels, { dbms: C.dbms })
  const gate = new Map(ents.map((e) => [e.ent_id, scopeWhy(chk, rels, new Set([e.ent_id]))]))
  const entIssues = (id) => [...chk.fkGaps.filter((g) => g.chld_ent_id === id).map((g) => `FK 상속 누락 : ${g.prnt_nm}.${g.term_log_nm}${g.role ? '(역할명 필요)' : ''}`), ...chk.issues.filter((i) => i.ent_id === id && i.action !== 'review').map((i) => i.msg)]

  // 물리 — 앱 toPhysical 결과가 정본(동기화 차이 0). 설계 물리(JSON)와의 차이는 테이블 설명에 기록(결정 L4)
  const tpMap = ref.tpMap
  const conv = toPhysical(lEnts.map((e) => ({ ent_id: e.ent_id, tbl_phy_nm: e.tbl_phy_nm, ent_desc: e.ent_desc, attrs: e.attrs })), rels, tpMap, { dbms: C.dbms })
  if (conv.issues.length) fail(`물리 변환 이슈 ${conv.issues.length}건 : ${conv.issues.slice(0, 5).join(' / ')}`)
  const P = Object.fromEntries(AREAS.map((a) => [a, json(`physical/${a}.json`)]))
  const pTbl = new Map(AREAS.flatMap((a) => P[a].tables.map((t) => [t.tblNm, t])))
  const tables = [], cols = [], idxs = [], skippedIdx = [], deltas = []
  const tblByEnt = new Map()
  for (const t of conv.tables) {
    const e = ents.find((x) => x.ent_id === t.ent_id)
    const pj = pTbl.get(t.tbl_nm) ?? fail(`설계 물리 테이블 없음 ${t.tbl_nm}`)
    const tb = { phy_tbl_id: randomUUID(), ent_id: t.ent_id, tbl_nm: t.tbl_nm, cols: t.cols.map((c) => ({ ...c, phy_col_id: randomUUID() })) }
    const colBy = new Map(tb.cols.map((c) => [c.col_nm, c]))
    const myPk = tb.cols.filter((c) => c.pk_yn === 'Y').map((c) => c.col_nm)
    const d = []
    const extra = pj.cols.filter((c) => !colBy.has(c.colNm))
    if (extra.length) d.push(`반정규화·파티션 칼럼 ${extra.map((c) => `${c.colNm}(${c.termNm})`).join(', ')}`)
    if (pj.pk.cols.join() !== myPk.join()) d.push(`PK ${pj.pk.cols.join('+')}(논리 ${myPk.join('+')})`)
    if (pj.partition) d.push(`파티션 ${pj.partition.type} ${pj.partition.key} ${pj.partition.unit ?? ''} ${pj.partition.from ?? ''}~${pj.partition.to ?? ''}`.trim())
    for (const ix of pj.idx) {
      const ids = ix.cols.map((n) => colBy.get(n)?.phy_col_id)
      if (ids.some((x) => !x)) {
        skippedIdx.push(`${ix.nm}(${ix.cols.join(',')})`)
        d.push(`인덱스 ${ix.nm}(${ix.cols.join(',')}) — 물리 전용 칼럼이라 모델 미등록`)
        continue
      }
      if (ix.cols.join() === myPk.join()) fail(`인덱스가 PK 와 같은 구성 ${ix.nm}`)
      idxs.push({ phy_idx_id: randomUUID(), phy_tbl_id: tb.phy_tbl_id, idx_nm: ix.nm.toUpperCase(), unq_yn: yn(ix.unq), col_ids: ids, idx_desc: ix.why ?? null })
    }
    if (d.length) deltas.push(`${t.tbl_nm} : ${d.join(' / ')}`)
    tb.tbl_desc = (e.ent_desc || '') + (d.length ? `\n[설계 물리(DDL) 차이 — schema.pi 물리 모델은 논리 변환 기준] ${d.join(' / ')}` : '')
    tables.push(tb)
    tblByEnt.set(t.ent_id, tb)
    for (const c of tb.cols) cols.push({ ...c, phy_tbl_id: tb.phy_tbl_id })
  }
  // 물리 FK — 관계마다 1건(앱 번호 규칙), 이름은 설계 FK(자식·부모 테이블·칼럼 일치)가 있으면 그 이름
  const pFks = AREAS.flatMap((a) => P[a].tables.flatMap((t) => t.fks.map((f) => ({ ...f, chld: t.tblNm }))))
  const usedFk = new Set()
  const fks = conv.fks.map((f) => {
    const r = rels.find((x) => x.rel_id === f.rel_id)
    const fkCols = r.c.attrs.filter((x) => x.fk_rel_id === r.rel_id).map((x) => x.term_phy_nm).sort().join()
    let m = pFks.filter((x) => x.chld === r.c.tbl_phy_nm && x.refTbl === r.p.tbl_phy_nm && !usedFk.has(x.nm))
    if (m.length > 1) m = m.filter((x) => [...x.cols].sort().join() === fkCols)
    const nm = m.length === 1 ? m[0].nm.toUpperCase() : f.fk_nm
    usedFk.add(nm)
    return { phy_fk_id: randomUUID(), rel_id: f.rel_id, fk_nm: nm }
  })
  if (new Set(fks.map((f) => f.fk_nm)).size !== fks.length) fail('FK 이름 중복')
  const unmatchedFk = pFks.filter((x) => !usedFk.has(x.nm.toUpperCase()))
  if (unmatchedFk.length) notes.push(`관계가 없는 설계 FK(물리 전용 칼럼) ${unmatchedFk.length}개 미등록 : ${unmatchedFk.map((x) => x.nm).join(', ')}`)

  // 상태 — 엔터티(관문 통과) → 테이블(엔터티 완료 + 동기화 차이 0, 앱 planSync) → ERD(dgmWhy)
  const entDone = new Set(ents.filter((e) => !gate.get(e.ent_id).length).map((e) => e.ent_id))
  const tblDone = new Set()
  for (const tb of tables) {
    if (!entDone.has(tb.ent_id)) continue
    const next = conv.tables.find((x) => x.ent_id === tb.ent_id)
    const ops = planSync([{ ...tb, phy_sts_cd: 'WRT' }], [next])
    if (ops.length) notes.push(`${tb.tbl_nm} 동기화 차이 ${ops.length}건 — 작성중 유지`)
    else tblDone.add(tb.ent_id)
  }

  // ERD — 주제영역마다 LGCL 다이어그램 1개(앱 기본 보기). 그 주제영역 엔터티 전부(작성중 포함) + 관계로 이어진 다른 주제영역 엔터티를 격자 배치(결정 L5)
  //  작성중 엔터티도 미리 배치 = 나중에 테이블을 완료해도 ERD 완료 취소 없이 들어감(앱 phyDgmWhy 는 배치된 엔터티면 허용), 화면에는 테이블 완료분만 보임
  const dgms = []
  for (const s of subjs) {
    const own = ents.filter((e) => e.subj_id === s.subj_id)
    const ownId = new Set(own.map((e) => e.ent_id))
    const rs = rels.filter((r) => ownId.has(r.prnt_ent_id) || ownId.has(r.chld_ent_id))
    const refs = ents.filter((e) => !ownId.has(e.ent_id) && rs.some((r) => r.prnt_ent_id === e.ent_id || r.chld_ent_id === e.ent_id))
    const ownDone = own.filter((e) => tblDone.has(e.ent_id)).length
    const g = C.grid
    const hOf = (e) => g.head + g.row * e.attrs.length
    const n = Math.max(1, Math.ceil(Math.sqrt(own.length)))
    const pos = []
    let y = 0
    for (let i = 0; i < own.length; i += n) {
      const row = own.slice(i, i + n)
      row.forEach((e, j) => pos.push({ ent_id: e.ent_id, x: j * (g.w + g.gapX), y, seq: pos.length + 1 }))
      y += Math.max(...row.map(hOf)) + g.gapY
    }
    const rx = n * (g.w + g.gapX) + g.refGap
    let ry = 0
    for (const e of refs) {
      pos.push({ ent_id: e.ent_id, x: rx, y: ry, seq: pos.length + 1 })
      ry += hOf(e) + g.gapY
    }
    const why = dgmWhy({ subj: true, saved: true, own: ownDone, unplaced: 0 })
    dgms.push({ dgm_id: randomUUID(), subj_id: s.subj_id, dgm_nm: `${s.subj_nm} ERD`, pos, done: !why.length, why, own: ownDone, ref: refs.length })
  }

  // 표준 점검(앱 runCheck) — 적재 뒤 화면 '표준 점검' 결과 미리보기
  const domList = [...doms.values()]
  const lgcAbbr = new Map([...ref.lgc.values()].map((t) => [t.cd, t.abbr]))
  const stdChk = runCheck({
    words: words.map((w) => ({ ...w })),
    doms: domList.map((d) => ({ dom_id: d.dom_id, dom_nm: d.dom_nm, key_dom_nm: d.key_dom_nm, lgc_tp_abbr_nm: lgcAbbr.get(d.lgc_tp_cd), data_len: d.data_len, data_scale: d.data_scale })),
    terms: terms.map((t) => ({ term_id: t.term_id, term_log_nm: t.term_log_nm, term_phy_nm: t.term_phy_nm, dom_id: t.dom_id, nstd_yn: t.nstd_yn, dic_ids: t.dic_ids })),
    syns: [],
    sep: C.sep,
  })

  return { words, doms: domList, terms, codes, subjs, ents, rels, gate, entIssues, entDone, tables, cols, idxs, fks, tblDone, dgms, notes, skippedIdx, deltas, stdChk }
}

// ── DB ──
const sql = postgres(DB_URL, { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 10 })
const ROLLBACK = Symbol('dry-run')
const ins = async (tx, tbl, rows) => {
  const n = Math.max(1, Math.floor(C.maxParams / Math.max(1, Object.keys(rows[0] ?? {}).length)))
  for (let i = 0; i < rows.length; i += n) await tx`INSERT INTO ${tx(tbl)} ${tx(rows.slice(i, i + n))}`
}
const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]))

// 같은 이름 분류체계 논리 삭제(--replace) — 완료 상태를 역순(ERD → 테이블 → 엔터티)으로 풀고, area_id·del_yn 을 가진 모든 테이블 행을 논리 삭제
async function retire(tx, areaId, uid) {
  await tx`UPDATE mdl_dgm SET dgm_sts_cd = 'WRT', dgm_cmptn_dtm = NULL, ver_no = ver_no + 1, modr_id = ${uid} WHERE area_id = ${areaId} AND dgm_sts_cd = 'CMPTN'`
  await tx`UPDATE mdl_phy_tbl SET phy_sts_cd = 'WRT', phy_cmptn_dtm = NULL, modr_id = ${uid} WHERE area_id = ${areaId} AND phy_sts_cd = 'CMPTN'`
  await tx`UPDATE mdl_ent SET lgc_sts_cd = 'WRT', lgc_cmptn_dtm = NULL, modr_id = ${uid} WHERE area_id = ${areaId} AND lgc_sts_cd = 'CMPTN'`
  const tbls = await tx`SELECT c.table_name t FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.column_name IN ('area_id','del_yn','del_dtm','modr_id')
                        GROUP BY c.table_name HAVING count(*) = 4 ORDER BY (c.table_name = 'std_area'), c.table_name`
  let n = 0
  for (const { t } of tbls) {
    const r = await tx`UPDATE ${tx(t)} SET del_yn = 'Y', del_dtm = now(), modr_id = ${uid} WHERE area_id = ${areaId} AND del_yn = 'N'`
    n += r.count
  }
  return n
}

async function counts(tx, areaId) {
  const [c] = await tx`SELECT
    (SELECT count(*) FROM std_dic WHERE area_id = ${areaId} AND del_yn = 'N')::int dic,
    (SELECT count(*) FROM std_dom WHERE area_id = ${areaId} AND del_yn = 'N')::int dom,
    (SELECT count(*) FROM std_term WHERE area_id = ${areaId} AND del_yn = 'N')::int term,
    (SELECT count(*) FROM std_cd_bas WHERE area_id = ${areaId} AND del_yn = 'N')::int cd,
    (SELECT count(*) FROM std_cd_dtl WHERE area_id = ${areaId} AND del_yn = 'N')::int cd_val,
    (SELECT count(*) FROM mdl_subj WHERE area_id = ${areaId} AND del_yn = 'N')::int subj,
    (SELECT count(*) FROM mdl_ent WHERE area_id = ${areaId} AND del_yn = 'N')::int ent,
    (SELECT count(*) FROM mdl_ent WHERE area_id = ${areaId} AND del_yn = 'N' AND lgc_sts_cd = 'CMPTN')::int ent_done,
    (SELECT count(*) FROM mdl_attr WHERE area_id = ${areaId} AND del_yn = 'N')::int attr,
    (SELECT count(*) FROM mdl_rel WHERE area_id = ${areaId} AND del_yn = 'N')::int rel,
    (SELECT count(*) FROM mdl_phy_tbl WHERE area_id = ${areaId} AND del_yn = 'N')::int tbl,
    (SELECT count(*) FROM mdl_phy_tbl WHERE area_id = ${areaId} AND del_yn = 'N' AND phy_sts_cd = 'CMPTN')::int tbl_done,
    (SELECT count(*) FROM mdl_phy_col WHERE area_id = ${areaId} AND del_yn = 'N')::int col,
    (SELECT count(*) FROM mdl_phy_idx WHERE area_id = ${areaId} AND del_yn = 'N')::int idx,
    (SELECT count(*) FROM mdl_phy_fk WHERE area_id = ${areaId} AND del_yn = 'N')::int fk,
    (SELECT count(*) FROM mdl_dgm WHERE area_id = ${areaId} AND del_yn = 'N')::int dgm,
    (SELECT count(*) FROM mdl_dgm WHERE area_id = ${areaId} AND del_yn = 'N' AND dgm_sts_cd = 'CMPTN')::int dgm_done,
    (SELECT count(*) FROM mdl_dgm_ent WHERE area_id = ${areaId} AND del_yn = 'N')::int dgm_ent`
  return c
}

try {
  // 기준 데이터(읽기) — 논리 타입·PostgreSQL 타입 매핑(db-seed 가 넣는 DA# 기준)
  const [lg, tm, own] = await Promise.all([
    sql`SELECT lgc_tp_cd cd, lgc_tp_nm nm, lgc_tp_abbr_nm abbr FROM std_lgc_tp WHERE del_yn = 'N'`,
    sql`SELECT lgc_tp_cd, phy_tp_nm, len_use_yn FROM std_tp_map WHERE dbms_cd = ${C.dbms} AND del_yn = 'N' ORDER BY phy_tp_nm`,
    sql`SELECT usr_id FROM sys_user WHERE pi_usr_nm = ${OWNER} AND del_yn = 'N'`,
  ])
  if (!own.length) fail(`소유자 없음 : sys_user.pi_usr_nm = ${OWNER}(활성)`)
  if (!lg.length || !tm.length) fail('기준 데이터 없음 : std_lgc_tp·std_tp_map(PostgreSQL) — schema.pi scripts/db-seed.mjs 먼저')
  const uid = own[0].usr_id
  const plan = buildPlan({ lgc: new Map(lg.map((r) => [r.nm, r])), tpMap: tm })

  const failEnts = plan.ents.filter((e) => plan.gate.get(e.ent_id).length)
  console.log(`· 계획 : 단어 ${plan.words.length} · 도메인 ${plan.doms.length} · 용어 ${plan.terms.length} · 코드 ${plan.codes.length}(값 ${plan.codes.reduce((s, c) => s + c.vals.length, 0)})`)
  console.log(`         주제영역 ${plan.subjs.length} · 엔터티 ${plan.ents.length} · 속성 ${plan.ents.reduce((s, e) => s + e.attrs.length, 0)} · 관계 ${plan.rels.length}`)
  console.log(`         테이블 ${plan.tables.length} · 칼럼 ${plan.cols.length} · 인덱스 ${plan.idxs.length} · FK ${plan.fks.length} · ERD ${plan.dgms.length}(배치 ${plan.dgms.reduce((s, d) => s + d.pos.length, 0)})`)
  console.log(`· 관문 : 엔터티 완료 ${plan.entDone.size}/${plan.ents.length} · 테이블 완료 ${plan.tblDone.size}/${plan.tables.length} · ERD 완료 ${plan.dgms.filter((d) => d.done).length}/${plan.dgms.length}`)
  for (const e of failEnts) console.log(`  ✗ ${e.ent_log_nm}(${e.tbl_phy_nm}) : ${plan.gate.get(e.ent_id).join(' / ')}${plan.entIssues(e.ent_id).length ? ` — ${plan.entIssues(e.ent_id).join(' / ')}` : ''}`)
  for (const d of plan.dgms.filter((x) => !x.done)) console.log(`  ✗ ERD ${d.dgm_nm} : ${d.why.join(' / ')}`)
  const sc = plan.stdChk
  const byRule = sc.violations.reduce((m, v) => ((m[`${v.rule}(${v.grade})`] = (m[`${v.rule}(${v.grade})`] ?? 0) + 1), m), {})
  console.log(`· 표준 점검(앱 runCheck) : ${sc.summary.map((s) => `${s.tp} ${s.rate}%`).join(' · ')} · 위반 ${JSON.stringify(byRule)}`)
  for (const n of plan.notes) console.log(`· 메모 : ${n}`)
  console.log(`· 설계 물리 차이 테이블 ${plan.deltas.length}개(테이블 설명에 기록), 미등록 인덱스 ${plan.skippedIdx.length}개`)

  const res = await sql
    .begin(async (tx) => {
      const ex = await tx`SELECT area_id FROM std_area WHERE area_nm = ${C.areaNm} AND del_yn = 'N' FOR UPDATE`
      if (ex.length && !REPLACE) fail(`분류체계 '${C.areaNm}' 이미 있음 — 다시 넣으려면 --replace`)
      let retired = 0
      for (const x of ex) retired += await retire(tx, x.area_id, uid)

      const U = { regr_id: uid, modr_id: uid }
      const now = Date.now()
      const areaId = randomUUID()
      // 분류체계 = 앱 생성 절차(분류체계 → DA 구성원 → 7일 체험 → 도메인그룹 8종)와 같게
      await tx`INSERT INTO std_area ${tx({ area_id: areaId, area_nm: C.areaNm, area_desc: C.areaDesc, cd_use_yn: 'Y', ...U })}`
      await tx`INSERT INTO std_area_mbr ${tx({ area_id: areaId, usr_id: uid, mbr_role_cd: 'DA', ...U })}`
      await tx`INSERT INTO std_area_plan ${tx({ area_id: areaId, plan_cd: 'P4', strt_dtm: new Date(now), end_dtm: new Date(now + C.trialMs), grnt_rsn_cd: 'GRACE', ...U })}`
      await tx`SELECT fn_seed_std_dom_grp(${areaId}, ${uid})`
      const grp = new Map((await tx`SELECT dom_grp_nm, dom_grp_id FROM std_dom_grp WHERE area_id = ${areaId} AND del_yn = 'N'`).map((r) => [r.dom_grp_nm, r.dom_grp_id]))

      // 표준 — 승인완료(CNFM)로 직접 등록(앱 일괄등록 fn_bulk_ins_* 와 같은 상태)
      await ins(tx, 'std_dic', plan.words.map((w) => ({ area_id: areaId, std_sts_cd: 'CNFM', ...pick(w, ['dic_id', 'dic_log_nm', 'dic_phy_nm', 'dic_eng_nm', 'ent_clss_yn', 'attr_clss_yn', 'forbid_yn', 'tbl_sfx_txt', 'dic_desc', 'key_dom_yn']), ...U })))
      await ins(tx, 'std_dom', plan.doms.map((d) => ({ area_id: areaId, std_sts_cd: 'CNFM', dom_grp_id: grp.get(d.grp) ?? fail(`도메인그룹 없음 ${d.grp}`), ...pick(d, ['dom_id', 'key_dom_nm', 'dom_nm', 'dom_tp_cd', 'lgc_tp_cd', 'data_len', 'data_scale', 'dom_desc']), ...U })))
      await ins(tx, 'std_term', plan.terms.map((t) => ({ area_id: areaId, std_sts_cd: 'CNFM', ...pick(t, ['term_id', 'term_log_nm', 'term_phy_nm', 'dom_id', 'term_desc', 'nstd_yn']), ...U })))
      await ins(tx, 'std_term_dic', plan.terms.flatMap((t) => t.dic_ids.map((d, i) => ({ term_id: t.term_id, dic_seq: i + 1, dic_id: d, ...U }))))
      await ins(tx, 'std_cd_bas', plan.codes.map((c) => ({ area_id: areaId, std_sts_cd: 'CNFM', ...pick(c, ['cd_id', 'term_id', 'cd_cls_nm', 'cd_desc']), ...U })))
      await ins(tx, 'std_cd_dtl', plan.codes.flatMap((c) => c.vals.map((v) => ({ area_id: areaId, cd_id: c.cd_id, ...v, ...U }))))

      // 모델 — 전부 작성중(WRT)으로 넣고 상태는 맨 끝(완료 = 잠금 트리거)
      const prjId = randomUUID()
      await tx`INSERT INTO mdl_prj ${tx({ prj_id: prjId, area_id: areaId, prj_nm: C.prjNm, prj_desc: 'Pi통신 과금 데이터 표준화 — 주제영역 7(상품·고객·가입·청구·수납·미납·파트너) + 업무 모듈 정산(STL, 엔터티 설명에 표시). 참조무결성은 설계만(DDL FK 없음, D6)', indstry_cd: 'TEL', tbl_pfx_txt: 'PTL', trgt_dbms_cd: C.dbms, ...U })}`
      await ins(tx, 'mdl_subj', plan.subjs.map((s) => ({ area_id: areaId, prj_id: prjId, ...s, ...U })))
      await ins(tx, 'mdl_ent', plan.ents.map((e) => ({ area_id: areaId, prj_id: prjId, ...pick(e, ['ent_id', 'subj_id', 'ent_log_nm', 'ent_tp_cd', 'ent_desc', 'dic_ids', 'mdl_lvl_cd']), ...U })))
      await ins(tx, 'mdl_rel', plan.rels.map((r) => ({ area_id: areaId, prj_id: prjId, ...pick(r, ['rel_id', 'prnt_ent_id', 'chld_ent_id', 'rel_nm', 'crdn_cd', 'idnt_yn', 'prnt_opt_yn', 'chld_opt_yn', 'rel_desc']), ...U })))
      await ins(tx, 'mdl_attr', plan.ents.flatMap((e) => e.attrs.map((a) => ({ area_id: areaId, prj_id: prjId, ent_id: e.ent_id, ...pick(a, ['attr_id', 'term_id', 'attr_seq', 'pk_yn', 'pk_seq', 'esntl_yn', 'fk_rel_id', 'src_attr_id', 'attr_desc']), ...U }))))
      const mdlId = randomUUID()
      await tx`INSERT INTO mdl_phy_mdl ${tx({ phy_mdl_id: mdlId, area_id: areaId, prj_id: prjId, dbms_cd: C.dbms, idntfr_ltr_cd: 'LOWER', del_col_use_yn: 'N', phy_mdl_desc: 'PostgreSQL 17 — DDL 은 소문자, 시스템 칼럼 4개는 DDL 생성 때만(D7). 파티션·반정규화는 테이블 설명과 sitemap/schema.pi/pitel/ddl 이 정본', ...U })}`
      await ins(tx, 'mdl_phy_tbl', plan.tables.map((t) => ({ area_id: areaId, phy_mdl_id: mdlId, ...pick(t, ['phy_tbl_id', 'ent_id', 'tbl_nm', 'tbl_desc']), ...U })))
      await ins(tx, 'mdl_phy_col', plan.cols.map((c) => ({ area_id: areaId, ...pick(c, ['phy_col_id', 'phy_tbl_id', 'attr_id', 'sys_col_yn', 'col_nm', 'col_seq', 'dom_id', 'dom_ver_no', 'phy_tp_nm', 'data_len', 'data_scale', 'null_yn', 'bsc_val_txt', 'pk_yn', 'pk_seq']), ...U })))
      await ins(tx, 'mdl_phy_idx', plan.idxs.map((x) => ({ area_id: areaId, ...x, ...U })))
      await ins(tx, 'mdl_phy_fk', plan.fks.map((f) => ({ area_id: areaId, phy_mdl_id: mdlId, ...f, ...U })))
      await ins(tx, 'mdl_dgm', plan.dgms.map((d) => ({ dgm_id: d.dgm_id, area_id: areaId, prj_id: prjId, subj_id: d.subj_id, mdl_lvl_cd: 'LGCL', dgm_nm: d.dgm_nm, ...U })))
      await ins(tx, 'mdl_dgm_ent', plan.dgms.flatMap((d) => d.pos.map((p) => ({ area_id: areaId, dgm_id: d.dgm_id, ent_id: p.ent_id, xcrd: p.x, ycrd: p.y, fix_yn: 'N', sort_seq: p.seq, ...U }))))

      // 상태 전이(맨 끝) — 엔터티 → 테이블 → ERD
      const ts = new Date()
      const entIds = [...plan.entDone], tblIds = plan.tables.filter((t) => plan.tblDone.has(t.ent_id)).map((t) => t.phy_tbl_id), dgmIds = plan.dgms.filter((d) => d.done).map((d) => d.dgm_id)
      if (entIds.length) await tx`UPDATE mdl_ent SET lgc_sts_cd = 'CMPTN', lgc_cmptn_dtm = ${ts}, modr_id = ${uid} WHERE ent_id IN ${tx(entIds)}`
      if (tblIds.length) await tx`UPDATE mdl_phy_tbl SET phy_sts_cd = 'CMPTN', phy_cmptn_dtm = ${ts}, modr_id = ${uid} WHERE phy_tbl_id IN ${tx(tblIds)}`
      if (dgmIds.length) await tx`UPDATE mdl_dgm SET dgm_sts_cd = 'CMPTN', dgm_cmptn_dtm = ${ts}, ver_no = ver_no + 1, modr_id = ${uid} WHERE dgm_id IN ${tx(dgmIds)}`

      const cnt = await counts(tx, areaId)
      await tx`INSERT INTO std_audit_log ${tx({ area_id: areaId, tgt_tp_cd: 'AREA', tgt_id: areaId, act_cd: 'INS', aftr_val: tx.json({ area_nm: C.areaNm, loader: 'sitemap/schema.pi/pitel/loader/load-schema-pi.mjs', replaced: ex.length, counts: cnt }), usr_id: uid, ...U })}`
      const out = { areaId, retired, cnt }
      if (DRY) throw Object.assign(new Error('dry-run'), { [ROLLBACK]: out })
      return out
    })
    .catch((e) => {
      if (e[ROLLBACK]) return { ...e[ROLLBACK], dry: true }
      throw e
    })
  console.log(`${res.dry ? '✓ dry-run(롤백)' : '✓ 적재 완료'} : 분류체계 ${res.areaId}${res.retired ? ` · 기존 분류체계 논리 삭제 ${res.retired}행` : ''}`)
  const c = res.cnt
  console.log(`  단어 ${c.dic} · 도메인 ${c.dom} · 용어 ${c.term} · 코드 ${c.cd}(값 ${c.cd_val}) · 주제영역 ${c.subj} · 엔터티 ${c.ent}(완료 ${c.ent_done}) · 속성 ${c.attr} · 관계 ${c.rel}`)
  console.log(`  테이블 ${c.tbl}(완료 ${c.tbl_done}) · 칼럼 ${c.col} · 인덱스 ${c.idx} · FK ${c.fk} · ERD ${c.dgm}(완료 ${c.dgm_done}) · 배치 ${c.dgm_ent}`)
} catch (e) {
  console.error(`✗ 중단 : ${e.message}`)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
