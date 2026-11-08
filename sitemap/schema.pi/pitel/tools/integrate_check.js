// 통합 관문 점검기(05) — 표준사전 4종 ↔ 논리 모델 7개 ↔ areas.json 정합을 점검한다
// 실행 : node tools/integrate_check.js  (오류 목록과 집계 출력, 파일 수정 없음)
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const AREAS = ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM']
const words = rd('model/std/words.json'), terms = rd('model/std/terms.json'), domains = rd('model/std/domains.json'), codes = rd('model/std/codes.json')
const areas = rd('model/areas.json')
const err = (k, m) => { (E[k] = E[k] || []).push(m) }
const E = {}
const abbr = new Map(), wnm = new Map()
for (const w of words) { if (abbr.has(w.abbr)) err('약어중복', w.abbr); abbr.set(w.abbr, w); if (wnm.has(w.wordNm)) err('단어중복', w.wordNm); wnm.set(w.wordNm, w) }
const tm = new Map(); const tphy = new Map()
for (const t of terms) { if (tm.has(t.termNm)) err('용어중복', t.termNm); tm.set(t.termNm, t); if (tphy.has(t.phyNm)) err('용어물리명중복', `${t.phyNm} ${tphy.get(t.phyNm)}/${t.termNm}`); tphy.set(t.phyNm, t.termNm)
  if (t.phyNm !== t.words.map((x) => wnm.get(x)?.abbr).join('_')) err('용어물리명≠단어조합', t.termNm)
}
const dm = new Set(domains.map((d) => d.domNm))
for (const t of terms) if (!dm.has(t.domNm)) err('용어도메인미등재', `${t.termNm} ${t.domNm}`)
const cm = new Map(codes.map((c) => [c.termNm, c]))
for (const t of terms) if (/(유형|구분|종류)코드$/.test(t.termNm) && !(cm.get(t.termNm)?.vals?.length)) err('코드값없음', t.termNm)
for (const c of codes) { if (!tm.has(c.termNm)) err('코드용어없음', c.termNm); if (c.kind === '구분' && c.vals.length > 3) err('구분코드4값+', c.termNm) }
const ents = new Map(); const cnt = {}; const tbls = new Map(); const usedTerms = new Set()
for (const a of AREAS) {
  const j = rd(`model/logical/${a}.json`); cnt[a] = { all: j.entities.length, CNCP: 0, LGCL: 0, STL: 0 }
  for (const e of j.entities) {
    cnt[a][e.stg] = (cnt[a][e.stg] || 0) + 1; if (e.moduleCd === 'STL') cnt[a].STL++
    const key = `${a}.${e.entNm}`; if (ents.has(key)) err('엔터티중복', key); ents.set(key, { ...e, area: a })
    if (tbls.has(e.tblNm)) err('테이블명중복', e.tblNm); tbls.set(e.tblNm, key)
    for (const at of e.attrs) {
      const t = tm.get(at.attrNm); usedTerms.add(at.attrNm)
      if (!t) { err('속성용어없음', `${key}.${at.attrNm}`); continue }
      if (t.phyNm !== at.phyNm) err('속성물리명불일치', `${key}.${at.attrNm} ${at.phyNm}≠${t.phyNm}`)
      if (t.domNm !== at.domNm) err('속성도메인불일치', `${key}.${at.attrNm} ${at.domNm}≠${t.domNm}`)
    }
  }
}
// 엔터티명 중복(다른 영역 같은 이름)
const byNm = {}; for (const [k, e] of ents) (byNm[e.entNm] = byNm[e.entNm] || []).push(k)
for (const [n, ks] of Object.entries(byNm)) if (ks.length > 1) err('같은엔터티명여러영역', ks.join(','))
// FK 정합 — 참조 엔터티·속성 존재, 도메인 일치
const fkX = []
for (const [k, e] of ents) for (const at of e.attrs) if (at.fk) {
  const pa = at.fk.area || e.area; const p = ents.get(`${pa}.${at.fk.ent}`)
  if (!p) { err('FK부모없음', `${k}.${at.attrNm} → ${pa}.${at.fk.ent}`); continue }
  const pat = p.attrs.find((x) => x.attrNm === at.fk.attr)
  if (!pat) { err('FK부모속성없음', `${k}.${at.attrNm} → ${pa}.${at.fk.ent}.${at.fk.attr}`); continue }
  if (!pat.pk) err('FK부모속성PK아님', `${k}.${at.attrNm} → ${pa}.${at.fk.ent}.${at.fk.attr}`)
  if (pat.domNm !== at.domNm) err('FK도메인불일치', `${k}.${at.attrNm}(${at.domNm}) → ${pa}.${at.fk.ent}.${at.fk.attr}(${pat.domNm})`)
  if (pa !== e.area) fkX.push({ from: k, to: `${pa}.${at.fk.ent}`, attr: at.attrNm, pattr: at.fk.attr, dom: at.domNm, nullYn: at.nullYn })
}
// crossRels ↔ 실제 교차 FK
const cr = new Set(areas.crossRels.map((r) => `${r.from}>${r.to}`))
const fkPairs = new Set(fkX.map((x) => `${x.from}>${x.to}`))
for (const r of areas.crossRels) {
  if (!ents.has(r.from)) err('crossRel끝없음', `from ${r.from}`)
  if (!ents.has(r.to)) err('crossRel끝없음', `to ${r.to}`)
  if (r.from.split('.')[0] === r.to.split('.')[0]) err('crossRel영역내부', `${r.from}>${r.to}`)
  else if (!fkPairs.has(`${r.from}>${r.to}`)) err('crossRel인데FK없음', `${r.from}>${r.to}`)
}
for (const p of fkPairs) if (!cr.has(p)) err('교차FK인데crossRel없음', p)
const unusedTerms = terms.filter((t) => !usedTerms.has(t.termNm)).length
const tot = Object.values(cnt).reduce((s, c) => s + c.all, 0)
console.log(JSON.stringify({ words: words.length, terms: terms.length, usedTerms: usedTerms.size, unusedTerms, domains: domains.length, codes: codes.length, codeVals: codes.reduce((s, c) => s + c.vals.length, 0), cnt, tot, crossRels: areas.crossRels.length, crossFkPairs: fkPairs.size, crossFkAttrs: fkX.length }, null, 1))
for (const [k, v] of Object.entries(E)) console.log(`\n[${k}] ${v.length}\n  ` + v.slice(0, 40).join('\n  '))
if (process.argv.includes('--fk')) console.log(fkX.map((x) => `${x.from}.${x.attr} → ${x.to}.${x.pattr} ${x.dom} ${x.nullYn ? 'NULL' : 'NN'}`).join('\n'))
// 관계(rels) ↔ FK·crossRels 카디널리티·선택성 정합
const relBy = new Map()
for (const [k, e] of ents) for (const r of e.rels || []) {
  if (!ents.has(r.parent) || !ents.has(r.child)) { err('rel끝없음', `${k}: ${r.parent}>${r.child}`); continue }
  for (const fa of r.fkAttrs || []) relBy.set(`${r.child}>${r.parent}>${fa}`, r)
}
for (const [k, e] of ents) for (const at of e.attrs) if (at.fk) {
  const p = `${at.fk.area}.${at.fk.ent}`
  const r = relBy.get(`${k}>${p}>${at.attrNm}`)
  if (!r) { err('FK인데rel없음', `${k}.${at.attrNm} → ${p}`); continue }
  if (r.opt !== r.fkAttrs.some((fa) => e.attrs.find((x) => x.attrNm === fa)?.nullYn)) err('rel선택성≠NULL', `${k}.${at.attrNm} opt=${r.opt} null=${at.nullYn}`)
}
const crMap = new Map(areas.crossRels.map((r) => [`${r.from}>${r.to}`, r]))
for (const x of fkX) {
  const c = crMap.get(`${x.from}>${x.to}`); if (!c) continue
  const r = relBy.get(`${x.from}>${x.to}>${x.attr}`); if (!r) continue
  const want = r.card === '1:1' ? '1:1' : 'N:1'
  if (c.card !== want) err('crossRel카디널리티불일치', `${x.from}>${x.to} cross=${c.card} rel=${r.card}`)
}
for (const [k, v] of Object.entries(E)) if (['rel끝없음', 'FK인데rel없음', 'rel선택성≠NULL', 'crossRel카디널리티불일치'].includes(k)) console.log(`\n[${k}] ${v.length}\n  ` + v.slice(0, 40).join('\n  '))
