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

test('applyEdits : 정확히 1번 있는 부분만 바꿈', () => {
  const src = { 'src/a.ts': "const x = 1\nconst y = 2\n", 'src/b.ts': 'b\n' }
  assert.deepEqual(applyEdits(src, [{ path: 'a.ts', find: 'const y = 2', replace: 'const y = 3' }]), { 'src/a.ts': "const x = 1\nconst y = 3\n" })
  // 같은 파일 두 번 연속 수정 = 앞 수정 결과에 적용
  assert.deepEqual(applyEdits(src, [{ path: 'src/a.ts', find: 'x = 1', replace: 'x = 9' }, { path: 'src/a.ts', find: 'x = 9', replace: 'x = 8' }]), { 'src/a.ts': "const x = 8\nconst y = 2\n" })
  // $ 는 치환 패턴이 아니라 글자 그대로
  assert.deepEqual(applyEdits(src, [{ path: 'src/b.ts', find: 'b', replace: "'$&'" }]), { 'src/b.ts': "'$&'\n" })
})

test('applyEdits : 없음·중복·주지 않은 파일·변경 없음 = null', () => {
  const src = { 'src/a.ts': 'a\na\n' }
  assert.equal(applyEdits(src, [{ path: 'src/a.ts', find: 'zz', replace: 'q' }]), null)
  assert.equal(applyEdits(src, [{ path: 'src/a.ts', find: 'a', replace: 'q' }]), null)
  assert.equal(applyEdits(src, [{ path: 'src/c.ts', find: 'a\na', replace: 'q' }]), null)
  assert.equal(applyEdits(src, [{ path: 'src/a.ts', find: '', replace: 'q' }]), null)
  assert.equal(applyEdits(src, [{ path: 'src/a.ts', find: 'a\na', replace: 'a\na' }]), null)
  assert.equal(applyEdits(src, []), null)
})
