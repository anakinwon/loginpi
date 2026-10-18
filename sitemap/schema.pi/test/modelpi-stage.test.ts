// 주제영역 단계 관문(마스터 지시 2026-10-17) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dgmWhy, phyDgmWhy, scopeWhy } from '../src/lib/modelpi/stage.ts'

const chk = {
  checks: [{ ent_id: 'a', pk: true }, { ent_id: 'b', pk: false }, { ent_id: 'c', pk: true }] as never,
  fkGaps: [{ chld_ent_id: 'c' }] as never,
  issues: [{ ent_id: 'a', action: 'review' }, { ent_id: 'c', action: 'fix' }] as never,
}
const rels = [{ prnt_ent_id: 'a', chld_ent_id: 'x', crdn_cd: 'NM' }, { prnt_ent_id: 'c', chld_ent_id: 'a', crdn_cd: '1N' }]

test('범위 관문 : 범위 안 엔터티만 판정(검토 이슈는 막지 않음)', () => {
  assert.deepEqual(scopeWhy(chk, rels, new Set(['a'])), ['N:M 관계 1건(해소 필요)'])
  assert.deepEqual(scopeWhy(chk, rels, new Set(['b'])), ['주식별자 없는 엔터티 1개'])
  assert.deepEqual(scopeWhy(chk, rels, new Set(['c'])), ['FK 상속 누락 1건', '수정 필요 점검 이슈 1건'])
  assert.deepEqual(scopeWhy(chk, rels, new Set()), ['엔터티가 없습니다'])
})

test('ERD 작성완료 관문 — 주제영역·저장·테이블·배치', () => {
  assert.match(dgmWhy({ subj: false, saved: true, own: 1, unplaced: 0 })[0], /주제영역/)
  assert.match(dgmWhy({ subj: true, saved: false, own: 1, unplaced: 0 })[0], /저장/)
  assert.deepEqual(dgmWhy({ subj: true, saved: true, own: 2, unplaced: 0 }), [])
  const w = dgmWhy({ subj: true, saved: true, own: 0, unplaced: 3 })
  assert.equal(w.length, 2)
  assert.match(w[1], /3개/)
})

test('테이블 상태 ERD 역순 관문', () => {
  const lock = { ents: new Set(['a']), subjs: new Set(['s1']) }
  assert.match(phyDgmWhy('WRT', { ent_id: 'a', subj_id: 's1' }, lock)[0], /ERD 완료 취소/)
  assert.deepEqual(phyDgmWhy('WRT', { ent_id: 'b', subj_id: 's2' }, lock), [])
  assert.match(phyDgmWhy('CMPTN', { ent_id: 'b', subj_id: 's1' }, lock)[0], /새 테이블/)
  assert.deepEqual(phyDgmWhy('CMPTN', { ent_id: 'a', subj_id: 's1' }, lock), [])
  assert.deepEqual(phyDgmWhy('CMPTN', { ent_id: 'c', subj_id: 's2' }, lock), [])
})
