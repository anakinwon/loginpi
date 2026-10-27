// 쪽 나눔 정렬 회귀 관문(r3 T07) — .range( 로 쪽을 나누는 조회는 기본키(<x>_id) 정렬로 동률을 끊는다.
//  시각·추천 수만으로 정렬하면 동률(정시 개최·0표·같은 시각 조각)이 쪽 경계에서 중복·누락된다(PostgreSQL 은 동률 순서를 보장하지 않음).
//  실행 : pnpm --dir sitemap/seminar.pi test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = fileURLToPath(new URL('../..', import.meta.url))
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

test('쪽 나눔 조회(.range)는 모두 기본키 정렬로 동률을 끊는다', () => {
  let n = 0
  for (const p of walk(join(APP, 'src')).filter((x) => /\.ts$/.test(x))) {
    const s = readFileSync(p, 'utf8')
    for (const m of s.matchAll(/\.range\(/g)) {
      n++
      // 같은 조회 사슬 = .range 앞 800자 안의 마지막 .from( 이후
      const before = s.slice(Math.max(0, m.index - 800), m.index)
      const chain = before.slice(before.lastIndexOf('.from('))
      assert.match(chain, /\.order\('\w+_id'\)/, `${relative(APP, p).split(sep).join('/')} : .range 앞에 기본키 정렬 없음`)
    }
  }
  assert.ok(n >= 8, `쪽 나눔 조회를 찾지 못함(${n})`)
})
