// 애플리케이션 모니터링 AI 원인 분석(2026-10-21, 마스터 지시 — 원인·해결 방안 화면 제시, 이 파일은 코드를 바꾸지 않음 : 수정안 PR 은 mon-fix.ts)
// 한 API 경로의 분 단위 합계·느린/오류 개별 이력 + 그 경로 소스(route.ts·직접 import 한 src/lib·호출 화면 일부) → 설정에 등록한 모델(Claude·Gemini·OpenAI) 구조화 출력
// 외부로 보내는 값 = 경로·수치·화면 경로·소스 코드(사용자 ID·이름은 보내지 않음). 소스는 next.config outputFileTracingIncludes 로 배포본에 포함
import 'server-only'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'
import { db } from './db'
import { mainOf, pageMenu, routeMenu, SLOW_MS } from './mon'
import { lastDeploy } from './mon-verify'

// 소스 위치는 실행 때만 계산(정적 분석되면 Turbopack 이 프로젝트 전체를 이 함수 배포본에 추적) — 포함할 파일은 next.config outputFileTracingIncludes 가 지정
const SRC = [process.cwd(), 'src'].join(path.sep)
const MAX_FILE = 16_000 // 파일 하나 상한(자)
const MAX_SRC = 60_000 // 소스 합계 상한(자)
const CLEAN_FROM = Date.parse('2026-10-21T22:38:18Z') // 운영 배포만 수집 시작 시각(KST 10-22 07:38)

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '무슨 일이 일어났는지 1~2문장 요약' },
    causes: {
      type: 'array',
      description: '가능성 높은 순 원인 1~4개, 원인마다 그 원인을 없애는 해결 방안을 바로 붙임',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '원인 한 줄(40자 이내)' },
          evidence: { type: 'string', description: '근거 1~2문장 — 수치·상태코드·시각·소스 파일(함수명) 중 핵심만' },
          likelihood: { type: 'string', enum: ['HIGH', 'MID', 'LOW'] },
          fixes: {
            type: 'array',
            description: '이 원인의 해결 방안 1~2개',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '조치 한 줄(40자 이내)' },
                detail: { type: 'string', description: '무엇을 어떻게 바꿀지 1~2문장' },
                files: { type: 'array', items: { type: 'string' }, description: 'src/ 기준 상대 경로(없으면 빈 배열)' },
              },
              required: ['title', 'detail', 'files'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'evidence', 'likelihood', 'fixes'],
        additionalProperties: false,
      },
    },
    checks: { type: 'array', items: { type: 'string' }, description: '조치 후 확인 방법 1~3개, 각 한 문장' },
    gaps: { type: 'array', items: { type: 'string' }, description: '판단에 부족했던 데이터(없으면 빈 배열)' },
    confidence: { type: 'string', enum: ['HIGH', 'MID', 'LOW'] },
  },
  required: ['summary', 'causes', 'checks', 'gaps', 'confidence'],
  additionalProperties: false,
} as const

export interface AiResult {
  summary: string
  causes: { title: string; evidence: string; likelihood: 'HIGH' | 'MID' | 'LOW'; fixes: { title: string; detail: string; files: string[] }[] }[]
  checks: string[]
  gaps: string[]
  confidence: 'HIGH' | 'MID' | 'LOW'
}

const clip = (s: string, n = MAX_FILE) => (s.length > n ? `${s.slice(0, n)}\n…(이하 생략)` : s)
const read = (p: string) => readFile(p, 'utf8').catch(() => null)
const rel = (p: string) => `src/${path.relative(SRC, p).replaceAll('\\', '/')}` // 프로젝트 루트(SRC/..)를 가리키면 Turbopack 이 전체 추적 경고

// '/api/areas/:id/sql/obj' → src/app/api/areas/[areaId]/sql/obj/route.ts (:id 는 [..] 디렉터리, 세그먼트는 경로 문자만)
async function routeFile(route: string): Promise<string | null> {
  let dir = path.join(SRC, 'app')
  for (const seg of route.split('/').filter(Boolean)) {
    const ents = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const d = seg === ':id' ? ents.find((e) => e.isDirectory() && /^\[[\w]+\]$/.test(e.name)) : ents.find((e) => e.isDirectory() && e.name === seg)
    const any = d ?? ents.find((e) => e.isDirectory() && /^\[\.\.\.[\w]+\]$/.test(e.name)) // [...nextauth] 같은 나머지 경로
    if (!any) return null
    dir = path.join(dir, any.name)
    if (any.name.startsWith('[...')) break
  }
  const f = path.join(dir, 'route.ts')
  return (await read(f)) === null ? null : f
}

async function walk(dir: string, out: string[] = []) {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'api') await walk(p, out)
    } else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

// 소스 묶음 : route.ts + 그 파일이 직접 import 한 @/lib/* + 이 API 를 부르는 화면 파일(호출 주변 ±20줄, 3개까지)
async function gatherSrc(route: string) {
  const parts: string[] = []
  let size = 0
  const add = (nm: string, body: string) => {
    if (size >= MAX_SRC) return
    const b = clip(body, Math.min(MAX_FILE, MAX_SRC - size))
    size += b.length
    parts.push(`=== ${nm} ===\n${b}`)
  }
  const rf = await routeFile(route)
  if (rf) {
    const body = (await read(rf))!
    add(rel(rf), body)
    // 직접 import 한 @/ 모듈 전부(@/lib/* 뿐 아니라 @/auth 같은 src 바로 아래 — 2026-10-22 NextAuth 라우트의 src/auth.ts 를 못 봐 '확인 못 함'으로 추정하던 문제)
    for (const m of body.matchAll(/from '@\/([\w/-]+)'/g)) {
      const base = path.join(SRC, m[1])
      for (const f of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
        const b = await read(f)
        if (b !== null) {
          add(rel(f), b)
          break
        }
      }
    }
  }
  const key = route.replace(/^\/api\/areas\/:id/, '').replace(/\/:id/g, '/') || route
  const needle = key.startsWith('/api/') ? key : key.split('/').filter((s) => s && s !== ':id').join('/')
  let n = 0
  for (const f of await walk(path.join(SRC, 'app'))) {
    if (n >= 3) break
    const b = await read(f)
    if (!b || !b.includes(needle)) continue
    const ls = b.split('\n')
    const i = ls.findIndex((l) => l.includes(needle))
    add(`${rel(f)} (호출부 ${i + 1}행 주변)`, ls.slice(Math.max(0, i - 20), i + 20).join('\n'))
    n++
  }
  return { found: !!rf, text: parts.join('\n\n') }
}

// 분석 모델(sql/070 mon_ai_mdl) — 설정에 등록한 제공사·모델·요금제·계정을 결과와 함께 돌려줘 화면에 표시(자료 신뢰성). 키는 환경변수만
export type Prvd = 'CLAUDE' | 'GEMINI' | 'OPENAI'
export interface AiMdl {
  mdl_id: string | null
  prvd_cd: Prvd
  mdl_nm: string
  dsp_nm: string
  plan_nm: string
  acct_nm: string
}
export const KEY_ENV: Record<Prvd, string> = { CLAUDE: 'ANTHROPIC_API_KEY', GEMINI: 'GEMINI_API_KEY', OPENAI: 'OPENAI_API_KEY' }
export const keyOn = (p: Prvd) => !!process.env[KEY_ENV[p]]
// 등록 모델이 없을 때(sql/070 적용 전 등) — 지금까지 쓰던 모델, 화면에는 요금제 '미등록'으로 드러냄
const FALLBACK: AiMdl = { mdl_id: null, prvd_cd: 'CLAUDE', mdl_nm: 'claude-opus-5-5', dsp_nm: 'Claude Opus 5.5', plan_nm: '미등록', acct_nm: '' }

// mdlId 가 있으면 그 모델(삭제됐으면 'GONE'), 없으면 기본 모델 → 없으면 FALLBACK
export async function pickMdl(mdlId?: string): Promise<AiMdl | 'GONE'> {
  const q = db().from('mon_ai_mdl').select('mdl_id, prvd_cd, mdl_nm, dsp_nm, plan_nm, acct_nm').eq('del_yn', 'N')
  const r = await (mdlId ? q.eq('mdl_id', mdlId) : q.eq('dflt_yn', 'Y')).maybeSingle()
  if (r.error) throw r.error
  return (r.data as AiMdl | null) ?? (mdlId ? 'GONE' : FALLBACK)
}

// 분석 근거(마스터 지시 2026-10-22 — 결과가 달라질 때 '무엇을 보고 판단했는지'로 차이를 설명)
export interface AiBasis {
  at: string // 분석 시각(재사용이면 원래 분석 시각)
  from: string // 데이터 구간 시작
  to: string // 데이터 구간 끝(= 분석 시각)
  req: number // 구간 요청 합계
  err: number // 구간 오류 합계
  evt: number // 느림·오류 개별 이력 수
  cut: boolean // 행 상한(합계 120·이력 100)에 걸려 최근 일부만 봄
  src: string | null // 분석한 배포본 커밋(앞 7자리)
  floor: 'DEPLOY' | null // 구간 시작을 최근 AI 수정 배포 시점으로 올림
}
export interface AiPrev {
  at: string
  mdl: string
  main: string | null // 1순위 원인(mainOf 기준 — 저장 길이 200자)
  from: string
  to: string
  req: number
  err: number
  src: string | null
}
export interface AiRun {
  ai: AiResult
  mdl: AiMdl
  ms: number // 분석 소요(밀리초, 재사용이면 원래 소요)
  tok: { in: number; out: number } // 토큰(제공사 응답 기준, 추론 토큰 포함)
  basis: AiBasis
  reused: boolean // 같은 입력 = 이전 결과 재사용(AI 다시 안 부름)
  prev: AiPrev | null // 이 경로의 직전 분석(비교용)
}

const TIMEOUT = 90_000
// 샘플링 고정값(같은 입력 = 같은 답에 가깝게) — Claude Opus 5.5 는 temperature 를 거부(400 'deprecated for this model', 2026-10-22 실호출)해 같은 입력 재사용(sql/073)으로 대신함
const SEED = 20261022
const MAX_OUT = 16_000 // Gemini·OpenAI 는 추론 토큰이 출력 한도에 포함돼 Claude(8,000)보다 크게
type Call = { text?: string; done: boolean; in: number; out: number }
// 구조화 출력 형식 — 원인 분석(SCHEMA)과 수정안(mon-fix.ts)이 같은 3사 호출을 씀
export type Fmt = { name: string; schema: object; claudeMax: number }
const ANALYZE: Fmt = { name: 'mon_ai_result', schema: SCHEMA, claudeMax: 8000 }

let client: Anthropic | null = null
async function callClaude(m: AiMdl, system: string, user: string, f: Fmt): Promise<Call> {
  client ??= new Anthropic({ timeout: TIMEOUT, maxRetries: 1 })
  const res = await client.messages.create({
    model: m.mdl_nm,
    max_tokens: f.claudeMax,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: f.schema as Record<string, unknown> } },
    system,
    messages: [{ role: 'user', content: user }],
  })
  return { text: res.content.find((b) => b.type === 'text')?.text, done: res.stop_reason === 'end_turn', in: res.usage.input_tokens, out: res.usage.output_tokens }
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT) })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`${r.status} ${j?.error?.message ?? ''}`.slice(0, 300))
  return j
}

async function callGemini(m: AiMdl, system: string, user: string, f: Fmt): Promise<Call> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m.mdl_nm)}:generateContent`
  const j = await post(url, { 'x-goog-api-key': process.env.GEMINI_API_KEY! }, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: f.schema, maxOutputTokens: MAX_OUT, temperature: 0, seed: SEED }, // 샘플링 고정(2026-10-22 실호출 200 확인)
  })
  const c = j.candidates?.[0]
  const u = j.usageMetadata ?? {}
  const parts: { text?: string; thought?: boolean }[] = c?.content?.parts ?? []
  return { text: parts.filter((p) => !p.thought).map((p) => p.text ?? '').join(''), done: c?.finishReason === 'STOP', in: u.promptTokenCount ?? 0, out: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) }
}

async function callOpenAi(m: AiMdl, system: string, user: string, f: Fmt): Promise<Call> {
  const j = await post('https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, {
    model: m.mdl_nm,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: { name: f.name, strict: true, schema: f.schema } },
    max_completion_tokens: MAX_OUT,
    seed: SEED, // 같은 seed = 가능한 한 같은 답(OpenAI 최선 노력, 실호출 미확인 — 키 없음). temperature 는 추론 모델이 거부할 수 있어 넣지 않음
  })
  const c = j.choices?.[0]
  return { text: c?.message?.content ?? undefined, done: c?.finish_reason === 'stop', in: j.usage?.prompt_tokens ?? 0, out: j.usage?.completion_tokens ?? 0 }
}

const CALL: Record<Prvd, typeof callClaude> = { CLAUDE: callClaude, GEMINI: callGemini, OPENAI: callOpenAi }

// 고른 모델로 구조화 출력 1회 — 미완료·실패 = null(로그만)
export async function callAi<T>(mdl: AiMdl, system: string, user: string, f: Fmt): Promise<{ out: T; tok: { in: number; out: number } } | null> {
  try {
    const c = await CALL[mdl.prvd_cd](mdl, system, user, f)
    if (!c.done || !c.text) {
      console.error('mon-ai', f.name, mdl.prvd_cd, mdl.mdl_nm, 'incomplete')
      return null
    }
    return { out: JSON.parse(c.text) as T, tok: { in: c.in, out: c.out } }
  } catch (e) {
    console.error('mon-ai', f.name, mdl.prvd_cd, mdl.mdl_nm, (e as Error).message)
    return null
  }
}

const ANL_KEEP_MS = 30 * 86_400_000 // 분석 이력 보관 30일(sql/073)
const REUSE_MS = 86_400_000 // 같은 입력 재사용 기간 24시간
const AGE_STEP_MS = 15 * 60_000 // 재사용 시점 단위(마지막 데이터 이후 경과)
const PROD = process.env.VERCEL_ENV === 'production' // 분석 이력·재사용·직전 비교는 운영 분석끼리만(로컬 dev 도 같은 DB)
const MAX_AGG = 120
const MAX_EVT = 100
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export type AnalyzeBlock = { block: 'DEPLOYING' | 'VERIFY'; pr: number | null; at: string | null; until: number | null }
export async function analyzeRoute(route: string, min: number, mdlId: string | undefined, usrId: string): Promise<AiRun | AnalyzeBlock | 'OFF' | 'GONE' | null> {
  const mdl = await pickMdl(mdlId)
  if (mdl === 'GONE') return 'GONE'
  if (!keyOn(mdl.prvd_cd)) return 'OFF'
  // AI 수정 배포 직후는 재분석 차단(배포 전 오류가 구간에 남아 해결된 문제가 '미결'로 나옴) — 화면은 실시간 확인(mon-verify)으로 대신 판정
  const dep = await lastDeploy(route)
  if (dep && dep.sts !== 'FAIL' && dep.until > Date.now()) return { block: dep.sts === 'DPLY' ? 'DEPLOYING' : 'VERIFY', pr: dep.pr, at: dep.at, until: dep.until }
  // 구간 하한 = max(최근 N분, 운영 전용 수집 시작, 최근 AI 수정 배포 다음 분) — 배포 전 데이터·로컬 혼입 데이터를 근거로 쓰지 않음
  const now = Date.now()
  const lo = Math.max(now - min * 60000, CLEAN_FROM, dep && dep.sts !== 'FAIL' ? dep.cut : 0)
  const since = new Date(lo).toISOString()
  const [agg, evt, src] = await Promise.all([
    db().from('mon_app_hist').select('bkt_dtm, req_cnt, err_cnt, slow_cnt, rsp_sum_val, rsp_max_val').eq('route_txt', route).gte('bkt_dtm', since).order('bkt_dtm', { ascending: false }).limit(MAX_AGG),
    db().from('mon_app_evt_hist').select('occr_dtm, evt_cd, scr_txt, sts_no, rsp_val').eq('route_txt', route).gte('occr_dtm', since).order('occr_dtm', { ascending: false }).limit(MAX_EVT),
    gatherSrc(route),
  ])
  if (agg.error) throw agg.error
  if (evt.error) throw evt.error
  const aggTxt = agg.data.map((r) => `${r.bkt_dtm} 요청 ${r.req_cnt} 오류 ${r.err_cnt} 느림 ${r.slow_cnt} 평균 ${Math.round(Number(r.rsp_sum_val) / Math.max(1, r.req_cnt))}ms 최대 ${r.rsp_max_val}ms`).join('\n')
  const evtTxt = evt.data.map((e) => `${e.occr_dtm} ${e.evt_cd} 상태 ${e.sts_no} ${e.rsp_val}ms 화면 ${e.scr_txt ?? '-'}(${pageMenu(e.scr_txt)})`).join('\n')
  const srcCmt = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null
  const basis: AiBasis = {
    at: new Date(now).toISOString(),
    from: since,
    to: new Date(now).toISOString(),
    req: agg.data.reduce((a, r) => a + r.req_cnt, 0),
    err: agg.data.reduce((a, r) => a + r.err_cnt, 0),
    evt: evt.data.length,
    cut: agg.data.length >= MAX_AGG || evt.data.length >= MAX_EVT,
    src: srcCmt,
    floor: dep && dep.cut === lo ? 'DEPLOY' : null,
  }
  const system =
    '당신은 Next.js 16(App Router)·Supabase(PostgreSQL) 웹 서비스 운영 엔지니어입니다. 브라우저 계측(Resource Timing)으로 모은 API 응답 지표와 소스 코드를 보고 오류·지연의 원인을 추정하고 해결 방안을 제시합니다. ' +
    '근거 없는 추측은 likelihood 를 낮추고 gaps 에 부족한 데이터를 적습니다. 상태 0 은 네트워크 실패·요청 중단(화면 이동·새로고침으로 fetch 가 끊긴 경우 포함)입니다. ' +
    '합계 이력의 오류 건은 상태코드가 남지 않고, 개별 이력(느림·오류)은 sql/069 배포 이후 요청부터만 있습니다. 수치·이력은 운영(production) 배포에서만 수집한 값입니다(로컬·미리보기 제외). ' +
    '분석 시각과 각 행의 시각을 비교해 오류가 지금도 나는지, 과거 한때였는지 구분합니다. 답은 한국어로, 짧고 간결하게 씁니다(장황한 설명 금지).'
  // 입력 = 시각을 뺀 근거(같은 데이터·소스·모델이면 같은 해시) — 분석 시각 줄은 해시 밖에서 붙임
  const body = [
    `API 경로 : ${route} (메뉴 : ${routeMenu(route)})`,
    `느림 기준 ${SLOW_MS}ms, 분석 서버 환경 : ${process.env.VERCEL_ENV ?? process.env.NODE_ENV}${basis.floor ? ', 구간 시작 = 최근 AI 수정 운영 배포 직후(그 전 오류는 제외)' : ''}`,
    `분 단위 합계(최신순, ${agg.data.length}행${agg.data.length >= MAX_AGG ? ' — 상한, 이보다 오래된 행 생략' : ''}) :\n${aggTxt || '없음'}`,
    `느림·오류 개별 이력(최신순, ${evt.data.length}건${evt.data.length >= MAX_EVT ? ' — 상한' : ''}) :\n${evtTxt || '없음'}`,
    src.found ? `소스 코드(배포본 ${srcCmt ?? '로컬'}) :\n${src.text}` : `소스 코드 : route.ts 를 찾지 못함\n${src.text}`,
  ].join('\n\n')
  // 시점 단위 = 마지막 데이터 이후 경과를 15분 단위로 — 같은 데이터라도 '지금도 나는지' 판단이 바뀔 만큼 시간이 흐르면 새로 분석
  const last = Math.max(agg.data[0] ? Date.parse(agg.data[0].bkt_dtm) : lo, evt.data[0] ? Date.parse(evt.data[0].occr_dtm) : lo)
  const hash = sha([mdl.prvd_cd, mdl.mdl_nm, system, body, Math.floor((now - last) / AGE_STEP_MS)].join('\u0000'))
  const user = `분석 시각 : ${basis.at}, 데이터 구간 : ${since} ~ ${basis.to}\n\n${body}`

  // 같은 입력이면 이전 결과 재사용(결과가 매번 달라 보이는 혼동 방지) + 이 경로의 직전 분석(비교 표시)
  const none = { data: null, error: null }
  const [hit, prevQ] = PROD
    ? await Promise.all([
        db().from('mon_ai_anl_hist').select('anl_id, reg_dtm, rslt_json, tok_in_cnt, tok_out_cnt, elps_val, from_dtm, to_dtm').eq('inp_hash_txt', hash).gte('reg_dtm', new Date(now - REUSE_MS).toISOString()).order('reg_dtm', { ascending: false }).limit(1).maybeSingle(),
        db().from('mon_ai_anl_hist').select('anl_id, reg_dtm, mdl_dsp_nm, main_caus_txt, from_dtm, to_dtm, req_cnt, err_cnt, src_cmt_txt').eq('route_txt', route).order('reg_dtm', { ascending: false }).limit(2),
      ])
    : [none, none]
  const prevRow = (prevQ.data ?? []).find((x) => x.anl_id !== hit.data?.anl_id) ?? null
  const prev: AiPrev | null = prevRow
    ? { at: prevRow.reg_dtm, mdl: prevRow.mdl_dsp_nm, main: prevRow.main_caus_txt, from: prevRow.from_dtm, to: prevRow.to_dtm, req: prevRow.req_cnt, err: prevRow.err_cnt, src: prevRow.src_cmt_txt }
    : null
  if (hit.data) {
    const h = hit.data
    return { ai: h.rslt_json as AiResult, mdl, ms: h.elps_val, tok: { in: h.tok_in_cnt, out: h.tok_out_cnt }, basis: { ...basis, at: h.reg_dtm, from: h.from_dtm, to: h.to_dtm }, reused: true, prev }
  }
  const t0 = Date.now()
  const c = await callAi<AiResult>(mdl, system, user, ANALYZE)
  if (!c) return null
  const ms = Date.now() - t0
  if (!PROD) return { ai: c.out, mdl, ms, tok: c.tok, basis, reused: false, prev }
  const ins = await db().from('mon_ai_anl_hist').insert({
    route_txt: route, mdl_nm: mdl.mdl_nm, mdl_dsp_nm: mdl.dsp_nm, inp_hash_txt: hash, from_dtm: basis.from, to_dtm: basis.to,
    req_cnt: basis.req, err_cnt: basis.err, evt_cnt: basis.evt, cut_yn: basis.cut ? 'Y' : 'N', src_cmt_txt: srcCmt,
    main_caus_txt: mainOf(c.out), cfdc_cd: c.out.confidence, rslt_json: c.out,
    tok_in_cnt: c.tok.in, tok_out_cnt: c.tok.out, elps_val: ms, anl_usr_id: usrId, regr_id: usrId, modr_id: usrId,
  })
  if (ins.error) console.error('mon-ai anl hist', ins.error.message) // 기록 실패는 결과 표시를 막지 않음
  void db().from('mon_ai_anl_hist').delete().lt('reg_dtm', new Date(now - ANL_KEEP_MS).toISOString()).then(() => {}) // 보관 기간 정리(_hist 물리 삭제 허용)
  return { ai: c.out, mdl, ms, tok: c.tok, basis, reused: false, prev }
}
