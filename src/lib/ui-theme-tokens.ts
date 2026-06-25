// UI 색상 테마 — 클라이언트/서버 공용 타입·상수·순수 함수.
// (DB 접근은 server-only인 ui-theme.ts에 분리. 이 파일은 양쪽에서 import 가능)

// 토큰 키 화이트리스트 → CSS 변수명 매핑.
// ⚠️ 이 맵에 없는 키는 무시한다 (임의 CSS 변수 주입 차단).
export const THEME_TOKEN_MAP = {
  // 배경 세트 — 무드 전환 시 배경·글자까지 통째로 바뀜 (라이트/다크 각각 정의)
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  secondary: '--secondary',
  border: '--border',
  // 포인트 색
  primary: '--primary',
  accent: '--accent',
  chart1: '--chart-1',
  chart2: '--chart-2',
  chart3: '--chart-3',
  chart4: '--chart-4',
  chart5: '--chart-5',
  kpi1: '--kpi-1',
  kpi2: '--kpi-2',
  kpi3: '--kpi-3',
  kpi4: '--kpi-4',
  kpi5: '--kpi-5',
} as const

export type ThemeTokenKey = keyof typeof THEME_TOKEN_MAP
export const THEME_TOKEN_KEYS = Object.keys(THEME_TOKEN_MAP) as ThemeTokenKey[]

// 편집 UI용 라벨·그룹 메타
export const THEME_TOKEN_META: { key: ThemeTokenKey; label: string; group: 'surface' | 'core' | 'chart' | 'kpi' }[] = [
  { key: 'background', label: '배경', group: 'surface' },
  { key: 'foreground', label: '본문 글자', group: 'surface' },
  { key: 'card', label: '카드 배경', group: 'surface' },
  { key: 'cardForeground', label: '카드 글자', group: 'surface' },
  { key: 'muted', label: '보조 배경', group: 'surface' },
  { key: 'mutedForeground', label: '보조 글자', group: 'surface' },
  { key: 'secondary', label: '세컨더리', group: 'surface' },
  { key: 'border', label: '테두리', group: 'surface' },
  { key: 'primary', label: '주색 (primary)', group: 'core' },
  { key: 'accent', label: '강조 (accent)', group: 'core' },
  { key: 'chart1', label: '차트 1', group: 'chart' },
  { key: 'chart2', label: '차트 2', group: 'chart' },
  { key: 'chart3', label: '차트 3', group: 'chart' },
  { key: 'chart4', label: '차트 4', group: 'chart' },
  { key: 'chart5', label: '차트 5', group: 'chart' },
  { key: 'kpi1', label: 'KPI 카드 1', group: 'kpi' },
  { key: 'kpi2', label: 'KPI 카드 2', group: 'kpi' },
  { key: 'kpi3', label: 'KPI 카드 3', group: 'kpi' },
  { key: 'kpi4', label: 'KPI 카드 4', group: 'kpi' },
  { key: 'kpi5', label: 'KPI 카드 5', group: 'kpi' },
]

export type ThemeColorSet = Partial<Record<ThemeTokenKey, string>>
export interface ThemeTokens {
  light: ThemeColorSet
  dark: ThemeColorSet
}

// 테마 적용 범위 — ADMIN(관리자 화면만) / GLOBAL(전체 페이지)
export type ApplyScope = 'ADMIN' | 'GLOBAL'

export interface UiTheme {
  theme_id: string
  theme_nm: string
  theme_desc: string | null
  theme_tokens: ThemeTokens
  actv_yn: 'Y' | 'N'
  lock_yn: 'Y' | 'N'
  apply_scope_cd: ApplyScope
  sort_ord: number
}

// 색상 값 보안 검증 — "문자셋"이 아니라 "색상 형식"을 허용리스트로 검사.
// (문자셋 검사는 url(//evil.com/x) 같은 프로토콜 상대 URL을 통과시켜
//  외부 리소스 로딩·CSP 우회 위험 → 형식 허용리스트로 차단)
// 허용: hex(#RGB/#RRGGBB/#RRGGBBAA) 또는 명시적 색상 함수(내부는 숫자·기호만).
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const COLOR_FN_RE =
  /^(?:rgb|rgba|hsl|hsla|oklch|oklab|lch|lab|color)\(\s*[0-9eE+\-.%,\s/]+\)$/
// 색상 함수 내부에 침투할 수 있는 위험 토큰(이중 방어)
const DANGER_RE = /url|image|expression|@|var\(|attr\(/

export function sanitizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v || v.length > 64) return null
  if (DANGER_RE.test(v.toLowerCase())) return null
  if (HEX_RE.test(v) || COLOR_FN_RE.test(v)) return v
  return null
}

// 입력 토큰을 화이트리스트 + sanitize로 정제 (저장 전 검증)
export function sanitizeThemeTokens(input: unknown): ThemeTokens {
  const result: ThemeTokens = { light: {}, dark: {} }
  if (!input || typeof input !== 'object') return result
  for (const mode of ['light', 'dark'] as const) {
    const set = (input as Record<string, unknown>)[mode]
    if (set && typeof set === 'object') {
      const rec = set as Record<string, unknown>
      for (const key of THEME_TOKEN_KEYS) {
        const safe = sanitizeColor(rec[key])
        if (safe) result[mode][key] = safe
      }
    }
  }
  return result
}

// 단일 색상 세트 → CSS 선언 문자열 (화이트리스트 + sanitize)
function buildDeclarations(set: ThemeColorSet | undefined): string {
  if (!set) return ''
  const decls: string[] = []
  for (const key of THEME_TOKEN_KEYS) {
    const safe = sanitizeColor(set[key])
    if (safe) decls.push(`${THEME_TOKEN_MAP[key]}:${safe}`)
  }
  return decls.join(';')
}

// 테마 토큰 → 스코프 CSS 문자열.
//  - ADMIN: [data-admin-theme] 스코프 (관리자 화면만, 일반 앱 불변)
//  - GLOBAL: :root 스코프 (전체 페이지). 핵심 색만 바꾸므로 배경·글자는 유지됨.
// 라이트는 기본 셀렉터, 다크는 .dark 결합 셀렉터로 분리.
export function buildThemeStyleCss(
  tokens: ThemeTokens | null | undefined,
  scope: ApplyScope = 'ADMIN',
): string {
  if (!tokens) return ''
  const light = buildDeclarations(tokens.light)
  const dark = buildDeclarations(tokens.dark)
  const lightSel = scope === 'GLOBAL' ? ':root' : '[data-admin-theme]'
  const darkSel = scope === 'GLOBAL' ? '.dark' : '.dark [data-admin-theme]'
  let css = ''
  if (light) css += `${lightSel}{${light}}`
  if (dark) css += `${darkSel}{${dark}}`
  return css
}
