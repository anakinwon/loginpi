// 학습 문제 은행·채점·진도 요약·사전 필터 시험 — node --test src/lib/learn/learn.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QUESTIONS, TOPICS, grade, summarize } from './questions.ts'
import { CASES } from './cases.ts'
import { DICT, filterDict } from './dict.ts'

test('문제 은행 무결성', () => {
  assert.ok(QUESTIONS.length >= 20)
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length)
  for (const q of QUESTIONS) {
    assert.ok(/^q\d{2}$/.test(q.id), q.id) // dbm_lrn_prgs.qst_id CHECK 와 일치
    assert.ok(TOPICS.includes(q.topic), q.id)
    assert.ok(q.answer >= 0 && q.answer < q.choices.length, q.id)
    assert.ok(q.expl.length > 0, q.id)
  }
  for (const t of TOPICS) assert.ok(QUESTIONS.some((q) => q.topic === t), t)
  assert.ok(CASES.length >= 6)
})

test('채점', () => {
  const q = QUESTIONS[0]
  assert.equal(grade(q.id, q.answer), true)
  assert.equal(grade(q.id, (q.answer + 1) % q.choices.length), false)
  assert.equal(grade(q.id, 99), null)
  assert.equal(grade(q.id, 1.5), null)
  assert.equal(grade('nope', 0), null)
})

test('진도 요약 — 폐기 id 무시', () => {
  const s = summarize([
    { qstId: 'q01', crctYn: 'Y' },
    { qstId: 'q05', crctYn: 'N' },
    { qstId: 'q99', crctYn: 'Y' },
  ])
  assert.equal(s.solved, 2)
  assert.equal(s.correct, 1)
  assert.equal(s.total, QUESTIONS.length)
  const idx = s.byTopic.find((b) => b.topic === 'INDEX')
  assert.deepEqual([idx.solved, idx.correct], [1, 1])
})

test('사전 필터', () => {
  assert.equal(filterDict(DICT, 'ALL', '').length, DICT.length)
  assert.ok(filterDict(DICT, 'ALL', 'nvl').every((r) => r.oracle.includes('NVL')))
  assert.ok(filterDict(DICT, 'SEQ', '').every((r) => r.cat === 'SEQ'))
  assert.equal(filterDict(DICT, 'TYPE', 'nextval').length, 0)
})
