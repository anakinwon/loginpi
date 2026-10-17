// 주제영역 단계 관문(마스터 지시 2026-10-17) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scopeWhy } from '../src/lib/modelpi/stage.ts'

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
