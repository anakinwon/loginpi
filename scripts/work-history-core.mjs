/**
 * work-history-core — 로거(.claude/hooks/work-history-logger.mjs)·통계(work-history-stats.mjs)·보고서(work-history-report.mjs)가
 * 공유하는 단일 진실 원천 (2026-09-20 10인 평가 후 재구성: 포맷 3벌 중복·카테고리 정의 2곳 분산·색 8종 상한 제거)
 *
 *   SCHEMA_VERSION   JSONL 레코드 스키마 버전 (레코드 `v` 필드)
 *   CATEGORIES       카테고리 정의(표시 순서·색·동작 동사·주제 명사 규칙) — 점수제 분류의 원천
 *   categorize()     요청문 + 증거(도구·단계)로 카테고리 판정. 첫 일치가 아니라 가중 점수제(동사 3 · 명사 1 · 증거 보너스 · 부정어 창 −2)
 *   PRICING          모델별 단가(USD / 1M tokens, 출처 claude.com/pricing 2026-09) — output 에는 thinking 이 이미 포함되므로 별도 합산 금지
 *   costUsd()        토큰 → 달러
 *   redact()         비밀값·홈·TEMP·세션 UUID 마스킹 (로그·보고서·CSV 에 쓰기 직전 한 지점에서 적용)
 *   kfmt / ms2 / pct / elapsed   표시 포맷 1벌
 */
import os from 'node:os'

export const SCHEMA_VERSION = 2

// ── 카테고리 ───────────────────────────────────────────────────────────────────
// verb: 동작 동사(가중 3), noun: 주제 명사(가중 1). 동점 시 order 가 앞선 쪽. color: dataviz 팔레트 슬롯(라이트/다크 검증 완료 8색 + 보조 4색)
export const CATEGORIES = [
  { key: 'FEATURE',  label: '기능 구현', color: 1,  verb: /만들어|만들고|구현|추가해|생성해|작성해|개발해|그려|짜\s?줘|\bbuild\b|\bimplement|\bcreate\b|\badd\b|\bwrite\b|\bgenerate/i, noun: /기능|스크립트|훅\b|컴포넌트|페이지|\bAPI\b|대시보드|보고서|차트|그래프|통계\s?파일/i },
  { key: 'FIX',      label: '수정·버그', color: 8,  verb: /고쳐|수정해|바로잡|해결해|\bfix\b|\brepair|\bresolve/i, noun: /버그|\bbug\b|오류|에러|\berror\b|안\s?돼|안\s?됨|깨졌|깨진|실패|\bfail/i },
  { key: 'REFACTOR', label: '재구성',   color: 7,  verb: /리팩토|재구성|정리해|단순화|분리해|통합해|\brefactor|\bsimplif|\bextract|\bsplit|\bmerge\b(?!.*(?:branch|pr))/i, noun: /구조|중복|모듈/i },
  { key: 'GIT',      label: 'Git',      color: 4,  verb: /커밋|푸시|\bcommit\b|\bpush\b|\brebase\b|체리픽|\bcherry/i, noun: /브랜치|\bbranch\b|\bPR\b|풀리퀘|머지/i },
  { key: 'DEPLOY',   label: '배포',     color: 6,  verb: /배포해|승격|\bdeploy|\bpromote|\brelease\b|롤백|\brollback/i, noun: /운영|프로덕션|\bprod\b|스테이징|\bvercel\b/i },
  { key: 'INSTALL',  label: '설치',     color: 3,  verb: /설치|걸치|\binstall|\bnpm i\b|\bpnpm add\b|\bnpx skills add\b|추가\s?설치/i, noun: /패키지|플러그인|스킬|\bMCP\b|의존성/i },
  { key: 'TEST',     label: '테스트',   color: 5,  verb: /테스트해|검증해|점검해|확인\s?테스트|\btest\b|\bverify|\bvalidate/i, noun: /테스트|\btests?\b|커버리지|\bcoverage\b|\be2e\b/i },
  { key: 'DATA',     label: '데이터',   color: 2,  verb: /마이그레이션|\bmigrat/i, noun: /\bDDL\b|테이블|스키마|\bschema\b|\bSQL\b|컬럼|인덱스|\bsupabase\b/i },
  { key: 'CONFIG',   label: '설정',     color: 9,  verb: /설정해|등록|반영|적용|활성화|비활성화|구분해|표기해|항상\s|앞으로\s|원칙|규칙|지시|\bconfigure|\bregister|\benable|\bdisable|\balways\b/i, noun: /설정|\bsettings|\bconfig|환경변수|전역변수|\benv\b|CLAUDE\.md|권한|상태표시줄|\bhooks?\b|훅|접미|라벨/i },
  { key: 'DOCS',     label: '문서',     color: 10, verb: /문서화|정리해\s?줘|요약해|기록해|남겨\s?줘|\bdocument|\bsummari[sz]e/i, noun: /문서|\bdocs?\b|README|메모리|주석|\bPRD\b|가이드|매뉴얼/i },
  { key: 'QUERY',    label: '조회·설명', color: 11, verb: /보여\s?줘|알려\s?줘|확인해\s?줘|설명해|표시해\s?줘|찾아\s?줘|평가해|분석해|비교해|\bshow\b|\blist\b|\bexplain|\bevaluate|\banaly[sz]e|\bcompare/i, noun: /뭐야|무엇|어떻게|왜\b|\bwhat\b|\bhow\b|\bwhy\b|\?\s*$/i },
  { key: 'OTHER',    label: '기타',     color: 0,  verb: /$^/, noun: /$^/ },
]
export const CATEGORY_KEYS = CATEGORIES.map(c => c.key)
export const categoryColorVar = key => { const c = CATEGORIES.find(x => x.key === key); return c && c.color ? `var(--s${c.color})` : 'var(--other)' }
const NEGATION = /(하지\s?말|말고|없이|제외|빼고|금지|\bnot\b|\bdon'?t\b|\bwithout\b|\bexcept\b)/i

// 노이즈 제거: 절대·상대 경로, 코드 펜스, 붙여넣기 블록, 꼬리 키워드(ultrathink 등)
export function stripNoise(text) {
  return String(text || '')
    .replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content[^>]*>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/(?:[A-Za-z]:|\$WORKSPACE_ROOT|~)[\\/][^\s"'`)]*/g, ' ')
    .replace(/(?:^|\s)\.?[\w.-]+(?:[\\/][\w.-]+)+/g, ' ')
    .replace(/\b(ultrathink|think hard|megathink)\b/gi, ' ')
}
/**
 * categorize(text, evidence) → { category, tags, rule, scores, confidence }
 *   evidence: { tools: {name:count}, steps: [{t, ok, ms}], descriptions: [Bash description 문자열...] }  (없으면 요청문만으로 잠정 판정)
 *   점수 = 4×verb + 1×noun (각 최대 1회) + 증거 보너스 − 2×(부정어가 키워드 앞 12자 안에 있으면)
 *   증거: Write|Edit|MultiEdit|NotebookEdit>0 → FEATURE+2 · git commit/push 서술 → GIT+3 · skills add/npm i → INSTALL+3
 *         · 쓰기 도구 0 & 조회 도구만 → QUERY+2 · 테스트 러너 서술 → TEST+2 · migration/sql 서술 → DATA+2
 *   `#cat:NAME` 이 있으면 강제. tags = 점수>0 인 카테고리(점수 내림차순). confidence = (1위−2위)/1위.
 */
export function categorize(text, evidence = {}) {
  const raw = String(text || '')
  const forced = raw.match(/#cat:([A-Za-z]+)/)
  if (forced) { const k = forced[1].toUpperCase(); return { category: k, tags: [k], rule: 'forced', scores: { [k]: 99 }, confidence: 1 } }
  const plain = stripNoise(raw)
  const scores = {}, why = {}
  const hit = (re) => { const m = plain.match(re); if (!m) return 0; const before = plain.slice(Math.max(0, m.index - 12), m.index), after = plain.slice(m.index + m[0].length, m.index + m[0].length + 10); return NEGATION.test(before) || NEGATION.test(after) ? -2 : 1 }   // 한국어는 부정어가 뒤에 온다("설치하지 말고")
  for (const c of CATEGORIES) {
    if (c.key === 'OTHER') continue
    const v = hit(c.verb), n = hit(c.noun)
    let s = 0
    if (v > 0) { s += 4; why[c.key] = 'verb:' + plain.match(c.verb)[0].trim().slice(0, 16) } else if (v < 0) s -= 2   // 동사 4 > 명사 1 + 증거 2: 동작 동사가 항상 이긴다
    if (n > 0) { s += 1; why[c.key] = why[c.key] || 'noun:' + plain.match(c.noun)[0].trim().slice(0, 16) } else if (n < 0) s -= 1
    if (s) scores[c.key] = s
  }
  const tools = evidence.tools || {}, desc = (evidence.descriptions || []).join('\n')
  const writes = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].reduce((a, k) => a + (tools[k] || 0), 0)
  const total = Object.values(tools).reduce((a, b) => a + b, 0)
  const bonus = (k, n, r) => { scores[k] = (scores[k] || 0) + n; why[k] = why[k] || r }
  if (writes > 0) bonus('FEATURE', 2, 'ev:writes')
  if (/git (commit|push)|커밋|푸시/i.test(desc)) bonus('GIT', 3, 'ev:git')
  if (/skills add|npm (i|install)|pnpm add|npx .* install|winget|setx/i.test(desc)) bonus('INSTALL', 3, 'ev:install')
  if (/\b(vitest|jest|node --test|pnpm test|npm test|run (the )?tests?)\b/i.test(desc)) bonus('TEST', 2, 'ev:test')   // 테스트 러너 실행만 (설명문의 "test" 단어는 제외)
  if (/migration|\bsql\b|ddl|supabase/i.test(desc)) bonus('DATA', 2, 'ev:data')
  if (total > 0 && writes === 0 && !/git (commit|push)/i.test(desc) && (tools.Read || tools.Grep || tools.Glob || tools.Bash)) bonus('QUERY', 2, 'ev:readonly')
  const ranked = Object.entries(scores).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || CATEGORY_KEYS.indexOf(a[0]) - CATEGORY_KEYS.indexOf(b[0]))
  if (!ranked.length) return { category: 'OTHER', tags: ['OTHER'], rule: 'none', scores, confidence: 0 }
  const [top, second] = ranked
  return { category: top[0], tags: ranked.map(([k]) => k), rule: why[top[0]] || 'score', scores, confidence: +(((top[1] - (second ? second[1] : 0)) / top[1]).toFixed(2)) }
}

// ── 비용 ────────────────────────────────────────────────────────────────────────
// USD per 1M tokens. 출처: https://claude.com/pricing (2026-09 확인). cache_create 는 5분 캐시 기준(1시간 캐시는 ×1.6 — 세션 TTL 이 1h 이면 CACHE_1H=true).
export const PRICING = {
  'claude-fable-5-1':          { input: 10, output: 50, cache_read: 0.25, cache_create: 12.5 },
  'claude-opus-5':             { input: 5,  output: 25, cache_read: 0.5,  cache_create: 6.25 },
  'claude-sonnet-5':           { input: 2,  output: 10, cache_read: 0.2,  cache_create: 2.5 },
  'claude-haiku-4-5-20251001': { input: 1,  output: 5,  cache_read: 0.1,  cache_create: 1.25 },
}
export const CACHE_1H_MULTIPLIER = 1.6
export function pricingFor(model) { if (!model) return null; if (PRICING[model]) return PRICING[model]; const k = Object.keys(PRICING).find(k => model.startsWith(k.replace(/-\d{8}$/, ''))); return k ? PRICING[k] : null }
export function costUsd(tokens, model, { cache1h = process.env.WORK_HISTORY_CACHE_1H !== '0' } = {}) {
  const p = pricingFor(model); if (!p || !tokens) return null
  const cc = p.cache_create * (cache1h ? CACHE_1H_MULTIPLIER : 1)
  return +(((tokens.input || 0) * p.input + (tokens.cache_read || 0) * p.cache_read + (tokens.cache_create || 0) * cc + (tokens.output || 0) * p.output) / 1e6).toFixed(4)   // output 에 thinking 포함 — 별도 합산 금지
}

// ── 마스킹 ──────────────────────────────────────────────────────────────────────
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, m => '\\' + m)
const pathForms = p => { p = String(p || '').replace(/\\/g, '/').replace(/\/+$/, ''); if (!p) return []; const d = p.match(/^([A-Za-z]):\/(.*)$/); const forms = [p, p.replace(/\//g, '\\\\'), p.replace(/\//g, '\\')]; if (d) forms.push(`/${d[1].toLowerCase()}/${d[2]}`, `/${d[1].toUpperCase()}/${d[2]}`); return forms.map(f => new RegExp(esc(f).replace(/^([A-Za-z])/, (m, x) => `[${x.toLowerCase()}${x.toUpperCase()}]`), 'g')) }
export function makeRedactor({ workspaceRoot, extra = [] } = {}) {
  const rules = []
  for (const re of pathForms(workspaceRoot)) rules.push([re, '$WORKSPACE_ROOT'])
  for (const re of pathForms(os.tmpdir())) rules.push([re, '$TEMP'])
  for (const re of pathForms(process.env.USERPROFILE || os.homedir())) rules.push([re, '$HOME'])
  rules.push([/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '$UUID'])
  rules.push([/\b(?:eyJ[\w-]{10,}\.[\w-]{10,}(?:\.[\w-]{5,})?|sk-ant-[\w-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[\w]{20,}|gho_[A-Za-z0-9]{30,}|AIza[\w-]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[\w-]{10,})\b/g, '[REDACTED]'])
  rules.push([/\b([A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE)[A-Za-z0-9_]*)(\s*[=:]\s*)(["']?)([^\s"'`,;]{8,})/gi, '$1$2$3[REDACTED]'])
  rules.push([/\b(Authorization|X-Pi-Token|apikey|api_key|x-api-key)(\s*[:=]\s*)(?:Bearer\s+)?([^\s"'`,;]{8,})/gi, '$1$2[REDACTED]'])
  for (const r of extra) rules.push(r)
  return s => rules.reduce((acc, [re, rep]) => acc.replace(re, rep), String(s ?? ''))
}
export const csvSafe = s => (typeof s === 'string' && /^[=+\-@\t\r]/.test(s) ? "'" + s : s)   // 스프레드시트 수식 인젝션 방지

// ── 표시 포맷 ─────────────────────────────────────────────────────────────────
export const kfmt = n => { n = Number(n) || 0; return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n) }
export const ms2 = ms => { if (ms == null || !(ms >= 0)) return '-'; const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}m` }
export const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '-')
export const elapsed = ms => { if (!(ms >= 0)) return '?'; if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`; const s = Math.round(ms / 1000); if (s < 60) return `${s}s`; if (s < 3600) return `${String(Math.floor(s / 60)).padStart(2, '0')}m${String(s % 60).padStart(2, '0')}s`; return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m` }
export const usd = v => (v == null ? '-' : v < 1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`)
