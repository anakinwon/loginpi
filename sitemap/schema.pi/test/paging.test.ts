// .in() 값 나누기 검사(2026-10-20 대표도메인 후보 551건 장애) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunks, IN_CHUNK, inChunks } from '../src/lib/paging.ts'

test('chunks — 150개씩, 빈 배열은 조회 0회, 순서·전체 보존', () => {
  assert.deepEqual(chunks([]), [])
  const ids = Array.from({ length: 551 }, (_, i) => `id${i}`)
  const parts = chunks(ids)
  assert.deepEqual(parts.map((p) => p.length), [IN_CHUNK, IN_CHUNK, IN_CHUNK, 551 - IN_CHUNK * 3])
  assert.deepEqual(parts.flat(), ids)
  assert.deepEqual(chunks([1, 2, 3], 2), [[1, 2], [3]])
})

test('inChunks — 묶음별 조회 합침, 값 0개면 조회 없음, 오류 하나면 오류', async () => {
  const seen: number[] = []
  const ids = Array.from({ length: 320 }, (_, i) => `id${i}`)
  const ok = await inChunks<string>(ids, async (p) => (seen.push(p.length), { data: p, error: null }))
  assert.deepEqual(seen, [IN_CHUNK, IN_CHUNK, 20])
  assert.deepEqual(ok.data, ids)
  let calls = 0
  assert.deepEqual(await inChunks([], async () => (calls++, { data: [], error: null })), { data: [], error: null })
  assert.equal(calls, 0)
  const bad = await inChunks(ids, async (p) => (p[0] === 'id150' ? { data: null, error: { code: 'X' } } : { data: p, error: null }))
  assert.deepEqual(bad, { data: null, error: { code: 'X' } })
})
