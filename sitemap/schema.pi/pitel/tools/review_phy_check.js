// 물리 관문 점검기(읽기 전용) — model/physical/<AREA>.json 을 논리·표준·다른 주제영역 물리와 대조하고, 선택적으로 DB 카탈로그 덤프와 DDL 일치를 검사
// 실행 : node sitemap/schema.pi/pitel/tools/review_phy_check.js INV [catalog.json]
//   catalog.json = rv_<area> 스키마에서 뽑은 칼럼·인덱스·파티션 덤프(리뷰 절차 참조). 없으면 JSON 대조만 한다
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const AREA = process.argv[2] || 'INV'
const CAT = process.argv[3]
const AREAS = ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM']
const SYS = ['LST_MDDTM', 'LST_MDFR_ID', 'LST_RGDTM', 'LST_RGTR_ID'] // D7 순서
const BIG = 10_000_000 // 이 행 수 이상이면 파티션 검토 대상
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const has = (p) => fs.existsSync(path.join(ROOT, p))

const LG = Object.fromEntries(AREAS.map((a) => [a, rd(`model/logical/${a}.json`)]))
const PH = Object.fromEntries(AREAS.filter((a) => has(`model/physical/${a}.json`)).map((a) => [a, rd(`model/physical/${a}.json`)]))
const DOM = Object.fromEntries(rd('model/std/domains.json').map((d) => [d.domNm, d]))
const TERM = Object.fromEntries(rd('model/std/terms.json').map((t) => [t.termNm, t]))
const domTp = (d) => (d.lgcTp === 'NUMERIC' ? (d.scale ? `NUMERIC(${d.len},${d.scale})` : `NUMERIC(${d.len})`) : d.len ? `${d.lgcTp}(${d.len})` : d.lgcTp)

// 전 주제영역 테이블 사전(물리 우선, 물리 없는 영역은 논리 PK 로)
const TBL = {}
for (const a of AREAS) {
  if (PH[a]) for (const t of PH[a].tables) TBL[t.tblNm] = { area: a, pk: t.pk.cols, tp: Object.fromEntries(t.cols.map((c) => [c.colNm, c.dataTp])) }
  else for (const e of LG[a].entities) TBL[e.tblNm] = { area: a, logicalOnly: true, pk: e.attrs.filter((x) => x.pk).map((x) => x.phyNm), tp: Object.fromEntries(e.attrs.map((x) => [x.phyNm, domTp(DOM[x.domNm])])) }
}

const err = []
const info = []
const E = (t, m) => err.push(`${t} : ${m}`)
const phy = PH[AREA]
const ents = LG[AREA].entities
if (phy.tables.length !== ents.length) E(AREA, `테이블 ${phy.tables.length} ≠ 논리 엔터티 ${ents.length}`)

for (const e of ents) {
  const t = phy.tables.find((x) => x.tblNm === e.tblNm && x.entId === e.entId)
  if (!t) { E(e.entId, `물리 테이블 없음(${e.tblNm})`); continue }
  const T = t.tblNm
  const C = Object.fromEntries(t.cols.map((c) => [c.colNm, c]))
  // 이름·길이
  if (t.pk.nm !== `PK_${T}`) E(T, `PK 이름 ${t.pk.nm}`)
  t.idx.forEach((x, i) => { if (x.nm !== `X_${T}_${String(i + 1).padStart(2, '0')}`) E(T, `인덱스 이름·순번 ${x.nm}`) })
  t.fks.forEach((x, i) => { if (x.nm !== `FK_${T}_${String(i + 1).padStart(2, '0')}`) E(T, `FK 이름·순번 ${x.nm}`) })
  for (const n of [T, t.pk.nm, ...t.idx.map((x) => x.nm), ...t.fks.map((x) => x.nm), ...t.cols.map((c) => c.colNm)]) if (n.length > 63) E(T, `63자 초과 ${n}`)
  if (t.partition && (T.length + 8 > 63)) E(T, `파티션 하위 이름 63자 초과 위험`)
  // 논리 속성 누락·타입·NULL
  for (const a of e.attrs) {
    const c = C[a.phyNm]
    if (!c) { E(T, `논리 속성 누락 ${a.phyNm}(${a.attrNm})`); continue }
    const want = domTp(DOM[a.domNm])
    if (c.dataTp !== want) E(T, `${a.phyNm} 타입 ${c.dataTp} ≠ 도메인 ${a.domNm}(${want})`)
    if (c.nullYn !== a.nullYn) E(T, `${a.phyNm} NULL ${c.nullYn} ≠ 논리 ${a.nullYn}`)
    if (a.pk && !t.pk.cols.includes(a.phyNm)) E(T, `논리 PK ${a.phyNm} 이 물리 PK 에 없음`)
  }
  // 추가 칼럼 = 반정규화로 등록되어야 함 + 표준용어·도메인
  const lgSet = new Set(e.attrs.map((a) => a.phyNm))
  for (const c of t.cols) {
    const tm = TERM[c.termNm]
    if (!tm) E(T, `${c.colNm} 용어 미등재 ${c.termNm}`)
    else { if (tm.phyNm !== c.colNm) E(T, `${c.colNm} ≠ 용어 물리명 ${tm.phyNm}`); if (domTp(DOM[tm.domNm]) !== c.dataTp) E(T, `${c.colNm} 타입 ≠ 용어 도메인 ${tm.domNm}`) }
    if (SYS.includes(c.colNm)) E(T, `시스템 칼럼 JSON 포함 ${c.colNm}(D7)`)
    if (!lgSet.has(c.colNm) && !t.denorm.some((d) => d.col === c.colNm)) E(T, `논리에 없는 칼럼 ${c.colNm} — 반정규화 기록 없음`)
  }
  for (const d of t.denorm) { if (!C[d.col]) E(T, `반정규화 칼럼 없음 ${d.col}`); if (!d.why) E(T, `반정규화 사유 없음 ${d.col}`) }
  // 칼럼 순서 PK → FK → 일반
  const fkCols = new Set(t.fks.flatMap((f) => f.cols))
  const rank = (c) => (c.pk ? 0 : fkCols.has(c.colNm) ? 1 : 2)
  const seqs = [...t.cols].sort((a, b) => a.seq - b.seq)
  for (let i = 1; i < seqs.length; i++) if (rank(seqs[i]) < rank(seqs[i - 1])) { info.push(`${T} : 칼럼 순서 PK→FK→일반 어긋남(${seqs[i - 1].colNm} 다음 ${seqs[i].colNm})`); break }
  if (t.pk.cols.some((p) => !C[p]?.pk) || t.cols.some((c) => c.pk && !t.pk.cols.includes(c.colNm))) E(T, `cols.pk ↔ pk.cols 불일치`)
  // 파티션
  const p = t.partition
  if (p) {
    if (!t.pk.cols.includes(p.key)) E(T, `파티션 키 ${p.key} ⊄ PK`)
    const okRange = p.unit === 'MONTH' ? p.from === '2010-01' && p.to === '2027-12' : p.from === '2010' && p.to === '2027'
    if (!okRange || !p.dflt) E(T, `파티션 범위 ${p.from}~${p.to} DEFAULT ${p.dflt}`)
  } else if (t.estRows >= BIG) info.push(`${T} : ${t.estRows.toLocaleString()}행 비파티션`)
  // FK : 대상·참조 칼럼 = 부모 PK(논리) · 타입 일치
  for (const f of t.fks) {
    const R = TBL[f.refTbl]
    if (!R) { E(T, `${f.nm} 부모 ${f.refTbl} 없음`); continue }
    if (f.refCols.some((rc) => !R.pk.includes(rc))) E(T, `${f.nm} refCols ${f.refCols} ⊄ 부모 PK ${R.pk}`)
    f.cols.forEach((fc, i) => { const a = C[fc]?.dataTp; const b = R.tp[f.refCols[i]]; if (a !== b) E(T, `${f.nm} ${fc} ${a} ≠ 부모 ${f.refTbl}.${f.refCols[i]} ${b}${R.area !== AREA ? ' [교차]' : ''}`) })
    if (R.pk.length > f.refCols.length) info.push(`${T} : ${f.nm} → ${f.refTbl} 부모 물리 PK(${R.pk}) 중 ${f.refCols} 만 참조(논리 PK 참조 관례)`)
    // FK 인덱스(선두 칼럼)
    const lead = [t.pk.cols, ...t.idx.map((x) => x.cols)].some((cs) => cs[0] === f.cols[0])
    if (!lead) info.push(`${T} : FK ${f.cols} 선두 인덱스 없음 → ${f.refTbl}`)
  }
  // 중복 인덱스(같은 부분 조건에서 선두 접두 포함)
  const all = [{ nm: t.pk.nm, cols: t.pk.cols, where: null }, ...t.idx.map((x) => ({ ...x, where: x.where || null }))]
  for (const x of t.idx) for (const y of all) {
    if (x === y || x.nm === y.nm) continue
    if ((x.where || null) === y.where && x.cols.length <= y.cols.length && x.cols.every((c, i) => y.cols[i] === c)) E(T, `중복 인덱스 ${x.nm}(${x.cols}) ⊂ ${y.nm}(${y.cols})`)
  }
  for (const x of t.idx) for (const c of [...x.cols]) if (!C[c]) E(T, `${x.nm} 칼럼 없음 ${c}`)
}

// DDL 실행 결과(카탈로그) 대조
if (CAT) {
  const cat = JSON.parse(fs.readFileSync(CAT, 'utf8'))
  for (const t of phy.tables) {
    const T = t.tblNm.toLowerCase()
    const cols = (cat.cols[T] || []).sort((a, b) => a.n - b.n)
    const want = [...[...t.cols].sort((a, b) => a.seq - b.seq).map((c) => ({ nm: c.colNm.toLowerCase(), tp: c.dataTp, nl: c.nullYn })), ...SYS.map((s) => ({ nm: s.toLowerCase(), tp: null, nl: false }))]
    if (cols.length !== want.length) E(T, `DDL 칼럼 수 ${cols.length} ≠ ${want.length}`)
    want.forEach((w, i) => {
      const g = cols[i]
      if (!g || g.nm !== w.nm) return E(T, `DDL 칼럼 ${i + 1} ${g?.nm} ≠ ${w.nm}`)
      if (w.tp && g.tp.toUpperCase().replace('CHARACTER VARYING', 'VARCHAR').replace('CHARACTER', 'CHAR').replace('TIMESTAMP WITHOUT TIME ZONE', 'TIMESTAMP').replace(',0)', ')') !== w.tp) E(T, `DDL ${w.nm} 타입 ${g.tp} ≠ ${w.tp}`)
      if (g.nl !== w.nl) E(T, `DDL ${w.nm} NULL ${g.nl} ≠ ${w.nl}`)
    })
    const ix = cat.idx[T] || {}
    const wantIx = [t.pk.nm, ...t.idx.map((x) => x.nm)].map((s) => s.toLowerCase())
    for (const n of wantIx) if (!ix[n]) E(T, `DDL 인덱스 없음 ${n}`)
    for (const n of Object.keys(ix)) if (!wantIx.includes(n)) E(T, `DDL 에만 있는 인덱스 ${n}`)
    for (const x of t.idx) { const d = ix[x.nm.toLowerCase()]; if (d && !d.includes(`(${x.cols.map((c) => c.toLowerCase()).join(', ')})`)) E(T, `DDL ${x.nm} 칼럼 불일치 : ${d}`) }
    const pkd = ix[t.pk.nm.toLowerCase()]
    if (pkd && !pkd.includes(`(${t.pk.cols.map((c) => c.toLowerCase()).join(', ')})`)) E(T, `DDL PK 칼럼 불일치 : ${pkd}`)
    if (!cat.pkc.includes(t.pk.nm.toLowerCase())) E(T, `PK 제약 없음`)
    const nPart = cat.parts[T] || 0
    const wantPart = t.partition ? (t.partition.unit === 'MONTH' ? 217 : 19) : 0
    if (nPart !== wantPart) E(T, `하위 파티션 ${nPart} ≠ ${wantPart}`)
  }
  if (Object.keys(cat.cols).length !== phy.tables.length) E(AREA, `DDL 상위 테이블 ${Object.keys(cat.cols).length} ≠ ${phy.tables.length}`)
}

console.log(`[${AREA}] 테이블 ${phy.tables.length} · 칼럼 ${phy.tables.reduce((s, t) => s + t.cols.length, 0)} · 인덱스 ${phy.tables.reduce((s, t) => s + t.idx.length, 0)} · FK ${phy.tables.reduce((s, t) => s + t.fks.length, 0)} · 파티션 ${phy.tables.filter((t) => t.partition).length}`)
console.log(`오류 ${err.length}`); err.forEach((m) => console.log('  E ' + m))
console.log(`참고 ${info.length}`); info.forEach((m) => console.log('  i ' + m))
process.exitCode = err.length ? 1 : 0
