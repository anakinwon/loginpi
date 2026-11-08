// physical_check.js : 물리 모델 관문 점검기(읽기 전용) — 논리 대비 누락·타입=도메인·이름 규칙·파티션·FK 인덱스·중복 인덱스·교차 FK 타입
// 실행 : node tools/physical_check.js <AREA>   (예 PAY) — 결함 0 이면 종료 코드 0
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const area = (process.argv[2] || '').toUpperCase()
if (!area) { console.error('사용법 : node tools/physical_check.js <AREA>'); process.exit(2) }
const load = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))

const phy = load(`model/physical/${area}.json`)
const lgc = load(`model/logical/${area}.json`)
const doms = Object.fromEntries(load('model/std/domains.json').map((d) => [d.domNm, d]))
const T4 = 100000000, T3P = 20000000 // 월 파티션 하한 / 연 파티션 하한(P2)
const errs = [], warns = []
const err = (m) => errs.push(m), warn = (m) => warns.push(m)

// 도메인 → 물리 타입
const domTp = (d) => {
  if (!d) return null
  if (['VARCHAR', 'CHAR'].includes(d.lgcTp)) return `${d.lgcTp}(${d.len})`
  if (d.lgcTp === 'NUMERIC') return d.scale ? `NUMERIC(${d.len},${d.scale})` : `NUMERIC(${d.len})`
  return d.lgcTp
}

// 전 영역 물리 테이블(교차 FK 부모 타입 대조) — 없으면 논리로 폴백
const allPhy = {}
for (const f of fs.readdirSync(path.join(ROOT, 'model/physical'))) {
  for (const t of load(`model/physical/${f}`).tables) allPhy[t.tblNm] = t
}
const allLgcTbl = {}
for (const f of fs.readdirSync(path.join(ROOT, 'model/logical'))) {
  for (const e of load(`model/logical/${f}`).entities) allLgcTbl[e.tblNm] = e
}
const parentColTp = (tbl, col) => {
  const t = allPhy[tbl]
  if (t) return (t.cols.find((c) => c.colNm === col) || {}).dataTp || null
  const e = allLgcTbl[tbl]
  const a = e && e.attrs.find((x) => x.phyNm === col)
  return a ? domTp(doms[a.domNm]) : null
}

const lgcById = Object.fromEntries(lgc.entities.map((e) => [e.entId, e]))
if (phy.tables.length !== lgc.entities.length) err(`테이블 수 ${phy.tables.length} ≠ 논리 엔터티 ${lgc.entities.length}`)
for (const e of lgc.entities) if (!phy.tables.find((t) => t.entId === e.entId)) err(`누락 테이블 ${e.entId} ${e.entNm}`)

const cmp = (a, b) => a.length <= b.length && a.every((x, i) => x === b[i]) // a 가 b 의 앞부분
let colCnt = 0
for (const t of phy.tables) {
  const tn = t.tblNm, lo = tn.toLowerCase()
  const e = lgcById[t.entId]
  if (!e) { err(`${tn} 논리 엔터티 없음`); continue }
  if (e.tblNm && e.tblNm !== tn) err(`${tn} 테이블명 ≠ 논리 tblNm ${e.tblNm}`)
  if (!/^PTL_[A-Z]{3}_[A-Z0-9_]+$/.test(tn) || !tn.startsWith(`PTL_${area}_`)) err(`${tn} 테이블명 형식`)
  const colNames = t.cols.map((c) => c.colNm)
  colCnt += t.cols.length
  // 논리 속성 ↔ 칼럼
  for (const a of e.attrs) {
    const c = t.cols.find((x) => x.colNm === a.phyNm)
    if (!c) { err(`${tn}.${a.phyNm} 논리 속성 누락`); continue }
    const exp = domTp(doms[a.domNm])
    if (!exp) err(`${tn}.${a.phyNm} 도메인 미등재 ${a.domNm}`)
    else if (c.dataTp !== exp) err(`${tn}.${a.phyNm} 타입 ${c.dataTp} ≠ 도메인 ${a.domNm}(${exp})`)
    if (!a.pk && c.nullYn !== a.nullYn) err(`${tn}.${a.phyNm} NULL 여부 불일치(논리 ${a.nullYn}, 물리 ${c.nullYn})`)
    if (a.pk && !c.pk) err(`${tn}.${a.phyNm} 논리 PK 인데 물리 PK 아님`)
  }
  const denormCols = (t.denorm || []).map((d) => d.col)
  const partKey = t.partition && t.partition.key
  for (const c of t.cols) {
    if (!e.attrs.find((a) => a.phyNm === c.colNm) && !denormCols.includes(c.colNm)) err(`${tn}.${c.colNm} 논리에 없는 칼럼(반정규화 사유 없음)`)
    if (c.colNm.length > 63) err(`${tn}.${c.colNm} 63자 초과`)
    if (/^LST_(MDDTM|MDFR_ID|RGDTM|RGTR_ID)$/.test(c.colNm)) err(`${tn} 시스템 칼럼이 모델 JSON 에 있음(D7)`)
  }
  for (const d of t.denorm || []) if (!d.why || !d.srcTbl) err(`${tn}.${d.col} 반정규화 사유·원천 누락`)
  // 칼럼 순서 PK → FK → 일반
  const fkColSet = new Set((t.fks || []).flatMap((f) => f.cols))
  const rank = (c) => (c.pk ? 0 : fkColSet.has(c.colNm) ? 1 : 2)
  const seqd = [...t.cols].sort((a, b) => a.seq - b.seq)
  for (let i = 1; i < seqd.length; i++) if (rank(seqd[i]) < rank(seqd[i - 1])) { err(`${tn} 칼럼 순서(PK→FK→일반) 위반 : ${seqd[i - 1].colNm} 다음 ${seqd[i].colNm}`); break }
  // PK
  if (t.pk.nm !== `PK_${tn}`) err(`${tn} PK 이름 ${t.pk.nm}`)
  if (t.pk.nm.length > 63) err(`${tn} PK 이름 63자 초과`)
  const lgcPk = e.attrs.filter((a) => a.pk).map((a) => a.phyNm)
  for (const k of lgcPk) if (!t.pk.cols.includes(k)) err(`${tn} PK 에 논리 PK ${k} 없음`)
  for (const k of t.pk.cols) if (!lgcPk.includes(k) && k !== partKey) err(`${tn} PK 에 논리 PK·파티션 키 아닌 ${k}`)
  for (const c of t.cols) if (c.pk !== t.pk.cols.includes(c.colNm)) err(`${tn}.${c.colNm} pk 표시 ≠ pk.cols`)
  // 파티션
  if (t.partition) {
    if (!t.pk.cols.includes(partKey)) err(`${tn} 파티션 키 ${partKey} ⊄ PK`)
    if (t.partition.from !== '2010-01' || t.partition.to !== '2027-12') err(`${tn} 파티션 범위 ${t.partition.from}~${t.partition.to}`)
    if (!colNames.includes(partKey)) err(`${tn} 파티션 키 칼럼 없음`)
    const unit = t.estRows >= T4 ? 'MONTH' : 'YEAR'
    if (t.partition.unit !== unit) warn(`${tn} 파티션 단위 ${t.partition.unit}(P2 기준 ${unit})`)
  } else if (t.estRows >= T3P) err(`${tn} ${t.estRows}행인데 파티션 없음(P2)`)
  // 인덱스 이름·중복
  const idxs = t.idx || []
  idxs.forEach((x, i) => {
    const nm = `X_${tn}_${String(i + 1).padStart(2, '0')}`
    if (x.nm !== nm) err(`${tn} 인덱스 이름 ${x.nm} ≠ ${nm}`)
    if (x.nm.length > 63) err(`${x.nm} 63자 초과`)
    for (const c of x.cols) if (!colNames.includes(c)) err(`${x.nm} 칼럼 ${c} 없음`)
    if (!x.why) err(`${x.nm} 근거 없음`)
  })
  const all = [{ nm: t.pk.nm, cols: t.pk.cols, where: null }, ...idxs.map((x) => ({ nm: x.nm, cols: x.cols, where: x.where || null }))]
  for (const a of all) for (const b of all) {
    if (a === b || a.where !== b.where || a.nm.startsWith('PK_')) continue
    if (cmp(a.cols, b.cols)) err(`중복 인덱스 ${a.nm}(${a.cols}) ⊂ ${b.nm}(${b.cols})`)
  }
  // FK
  ;(t.fks || []).forEach((f, i) => {
    const nm = `FK_${tn}_${String(i + 1).padStart(2, '0')}`
    if (f.nm !== nm) err(`${tn} FK 이름 ${f.nm} ≠ ${nm}`)
    for (const c of f.cols) if (!colNames.includes(c)) err(`${f.nm} 칼럼 ${c} 없음`)
    if (f.cols.length !== f.refCols.length) err(`${f.nm} 칼럼 수 불일치`)
    f.cols.forEach((c, j) => {
      const ct = (t.cols.find((x) => x.colNm === c) || {}).dataTp
      const pt = parentColTp(f.refTbl, f.refCols[j])
      if (!pt) err(`${f.nm} 부모 ${f.refTbl}.${f.refCols[j]} 없음`)
      else if (ct !== pt) err(`${f.nm} ${c} ${ct} ≠ 부모 ${f.refTbl}.${f.refCols[j]} ${pt}`)
    })
    // 부모 쪽 : refCols 가 부모 PK(또는 PK 에서 파티션 키 뺀 것)
    const pp = allPhy[f.refTbl]
    if (pp) {
      const ppk = pp.pk.cols.filter((c) => !(pp.partition && c === pp.partition.key && !f.refCols.includes(c)))
      if (ppk.join() !== f.refCols.join()) err(`${f.nm} 참조 ${f.refCols} ≠ 부모 PK ${pp.pk.cols}`)
    }
    // FK 인덱스 : FK 칼럼이 인덱스 앞부분이거나, 인덱스가 FK 칼럼 앞부분(마지막 1개만 빠짐)
    // 부분 인덱스는 `<FK 첫 칼럼> IS NOT NULL` 조건(선택 FK)만 인정
    const usable = all.filter((x) => !x.where || x.where.toLowerCase() === `${f.cols[0].toLowerCase()} is not null`)
    const covered = usable.some((x) => cmp(f.cols, x.cols) || (cmp(x.cols, f.cols) && x.cols.length >= f.cols.length - 1))
    if (!covered) warn(`${f.nm}(${f.cols}) → ${f.refTbl} 접근 인덱스 없음`)
  })
}

console.log(`[${area}] 테이블 ${phy.tables.length} · 칼럼 ${colCnt} · 인덱스 ${phy.tables.reduce((s, t) => s + (t.idx || []).length, 0)} · FK ${phy.tables.reduce((s, t) => s + (t.fks || []).length, 0)}`)
console.log(`오류 ${errs.length}`); errs.forEach((m) => console.log('  E ' + m))
console.log(`경고 ${warns.length}`); warns.forEach((m) => console.log('  W ' + m))
process.exit(errs.length ? 1 : 0)
