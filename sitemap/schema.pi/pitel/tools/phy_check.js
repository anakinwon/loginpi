// 물리 모델 관문 점검기(읽기 전용) — model/physical/<AREA>.json + ddl/<NN>_<area>_*.sql 을 논리·표준·타 영역 물리와 대조한다.
// 실행 : node tools/phy_check.js ORD   (sitemap/schema.pi/pitel 에서) — 오류(E)·경고(W) 목록 출력, 오류가 있으면 종료 코드 1
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const AREA = (process.argv[2] || '').toUpperCase()
if (!AREA) throw new Error('사용법 : node tools/phy_check.js <AREA>')
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const SYS = ['LST_MDDTM', 'LST_MDFR_ID', 'LST_RGDTM', 'LST_RGTR_ID']
const Y_FROM = 2010
const Y_TO = 2027

const phy = rd(`model/physical/${AREA}.json`)
const lgc = rd(`model/logical/${AREA}.json`)
const domains = Object.fromEntries(rd('model/std/domains.json').map((d) => [d.domNm, d]))
const pgType = (domNm) => {
  const d = domains[domNm]
  if (!d) return null
  if (['TIMESTAMP', 'DATE', 'TEXT'].includes(d.lgcTp)) return d.lgcTp
  if (d.lgcTp === 'NUMERIC') return d.scale ? `NUMERIC(${d.len},${d.scale})` : `NUMERIC(${d.len})`
  return `${d.lgcTp}(${d.len})`
}

// 전 영역 논리 엔터티(영역.엔터티명 → 엔터티), 전 영역 물리 테이블(테이블명 → 테이블)
const lgcEnt = {}
for (const f of fs.readdirSync(path.join(ROOT, 'model/logical'))) {
  const j = rd('model/logical/' + f)
  for (const e of j.entities) lgcEnt[`${j.area}.${e.entNm}`] = e
}
const phyTbl = {}
for (const f of fs.readdirSync(path.join(ROOT, 'model/physical'))) {
  for (const t of rd('model/physical/' + f).tables) phyTbl[t.tblNm] = t
}

const errs = []
const warns = []
const E = (m) => errs.push(m)
const W = (m) => warns.push(m)

// ── 1. 논리 대비 누락 테이블·칼럼, 타입 = 도메인 ─────────────────
const tblByEnt = Object.fromEntries(phy.tables.map((t) => [t.entId, t]))
for (const e of lgc.entities) {
  const t = tblByEnt[e.entId]
  if (!t) { E(`누락 테이블 : ${e.entId} ${e.entNm}`); continue }
  if (t.tblNm !== e.tblNm) E(`${t.tblNm} : 테이블명 ≠ 논리 tblNm ${e.tblNm}(사전 tblSfx)`)
  const cm = Object.fromEntries(t.cols.map((c) => [c.colNm, c]))
  for (const a of e.attrs) {
    const c = cm[a.phyNm]
    if (!c) { E(`${t.tblNm} : 누락 칼럼 ${a.phyNm}(${a.attrNm})`); continue }
    const want = pgType(a.domNm)
    if (c.dataTp !== want) E(`${t.tblNm}.${c.colNm} : 타입 ${c.dataTp} ≠ 도메인 ${a.domNm}=${want}`)
    if (c.nullYn !== a.nullYn) W(`${t.tblNm}.${c.colNm} : NULL 허용 ${c.nullYn} ≠ 논리 ${a.nullYn}`)
    if (!!a.pk && !c.pk) E(`${t.tblNm}.${c.colNm} : 논리 PK 인데 물리 PK 아님`)
  }
  // 논리에 없는 칼럼 = 반정규화 또는 파티션 키 추가여야 함
  const lgcCols = new Set(e.attrs.map((a) => a.phyNm))
  const denCols = new Set((t.denorm || []).map((d) => d.col))
  for (const c of t.cols) {
    if (lgcCols.has(c.colNm)) continue
    if (!denCols.has(c.colNm)) E(`${t.tblNm}.${c.colNm} : 논리에 없고 반정규화 사유도 없음`)
  }
  for (const d of t.denorm || []) {
    if (!d.why || !d.srcTbl) E(`${t.tblNm}.${d.col} : 반정규화 사유·원천 없음`)
    if (!cm[d.col]) E(`${t.tblNm}.${d.col} : 반정규화 칼럼이 cols 에 없음`)
  }
  // 칼럼 순서 PK → 일반
  const seqs = t.cols.map((c) => c.seq)
  if (seqs.some((s, i) => s !== i + 1)) E(`${t.tblNm} : seq 가 1..n 연속 아님`)
  const lastPk = Math.max(...t.cols.filter((c) => c.pk).map((c) => c.seq))
  if (t.cols.some((c) => !c.pk && c.seq < lastPk)) E(`${t.tblNm} : PK 칼럼이 앞에 모여 있지 않음`)
  if (t.cols.some((c) => SYS.includes(c.colNm))) E(`${t.tblNm} : 시스템 칼럼이 JSON 에 있음(D7 위반)`)
}
for (const t of phy.tables) if (!lgc.entities.find((e) => e.entId === t.entId)) E(`논리에 없는 테이블 ${t.tblNm}`)

// ── 2. 이름 규칙·63자 ─────────────────────────────────────────────
for (const t of phy.tables) {
  const cs = new Set(t.cols.map((c) => c.colNm))
  if (!t.tblNm.startsWith(`PTL_${AREA}_`)) E(`${t.tblNm} : 접두 PTL_${AREA}_ 아님`)
  if (t.pk.nm !== `PK_${t.tblNm}`.slice(0, 63)) E(`${t.tblNm} : PK 이름 ${t.pk.nm}`)
  const pkCols = t.cols.filter((c) => c.pk).map((c) => c.colNm)
  if (pkCols.join() !== t.pk.cols.join()) E(`${t.tblNm} : pk.cols ≠ pk 표시 칼럼`)
  t.idx.forEach((x, i) => {
    const nn = String(i + 1).padStart(2, '0')
    const want = `X_${t.tblNm}`.slice(0, 63 - 3) + '_' + nn
    if (x.nm !== want) E(`${t.tblNm} : 인덱스 이름 ${x.nm} ≠ ${want}`)
    if (!x.why) E(`${x.nm} : 사유 없음`)
    for (const c of x.cols) if (!cs.has(c)) E(`${x.nm} : 칼럼 ${c} 없음`)
  })
  t.fks.forEach((f, i) => {
    const nn = String(i + 1).padStart(2, '0')
    const want = `FK_${t.tblNm}`.slice(0, 63 - 3) + '_' + nn
    if (f.nm !== want) E(`${t.tblNm} : FK 이름 ${f.nm} ≠ ${want}`)
  })
  for (const n of [t.tblNm, t.pk.nm, ...t.idx.map((x) => x.nm), ...t.fks.map((f) => f.nm), ...t.cols.map((c) => c.colNm)]) {
    if (n.length > 63) E(`63자 초과 : ${n}`)
    if (n !== n.toUpperCase()) E(`모델 이름 대문자 아님 : ${n}`)
  }
}

// ── 3. FK : 부모 존재·타입 일치·조인 인덱스 ──────────────────────
for (const t of phy.tables) {
  const cm = Object.fromEntries(t.cols.map((c) => [c.colNm, c]))
  const leads = [t.pk.cols, ...t.idx.map((x) => x.cols)]
  for (const f of t.fks) {
    const p = phyTbl[f.refTbl]
    let parentTypes = null
    if (p) {
      if (p.pk.cols.join() !== f.refCols.join()) {
        // 파티션 테이블 PK 는 파티션 키가 붙으므로 접두 일치만 허용
        if (!(p.partition && p.pk.cols.slice(0, f.refCols.length).join() === f.refCols.join())) W(`${f.nm} : 참조 칼럼 ${f.refCols} ≠ 부모 PK ${p.pk.cols}`)
      }
      parentTypes = f.refCols.map((rc) => (p.cols.find((c) => c.colNm === rc) || {}).dataTp)
    } else {
      // 부모 물리 미작성(타 영역) → 논리 사전으로 해석
      let pe = null
      for (const e of Object.values(lgcEnt)) if (e.tblNm === f.refTbl) pe = e
      if (!pe) { E(`${f.nm} : 부모 테이블 ${f.refTbl} 없음(논리·물리)`); continue }
      parentTypes = f.refCols.map((rc) => { const a = pe.attrs.find((x) => x.phyNm === rc); return a ? pgType(a.domNm) : undefined })
    }
    f.cols.forEach((c, i) => {
      if (!cm[c]) E(`${f.nm} : 자식 칼럼 ${c} 없음`)
      else if (cm[c].dataTp !== parentTypes[i]) E(`${f.nm} : ${t.tblNm}.${c} ${cm[c].dataTp} ≠ ${f.refTbl}.${f.refCols[i]} ${parentTypes[i]}`)
    })
    const covered = leads.some((l) => f.cols.every((c, i) => l[i] === c))
    if (!covered) W(`${t.tblNm} : FK ${f.nm}(${f.cols}) → ${f.refTbl} 선두 인덱스 없음`)
  }
  // 중복 인덱스 : 같은 칼럼 목록, 또는 다른 인덱스(PK 포함)의 선두 접두(부분 인덱스 조건이 같을 때)
  const all = [{ nm: t.pk.nm, cols: t.pk.cols, where: undefined }, ...t.idx]
  for (const a of t.idx) for (const b of all) {
    if (a === b) continue
    if ((a.where || '') !== (b.where || '')) continue
    if (a.cols.length <= b.cols.length && a.cols.every((c, i) => b.cols[i] === c) && !a.unq) E(`중복 인덱스 : ${a.nm}(${a.cols}) ⊂ ${b.nm}(${b.cols})`)
  }
}

// ── 4. 파티션 ─────────────────────────────────────────────────────
for (const t of phy.tables) {
  if (!t.partition) { if (t.estRows >= 30_000_000) W(`${t.tblNm} : ${t.estRows.toLocaleString()}행인데 파티션 없음`); continue }
  const keys = [].concat(t.partition.key)
  for (const k of keys) if (!t.pk.cols.includes(k)) E(`${t.tblNm} : 파티션 키 ${k} ⊄ PK`)
}

// ── 5. DDL 대조 ───────────────────────────────────────────────────
const ddlDir = path.join(ROOT, 'ddl')
const tf = fs.readdirSync(ddlDir).find((f) => f.endsWith(`_${AREA.toLowerCase()}_tables.sql`))
const cf = fs.readdirSync(ddlDir).find((f) => f.endsWith(`_${AREA.toLowerCase()}_constraints.sql`))
const tsql = fs.readFileSync(path.join(ddlDir, tf), 'utf8')
const csql = fs.readFileSync(path.join(ddlDir, cf), 'utf8')
for (const t of phy.tables) {
  const tl = t.tblNm.toLowerCase()
  const m = tsql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${tl} \\(([\\s\\S]*?)\\n\\)( PARTITION BY RANGE \\((\\w+)\\))?;`))
  if (!m) { E(`DDL 에 ${tl} 없음`); continue }
  const lines = m[1].split('\n').map((l) => l.trim()).filter(Boolean)
  const ddlCols = lines.map((l) => l.split(/\s+/)[0])
  const want = [...t.cols.map((c) => c.colNm.toLowerCase()), ...SYS.map((s) => s.toLowerCase())]
  if (ddlCols.join() !== want.join()) E(`${tl} : DDL 칼럼 순서 ≠ JSON+시스템 4(D7)`)
  for (const c of t.cols) {
    const l = lines.find((x) => x.split(/\s+/)[0] === c.colNm.toLowerCase())
    if (l && !l.includes(` ${c.dataTp}`)) E(`${tl}.${c.colNm} : DDL 타입 불일치`)
    if (l && c.nullYn === l.includes('NOT NULL')) E(`${tl}.${c.colNm} : DDL NULL 불일치`)
  }
  if (!!t.partition !== !!m[2]) E(`${tl} : 파티션 선언 JSON ≠ DDL`)
  if (t.partition) {
    if (m[3] !== [].concat(t.partition.key)[0].toLowerCase()) E(`${tl} : 파티션 키 DDL 불일치`)
    // 하위 파티션 = 이 테이블 블록의 생성 루프(범위 Y_FROM~Y_TO) + DEFAULT 1개. 하위 이름 접미는 영역마다 달라 범위·존재만 본다(실제 개수는 DB 실행으로 확인)
    const end = tsql.indexOf('\n-- ', m.index)
    const blk = tsql.slice(m.index, end < 0 ? tsql.length : end)
    if (!blk.includes(String(Y_FROM)) || !blk.includes(String(Y_TO))) E(`${tl} : 파티션 범위 ${Y_FROM}~${Y_TO} 아님`)
    if (!blk.includes(`PARTITION OF ${tl} DEFAULT`)) E(`${tl} : DEFAULT 파티션 없음`)
  }
  if (!csql.includes(`pk_${tl}`)) E(`${tl} : constraints DDL 에 PK 없음`)
  for (const x of t.idx) {
    const re = new RegExp(`CREATE ${x.unq ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${x.nm.toLowerCase()} ON ${tl} \\(${x.cols.map((c) => c.toLowerCase()).join(', ')}\\)`)
    if (!re.test(csql)) E(`${x.nm} : constraints DDL 불일치`)
  }
}
if (/\bFOREIGN KEY\b|\bREFERENCES\b/i.test(tsql + csql)) E('DDL 에 FK 제약 있음(D6 위반)')
if (/CREATE (TABLE|INDEX|UNIQUE INDEX) (?!IF NOT EXISTS)/.test(tsql + csql)) E('IF NOT EXISTS 없는 CREATE 있음(재실행 불안전)')

console.log(`[${AREA}] 테이블 ${phy.tables.length} · 칼럼 ${phy.tables.reduce((s, t) => s + t.cols.length, 0)} · 인덱스 ${phy.tables.reduce((s, t) => s + t.idx.length, 0)} · FK ${phy.tables.reduce((s, t) => s + t.fks.length, 0)} · 파티션 ${phy.tables.filter((t) => t.partition).length}`)
for (const m of errs) console.log('E ' + m)
for (const m of warns) console.log('W ' + m)
console.log(`오류 ${errs.length} · 경고 ${warns.length}`)
process.exit(errs.length ? 1 : 0)
