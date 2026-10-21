// 모니터링 AI 수정안 PR(2026-10-22, 마스터 지시 "AI 가 원인을 분석했으면 버튼 하나로 해결" — 마스터 선택 : 수정안 PR 생성, 운영 직접 반영 없음)
// 해결 방안 1개 → 그 파일들의 현재 master 원문(GitHub) + 원인·해결 설명을 등록 모델(mon-ai.ts callAi)에 보내 바꿀 부분(찾기·바꾸기)을 받고
//  원문에 정확히 1번 있는 부분만 바꿔 새 브랜치 커밋 1개 + PR 생성. 병합·배포는 사람이 PR 을 보고 함(Vercel 이 PR 미리보기 배포)
// env : GITHUB_TOKEN(저장소 Contents·Pull requests 쓰기, 없으면 503), GITHUB_REPO(기본 anakinwon/loginpi), GITHUB_BASE(기본 master)
import 'server-only'
import { callAi, keyOn, pickMdl, type AiMdl, type Fmt } from './mon-ai'
import { routeMenu } from './mon'
import { applyEdits, normFile, type Patch } from './mon-fix-patch'

const APP_DIR = 'sitemap/schema.pi/' // 저장소 안 이 앱 위치
const MAX_FILES = 3
const MAX_FILE = 40_000 // 파일 하나 상한(자) — 넘으면 수정안 대상에서 거절

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '무엇을 왜 바꿨는지 2~3문장(PR 설명용)' },
    edits: {
      type: 'array',
      description: '바꿀 부분 1~8개. find 는 원문에 정확히 1번 나오는 연속된 줄(공백·들여쓰기까지 그대로), replace 는 바꾼 뒤 내용',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '주어진 파일 경로 중 하나(src/ 로 시작)' },
          find: { type: 'string' },
          replace: { type: 'string' },
        },
        required: ['path', 'find', 'replace'],
        additionalProperties: false,
      },
    },
    checks: { type: 'array', items: { type: 'string' }, description: '병합 전 확인 방법 1~3개, 각 한 문장' },
  },
  required: ['summary', 'edits', 'checks'],
  additionalProperties: false,
} as const
const FIX: Fmt = { name: 'mon_fix_patch', schema: SCHEMA, claudeMax: 16_000 }

export interface FixReq {
  route: string
  cause: { title: string; evidence: string }
  fix: { title: string; detail: string; files: string[] }
  mdlId?: string
}
export interface FixPr {
  url: string
  number: number
  branch: string
  files: string[]
  summary: string
  mdl: AiMdl
  ms: number
  tok: { in: number; out: number }
}
export type FixFail = 'OFF' | 'GONE' | 'NO_GH' | 'FILE' | 'EDIT' | null

const repo = () => process.env.GITHUB_REPO || 'anakinwon/loginpi'
async function gh<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(`https://api.github.com/repos/${repo()}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'schema.pi-monitor',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`GitHub ${method} ${url.split('?')[0]} ${r.status} ${j?.message ?? ''}`.slice(0, 300))
  return j as T
}
const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/')
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15) // 20261022-051200

export async function fixPr(q: FixReq): Promise<FixPr | FixFail> {
  if (!process.env.GITHUB_TOKEN) return 'NO_GH'
  const files = [...new Set(q.fix.files.map(normFile).filter((x): x is string => !!x))].slice(0, MAX_FILES)
  if (!files.length) return 'FILE'
  const mdl = await pickMdl(q.mdlId)
  if (mdl === 'GONE') return 'GONE'
  if (!keyOn(mdl.prvd_cd)) return 'OFF'

  const base = process.env.GITHUB_BASE || 'master'
  const head = await gh<{ object: { sha: string } }>('GET', `/git/ref/heads/${enc(base)}`)
  const sha = head.object.sha
  const src: Record<string, string> = {}
  for (const f of files) {
    const c = await gh<{ content?: string; encoding?: string }>('GET', `/contents/${enc(APP_DIR + f)}?ref=${sha}`).catch(() => null)
    if (!c?.content || c.encoding !== 'base64') return 'FILE'
    const t = Buffer.from(c.content, 'base64').toString('utf8')
    if (t.length > MAX_FILE) return 'FILE'
    src[f] = t
  }

  const system =
    '당신은 Next.js 16(App Router)·React 19·Supabase 프로젝트의 시니어 개발자입니다. 운영 모니터링 AI 가 찾은 원인과 해결 방안 1개를 받아, 주어진 파일만 최소한으로 고쳐 그 원인을 없앱니다. ' +
    '규칙 : 주어진 파일 밖은 바꾸지 않음, 해결 방안과 무관한 정리·리팩터링 금지, 기존 스타일 유지(들여쓰기 2칸·세미콜론 없음·작은따옴표·한국어 주석), ' +
    "find 는 원문을 한 글자도 바꾸지 않고 그대로 복사(파일 안에서 유일하도록 앞뒤 줄 포함), 고칠 수 없으면 edits 를 빈 배열로 하고 summary 에 이유. 답은 한국어."
  const user = [
    `API 경로 : ${q.route} (메뉴 : ${routeMenu(q.route)})`,
    `원인 : ${q.cause.title}\n근거 : ${q.cause.evidence}`,
    `해결 방안 : ${q.fix.title}\n${q.fix.detail}`,
    ...files.map((f) => `=== ${f} ===\n${src[f]}`),
  ].join('\n\n')
  const t0 = Date.now()
  const c = await callAi<Patch>(mdl, system, user, FIX)
  if (!c) return null
  const changed = applyEdits(src, c.out.edits)
  if (!changed) return 'EDIT'
  const ms = Date.now() - t0

  // 커밋 1개 = 기준 트리 + 바뀐 파일 내용, 브랜치는 그 커밋으로 바로 생성(빈 브랜치 없음)
  const baseCommit = await gh<{ tree: { sha: string } }>('GET', `/git/commits/${sha}`)
  const tree = await gh<{ sha: string }>('POST', '/git/trees', {
    base_tree: baseCommit.tree.sha,
    tree: Object.entries(changed).map(([p, content]) => ({ path: APP_DIR + p, mode: '100644', type: 'blob', content })),
  })
  const title = `🐛 fix(schema): ${q.fix.title} — 모니터링 AI 수정안`
  const commit = await gh<{ sha: string }>('POST', '/git/commits', {
    message: `${title}\n\n${q.route} : ${q.cause.title}\n${c.out.summary}\n\nAI 수정안(${mdl.dsp_nm} ${mdl.mdl_nm}) — 검토 후 병합`,
    tree: tree.sha,
    parents: [sha],
  })
  const branch = `fix/mon-ai-${stamp()}`
  await gh('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha: commit.sha })
  const body = [
    '> ⚠️ 모니터링 AI 가 만든 수정안입니다. 변경 내용과 미리보기 배포를 확인한 뒤 병합하십시오. 병합 전에는 운영에 반영되지 않습니다.',
    `**API** \`${q.route}\` (${routeMenu(q.route)})`,
    `**원인** ${q.cause.title}\n${q.cause.evidence}`,
    `**해결** ${q.fix.title}\n${q.fix.detail}`,
    `**수정 요약** ${c.out.summary}`,
    `**바뀐 파일**\n${Object.keys(changed).map((p) => `- \`${APP_DIR}${p}\``).join('\n')}`,
    c.out.checks.length ? `**병합 전 확인**\n${c.out.checks.map((x) => `- [ ] ${x}`).join('\n')}` : '',
    `**모델** ${mdl.dsp_nm} (\`${mdl.mdl_nm}\`) · 요금제 ${mdl.plan_nm || '미입력'} · ${(ms / 1000).toFixed(1)}초 · 토큰 ${c.tok.in}/${c.tok.out}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  // PR 실패 = 방금 만든 브랜치 삭제(PR 없는 고아 브랜치 방지)
  const pr = await gh<{ html_url: string; number: number }>('POST', '/pulls', { title, head: branch, base, body }).catch(async (e) => {
    await gh('DELETE', `/git/refs/heads/${enc(branch)}`).catch(() => {})
    throw e
  })
  return { url: pr.html_url, number: pr.number, branch, files: Object.keys(changed), summary: c.out.summary, mdl, ms, tok: c.tok }
}

// 승인(2026-10-22 마스터 지시 "프롬프트로 배포 요청은 곤란, 승인 처리로") — AI 수정안 PR 을 화면에서 승인 = master 에 squash 병합 + 운영 브랜치 빨리 감기(fast-forward)
//  AI 브랜치(fix/mon-ai-*)·같은 저장소·열린 PR 만. 병합 기준 = 지금 PR 머리 커밋(검토 뒤 바뀌면 GitHub 409). master 의 다른 미배포 커밋도 함께 운영에 나감(ahead 로 알림)
const PROD = () => process.env.GITHUB_PROD || 'prod/schema'
export type ApproveFail = 'NO_GH' | 'NOT_AI' | 'CLOSED' | 'CONFLICT' | 'PROD_FF'
export interface Approved {
  sha: string // 병합 커밋(= 운영 배포 커밋)
  ahead: number // 이번에 운영에 나간 커밋 수(병합 커밋 포함)
  url: string // 커밋 페이지(Vercel 상태 표시)
}
export async function approvePr(n: number): Promise<Approved | ApproveFail> {
  if (!process.env.GITHUB_TOKEN) return 'NO_GH'
  const base = process.env.GITHUB_BASE || 'master'
  const pr = await gh<{ state: string; merged: boolean; mergeable: boolean | null; title: string; head: { ref: string; sha: string; repo: { full_name: string } | null }; base: { ref: string } }>('GET', `/pulls/${n}`)
  if (!pr.head.ref.startsWith('fix/mon-ai-') || pr.head.repo?.full_name !== repo() || pr.base.ref !== base) return 'NOT_AI'
  if (pr.state !== 'open' || pr.merged) return 'CLOSED'
  if (pr.mergeable === false) return 'CONFLICT'
  const m = await gh<{ sha: string }>('PUT', `/pulls/${n}/merge`, { merge_method: 'squash', sha: pr.head.sha, commit_title: `${pr.title} (#${n})` }).catch((e: Error) => {
    if (/ (405|409) /.test(e.message)) return null // 병합 불가·검토 뒤 머리 커밋 변경
    throw e
  })
  if (!m) return 'CONFLICT'
  await gh('DELETE', `/git/refs/heads/${enc(pr.head.ref)}`).catch(() => {}) // 병합한 AI 브랜치 정리
  const prod = await gh<{ object: { sha: string } }>('GET', `/git/ref/heads/${enc(PROD())}`)
  const cmp = await gh<{ status: string; ahead_by: number }>('GET', `/compare/${prod.object.sha}...${m.sha}`)
  if (cmp.status !== 'ahead' && cmp.status !== 'identical') return 'PROD_FF' // 운영 브랜치가 master 조상이 아님 — 병합만 됨
  await gh('PATCH', `/git/refs/heads/${enc(PROD())}`, { sha: m.sha, force: false })
  return { sha: m.sha, ahead: cmp.ahead_by, url: `https://github.com/${repo()}/commit/${m.sha}` }
}

// 운영 배포 상태 = 그 커밋의 'Vercel – schema' 상태(pending·success·failure·error, 아직 없으면 null)
export async function deployState(sha: string): Promise<string | null> {
  const s = await gh<{ statuses: { context: string; state: string }[] }>('GET', `/commits/${sha}/status`)
  return s.statuses.find((x) => x.context === 'Vercel – schema')?.state ?? null
}
