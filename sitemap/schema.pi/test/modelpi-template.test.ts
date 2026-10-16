// ModelPi 업종 템플릿 정합·업종 추천 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { INDSTRY_CDS, TEMPLATES, entKey, recommendIndustries } from '../src/lib/modelpi/template.ts'

test('템플릿 8종 : 코드 = sql/022 CHECK 목록, 참조 정합(관계·속성·물리 → 엔터티 키, 엔터티 → 주제영역), 약어 유일', () => {
  const sql = readFileSync(new URL('../sql/022_mdl_indstry.sql', import.meta.url), 'utf8')
  const inCheck = sql.match(/indstry_cd IN \(([^)]+)\)/)![1].replace(/'/g, '').split(',')
  assert.deepEqual(inCheck, [...INDSTRY_CDS])
  for (const cd of INDSTRY_CDS) {
    const t = TEMPLATES[cd]
    const keys = new Set(t.entities.map(entKey))
    assert.equal(keys.size, t.entities.length, `${cd} 엔터티 키 중복`)
    const subjs = new Set(t.subjects.map((s) => s.nm))
    assert.equal(new Set(t.subjects.map((s) => s.abbr)).size, t.subjects.length, `${cd} 약어 중복`)
    for (const e of t.entities) assert.ok(subjs.has(e.subj), `${cd} ${entKey(e)} 주제영역`)
    for (const r of t.rels) assert.ok(keys.has(r.prnt) && keys.has(r.chld), `${cd} 관계 ${r.prnt}→${r.chld}`)
    for (const r of t.rels) assert.ok(!(r.idnt === 'Y' && (r.crdn === 'NM' || r.prnt === r.chld)), `${cd} 식별 제약 ${r.prnt}→${r.chld}`)
    for (const a of t.attrs) assert.ok(keys.has(a.ent) && a.pk.every((p) => a.terms.includes(p)), `${cd} 속성 ${a.ent}`)
    for (const p of t.physical) assert.ok(keys.has(p.ent), `${cd} 물리 ${p.ent}`)
    for (const e of t.entities) if (e.tp === 'AGG') assert.equal(e.clss, '집계', `${cd} 집계 엔터티는 '집계'로 끝남`)
  }
})

test('업종 추천 : 키워드 점수 순, 근거 단어, 빈 입력·무관 입력은 빈 목록', () => {
  assert.equal(recommendIndustries('온라인 쇼핑몰 구축')[0].cd, 'ECOM')
  assert.equal(recommendIndustries('차세대 계좌 대출 시스템')[0].cd, 'FIN')
  assert.equal(recommendIndustries('MES 설비 공정 고도화')[0].cd, 'MFG')
  assert.equal(recommendIndustries('학사 수강 성적')[0].cd, 'EDU')
  assert.ok(recommendIndustries('온라인 쇼핑몰')[0].why.includes('쇼핑몰'))
  assert.deepEqual(recommendIndustries(''), [])
  assert.deepEqual(recommendIndustries('zzz'), [])
})

test('스키마 접두사 후보 : AI → 업종 코드 → 앞 2·3자 → TB, 형식·사용 중 제외, 최대 4', async () => {
  const { tblPfxCands } = await import('../src/lib/modelpi/template.ts')
  assert.deepEqual(tblPfxCands('ECOM', []), ['ECOM', 'EC', 'ECO', 'TB'])
  assert.deepEqual(tblPfxCands('ECOM', ['TB', 'ECOM']), ['EC', 'ECO', 'ECOA', 'ECOB'])
  assert.deepEqual(tblPfxCands('FIN', [], ['bank', 'x1', 'TOOLONG']), ['BANK', 'FIN', 'FI', 'TB'])
  assert.deepEqual(tblPfxCands(null, ['TB']), ['TBA', 'TBB', 'TBC', 'TBD'])
  for (const x of tblPfxCands('EDU', ['EDU', 'ED'])) assert.match(x, /^[A-Z]{2,4}$/)
})
