// PC 도구 현황 표 결합·조회 시험(src/tools/types.ts) — 실행 : pnpm test (Node 내장 테스트, 타입 제거 실행)
import test from 'node:test'
import assert from 'node:assert/strict'
import { joinRows, queryRows, type InstItem, type UseItem } from '../src/tools/types.ts'

const use = (type: UseItem['type'], name: string, calls: number): UseItem => ({ type, name, turns: 1, calls, errors: 0, avg_ms: null })

test('joinRows : 플러그인은 전체 키 우선, 짧은 이름은 유일할 때만 연결', () => {
  const inst: InstItem[] = [
    { type: 'plugin', name: 'a@m1', src: 'user', plugin: null },
    { type: 'plugin', name: 'a@m2', src: 'user', plugin: null },
    { type: 'plugin', name: 'b@m1', src: 'user', plugin: null },
  ]
  const rows = joinRows(inst, [use('plugin', 'a', 5), use('plugin', 'b', 7), use('plugin', 'a@m2', 9)])
  const by = Object.fromEntries(rows.map((r) => [`${r.name}|${r.src}`, r.calls]))
  assert.equal(by['a@m1|user'], null) // 동명 a 가 둘 → 짧은 이름 연결 안 함
  assert.equal(by['a@m2|user'], 9) // 전체 키 일치
  assert.equal(by['b@m1|user'], 7) // 유일한 짧은 이름
  assert.equal(by['a|none'], 5) // 연결 못 한 사용 기록은 설치 목록 없음 행
})

test('joinRows : 훅은 사용 연결 없음, 사용만 있는 항목은 src none', () => {
  const rows = joinRows([{ type: 'hook', name: 'x.mjs', src: 'project', plugin: null, event: 'Stop' }], [use('skill', 's1', 2)])
  assert.equal(rows[0].calls, null)
  assert.equal(rows[0].detail, 'Stop')
  assert.equal(rows[1].src, 'none')
})

test('queryRows : 탭·검색·정렬(null 맨 뒤)·페이지·탭 건수', () => {
  const inst: InstItem[] = Array.from({ length: 25 }, (_, i) => ({ type: i < 20 ? 'skill' : 'agent', name: `n${String(i).padStart(2, '0')}`, src: 'user', plugin: null }))
  const rows = joinRows(inst, [use('skill', 'n03', 4), use('skill', 'n07', 9)])
  const p1 = queryRows(rows, { tab: 'skill', q: '', sort: 'calls', desc: true, page: 1, size: 10 })
  assert.equal(p1.total, 20)
  assert.deepEqual(p1.items.slice(0, 2).map((r) => r.name), ['n07', 'n03'])
  assert.equal(p1.counts.all, 25)
  assert.equal(p1.counts.agent, 5)
  const asc = queryRows(rows, { tab: 'skill', q: '', sort: 'calls', desc: false, page: 1, size: 10 })
  assert.deepEqual(asc.items.slice(0, 2).map((r) => r.name), ['n03', 'n07']) // null 은 오름차순에서도 뒤
  const last = queryRows(rows, { tab: 'all', q: '', sort: 'name', desc: false, page: 99, size: 10 })
  assert.equal(last.page, 3) // 범위 밖 페이지는 마지막으로
  assert.equal(last.items.length, 5)
  const s = queryRows(rows, { tab: 'all', q: 'N2', sort: 'name', desc: false, page: 1, size: 10 })
  assert.equal(s.total, 5) // n20~n24
})
