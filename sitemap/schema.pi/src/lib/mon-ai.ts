// 애플리케이션 모니터링 AI 원인 분석(2026-10-21, 마스터 지시 — 원인·해결 방안까지만 화면 제시, 코드 자동 수정 없음)
// 한 API 경로의 분 단위 합계·느린/오류 개별 이력 + 그 경로 소스(route.ts·직접 import 한 src/lib·호출 화면 일부) → Claude 구조화 출력
// 외부로 보내는 값 = 경로·수치·화면 경로·소스 코드(사용자 ID·이름은 보내지 않음). 소스는 next.config outputFileTracingIncludes 로 배포본에 포함
import 'server-only'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { db } from './db'
import { pageMenu, routeMenu, SLOW_MS } from './mon'

// 소스 위치는 실행 때만 계산(정적 분석되면 Turbopack 이 프로젝트 전체를 이 함수 배포본에 추적) — 포함할 파일은 next.config outputFileTracingIncludes 가 지정
const SRC = [process.cwd(), 'src'].join(path.sep)
const MAX_FILE = 16_000 // 파일 하나 상한(자)
const MAX_SRC = 60_000 // 소스 합계 상한(자)

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
    for (const m of body.matchAll(/from '@\/lib\/([\w/-]+)'/g)) {
      const base = path.join(SRC, 'lib', m[1])
      for (const f of [`${base}.ts`, path.join(base, 'index.ts')]) {
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

let client: Anthropic | null = null

export async function analyzeRoute(route: string, min: number): Promise<AiResult | 'OFF' | null> {
  if (!process.env.ANTHROPIC_API_KEY) return 'OFF'
  const since = new Date(Date.now() - min * 60000).toISOString()
  const [agg, evt, src] = await Promise.all([
    db().from('mon_app_hist').select('bkt_dtm, req_cnt, err_cnt, slow_cnt, rsp_sum_val, rsp_max_val').eq('route_txt', route).gte('bkt_dtm', since).order('bkt_dtm', { ascending: false }).limit(120),
    db().from('mon_app_evt_hist').select('occr_dtm, evt_cd, scr_txt, sts_no, rsp_val').eq('route_txt', route).gte('occr_dtm', since).order('occr_dtm', { ascending: false }).limit(100),
    gatherSrc(route),
  ])
  if (agg.error) throw agg.error
  if (evt.error) throw evt.error
  const aggTxt = agg.data.map((r) => `${r.bkt_dtm} 요청 ${r.req_cnt} 오류 ${r.err_cnt} 느림 ${r.slow_cnt} 평균 ${Math.round(Number(r.rsp_sum_val) / Math.max(1, r.req_cnt))}ms 최대 ${r.rsp_max_val}ms`).join('\n')
  const evtTxt = evt.data.map((e) => `${e.occr_dtm} ${e.evt_cd} 상태 ${e.sts_no} ${e.rsp_val}ms 화면 ${e.scr_txt ?? '-'}(${pageMenu(e.scr_txt)})`).join('\n')
  client ??= new Anthropic({ timeout: 90_000, maxRetries: 1 })
  try {
    const res = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system:
        '당신은 Next.js 16(App Router)·Supabase(PostgreSQL) 웹 서비스 운영 엔지니어입니다. 브라우저 계측(Resource Timing)으로 모은 API 응답 지표와 소스 코드를 보고 오류·지연의 원인을 추정하고 해결 방안을 제시합니다. ' +
        '근거 없는 추측은 likelihood 를 낮추고 gaps 에 부족한 데이터를 적습니다. 상태 0 은 네트워크 실패·요청 중단(화면 이동·새로고침으로 fetch 가 끊긴 경우 포함)입니다. ' +
        '합계 이력의 오류 건은 상태코드가 남지 않고, 개별 이력(느림·오류)은 sql/069 배포 이후 요청부터만 있습니다. 운영(production)과 로컬 개발 서버가 같은 DB 에 기록할 수 있습니다. 답은 한국어로, 짧고 간결하게 씁니다(장황한 설명 금지).',
      messages: [
        {
          role: 'user',
          content: [
            `API 경로 : ${route} (메뉴 : ${routeMenu(route)})`,
            `분석 구간 : 최근 ${min}분, 느림 기준 ${SLOW_MS}ms, 분석 서버 환경 : ${process.env.VERCEL_ENV ?? process.env.NODE_ENV}`,
            `분 단위 합계(최신순, ${agg.data.length}행) :\n${aggTxt || '없음'}`,
            `느림·오류 개별 이력(최신순, ${evt.data.length}건) :\n${evtTxt || '없음'}`,
            src.found ? `소스 코드 :\n${src.text}` : `소스 코드 : route.ts 를 찾지 못함\n${src.text}`,
          ].join('\n\n'),
        },
      ],
    })
    const text = res.stop_reason === 'end_turn' ? res.content.find((b) => b.type === 'text')?.text : undefined
    return text ? (JSON.parse(text) as AiResult) : null
  } catch (e) {
    console.error('mon-ai', (e as Error).message)
    return null
  }
}
