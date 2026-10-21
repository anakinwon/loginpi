// 모니터링 AI 수정안 순수 함수(mon-fix.ts 공용, 단위 테스트 test/mon-fix.test.ts) — 고칠 파일 경로 검사·찾기/바꾸기 적용
// 고칠 수 있는 파일 = 이 앱 src 아래 ts·tsx 만(설정·워크플로·SQL·환경 파일 제외)
const FILE_RE = /^src\/[\w\-./[\]()@]+\.tsx?$/

export type Patch = { summary: string; edits: { path: string; find: string; replace: string }[]; checks: string[] }

// AI 가 준 경로('app/x.tsx'·'src/app/x.tsx'·'/src/…') → 'src/…', 허용 밖이면 null
export function normFile(f: string): string | null {
  const p = f.trim().replace(/^\/+/, '')
  const s = p.startsWith('src/') ? p : `src/${p}`
  return FILE_RE.test(s) && !s.split('/').some((x) => x === '..' || x === '.') ? s : null
}

// 찾기·바꾸기 적용 — find 가 정확히 1번 있어야 함(0번·여러 번 = 적용 불가). 바뀐 파일만 돌려줌
export function applyEdits(src: Record<string, string>, edits: Patch['edits']): Record<string, string> | null {
  const out = { ...src }
  for (const e of edits) {
    const k = normFile(e.path) // AI 가 'app/x.tsx' 처럼 src/ 를 빼고 줘도 같은 파일
    const t = k === null ? undefined : out[k]
    if (t === undefined || !e.find) return null
    const i = t.indexOf(e.find)
    if (i < 0 || t.indexOf(e.find, i + 1) >= 0) return null
    out[k!] = t.slice(0, i) + e.replace + t.slice(i + e.find.length)
  }
  const changed = Object.fromEntries(Object.entries(out).filter(([p, t]) => t !== src[p]))
  return Object.keys(changed).length ? changed : null
}
