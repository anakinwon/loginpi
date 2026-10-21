// 모니터링 AI 수정안 PR(2026-10-22, 마스터 지시 "AI 가 원인을 분석했으면 버튼 하나로 해결" — 마스터 선택 : 수정안 PR 생성, 운영 직접 반영 없음)
// 해결 방안 1개 → 그 파일들의 현재 master 원문(GitHub) + 원인·해결 설명을 등록 모델(mon-ai.ts callAi)에 보내 바꿀 부분(찾기·바꾸기)을 받고
//  원문에 정확히 1번 있는 부분만 바꿔 새 브랜치 커밋 1개 + PR 생성. 병합·배포는 사람이 PR 을 보고 함(Vercel 이 PR 미리보기 배포)
// env : GITHUB_TOKEN(저장소 Contents·Pull requests 쓰기, 없으면 503), GITHUB_REPO(기본 anakinwon/loginpi), GITHUB_BASE(기본 master)
import 'server-only'
import { db } from './db'
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
  head: string // 서버가 만든 커밋 — 승인 때 이 커밋 그대로인지 확인(만든 뒤 누가 덧붙인 커밋은 승인 불가)
  files: string[]
  summary: string
  mdl: AiMdl
  ms: number
  tok: { in: number; out: number }
  fixId?: string // 진행 기록 행(sql/072)
}
export type FixFail = 'OFF' | 'GONE' | 'NO_GH' | 'FILE' | { edit: string } | null

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

// 진행 기록(sql/072 mon_ai_fix, 마스터 지시 2026-10-22 보고서) — 상태·사람·PR·배포를 단계마다 갱신. 기록 실패는 본 작업을 막지 않음(로그만)
type FixRow = Partial<{
  fix_sts_cd: FixSts
  file_txt: string
  pr_no: number
  pr_url: string
  head_cmt_txt: string
  apv_usr_id: string
  apv_dtm: string
  mrg_cmt_txt: string
  ahead_cnt: number
  dply_dtm: string
  err_txt: string | null
  modr_id: string
}>
export type FixSts = 'REQ' | 'REQ_FAIL' | 'PR' | 'APV' | 'APV_FAIL' | 'DPLY' | 'DONE' | 'DPLY_FAIL'
async function rec(match: { fix_id?: string; pr_no?: number; mrg_cmt_txt?: string; fix_sts_cd?: FixSts | FixSts[] }, v: FixRow): Promise<string[]> {
  let qb = db().from('mon_ai_fix').update(v).eq('del_yn', 'N')
  for (const [k, x] of Object.entries(match)) qb = Array.isArray(x) ? qb.in(k, x) : qb.eq(k, x as string)
  const r = await qb.select('fix_id')
  if (r.error) console.error('mon-fix rec', r.error.message)
  return (r.data ?? []).map((x) => x.fix_id as string) // 바뀐 행(선점 판정용)
}
const why = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500)

export async function fixPr(q: FixReq, usrId: string): Promise<FixPr | FixFail> {
  if (!process.env.GITHUB_TOKEN) return 'NO_GH'
  const files = [...new Set(q.fix.files.map(normFile).filter((x): x is string => !!x))].slice(0, MAX_FILES)
  if (!files.length) return 'FILE'
  const mdl = await pickMdl(q.mdlId)
  if (mdl === 'GONE') return 'GONE'
  if (!keyOn(mdl.prvd_cd)) return 'OFF'
  // 1. 수정안 요청 — 결재 요청자 = 누른 사람, 요청 주체 = 고른 AI 모델(당시 이름 보관)
  const ins = await db()
    .from('mon_ai_fix')
    .insert({ route_txt: q.route, caus_txt: q.cause.title.slice(0, 200), fix_txt: q.fix.title.slice(0, 200), file_txt: files.join(' · '), mdl_nm: mdl.mdl_nm, mdl_dsp_nm: mdl.dsp_nm, req_usr_id: usrId, regr_id: usrId, modr_id: usrId })
    .select('fix_id')
    .single()
  if (ins.error) console.error('mon-fix rec', ins.error.message) // 기록 실패는 PR 생성을 막지 않음(보고서에만 빠짐)
  const fixId = (ins.data?.fix_id as string | undefined) ?? '00000000-0000-0000-0000-000000000000' // 없는 ID = 이후 rec 는 0행
  try {
    const r = await makePr(q, files, mdl)
    if (r && typeof r === 'object' && 'url' in r) {
      await rec({ fix_id: fixId }, { fix_sts_cd: 'PR', pr_no: r.number, pr_url: r.url, head_cmt_txt: r.head, file_txt: r.files.join(' · ') })
      return { ...r, fixId }
    }
    const msg = r === 'FILE' ? '고칠 파일을 저장소에서 읽지 못함' : r && typeof r === 'object' ? r.edit : 'AI 응답 실패'
    await rec({ fix_id: fixId }, { fix_sts_cd: 'REQ_FAIL', err_txt: msg.slice(0, 500) })
    return r
  } catch (e) {
    await rec({ fix_id: fixId }, { fix_sts_cd: 'REQ_FAIL', err_txt: why(e) })
    throw e
  }
}

async function makePr(q: FixReq, files: string[], mdl: AiMdl): Promise<FixPr | FixFail> {
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
  // 적용 실패(find 불일치·겹침)면 이유를 붙여 1번 다시 요청 — AI 가 원문을 조금 다르게 옮기는 일이 가끔 있음(같은 입력도 성공·실패가 갈림)
  let c: Awaited<ReturnType<typeof callAi<Patch>>> = null
  let r: ReturnType<typeof applyEdits> = { bad: [] }
  const tok = { in: 0, out: 0 }
  for (let k = 0; k < 2; k++) {
    const again = k === 0 || !('bad' in r) ? '' : `\n\n이전 답을 적용하지 못했습니다 : ${r.bad.join(' / ')}. find 를 원문에서 한 글자도 바꾸지 말고 다시 복사하십시오.`
    c = await callAi<Patch>(mdl, system, user + again, FIX)
    if (!c) return null
    tok.in += c.tok.in
    tok.out += c.tok.out
    if (!c.out.edits.length) return { edit: `AI 가 고칠 수 없다고 답했습니다 — ${c.out.summary}`.slice(0, 500) }
    r = applyEdits(src, c.out.edits)
    if ('changed' in r) break
  }
  if (!c || !('changed' in r)) return { edit: `바꿀 부분을 원문과 맞추지 못했습니다(2회) — ${'bad' in r ? r.bad.join(' / ') : ''}`.slice(0, 500) }
  const changed = r.changed
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
    `**모델** ${mdl.dsp_nm} (\`${mdl.mdl_nm}\`) · 요금제 ${mdl.plan_nm || '미입력'} · ${(ms / 1000).toFixed(1)}초 · 토큰 ${tok.in}/${tok.out}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  // PR 실패 = 방금 만든 브랜치 삭제(PR 없는 고아 브랜치 방지)
  const pr = await gh<{ html_url: string; number: number }>('POST', '/pulls', { title, head: branch, base, body }).catch(async (e) => {
    await gh('DELETE', `/git/refs/heads/${enc(branch)}`).catch(() => {})
    throw e
  })
  return { url: pr.html_url, number: pr.number, branch, head: commit.sha, files: Object.keys(changed), summary: c.out.summary, mdl, ms, tok }
}

// 승인(2026-10-22 마스터 지시 "프롬프트로 배포 요청은 곤란, 승인 처리로") — AI 수정안 PR 을 화면에서 승인 = master 에 squash 병합 + 운영 브랜치 빨리 감기(fast-forward)
//  AI 브랜치(fix/mon-ai-*)·같은 저장소·열린 PR 만, PR 커밋 = 서버가 만든 커밋 1개(head)일 때만 — 만든 뒤 덧붙인 커밋은 거절(TOCTOU 방지), 병합도 그 sha 로 고정
//  master 의 다른 미배포 커밋도 함께 운영에 나감(ahead 로 알림). 진행 기록 = PR 번호로 찾은 mon_ai_fix 행(기록 이전 PR 은 행 없음 — 승인은 그대로 진행)
const PROD = () => process.env.GITHUB_PROD || 'prod/schema'
export type ApproveFail = 'NO_GH' | 'NOT_AI' | 'CLOSED' | 'CONFLICT' | 'CHANGED' | 'PROD_FF' | 'BUSY'
export interface Approved {
  sha: string // 병합 커밋(= 운영 배포 커밋)
  ahead: number // 이번에 운영에 나간 커밋 수(병합 커밋 포함)
  url: string // 커밋 페이지(Vercel 상태 표시)
}
const APV_MSG: Record<ApproveFail, string> = {
  NO_GH: 'GitHub 토큰 없음',
  NOT_AI: 'AI 수정안 PR 이 아님',
  CLOSED: '이미 병합·닫힌 PR',
  CONFLICT: '병합 불가(충돌·확인 직후 변경)',
  CHANGED: 'AI 가 만든 뒤 PR 이 바뀜(커밋 추가)',
  PROD_FF: 'master 병합만 됨 — 운영 브랜치가 갈라져 운영 배포 못 함',
  BUSY: '다른 승인이 처리 중',
}
export async function approvePr(n: number, head: string, usrId: string): Promise<Approved | ApproveFail> {
  if (!process.env.GITHUB_TOKEN) return 'NO_GH'
  // 기록 행이 있는 PR = 행의 머리 커밋이 기준(화면이 보낸 값과 다르면 거절) + 승인 대기·승인 실패 행을 원자적으로 선점(동시 승인 1건만 진행)
  //  이후 기록은 선점한 fix_id 로만 — 늦게 온 요청이 앞 요청의 결과를 덮어쓰지 않음(2026-10-22 검토 HIGH). 기록 이전 PR(행 없음)은 화면 값으로 그대로 진행
  const row = await db().from('mon_ai_fix').select('fix_id, head_cmt_txt').eq('pr_no', n).eq('del_yn', 'N').maybeSingle()
  if (row.error) throw row.error
  let fixId: string | null = null
  if (row.data) {
    if (row.data.head_cmt_txt && row.data.head_cmt_txt !== head) return 'CHANGED'
    const got = await rec({ fix_id: row.data.fix_id, fix_sts_cd: ['PR', 'APV_FAIL'] }, { fix_sts_cd: 'APV', apv_usr_id: usrId, apv_dtm: new Date().toISOString(), err_txt: null, modr_id: usrId })
    if (!got.length) return 'BUSY'
    fixId = got[0]
  }
  const mine = { fix_id: fixId ?? '00000000-0000-0000-0000-000000000000' }
  let merged: string | null = null // 병합까지 됐으면 그 커밋 — 이후 실패는 '배포 실패'(master 에는 반영됨)
  try {
    const r = await mergeAndDeploy(n, head, async (sha) => {
      merged = sha
      await rec(mine, { mrg_cmt_txt: sha })
    })
    if (typeof r === 'string') await rec(mine, { fix_sts_cd: r === 'PROD_FF' ? 'DPLY_FAIL' : 'APV_FAIL', err_txt: APV_MSG[r] })
    else await rec(mine, { fix_sts_cd: 'DPLY', mrg_cmt_txt: r.sha, ahead_cnt: r.ahead })
    return r
  } catch (e) {
    await rec(mine, { fix_sts_cd: merged ? 'DPLY_FAIL' : 'APV_FAIL', err_txt: merged ? `master 병합 후 운영 배포 실패 — ${why(e)}`.slice(0, 500) : why(e) })
    throw e
  }
}

async function mergeAndDeploy(n: number, head: string, onMerged: (sha: string) => Promise<void>): Promise<Approved | ApproveFail> {
  const base = process.env.GITHUB_BASE || 'master'
  const pr = await gh<{ state: string; merged: boolean; mergeable: boolean | null; commits: number; title: string; head: { ref: string; sha: string; repo: { full_name: string } | null }; base: { ref: string } }>('GET', `/pulls/${n}`)
  if (!pr.head.ref.startsWith('fix/mon-ai-') || pr.head.repo?.full_name !== repo() || pr.base.ref !== base) return 'NOT_AI'
  if (pr.state !== 'open' || pr.merged) return 'CLOSED'
  if (pr.head.sha !== head || pr.commits !== 1) return 'CHANGED'
  if (pr.mergeable === false) return 'CONFLICT'
  const m = await gh<{ sha: string }>('PUT', `/pulls/${n}/merge`, { merge_method: 'squash', sha: head, commit_title: `${pr.title} (#${n})` }).catch((e: Error) => {
    if (/ (405|409) /.test(e.message)) return null // 병합 불가·확인 직후 머리 커밋 변경
    throw e
  })
  if (!m) return 'CONFLICT'
  await onMerged(m.sha)
  await gh('DELETE', `/git/refs/heads/${enc(pr.head.ref)}`).catch(() => {}) // 병합한 AI 브랜치 정리
  const prod = await gh<{ object: { sha: string } }>('GET', `/git/ref/heads/${enc(PROD())}`)
  const cmp = await gh<{ status: string; ahead_by: number }>('GET', `/compare/${prod.object.sha}...${m.sha}`)
  if (cmp.status !== 'ahead' && cmp.status !== 'identical') return 'PROD_FF' // 운영 브랜치가 master 조상이 아님 — 병합만 됨
  await gh('PATCH', `/git/refs/heads/${enc(PROD())}`, { sha: m.sha, force: false })
  return { sha: m.sha, ahead: cmp.ahead_by, url: `https://github.com/${repo()}/commit/${m.sha}` }
}

// 운영 배포 상태 = 그 커밋의 'Vercel – schema' 상태(pending·success·failure·error, 아직 없으면 null)
//  끝난 상태(success·failure·error)면 그 커밋으로 배포 중인 기록을 4. 운영 배포 완료·실패로 확정
export async function deployState(sha: string): Promise<string | null> {
  const s = await gh<{ statuses: { context: string; state: string }[] }>('GET', `/commits/${sha}/status`)
  const st = s.statuses.find((x) => x.context === 'Vercel – schema')?.state ?? null
  if (st && st !== 'pending') await rec({ mrg_cmt_txt: sha, fix_sts_cd: 'DPLY' }, { fix_sts_cd: st === 'success' ? 'DONE' : 'DPLY_FAIL', dply_dtm: new Date().toISOString(), err_txt: st === 'success' ? null : `Vercel 운영 빌드 ${st} — 이전 배포 유지` })
  return st
}

// 보고서 목록(최신 요청순, 20행 페이지) — 사람 이름은 sys_user 별도 조회 후 병합(FK·임베디드 조인 없음, RI 물리 미구현 결정)
//  배포 중(DPLY) 행은 보는 김에 Vercel 상태를 확인해 확정(화면을 닫아 폴링이 끊긴 경우 보완, 한 번에 5건)
export const FIX_PAGE = 20
export type FixListRow = Record<string, unknown> & { fix_id: string; req_usr_nm: string | null; apv_usr_nm: string | null }
const STALE_MS = 10 * 60_000 // 함수 최대 실행(300초)의 두 배 — 넘은 '진행 중' 행 = 강제 종료로 끊긴 것
export async function listFixes(page: number, sts?: FixSts[]): Promise<{ rows: FixListRow[]; total: number }> {
  const old = new Date(Date.now() - STALE_MS).toISOString()
  await Promise.all([
    db().from('mon_ai_fix').update({ fix_sts_cd: 'REQ_FAIL', err_txt: '시간 초과로 중단(서버 실행 제한)' }).eq('fix_sts_cd', 'REQ').lt('req_dtm', old),
    db().from('mon_ai_fix').update({ fix_sts_cd: 'APV_FAIL', err_txt: '시간 초과로 중단(서버 실행 제한) — GitHub PR·운영 브랜치 상태 확인' }).eq('fix_sts_cd', 'APV').lt('apv_dtm', old).is('mrg_cmt_txt', null),
    // 병합 커밋이 남은 행 = master 병합 뒤 끊김 → 배포 실패(다시 승인 대상 아님)
    db().from('mon_ai_fix').update({ fix_sts_cd: 'DPLY_FAIL', err_txt: 'master 병합 후 시간 초과로 중단 — 운영 브랜치(prod/schema) 반영 여부 확인' }).eq('fix_sts_cd', 'APV').lt('apv_dtm', old).not('mrg_cmt_txt', 'is', null),
  ])
  let q = db()
    .from('mon_ai_fix')
    .select('fix_id, route_txt, caus_txt, fix_txt, file_txt, mdl_nm, mdl_dsp_nm, fix_sts_cd, req_usr_id, req_dtm, pr_no, pr_url, head_cmt_txt, apv_usr_id, apv_dtm, mrg_cmt_txt, ahead_cnt, dply_dtm, err_txt', { count: 'exact' })
    .eq('del_yn', 'N')
  if (sts?.length) q = q.in('fix_sts_cd', sts)
  const r = await q.order('req_dtm', { ascending: false }).range((page - 1) * FIX_PAGE, page * FIX_PAGE - 1)
  if (r.error?.code === 'PGRST103') {
    // 페이지가 범위 밖(건수가 줄어듦) — 빈 목록 + 건수만, 화면이 마지막 페이지로 옮김
    let c = db().from('mon_ai_fix').select('fix_id', { count: 'exact', head: true }).eq('del_yn', 'N')
    if (sts?.length) c = c.in('fix_sts_cd', sts)
    const n = await c
    if (n.error) throw n.error
    return { rows: [], total: n.count ?? 0 }
  }
  if (r.error) throw r.error
  let rows = r.data
  const dply = [...new Set(rows.filter((x) => x.fix_sts_cd === 'DPLY' && x.mrg_cmt_txt).map((x) => x.mrg_cmt_txt as string))].slice(0, 5)
  if (dply.length && process.env.GITHUB_TOKEN) {
    const done = await Promise.all(dply.map((sha) => deployState(sha).catch(() => null)))
    if (done.some((x) => x && x !== 'pending')) {
      const again = await db().from('mon_ai_fix').select('fix_id, fix_sts_cd, dply_dtm, err_txt').in('mrg_cmt_txt', dply)
      const by = new Map((again.data ?? []).map((x) => [x.fix_id, x]))
      rows = rows.map((x) => ({ ...x, ...(by.get(x.fix_id) ?? {}) }))
    }
  }
  const ids = [...new Set(rows.flatMap((x) => [x.req_usr_id, x.apv_usr_id]).filter(Boolean))] as string[]
  const users = ids.length ? await db().from('sys_user').select('usr_id, dsp_nm, pi_usr_nm').in('usr_id', ids) : { data: [], error: null }
  if (users.error) throw users.error
  const nm = new Map((users.data ?? []).map((u) => [u.usr_id, u.dsp_nm || u.pi_usr_nm]))
  return { rows: rows.map((x) => ({ ...x, req_usr_nm: nm.get(x.req_usr_id) ?? null, apv_usr_nm: x.apv_usr_id ? (nm.get(x.apv_usr_id) ?? null) : null })), total: r.count ?? 0 }
}
