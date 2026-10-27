// note-rules.ts 판정 시험 — node --test src/lib/note-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  frameDiff,
  isJpeg,
  noteMarkdown,
  noteState,
  noteUrl,
  recAlert,
  SHOT_DIFF,
  shotAllowed,
} from './note-rules.ts'

const frame = (v) => new Uint8ClampedArray(64 * 36 * 4).fill(v)

test('frameDiff — 같은 화면 0, 슬라이드 전환은 문턱 이상', () => {
  assert.equal(frameDiff(frame(100), frame(100)), 0)
  assert.ok(frameDiff(frame(0), frame(255)) > SHOT_DIFF)
  assert.ok(frameDiff(frame(100), frame(105)) < SHOT_DIFF)
  assert.equal(frameDiff(frame(0), new Uint8ClampedArray(8)), 255)
})

test('shotAllowed — 60초 창 안 분당 2장', () => {
  assert.equal(shotAllowed([], 0), true)
  assert.equal(shotAllowed([0], 1000), true)
  assert.equal(shotAllowed([0, 1000], 2000), false)
  assert.equal(shotAllowed([0, 1000], 60_001), true)
})

test('noteState — {notes:boolean} 만', () => {
  assert.equal(noteState({ notes: true }), true)
  assert.equal(noteState({ notes: false, rec: true }), false)
  assert.equal(noteState({ rec: true }), null)
  assert.equal(noteState('x'), null)
  assert.equal(noteState(null), null)
})

test('isJpeg·noteUrl', () => {
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), true)
  assert.equal(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false)
  assert.equal(noteUrl('https://a.b/', 'ko', 'x'), 'https://a.b/ko/notes/x')
})

test('noteMarkdown — 요약·할 일 체크박스·캡처 위치·빈 조각 생략', () => {
  const md = noteMarkdown(
    {
      title: 'T',
      start: 's',
      end: 'e',
      summary: { points: ['p'], decisions: [], todos: ['t'] },
    },
    [
      { at: '14:00', spk: 'A', text: 'hi\nthere', shot: false },
      { at: '14:01', spk: '', text: null, shot: true },
      { at: '14:02', spk: 'B', text: '  ', shot: false },
    ],
    {
      points: 'P',
      decisions: 'D',
      todos: 'TD',
      transcript: 'TR',
      shot: 'S',
      cut: 'CUT',
    },
  )
  assert.match(md, /^# T\n/)
  assert.match(md, /## P\n\n- p\n/)
  assert.doesNotMatch(md, /## D/)
  assert.match(md, /- \[ \] t/)
  assert.match(md, /- 14:00 \*\*A\*\* hi there/)
  assert.match(md, /- 14:01 \[S\]/)
  assert.doesNotMatch(md, /14:02/)
  assert.doesNotMatch(md, /CUT/)
  const L = {
    points: 'P',
    decisions: 'D',
    todos: 'TD',
    transcript: 'TR',
    shot: 'S',
    cut: 'CUT',
  }
  const cutMd = noteMarkdown(
    { title: 'T', start: 's', end: null, summary: null },
    [],
    L,
    true,
  )
  assert.ok(cutMd.endsWith('_… CUT_\n'))
})

test('recAlert — 대면 노트 경고 우선순위(오류 > 마이크 끊김 > 한도)', () => {
  const s = { err: null, limited: false, micLost: false }
  assert.equal(recAlert(s), null)
  assert.equal(recAlert({ ...s, limited: true }), 'limited')
  assert.equal(recAlert({ ...s, limited: true, micLost: true }), 'micLost')
  assert.equal(recAlert({ err: 'x', limited: true, micLost: true }), 'err')
})
