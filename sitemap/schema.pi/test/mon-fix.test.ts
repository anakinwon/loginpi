// 모니터링 AI 수정안 순수 함수 검사(src/lib/mon-fix-patch.ts) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyEdits, normFile } from '../src/lib/mon-fix-patch.ts'

test('normFile : src 아래 ts·tsx 만, 상위 경로·설정 파일 거절', () => {
  assert.equal(normFile('app/dev-user-switch.tsx'), 'src/app/dev-user-switch.tsx')
  assert.equal(normFile('/src/lib/api.ts'), 'src/lib/api.ts')
  assert.equal(normFile('src/app/areas/[areaId]/monitor/app-tab.tsx'), 'src/app/areas/[areaId]/monitor/app-tab.tsx')
  for (const bad of ['src/../next.config.ts', '../.github/workflows/x.ts', 'src/./a.ts', 'src/env.json', '.env.local', 'sql/071.sql', 'src/app/a.ts; rm', 'src/a b.tsx']) assert.equal(normFile(bad), null, bad)
})

const ok = (r: ReturnType<typeof applyEdits>) => ('changed' in r ? r.changed : null)

test('applyEdits : 모든 find 를 원문 기준으로 찾아 바꿈', () => {
  const src = { 'src/a.ts': 'const x = 1\nconst y = 2\n', 'src/b.ts': 'b\n' }
  assert.deepEqual(ok(applyEdits(src, [{ path: 'a.ts', find: 'const y = 2', replace: 'const y = 3' }])), { 'src/a.ts': 'const x = 1\nconst y = 3\n' })
  // 두 수정 모두 원문 기준(앞 수정이 바꾼 글자를 뒤 수정이 찾지 않음) — 순서가 뒤집혀 있어도 위치대로 적용
  assert.deepEqual(ok(applyEdits(src, [{ path: 'src/a.ts', find: 'y = 2', replace: 'y = 20' }, { path: 'src/a.ts', find: 'x = 1', replace: 'x = 10' }])), { 'src/a.ts': 'const x = 10\nconst y = 20\n' })
  // $ 는 치환 패턴이 아니라 글자 그대로, CRLF 로 옮겨도 원문(LF)과 맞춤
  assert.deepEqual(ok(applyEdits(src, [{ path: 'src/b.ts', find: 'b', replace: "'$&'" }])), { 'src/b.ts': "'$&'\n" })
  assert.deepEqual(ok(applyEdits(src, [{ path: 'src/a.ts', find: 'const x = 1\r\nconst y', replace: 'const x = 1\r\nlet y' }])), { 'src/a.ts': 'const x = 1\nlet y = 2\n' })
})

test('applyEdits : 없음·중복·주지 않은 파일·빈 find·겹침·변경 없음 = 이유 목록', () => {
  const src = { 'src/a.ts': 'a\na\nbc\n' }
  const bad = (e: { path: string; find: string; replace: string }[]) => {
    const r = applyEdits(src, e)
    assert.ok('bad' in r && r.bad.length > 0, JSON.stringify(e))
  }
  bad([{ path: 'src/a.ts', find: 'zz', replace: 'q' }])
  bad([{ path: 'src/a.ts', find: 'a', replace: 'q' }])
  bad([{ path: 'src/c.ts', find: 'bc', replace: 'q' }])
  bad([{ path: 'src/a.ts', find: '', replace: 'q' }])
  bad([{ path: 'src/a.ts', find: 'a\nbc', replace: 'q' }, { path: 'src/a.ts', find: 'bc\n', replace: 'r' }])
  bad([{ path: 'src/a.ts', find: 'bc', replace: 'bc' }])
  bad([])
})
