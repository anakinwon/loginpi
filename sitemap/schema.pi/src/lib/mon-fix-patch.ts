// 모니터링 AI 수정안 순수 함수(mon-fix.ts 공용, 단위 테스트 test/mon-fix.test.ts) — 고칠 파일 경로 검사·찾기/바꾸기 적용
// 고칠 수 있는 파일 = 이 앱 src 아래 ts·tsx 만(설정·워크플로·SQL·환경 파일 제외)
const FILE_RE = /^src\/[\w\-./[\]()@]+\.tsx?$/
// 사람만 고치는 파일(2026-10-22 마스터 승인 — AI 수정안 #12·#13 이 성능을 위해 권한 캐시·연동 재확인 축소를 넣어 보안 점검 지적) :
//  인증·세션·권한·결제·요금제·환경·DB 접속, 그리고 AI 수정 기능 자신(자기 안전장치를 AI 가 풀지 못하게)
const DENY_RE = /^src\/(auth\.ts|env\.ts|proxy\.ts|middleware\.ts|lib\/(auth|api|roles|plan|upgrade|payments|db|mon-ai|mon-fix|mon-fix-patch|net-guard)\.ts|app\/api\/(auth|payments|link|dev)\/|app\/api\/mon\/app\/fix\/)/

export type Patch = { summary: string; edits: { path: string; find: string; replace: string }[]; checks: string[] }

// AI 가 준 경로('app/x.tsx'·'src/app/x.tsx'·'/src/…') → 'src/…', 허용 밖·사람만 고치는 파일이면 null
export function normFile(f: string): string | null {
  const p = f.trim().replace(/^\/+/, '')
  const s = p.startsWith('src/') ? p : `src/${p}`
  return FILE_RE.test(s) && !DENY_RE.test(s) && !s.split('/').some((x) => x === '..' || x === '.') ? s : null
}

// 찾기·바꾸기 적용 — 모든 find 를 '원문' 기준으로 찾음(앞 수정 결과가 아님 — 프롬프트가 원문 복사를 요구하므로, 2026-10-22 순차 적용 때 겹친 수정이 실패하던 문제)
//  find 는 원문에 정확히 1번(CRLF 는 LF 로 맞춤), 같은 파일 안 수정 범위가 겹치면 거절. 성공 = 바뀐 파일만, 실패 = 이유 목록(AI 재시도 안내용)
export function applyEdits(src: Record<string, string>, edits: Patch['edits']): { changed: Record<string, string> } | { bad: string[] } {
  const bad: string[] = []
  const spans: Record<string, { i: number; end: number; rep: string }[]> = {}
  edits.forEach((e, n) => {
    const k = normFile(e.path) // AI 가 'app/x.tsx' 처럼 src/ 를 빼고 줘도 같은 파일
    const t = k === null ? undefined : src[k]
    const find = e.find.replace(/\r\n/g, '\n')
    const tag = `수정 ${n + 1}(${e.path})`
    if (t === undefined) return void bad.push(`${tag} : 주어진 파일이 아님`)
    if (!find) return void bad.push(`${tag} : find 가 비어 있음`)
    const i = t.indexOf(find)
    if (i < 0) return void bad.push(`${tag} : find 를 원문에서 찾지 못함`)
    if (t.indexOf(find, i + 1) >= 0) return void bad.push(`${tag} : find 가 원문에 여러 번 있음(앞뒤 줄을 더 포함)`)
    ;(spans[k!] ??= []).push({ i, end: i + find.length, rep: e.replace.replace(/\r\n/g, '\n') })
  })
  const changed: Record<string, string> = {}
  for (const [k, ss] of Object.entries(spans)) {
    ss.sort((a, b) => a.i - b.i)
    if (ss.some((x, j) => j > 0 && x.i < ss[j - 1].end)) {
      bad.push(`${k} : 수정 범위가 서로 겹침(한 수정으로 합치십시오)`)
      continue
    }
    let out = src[k]
    for (const x of [...ss].reverse()) out = out.slice(0, x.i) + x.rep + out.slice(x.end) // 뒤에서부터 = 앞 위치가 밀리지 않음
    if (out !== src[k]) changed[k] = out
  }
  if (bad.length) return { bad }
  return Object.keys(changed).length ? { changed } : { bad: ['바뀐 내용이 없음'] }
}
