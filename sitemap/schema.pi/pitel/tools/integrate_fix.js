// 통합 관문 보정기(05) — 논리 모델 7개의 FK·관계 표기를 한 형식으로 맞춘다(멱등)
// fk = {area, ent(영역 접두 없는 엔터티명), attr[, also]} / rels.parent·child = 'AREA.엔터티명', fkAttrs = 배열
// 실행 : node tools/integrate_fix.js --write
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const AREAS = ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM']
const WRITE = process.argv.includes('--write')
const split = (s, a) => (/^[A-Z]{3}\./.test(s) ? [s.slice(0, 3), s.slice(4)] : [a, s])
let n = 0
for (const a of AREAS) {
  const f = path.join(ROOT, 'model', 'logical', a + '.json')
  const j = JSON.parse(fs.readFileSync(f, 'utf8'))
  const before = JSON.stringify(j)
  const normFk = (fk) => {
    const [ar, ent] = split(fk.ent, fk.area || a)
    const o = { area: ar, ent, attr: fk.attr }
    if (fk.also) o.also = fk.also.map(normFk)
    return o
  }
  for (const e of j.entities) {
    for (const at of e.attrs) if (at.fk) at.fk = normFk(at.fk)
    e.rels = (e.rels || []).map((r) => {
      const { fkAttr, ...rest } = r
      const o = { ...rest, parent: split(r.parent, a).join('.'), child: split(r.child, a).join('.') }
      o.fkAttrs = r.fkAttrs || (fkAttr ? [fkAttr] : [])
      return o
    })
  }
  if (JSON.stringify(j) !== before) { n++; if (WRITE) fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n') }
}
console.log(`표기 보정 대상 파일 ${n}${WRITE ? ' (기록)' : ' (점검만)'}`)

// ---------- 2단계 : areas.json crossRels ↔ 논리 교차 FK 일치(멱등) ----------
{
  const af = path.join(ROOT, 'model', 'areas.json')
  const ar = JSON.parse(fs.readFileSync(af, 'utf8'))
  const ents = new Map()
  for (const a of AREAS) for (const e of JSON.parse(fs.readFileSync(path.join(ROOT, 'model', 'logical', a + '.json'), 'utf8')).entities) ents.set(`${a}.${e.entNm}`, e)
  // 교차 FK → 관계(카디널리티)
  const want = new Map()
  for (const [k, e] of ents) for (const at of e.attrs) if (at.fk && at.fk.area !== k.slice(0, 3)) {
    const to = `${at.fk.area}.${at.fk.ent}`
    const r = (e.rels || []).find((x) => x.parent === to && x.fkAttrs.includes(at.attrNm))
    const card = r && r.card === '1:1' ? '1:1' : 'N:1'
    const prev = want.get(`${k}>${to}`)
    want.set(`${k}>${to}`, { from: k, to, card: prev && prev.card === 'N:1' ? 'N:1' : card, attrs: [...(prev ? prev.attrs : []), at.attrNm], relNm: (r && r.relNm) || '' })
  }
  const removed = [], added = [], cardFix = []
  const kept = []
  for (const c of ar.crossRels) {
    const k = `${c.from}>${c.to}`
    if (!want.has(k)) { removed.push(c); continue }
    const w = want.get(k)
    if (c.card !== w.card) { cardFix.push(`${k} ${c.card}→${w.card}`); c.card = w.card }
    kept.push(c)
  }
  const have = new Set(kept.map((c) => `${c.from}>${c.to}`))
  for (const [k, w] of want) if (!have.has(k)) { const c = { from: w.from, to: w.to, card: w.card, note: `FK ${w.attrs.join('·')} (05 통합 관문 추가)` }; kept.push(c); added.push(c) }
  ar.crossRels = kept
  if (ar.summary) ar.summary.crossRelCnt = kept.length
  console.log(`crossRels 삭제 ${removed.length} · 추가 ${added.length} · 카디널리티 ${cardFix.length} → ${kept.length}`)
  removed.forEach((c) => console.log(`  - ${c.from} > ${c.to} (${c.note || ''})`))
  added.forEach((c) => console.log(`  + ${c.from} > ${c.to} ${c.card} ${c.note}`))
  cardFix.forEach((c) => console.log(`  ~ ${c}`))
  if (WRITE && (removed.length || added.length || cardFix.length)) fs.writeFileSync(af, JSON.stringify(ar, null, 2) + '\n')
}
