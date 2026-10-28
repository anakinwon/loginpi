// engage-rules.ts 시험 — node src/lib/engage-rules.test.mjs (설문 입력·집계·출석 시간·CSV·refresh 신호)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attendSec, beatDue, beatStops, charsLeft, cleanPoll, cleanQuestion, csvCell, fmtDur, isOnline, parseRefresh, pollVoting, sendKey, tally, toCsv, leftNow, LOW_LEFT_SEC, splitLeft } from './engage-rules.ts'

test('설문 입력 — 2~10개·중복·길이', () => {
  assert.deepEqual(cleanPoll(' 다음 주제? ', [' A', 'B ']), { q: '다음 주제?', opts: ['A', 'B'] })
  assert.equal(cleanPoll('q', ['A']), null)
  assert.equal(cleanPoll('q', Array.from({ length: 11 }, (_, i) => `o${i}`)), null)
  assert.equal(cleanPoll('q', ['A', 'a']), null) // 대소문자만 다른 중복
  assert.equal(cleanPoll('q', ['A', '  ']), null)
  assert.equal(cleanPoll('', ['A', 'B']), null)
  assert.equal(cleanPoll('x'.repeat(501), ['A', 'B']), null)
  assert.equal(cleanPoll('q', ['x'.repeat(201), 'B']), null)
  assert.equal(cleanPoll('q', 'A,B'), null)
})

test('질문 입력', () => {
  assert.equal(cleanQuestion('  왜요? '), '왜요?')
  assert.equal(cleanQuestion(' '), null)
  assert.equal(cleanQuestion('x'.repeat(501)), null)
  assert.equal(cleanQuestion(3), null)
})

test('설문 집계 — 순서 유지·0표 채움·비율', () => {
  const opts = [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ]
  const r = tally(opts, { a: 9, b: 4, c: 7 })
  assert.deepEqual(r.map((x) => [x.id, x.n, x.pct]), [['a', 9, 45], ['b', 4, 20], ['c', 7, 35]])
  assert.deepEqual(tally(opts, {}).map((x) => x.pct), [0, 0, 0])
  assert.deepEqual(tally(opts, { b: 1 }).map((x) => x.n), [0, 1, 0])
})

test('출석 시간·접속 판정', () => {
  assert.equal(attendSec('2026-10-27T10:00:00Z', '2026-10-27T11:02:30Z'), 3750)
  assert.equal(attendSec('2026-10-27T10:00:00Z', '2026-10-27T09:00:00Z'), 0)
  assert.equal(attendSec('bad', '2026-10-27T09:00:00Z'), 0)
  assert.equal(fmtDur(3750), '1:02:30')
  assert.equal(fmtDur(303), '5:03')
  assert.equal(fmtDur(0), '0:00')
  const now = Date.parse('2026-10-27T10:05:00Z')
  assert.equal(isOnline('2026-10-27T10:04:00Z', now), true)
  assert.equal(isOnline('2026-10-27T10:02:00Z', now), false)
})

test('CSV — 따옴표·수식 주입·BOM', () => {
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(csvCell('-1'), "'-1")
  assert.equal(csvCell(null), '')
  assert.equal(toCsv([['이름', '분'], ['김', 3]]), '﻿이름,분\r\n김,3\r\n')
})

test('refresh 신호 모양', () => {
  assert.deepEqual(parseRefresh({ what: 'polls', kind: 'new' }), { what: 'polls', isNew: true })
  assert.deepEqual(parseRefresh({ what: 'qna' }), { what: 'qna', isNew: false })
  assert.equal(parseRefresh({ what: 'chat' }), null)
  assert.equal(parseRefresh('polls'), null)
  assert.equal(parseRefresh(null), null)
})

test('하트비트 중단 — 다시 보내도 같은 거절만', () => {
  for (const s of [402, 404, 409]) assert.equal(beatStops(s), true)
  for (const s of [0, 200, 401, 429, 500, 503]) assert.equal(beatStops(s), false)
})

test('설문 카드 투표 화면 — 개최자는 평소 실시간 결과, [투표]를 눌러야 라디오(E2E r1·T04 r2)', () => {
  const v = (o) => pollVoting({ open: true, mine: null, staff: false, change: false, ...o })
  assert.equal(v({}), true) // 청중 투표 전 = 라디오
  assert.equal(v({ mine: 'o1' }), false) // 청중 투표 후 = 결과
  assert.equal(v({ mine: 'o1', change: true }), true) // 다시 투표
  assert.equal(v({ staff: true }), false) // 개최자 투표 전에도 결과(집계 오염 없이)
  assert.equal(v({ staff: true, change: true }), true) // 개최자가 [투표]를 누름
  assert.equal(v({ open: false }), false) // 마감 = 모두 결과
  assert.equal(v({ open: false, change: true }), false)
})

test('출석 하트비트 당겨 보내기 — 마지막 전송 뒤 30초 이상만', () => {
  assert.equal(beatDue(0, 1_000_000), true) // 아직 안 보냄
  assert.equal(beatDue(1_000_000, 1_029_999), false) // 빠른 탭 전환 = 안 보냄
  assert.equal(beatDue(1_000_000, 1_030_000), true)
  assert.equal(beatDue(1_000_000, 1_000_000 + 5 * 60_000), true) // 백그라운드 5분 뒤 복귀
})

test('질문 보내기 키 — Ctrl/⌘+Enter 만, 한글 조합 중 Enter 는 제외(T04 r3)', () => {
  const k = (o) => sendKey({ key: 'Enter', ctrlKey: false, metaKey: false, ...o })
  assert.equal(k({}), false) // Enter = 줄바꿈
  assert.equal(k({ ctrlKey: true }), true)
  assert.equal(k({ metaKey: true }), true)
  assert.equal(k({ ctrlKey: true, isComposing: true }), false)
  assert.equal(k({ key: 'a', ctrlKey: true }), false)
  assert.equal(k({ ctrlKey: true, repeat: true }), false) // 누르고 있는 자동 반복 — 중복 질문(T04 r6)
})

// requestSubmit() 은 비활성 제출 버튼을 무시한다 → 제출 처리기 자체가 보내는 중(busy)을 막아야 한다(T04 r6)
test('질문·새 설문 제출 — 보내는 중이면 첫 await 전에 돌아간다(중복 등록 방지, T04 r6)', async () => {
  const { readFileSync } = await import('node:fs')
  const read = (f) => readFileSync(new URL(`../components/room/features/engage/${f}`, import.meta.url), 'utf8')
  for (const [f, guard] of [
    ['qna.tsx', 'if (busy || !text.trim()) return'],
    ['polls.tsx', 'if (busy || !valid) return'],
  ]) {
    const s = read(f)
    const sub = s.indexOf('onSubmit={async (e) => {')
    assert.ok(sub > 0, f)
    const g = s.indexOf(guard, sub)
    assert.ok(g > sub && g < s.indexOf('await ', sub), `${f} : busy 확인이 첫 await 보다 뒤`)
  }
  assert.ok(read('qna.tsx').includes('repeat: e.repeat'), 'qna 가 자동 반복을 sendKey 에 넘기지 않음')
})

test('남은 글자 수 — 상한 90% 부터만(T04 r3)', () => {
  assert.equal(charsLeft(0, 500), null)
  assert.equal(charsLeft(449, 500), null)
  assert.equal(charsLeft(450, 500), 50)
  assert.equal(charsLeft(500, 500), 0)
  assert.equal(charsLeft(600, 500), 0)
})

// 룸 남은 시간 카운트다운(마스터 2026-10-29) — 받은 값에서 흐른 초만큼, 0 아래로 안 감, 시계가 거꾸로 가도 늘지 않음
test('leftNow — 카운트다운·5분 문턱', () => {
  assert.equal(leftNow(600, 1000, 1000), 600)
  assert.equal(leftNow(600, 1000, 61_999), 540)
  assert.equal(leftNow(30, 0, 60_000), 0)
  assert.equal(leftNow(600, 5000, 0), 600) // 받기 전 시각(초기값) = 그대로
  assert.equal(LOW_LEFT_SEC, 300)
})

// 이원화 카운트다운(sql/021) — 유료 먼저, 0 이면 무료, 무료 세미나는 무료만
test('splitLeft — 유료 먼저 줄고 다음 무료', () => {
  assert.deepEqual(splitLeft(100, 3600, 0, 30_000), { paid: 70, free: 3600 })
  assert.deepEqual(splitLeft(100, 3600, 0, 160_000), { paid: 0, free: 3540 })
  assert.deepEqual(splitLeft(0, 50, 0, 80_000), { paid: 0, free: 0 })
  assert.deepEqual(splitLeft(null, 3600, 0, 60_000), { paid: null, free: 3540 })
  assert.deepEqual(splitLeft(100, 3600, 5000, 0), { paid: 100, free: 3600 }) // 받기 전 시각 = 그대로
})
