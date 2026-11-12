// 아소카 승인 감사·메인 직접 변경 판정 요청·같은 원장 재회송 — 원장(.omc/state/loop/<id>)이 '판정받은 그 내용 · 새 규칙 계약 · 전 기준 실행 증거 · 실 Codex 판정'인지 결정적으로 검사하고(check), 메인 변경은 Codex 판정을 요청(request), 불충족 원장은 같은 원장 다음 회차로 Codex 에 되돌린다(rejudge)
// 실행 : node scripts/codex-audit.mjs check [--id <id>]… [--files a,b] [--staged] | request <파일…> | rejudge <id> [--note <글>] [--waive D-NNN,… --quote <마스터 원문>]  (request·rejudge = Codex 판정 최대 약 9분 — Bash timeout 600000 또는 백그라운드)
// 종료 : 0 통과(조건부 포함) · 1 불충족·거부 · 2 사용법·환경 오류. 이 파일은 원장·증거를 직접 쓰지 않는다(쓰기 = codex-gate judgeOne·래퍼만). 시험 : node --test test/codex-audit.test.mjs
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  GEN_RE, EXCLUDE_RE, blobsOf, ZERO, contractQuotes, derivedAcs, masterTexts, readJsonl, tailJsonl, writesOf, relOf, requestOf,
  toolEntries, slugOf, prepareJobs, judgeOne, summarize, nextIter, loopsDir,
} from '../.claude/hooks/codex-gate.mjs'
import { criteriaIds, contractHead, execRuleOf, naIds, execIndex, refsOk, budgetExceeded } from './codex-verify.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** 실제 원장 루트 — 여기서 CODEX_JS 대역(via codex-js)·--ingest 판정은 무효(judge-via) */
export const DEFAULT_LOOPS = path.join(ROOT, '.omc', 'state', 'loop')
const loopsRoot = process.env.CODEX_LOOP_ROOT ? path.resolve(process.env.CODEX_LOOP_ROOT) : DEFAULT_LOOPS
const CAP = 5   // 일감 누적 상한(판정 회차 + BLOCKED, 갈아타기 포함 — 마스터 2026-11-11)
const DEVICE_RE = /실기기|device|pi\s?browser/i
const isDevice = reason => !!reason && String(reason).split(',').every(x => x.trim() === 'device')   // 사유 쉼표 목록이 전부 device = 실기기 단독
const WAIVE_RE = /면제|예외|무시|넘어가|허용|괜찮|waive/i
const JUDGE_MS = 560e3   // 판정 시간 예산(훅과 같은 값)
const REQUEST_CODES = new Set(['stale', 'no-ledger', 'no-blobs', 'legacy-contract'])   // 같은 원장 재판정으로 못 고침 = 새 판정(request) 안내
const ID_RE = /^[\w.-]+$/

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const git = (args, root = ROOT) => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30e3, maxBuffer: 64 * 2 ** 20 })
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const short = s => String(s || '').slice(0, 7) || '(없음)'
const clip = s => norm(s).slice(0, 120)
const samePath = (a, b) => { const x = path.resolve(a), y = path.resolve(b); return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y }
const atOf = x => { const t = Date.parse(x?.g?.judged?.at); return Number.isFinite(t) ? t : 0 }
const fail = (exit, msg) => { throw Object.assign(new Error(msg), { exit }) }

/** 원장 1개 읽기 → { id, dir, l, g, ev, r, superseded, parts } | null(폴더 없음·id 형식 밖) — ev = iters·blocked 중 at 최댓값, r = 그 결과 json, parts = split.json 의 대체 안 된 묶음(0건 = null) */
export function ledgerOf(id, loops = loopsRoot) {
  if (!ID_RE.test(String(id ?? ''))) return null
  const dir = path.join(loops, id); if (!fs.existsSync(dir)) return null
  const l = readJson(path.join(dir, 'ledger.json')), g = readJson(path.join(dir, 'gate.json'))
  const evs = [
    ...(l?.iters || []).map(x => ({ kind: 'iter', iter: x.iter, at: x.at, verdict: x.verdict, out: x.out })),
    ...(l?.blocked || []).map(x => ({ kind: 'blocked', iter: x.iter, at: x.at, verdict: 'BLOCKED', reason: String(x.reason || ''), out: x.out })),
  ].filter(e => Number.isFinite(Date.parse(e.at)))
  const ev = evs.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1) || null
  // 결과 = 원장이 가리킨 out → 같은 이름의 이 폴더 파일(저장소 이동 대비) → iter-N.codex.json
  const r = ev ? [ev.out, ev.out && path.join(dir, path.basename(String(ev.out))), path.join(dir, `iter-${ev.iter}.codex.json`)].filter(Boolean).map(readJson).find(Boolean) ?? null : null
  const sp = readJson(path.join(dir, 'split.json'))
  const parts = Array.isArray(sp?.parts) ? sp.parts.filter(p => ID_RE.test(String(p)) && !fs.existsSync(path.join(loops, p, 'superseded.json'))) : []
  return { id, dir, l, g, ev, r, superseded: fs.existsSync(path.join(dir, 'superseded.json')), parts: parts.length ? parts : null }
}

/** 원장 루트의 gate.json 전부 [{ id, dir, g, superseded, split }] — split = 대체 안 된 묶음이 있는 기준 원장(판정은 묶음 몫) */
function gatesOf(loops = loopsRoot) {
  let ids = []; try { ids = fs.readdirSync(loops) } catch { return [] }
  return ids.flatMap(id => {
    const dir = path.join(loops, id), g = readJson(path.join(dir, 'gate.json')); if (!g) return []
    const sp = readJson(path.join(dir, 'split.json'))
    const split = Array.isArray(sp?.parts) && sp.parts.some(p => ID_RE.test(String(p)) && !fs.existsSync(path.join(loops, p, 'superseded.json')))
    return [{ id, dir, g, superseded: fs.existsSync(path.join(dir, 'superseded.json')), split }]
  })
}

/** 일감 누적 = 같은 요청(requestAt 같음 — null 이면 자기 원장만)·scope 파일 하나 이상 겹치는 c4 원장(superseded 포함)의 iters + blocked 수 */
export function workCount(g, loops = loopsRoot, self = null, gates = gatesOf(loops)) {
  if (!g) return 0
  const mine = new Set(g.files || [])
  return gates.reduce((n, x) => {
    const hit = x.id === self || (g.requestAt != null && x.g.no === 4 && x.g.requestAt === g.requestAt && (x.g.files || []).some(f => mine.has(f)))
    if (!hit) return n
    const l = readJson(path.join(x.dir, 'ledger.json'))
    return n + (l?.iters?.length || 0) + (l?.blocked?.length || 0)
  }, 0)
}

/**
 * 원장 감사 → { id, ok, conditional, findings:[{ code, detail, id }], work, reqs, sum, files, parts? } — 순서대로 전부 검사(중단 없음, 원장·gate.json 없음만 즉시 끝)
 *   blobOf = 파일 → 현재 blob(없으면 작업 트리 blobsOf 한 번), onlyFiles = blob 대조 파일(null = 원장 파일 전부, [] = 대조 생략), defaultLoops = 실제 원장 루트(시험이 바꿔 judge-via 확인)
 */
export function auditLedger(id, { loops = loopsRoot, blobOf = null, onlyFiles = null, root = ROOT, defaultLoops = DEFAULT_LOOPS, gates = null } = {}) {
  const L = ledgerOf(id, loops), findings = [], add = (code, detail) => findings.push({ code, detail, id })
  const res = (extra = {}) => ({ id, ok: !findings.length, conditional: false, findings, work: 0, reqs: [], sum: null, files: L?.g?.files || [], ...extra })
  if (!L) { add('missing', '원장 폴더 없음'); return res() }
  if (L.superseded) add('superseded', '대체된 원장(superseded.json) — 대체한 원장으로 감사')
  if (L.parts) {   // 기준 원장 = 묶음 AND
    const subs = L.parts.map(p => auditLedger(p, { loops, blobOf, onlyFiles, root, defaultLoops, gates }))
    for (const s of subs) for (const f of s.findings) findings.push({ ...f, detail: `${s.id} : ${f.detail}` })
    return res({ conditional: subs.some(s => s.conditional), work: Math.max(0, ...subs.map(s => s.work)), reqs: subs.flatMap(s => s.reqs), parts: subs, files: subs.flatMap(s => s.files) })
  }
  const { dir, l, g, ev, r } = L
  if (!l || !g) { add('missing', `${!l ? 'ledger.json' : 'gate.json'} 없음·깨짐`); return res() }
  let contract = ''; try { contract = fs.readFileSync(path.join(dir, 'contract.md'), 'utf8') } catch { /* 없음 = legacy-contract */ }
  if (!ev) add('no-judgment', '판정 기록(iters·blocked) 없음')
  else if (!r) add('no-result', `${ev.iter}회차 결과 파일 없음·깨짐`)
  if (r) {
    const via = r.judge?.via
    if (!(via === 'codex' || (via === 'codex-js' && !samePath(loops, defaultLoops)))) add('judge-via', `판정 출처 ${via ?? '(없음)'} — 실 Codex 판정 아님(기본 원장 루트의 CODEX_JS·--ingest 판정은 무효)`)
    if (r.judge?.kind !== 'codex') add('substitute', `판정자 ${r.judge?.kind ?? '(없음)'} — Codex 아님`)
  }
  if (!execRuleOf(contract)) add('legacy-contract', contract ? '계약에 실행 증거 규칙 표식 없음(옛 규칙 판정) — request·재실행으로 새 규칙 판정 필요' : 'contract.md 없음')
  // 기준 전수 : 계약 기준 id 가 결과에 다 있나 + 인용 구획에서 다시 계산한 요구 항목(#h)이 계약 정의에 다 있나
  const head = contractHead(contract), items = derivedAcs(contractQuotes(contract)).items
  if (r) { const have = new Set((r.criteria || []).map(c => c.id)), miss = criteriaIds(contract).filter(x => !have.has(x)); if (miss.length) add('coverage', `결과에 없는 기준 ${miss.join(', ')}`) }
  const lost = items.filter(x => !head.includes(`#${x.h}]`))
  if (lost.length) add('coverage', `계약 정의에 없는 요구 항목 ${lost.map(x => `#${x.h} ${x.t.slice(0, 40)}`).join(' / ')}`)
  // 판정
  let conditional = false
  const dev = ev?.kind === 'blocked' && isDevice(ev.reason)
  if (ev && r && ((ev.kind === 'iter' && ev.verdict === 'PASS') || dev)) {
    conditional = dev
    if (!dev && r.verdict !== 'PASS') add('fail', `원장 PASS ≠ 결과 파일 ${r.verdict}`)
    const ix = execIndex(path.join(dir, `evidence-${ev.iter}`), g.files || []), na = new Set(naIds(contract))
    for (const c of r.criteria || []) {
      if (c.status === 'met') { if (!refsOk(c.exec_ref, ix)) add('no-exec', `${c.id} exec_ref ${JSON.stringify(c.exec_ref ?? '')} — 실행 증거 색인에 없음`) }
      else if (c.status === 'na') { if (!na.has(c.id) || !String(c.evidence ?? '').trim()) add('na-invalid', `${c.id} na 불가 기준·근거 없음`) }
      else if (!(dev && c.status === 'unverifiable' && DEVICE_RE.test(String(c.evidence ?? '')))) add(String(c.status || 'unverifiable'), `${c.id} ${clip(c.evidence)}`)
    }
    const waived = l.waived || {}, live = (r.defects || []).filter(d => ['open', 'regressed'].includes(d.status) && !waived[d.id])
    if (live.length) add('fail', `열린 결함 ${live.map(d => d.id).join(', ')}`)
  } else if (ev?.kind === 'iter' && ev.verdict !== 'PASS') add('fail', `${ev.iter}회차 ${ev.verdict}`)
  else if (ev?.kind === 'blocked') add('blocked', `BLOCKED ${ev.reason || '(사유 없음)'}`)
  // 면제 = 마스터 원문 인용이 그 결함 발견 회차 뒤 마스터 메시지(면제 낱말)에 그대로 있어야 함
  const ws = Object.entries(l.waived || {})
  if (ws.length) {
    const msgs = g.transcript ? masterTexts(readJsonl(g.transcript)) : []
    for (const [d, x] of ws) {
      const q = norm(x?.quote), seen = l.defects?.[d]?.firstSeen, at = Date.parse((l.iters || []).find(i => i.iter === seen)?.at)
      const ok = q.replace(/\s/g, '').length >= 8 && Number.isFinite(at) && msgs.some(m => m.t > at && norm(m.text).includes(q) && WAIVE_RE.test(m.text))
      if (!ok) add('waive-unverified', `${d} 면제 인용이 마스터 기록(결함 발견 ${seen ?? '?'}회차 뒤 면제 낱말 메시지)에 없음`)
    }
  }
  // 판정받은 그 내용인가(파일별 git blob)
  const j = g.judged
  if (!j || !ev || j.at !== ev.at || !j.blobs || typeof j.blobs !== 'object') {
    add(j?.stale ? 'stale' : 'no-blobs', j?.stale ? `판정 기록 ${j.stale}` : !j ? '판정 내용 기록(gate.json judged) 없음' : j.at !== ev?.at ? `판정 기록 시각 ${j.at} ≠ 마지막 기록 ${ev?.at}` : 'judged.blobs 없음')
  } else {
    const fl = onlyFiles ?? g.files ?? []
    let map; const cur = blobOf || (f => (map ??= blobsOf(fl, root) || {})[f] ?? null)
    for (const f of fl) { const c = cur(f); if (c !== j.blobs[f]) add('stale', `${f} 판정 ${short(j.blobs[f])} ≠ 현재 ${short(c)}`) }
  }
  // 원문 요구 충족 여부(경고용) · 요약
  const acOf = new Map([...head.matchAll(/^\s*-\s*(AC-\d+)\s*:\s*\[원문 요구 #([0-9a-f]{6})\]/gm)].map(m => [m[2], m[1]]))
  const st = new Map((r?.criteria || []).map(c => [c.id, c.status]))
  const reqs = items.filter(x => x.tag === '원문 요구').map(x => ({ h: x.h, t: x.t, met: st.get(acOf.get(x.h)) === 'met' }))
  const sum = { iter: ev?.iter ?? null, verdict: ev?.verdict ?? null, via: r?.judge?.via ?? null, met: [...st.values()].filter(s => s === 'met').length, na: [...st.values()].filter(s => s === 'na').length }
  return res({ conditional, work: workCount(g, loops, id, gates ?? undefined), reqs, sum })
}

/** staged blob(git ls-files -s 한 번) — 목록에 없음 = ZERO, git 실패 = null */
function stagedBlobs(files, root = ROOT) {
  if (!files.length) return {}
  const r = git(['ls-files', '-s', '-z', '--', ...files.map(f => `:(literal)${f}`)], root); if (r.status !== 0) return null
  const m = new Map()
  for (const e of r.stdout.split('\0')) { const x = /^\d+ ([0-9a-f]{40}) (\d)\t(.+)$/s.exec(e); if (x && (x[2] === '0' || !m.has(x[3]))) m.set(x[3], x[1]) }
  return Object.fromEntries(files.map(f => [f, m.get(f) ?? ZERO]))
}

/**
 * 파일 단위 감사(커밋 관문용) → { ok, files:[{ file, ok, ledger, conditional, findings }], warnings }
 *   파일마다 '지금 내용(mode)과 같은 blob 을 판정한' 원장 중 가장 최근 판정 1개(옛 PASS 고르기 차단)를 그 파일만 blob 대조로 감사, 묶음이면 형제 묶음 AND(형제 blob 대조 생략)
 */
export function auditFiles(files, { mode = 'worktree', loops = loopsRoot, root = ROOT, defaultLoops = DEFAULT_LOOPS } = {}) {
  const fl = [...new Set(files)].filter(f => f && !GEN_RE.test(f) && !EXCLUDE_RE.test(f)).sort()
  const cur = (mode === 'staged' ? stagedBlobs(fl, root) : blobsOf(fl, root)) || {}
  const gates = gatesOf(loops), live = gates.filter(x => !x.superseded && !x.split), audits = [], out = []
  const opt = { loops, root, defaultLoops, gates }
  for (const f of fl) {
    const c = cur[f] ?? null
    const pick = c && live.filter(x => x.g.judged?.blobs && typeof x.g.judged.blobs === 'object' && x.g.judged.blobs[f] === c).sort((a, b) => atOf(a) - atOf(b)).at(-1)
    if (!pick) {
      const own = live.filter(x => (x.g.files || []).includes(f)).sort((a, b) => atOf(a) - atOf(b)).at(-1)
      out.push({ file: f, ok: false, ledger: own?.id ?? null, conditional: false, findings: [own
        ? { code: 'stale', detail: `${f} 현재 ${short(c)} — 이 내용의 판정 기록 없음(최근 원장 ${own.id} 판정 ${short(own.g.judged?.blobs?.[f])})`, id: own.id }
        : { code: 'no-ledger', detail: `${f} 를 판정한 원장 없음`, id: null }] })
      continue
    }
    const main = auditLedger(pick.id, { ...opt, blobOf: x => (x === f ? c : null), onlyFiles: [f] })
    const sibs = pick.g.base ? (ledgerOf(pick.g.base, loops)?.parts || []).filter(p => p !== pick.id).map(p => auditLedger(p, { ...opt, onlyFiles: [] })) : []
    const findings = [...main.findings, ...sibs.flatMap(s => s.findings.map(x => ({ ...x, detail: `${s.id} : ${x.detail}` })))]
    audits.push(main, ...sibs)
    out.push({ file: f, ok: !findings.length, ledger: pick.id, conditional: [main, ...sibs].some(a => a.conditional), findings, audits: [main, ...sibs] })
  }
  const met = new Map()
  for (const a of audits) for (const q of a.reqs) met.set(q.h, { t: q.t, met: !!met.get(q.h)?.met || q.met })
  return { ok: out.every(x => x.ok), files: out, warnings: [...met].filter(([, v]) => !v.met).map(([h, v]) => `#${h} ${v.t}`) }
}

// ───────── CLI ─────────
const USAGE = [
  '사용법 :',
  '  node scripts/codex-audit.mjs check [--id <id>]… [--files a,b] [--staged]   — 아소카 승인 전 결정적 감사(인자 없음 = 작업 트리 변경 파일)',
  '  node scripts/codex-audit.mjs request <파일…>                              — 메인 직접 변경 Codex 판정 요청(메인 전용)',
  '  node scripts/codex-audit.mjs rejudge <id> [--note <글>] [--waive D-NNN,… --quote <마스터 원문>]   — 같은 원장 다음 회차로 Codex 재판정',
  '종료 : 0 통과 · 1 불충족·거부 · 2 사용법·환경 오류',
].join('\n')
const need = (args, i, name) => { const v = args[i]; if (v == null || v.startsWith('--')) fail(2, `${name} 값 없음\n${USAGE}`); return v }
/** 현재 폴더 기준 경로 → 저장소 상대(밖 = null) */
const repoRel = p => relOf(path.resolve(process.cwd(), p), ROOT)
const hintOf = (f, files) => REQUEST_CODES.has(f.code) ? `node scripts/codex-audit.mjs request ${(files.length ? files : ['<파일…>']).join(' ')}` : `node scripts/codex-audit.mjs rejudge ${f.id} [--note <지적>]`

/** 원장 감사 결과 출력(기준 원장 = 묶음마다) */
function printLedger(a, printed = new Set()) {
  if (a.parts) {
    for (const f of a.findings.filter(x => x.id === a.id)) console.log(`✖ ${a.id} — ${f.code} : ${f.detail}`)
    console.log(`${a.ok ? '✔' : '✖'} ${a.id} — 묶음 ${a.parts.length}개 AND → ${a.ok ? 'Y' : 'N'}`)
    for (const p of a.parts) printLedger(p, printed)
    return
  }
  if (printed.has(a.id)) return
  printed.add(a.id)
  const s = a.sum || {}, tail = `기준 met ${s.met ?? 0}·na ${s.na ?? 0} · 일감 ${a.work}/${CAP}`
  if (a.ok) { console.log(a.conditional ? `◐ ${a.id} — 조건부(실기기 미검증 — Pi Browser 실기기 확인 뒤 확정) · ${s.iter}회차 BLOCKED(device)·${s.via} · ${tail}` : `✔ ${a.id} — Y(${s.iter}회차 PASS·${s.via}) · ${tail}`); return }
  for (const f of a.findings) console.log(`✖ ${a.id} — ${f.code} : ${f.detail}`)
  for (const h of new Set(a.findings.map(f => hintOf(f, a.files)))) console.log(`  → ${h}`)
}

/** 작업 트리 변경 파일(git status -z — 이름 바꾸기 = 새 경로, 삭제 포함) */
function changedNow(root = ROOT) {
  const r = git(['status', '--porcelain=v1', '-z', '-uall'], root); if (r.status !== 0) fail(2, `git status 실패 : ${r.stderr.trim()}`)
  const xs = r.stdout.split('\0'), out = []
  for (let i = 0; i < xs.length; i++) { const e = xs[i]; if (!e) continue; out.push(e.slice(3)); if (/[RC]/.test(e[0])) i++ }
  return out
}

function cmdCheck(args) {
  const ids = []; let files = null, staged = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--id') ids.push(need(args, ++i, '--id'))
    else if (a === '--files') files = need(args, ++i, '--files').split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--staged') staged = true
    else fail(2, `모르는 인자 ${a}\n${USAGE}`)
  }
  if (ids.length) { const rs = ids.map(id => auditLedger(id)), printed = new Set(); rs.forEach(r => printLedger(r, printed)); return rs.every(r => r.ok) ? 0 : 1 }
  const rel = files ? files.map(f => repoRel(f) ?? fail(2, `저장소 밖 경로 : ${f}`)) : changedNow()
  const res = auditFiles(rel, { mode: staged ? 'staged' : 'worktree' })
  if (!res.files.length) { console.log('대상 파일 없음(생성물·제외 경로뿐 또는 변경 없음)'); return 0 }
  const printed = new Set()
  for (const x of res.files) {
    if (x.ok) { for (const a of x.audits) printLedger(a, printed); continue }
    for (const f of x.findings) console.log(`✖ ${f.id ?? x.file} — ${f.code} : ${f.detail}`)
    for (const h of new Set(x.findings.map(f => hintOf(f, REQUEST_CODES.has(f.code) ? [x.file] : [])))) console.log(`  → ${h}`)
  }
  if (res.warnings.length) console.log(`⚠ 원문 요구 미충족(전 원장 met 아님) : ${res.warnings.join(' / ')}`)
  return res.ok ? 0 : 1
}

/** 메인 기록 : CODEX_AUDIT_TRANSCRIPT(CODEX_JS 있고 os.tmpdir() 아래일 때만 — 시험 전용) → ~/.claude/projects/*\/<세션 id>.jsonl 첫 일치 */
function transcriptOf(env = process.env) {
  const t = env.CODEX_AUDIT_TRANSCRIPT
  if (t && env.CODEX_JS) {
    try {
      const real = p => fs.realpathSync.native(p), rel = path.relative(real(os.tmpdir()), real(t))
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return path.resolve(t)
    } catch { /* 없는 경로 = 무시 */ }
  }
  const sid = env.CLAUDE_CODE_SESSION_ID; if (!sid || !ID_RE.test(sid)) return null
  const base = path.join(os.homedir(), '.claude', 'projects')
  let ds = []; try { ds = fs.readdirSync(base) } catch { return null }
  for (const d of ds) { const f = path.join(base, d, `${sid}.jsonl`); if (fs.existsSync(f)) return f }
  return null
}
/** 거부 사유(일감 5회·원장 예산) — 원장과 그 묶음마다, 없으면 '' */
function refusal(L, loops = loopsRoot) {
  if (!L) return ''
  for (const x of [L, ...(L.parts || []).map(p => ledgerOf(p, loops)).filter(Boolean)]) {
    if (!x.l || !x.g) continue
    const n = workCount(x.g, loops, x.id); if (n >= CAP) return `${x.id} 일감 ${n}/${CAP}`
    const over = budgetExceeded(x.l, nextIter(path.join(x.dir, 'ledger.json'))); if (over) return `${x.id} ${over}`
  }
  return ''
}
const sameRoot = () => { if (!samePath(loopsRoot, loopsDir())) fail(2, `원장 루트 불일치 — CODEX_LOOP_ROOT(${loopsRoot}) ≠ 판정 원장 루트(${loopsDir()}) : CODEX_GATE_STATE/loop 와 같게`) }
// 판정 성공 = Y(종료 0) 또는 이번 판정이 새로 쓴 실기기 단독 BLOCKED(종료 2 — 감사가 조건부로 인정하는 결과, 나머지 기준은 뒤의 감사 a.ok 가 확인).
// 판정 오류·기록 실패(새 기록 없음)는 이전 기록이 실기기여도 성공 아님 — 판정 전 마지막 기록 시각(prevAt)과 달라야 한다
const judgedOk = (id, code, prevAt) => {
  if (code === 0) return true
  if (code !== 2) return false
  const ev = ledgerOf(id)?.ev
  return ev?.kind === 'blocked' && ev.at !== prevAt && isDevice(ev.reason)
}
const pickRec = ({ id, no, iter, code, verdict, reason, base, part }) => ({ id, no, iter, code, verdict, ...(reason ? { reason } : {}), ...(base ? { base, part } : {}), ledger: path.relative(ROOT, path.join(loopsDir(), id)).replace(/\\/g, '/') })

async function cmdRequest(args, env = process.env) {
  if (env.CLAUDE_CODE_CHILD_SESSION) fail(2, '서브에이전트 변경은 SubagentStop 훅이 판정 — request 는 메인 전용')
  if (!args.length || args.some(a => a.startsWith('--'))) fail(2, USAGE)
  const tp = transcriptOf(env); if (!tp) fail(2, '메인 세션 기록 없음 — CLAUDE_CODE_SESSION_ID 의 ~/.claude/projects/*/<id>.jsonl 을 찾지 못함')
  sameRoot()
  const files = []
  for (const a of args) {
    const r = repoRel(a)
    if (!r) fail(2, `저장소 밖 경로 : ${a}`)
    if (EXCLUDE_RE.test(r)) fail(2, `판정 제외 경로 : ${r}`)
    if (GEN_RE.test(r)) { console.log(`ℹ 생성물 제외 : ${r}(생성기 산출 — 판정 대상 아님)`); continue }
    files.push(r)
  }
  const fl = [...new Set(files)].sort(); if (!fl.length) fail(2, '판정할 파일 0건')
  const mains = tailJsonl(tp, 16 * 2 ** 20).filter(j => !j.isSidechain)
  const tHead = (Number(git(['log', '-1', '--format=%ct']).stdout.trim()) || 0) * 1000, set = new Set(fl)
  const ws = writesOf(mains).filter(w => Number.isFinite(w.t) && w.t >= tHead && set.has(relOf(w.p)))
  const t0 = ws.length ? Math.min(...ws.map(w => w.t)) : null
  const req = requestOf(mains, t0 ?? Date.now(), null, null, '', { main: true })
  const toolLog = toolEntries(mains.filter(j => Date.parse(j.timestamp) >= (t0 ?? tHead)), 'main')
  const sessionId = env.CLAUDE_CODE_SESSION_ID || path.basename(tp, '.jsonl')
  const tag = crypto.createHash('sha1').update(`${sessionId}|${req?.t ?? ''}|${fl.join('\n')}`).digest('hex').slice(0, 6)
  const id = (`c4-main-${slugOf('main', path.basename(fl[0], path.extname(fl[0])))}-${tag}`).slice(0, 60)
  const why = refusal(ledgerOf(id)); if (why) fail(1, `일감 누적 5회·원장 예산 초과 — 마스터 보고 (${why})`)
  const ctx = { chk: {}, type: 'main', agentId: `main-${tag}`, brief: '(메인 직접 변경 — 브리프 없음 : 요구 = 마스터 요청 원문)', report: '(메인 직접 변경 — 작성자 보고 없음)', own: fl, excluded: 0, shell: false, toolLog, generated: [], genRuns: [], baseRef: null, request: req?.text, requestAt: req?.t ?? null, t0, sessionId, transcript: tp, root: ROOT }
  const jobs = prepareJobs({ plan: [{ no: 4, id }], files: fl, ctx, root: ROOT }), deadline = Date.now() + JUDGE_MS
  const prev = new Map(jobs.map(j => [j.id, ledgerOf(j.id)?.ev?.at ?? null]))
  const results = await Promise.all(jobs.map(j => judgeOne(j, ctx, deadline).catch(e => ({ iter: null, code: 2, verdict: 'BLOCKED', reason: `판정 오류 : ${e.message}` })).then(r => ({ ...j, ...r }))))
  console.log(summarize({ at: new Date().toISOString(), agentType: 'main', agentId: ctx.agentId, changed: fl.length, baseRef: 'HEAD', results: results.map(pickRec) }))
  const a = auditLedger(jobs[0]?.base || id); printLedger(a)
  return results.every(r => judgedOk(r.id, r.code, prev.get(r.id))) && a.ok ? 0 : 1
}

async function cmdRejudge(args) {
  const id = args[0]; if (!id || id.startsWith('--')) fail(2, USAGE)
  let note = '', waive = '', quote = ''
  for (let i = 1; i < args.length; i++) {
    const a = args[i]
    if (a === '--note') note = need(args, ++i, '--note')
    else if (a === '--waive') waive = need(args, ++i, '--waive')
    else if (a === '--quote') quote = args[++i] ?? ''
    else fail(2, `모르는 인자 ${a}\n${USAGE}`)
  }
  sameRoot()
  const L = ledgerOf(id); if (!L) fail(2, `원장 없음 : ${id}`)
  if (L.parts) fail(2, `기준 원장 — 묶음 id(-pN)로 : ${L.parts.join(', ')}`)
  if (!L.l || !L.g) fail(2, `원장 기록 없음(ledger.json·gate.json) : ${id}`)
  const a = auditLedger(id), g = L.g
  if (!a.findings.length && !note.trim()) fail(1, '감사 통과·지적 없음 — 재판정 불필요')
  const files = g.files || [], cur = blobsOf(files, ROOT), jb = g.judged?.blobs
  if (!jb || typeof jb !== 'object' || !cur || files.some(f => cur[f] !== jb[f])) fail(1, `내용 변경 — request ${files.join(' ')} 로 새 판정`)
  const n = nextIter(path.join(L.dir, 'ledger.json')), work = workCount(g, loopsRoot, id), over = budgetExceeded(L.l, n)
  if (work >= CAP || over) fail(1, `일감 누적 ${work}/${CAP}${over ? ` · ${over}` : ''} — 마스터 보고`)
  if (waive) {
    if (!/^D-\d{3,}(,D-\d{3,})*$/.test(waive)) fail(2, '--waive 는 결함 ID(D-NNN) 쉼표 목록')
    if (norm(quote).replace(/\s/g, '').length < 8) fail(2, '--waive 에는 --quote <마스터 원문>(공백 뺀 8자 이상) 필수')
    const msgs = g.transcript ? masterTexts(readJsonl(g.transcript)) : []
    if (!msgs.some(m => WAIVE_RE.test(m.text) && norm(m.text).includes(norm(quote)))) fail(2, '--quote 가 마스터 기록의 면제 메시지에 그대로 없음')
  }
  const body = ['## 아소카 감사 재회송(판정 기준·계약을 바꾸지 않는다)', '', '### 결정적 감사 결과', ...(a.findings.length ? a.findings.map(f => `- ${f.code} : ${f.detail}`) : ['- (불충족 없음)']),
    '', '### 아소카 지적(참고 — 사실 주장은 실행 증거로 확인)', note.trim() || '없음', ''].join('\n')
  const prevAt = L.ev?.at ?? null
  const res = await judgeOne({ id, no: 4, files, part: g.part, base: g.base }, {
    keep: true, chk: {}, type: g.agentType, agentId: g.agentId, generated: g.generated, baseRef: g.baseRef, requestAt: g.requestAt, transcript: g.transcript, sessionId: g.sessionId,
    extraEvidence: { [`audit-${n}.md`]: body },
    wrapperArgs: waive ? ['--waive', waive, '--waive-reason', '마스터 명시 면제', '--waive-quote', norm(quote)] : [],
  }, Date.now() + JUDGE_MS).catch(e => ({ iter: null, code: 2, verdict: 'BLOCKED', reason: `판정 오류 : ${e.message}` }))
  console.log(summarize({ at: new Date().toISOString(), agentType: g.agentType || 'main', agentId: String(g.agentId || ''), changed: files.length, baseRef: g.baseRef || 'HEAD', results: [pickRec({ id, no: 4, base: g.base, part: g.part, ...res })] }))
  const b = auditLedger(id); printLedger(b)
  return judgedOk(id, res.code, prevAt) && b.ok ? 0 : 1
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2), run = { check: cmdCheck, request: cmdRequest, rejudge: cmdRejudge }[cmd]
  if (!run) { console.error(USAGE); process.exitCode = 2 }
  else Promise.resolve().then(() => run(rest)).then(c => { process.exitCode = c }, e => { console.error(`✖ ${e.message}`); process.exitCode = e.exit ?? 2 })
}
