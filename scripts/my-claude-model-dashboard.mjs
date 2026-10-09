/**
 * my-claude-model-dashboard.mjs : 모델·effort 튜닝 분석 6개 항목(요청 패턴·모델 특징·효율 지표·최적 모델·유형별 선택안·전환 방법) 대시보드 (근거 docs/CLAUDE_CODE_MODEL_TUNING.md, 2026-10-08)
 * 원천 : work-history/**\/*.jsonl (loadRows 재사용, part를 턴 단위로 합산) + 세션 기록 ~/.claude/projects/<프로젝트>/*.jsonl의 perTurnEffort(effort 필드가 없는 과거 턴 보완)
 * 실행 : node scripts/my-claude-model-dashboard.mjs [--out 경로]  (기본 출력은 사용자 지정 경로 work-statistics/mywork/, 2026-10-08 지시)
 * 팔레트 : final-metrics-dashboard.mjs와 같은 토큰(계열 Opus 5.5=#2a78d6 · Fable 5.1=#eb6834, validate_palette.js 통과) · 상태색 좋음 다홍 #e8503a · 나쁨 네이비 #1f3a68(2026-10-06 지시)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRows } from './work-history-stats.mjs'
import { PRICING, costUsd, CATEGORIES } from './work-history-core.mjs'
import { advise } from '../.claude/hooks/model-advisor.mjs'

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const OUT = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(PROJECT, 'work-statistics/mywork/myClaudeModel_4_myWorkStyle.html'))
const SESS_DIR = path.join(process.env.TOOLDASH_HOME || os.homedir(), '.claude/projects', (process.env.TOOLDASH_PROJECT || PROJECT).replace(/[:\\/]/g, '-'))
const MIN_N = 20                                               // KPI_TREE 증감 판정과 같은 최소 표본
const MODEL = {                                                // 계열색은 엔터티 고정(순위로 바꾸지 않음)
  'claude-opus-5-5': { label: 'Opus 5.5', color: 'var(--w)' },
  'claude-fable-5-1': { label: 'Fable 5.1', color: 'var(--o)' },
  'claude-opus-5': { label: 'Opus 5', color: 'var(--muted)' },
  'claude-sonnet-5-5': { label: 'Sonnet 5.5', color: 'var(--muted)' },
  'claude-haiku-4-5-20251001': { label: 'Haiku 4.5', color: 'var(--muted)' },
}
const mLabel = m => MODEL[m]?.label || m || '(미기록)'
// 공식 사양 : docs.claude.com pricing·models, code.claude.com model-config (2026-10-08 조회, 단가는 PRICING 단일 소스)
const SPEC = [
  { id: 'claude-fable-5-1', effort: 'high', note: 'thinking 상시, 장기 추론·에이전트 작업' },
  { id: 'claude-opus-5-5', effort: 'medium', note: '`opus` 별칭·이 PC 기본 모델, fast mode 지원' },
  { id: 'claude-sonnet-5-5', effort: '[확인중]', note: '속도·지능 균형, 서브에이전트 2종 지정(repo-index·quality-engineer)' },
  { id: 'claude-haiku-4-5-20251001', effort: '미지원', note: '`haiku` 별칭 400 오류(2.1.293, 2026-10-08 재현)' },
]

// ── 턴 구성 : part 합산 ─────────────────────────────────────────────────────────
const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0)
const p50 = a => { a = a.filter(v => v != null).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null }
const turnsById = new Map()
for (const r of loadRows({})) {
  const key = (r.id || '').replace(/\.\d+$/, '') || r.ts_req
  const t = turnsById.get(key)
  if (!t) { turnsById.set(key, { ...r, tokens: { ...(r.tokens || {}) }, _parts: [r] }); continue }
  t._parts.push(r)
  for (const k of ['input', 'cache_read', 'cache_create', 'output', 'thinking', 'api_calls']) t.tokens[k] = (t.tokens[k] || 0) + (r.tokens?.[k] || 0)
  for (const k of ['cost_usd', 'cost_agents_usd', 'tools_total', 'tool_errors', 'elapsed_ms']) t[k] = (t[k] || 0) + (r[k] || 0)
  t.ts_res = r.ts_res || t.ts_res; t.effort = r.effort || t.effort; t.model = t.model || r.model
  t.superseded = t.superseded || r.superseded; t.interrupted = r.interrupted; t.incomplete = r.incomplete
}
const turns = [...turnsById.values()].filter(t => t.date)

// ── effort 보완 : 세션 기록 assistant 레코드(isSidechain=false)의 perTurnEffort, 턴 구간 안 마지막 값 ─────────
const effortLog = new Map()                                    // session_id → [[ms, effort]]
if (fs.existsSync(SESS_DIR)) for (const f of fs.readdirSync(SESS_DIR).filter(f => f.endsWith('.jsonl'))) {
  for (const l of fs.readFileSync(path.join(SESS_DIR, f), 'utf8').split('\n')) {
    if (!l.includes('ffort"')) continue
    let j; try { j = JSON.parse(l) } catch { continue }
    const e = j.perTurnEffort || j.effort
    if (j.type !== 'assistant' || j.isSidechain || !e || !j.sessionId) continue
    ;(effortLog.get(j.sessionId) || effortLog.set(j.sessionId, []).get(j.sessionId)).push([Date.parse(j.timestamp), e])
  }
}
let effortFromLog = 0
for (const t of turns) {
  if (t.effort) continue
  const a = effortLog.get(t.session_id), s = Date.parse(t.ts_req), e = Date.parse(t.ts_res)
  if (!a || !s || !e) continue
  const hit = a.filter(([ms]) => ms >= s && ms <= e).pop()
  if (hit) { t.effort = hit[1]; effortFromLog++ }
}

// ── 지표 ────────────────────────────────────────────────────────────────────
const isTimed = r => r.elapsed_ms != null && !r.absorbed && !r.superseded && !r.incomplete
const isDelivered = r => !r.superseded && !r.interrupted && !r.incomplete
const costOf = r => (r.cost_usd || 0) + (r.cost_agents_usd || 0)
function metrics(g) {
  const d = g.filter(isDelivered), inTok = sum(g, r => (r.tokens.input || 0) + (r.tokens.cache_read || 0) + (r.tokens.cache_create || 0))
  return {
    n: g.length,
    S1: p50(g.filter(isTimed).map(r => r.elapsed_ms / 1000)),                      // 턴 소요 p50(초)
    S4: p50(g.map(r => r.perf?.gen_tps)),                                           // 생성 속도 p50(tok/s)
    T1: inTok ? sum(g, r => r.tokens.cache_read) / inTok : null,                   // 캐시 읽기 비중
    TH: sum(g, r => r.tokens.output) ? sum(g, r => r.tokens.thinking) / sum(g, r => r.tokens.output) : null,  // 출력 중 thinking 비중
    Q1: g.length ? d.length / g.length : null,                                     // 1차 수용률
    Q2: g.length ? g.filter(r => r.correction).length / g.length : null,           // 재작업(교정) 비율
    Q3: sum(g, r => r.tools_total) ? sum(g, r => r.tool_errors) / sum(g, r => r.tools_total) : null,  // 도구 오류율
    C1: d.length ? sum(g, costOf) / d.length : null,                               // 완료 요청당 비용(API 단가 환산)
    cost: sum(g, costOf),
  }
}
const groupBy = (a, f) => a.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m }, {})
const all = metrics(turns)
const byModel = Object.entries(groupBy(turns, t => t.model || '(미기록)')).map(([k, g]) => ({ k, ...metrics(g) })).sort((a, b) => b.n - a.n)
const byCat = CATEGORIES.map(c => ({ k: c.key, label: c.label, ...metrics(turns.filter(t => t.category === c.key)) })).filter(c => c.n)
const byEffort = Object.entries(groupBy(turns, t => t.effort || '미매칭')).map(([k, g]) => ({ k, ...metrics(g) })).sort((a, b) => b.n - a.n)
const sessions = new Set(turns.map(t => t.session_id || t.session)).size
const days = [...new Set(turns.map(t => t.date))].sort()
const utRate = turns.filter(t => t.ultrathink).length / turns.length
const shortRate = turns.filter(t => (t.req_chars || 0) < 100).length / turns.length
const effortMatched = turns.filter(t => t.effort).length

// 단가 치환 계산 : Fable 5.1 턴의 실측 토큰량에 각 모델 단가 적용(모델별 토큰량 차이 미반영)
const fableTurns = turns.filter(t => t.model === 'claude-fable-5-1')
const reprice = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001'].filter(m => PRICING[m])
  .map(m => ({ k: m, v: sum(fableTurns, t => costUsd(t.tokens, m)) }))
const cacheCreateShare = (() => { const c = sum(fableTurns, t => t.cost_usd); const cc = sum(fableTurns, t => (t.tokens.cache_create || 0) * PRICING['claude-fable-5-1'].cache_create * 1.6 / 1e6); return c ? cc / c : null })()

// 안내 훅 발화율 : 과거 요청문 재생
const heads = turns.filter(t => t.req_head)
const advFired = heads.filter(t => advise(t.req_head)).length

// ── HTML 조각 ────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const pct = v => v == null ? '-' : (100 * v).toFixed(1) + '%'
const usd = v => v == null ? '-' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v, d = 0) => v == null ? '-' : v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })
const tile = (label, value, sub = '') => `<div class="tile"><div class="tl">${esc(label)}</div><div class="tv">${value}</div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`
const dot = c => `<i class="sw" style="background:${c}"></i>`

/** 가로 막대(한 축, 계열 2개까지) : items [{label, vals:[{v, color, name, tip}]}] */
function hbar(items, { fmt = v => v, max, legend = [], W = 620 } = {}) {
  const L = W < 500 ? 80 : 150, R = 70, BH = 11, GAP = 4, ROW = items[0]?.vals.length > 1 ? 2 * BH + GAP + 12 : BH + 14
  const mx = max ?? Math.max(...items.flatMap(i => i.vals.map(v => v.v || 0)), 1e-9)
  const x = v => L + (W - L - R) * (v || 0) / mx
  const H = items.length * ROW + 24
  let g = `<line x1="${L}" x2="${L}" y1="4" y2="${H - 18}" stroke="var(--axis)"/>`
  items.forEach((it, i) => {
    const y0 = 8 + i * ROW
    g += `<text x="${L - 8}" y="${y0 + (it.vals.length > 1 ? BH + 2 : BH - 1)}" text-anchor="end" class="lab">${esc(it.label)}</text>`
    it.vals.forEach((v, j) => {
      const y = y0 + j * (BH + GAP)
      g += `<rect x="${L}" y="${y}" width="${Math.max(1, x(v.v) - L)}" height="${BH}" rx="2" fill="${v.color}" stroke="var(--surface)" stroke-width="1" data-tip="${esc(v.tip || `${it.label} · ${v.name || ''} ${fmt(v.v)}`)}"/>`
      g += `<text x="${x(v.v) + 5}" y="${y + BH - 2}" class="val">${esc(fmt(v.v))}</text>`
    })
  })
  const lg = legend.length ? `<div class="legend">${legend.map(l => `<span>${dot(l.color)}${esc(l.name)}</span>`).join('')}</div>` : ''
  return `${lg}<svg viewBox="0 0 ${W} ${H}" role="img" class="chart">${g}</svg>`
}

/** 덤벨 : 지표 하나에 두 모델 값을 같은 축에 표시(지표마다 별도 축 : 작은 배수) */
function dumbbell(name, a, b, fmt, dir) {
  const W = 300, L = 14, R = 14, H = 58
  const lo = Math.min(a.v, b.v), hi = Math.max(a.v, b.v), pad = (hi - lo) * 0.25 || hi * 0.1 || 1
  const x = v => L + (W - L - R) * (v - (lo - pad)) / ((hi + pad) - (lo - pad))
  const better = dir === 'higher' ? (a.v >= b.v ? a : b) : (a.v <= b.v ? a : b)
  const pt = p => `<circle cx="${x(p.v)}" cy="30" r="6" fill="${p.color}" stroke="var(--surface)" stroke-width="2" data-tip="${esc(`${name} · ${p.name} ${fmt(p.v)}`)}"/><text x="${x(p.v)}" y="${p === better ? 50 : 16}" text-anchor="middle" class="val${p === better ? ' goodt' : ''}">${esc(p.name)} ${esc(fmt(p.v))}</text>`
  return `<figure class="mini"><figcaption>${esc(name)} <small>${dir === 'higher' ? '높을수록 좋음' : '낮을수록 좋음'}</small></figcaption><svg viewBox="0 0 ${W} ${H}" class="chart"><line x1="${x(a.v)}" x2="${x(b.v)}" y1="30" y2="30" stroke="var(--axis)" stroke-width="3"/>${pt(a)}${pt(b)}</svg></figure>`
}

/** 표 셀 상태색 : 같은 열에서 표본 MIN_N 이상 행 중 최선 = 좋음, 최악 = 나쁨 */
function statusCols(rows, cols) {
  const cls = {}
  for (const [key, dir] of cols) {
    const pool = rows.filter(r => r.n >= MIN_N && r[key] != null && !NON_GROUP.has(r.k))
    if (pool.length < 2) continue
    const s = [...pool].sort((p, q) => dir === 'higher' ? q[key] - p[key] : p[key] - q[key])
    cls[key + s[0].k] = 'good'; cls[key + s[s.length - 1].k] = 'bad'
  }
  return (r, key) => cls[key + r.k] ? ` class="${cls[key + r.k]}"` : ''
}
const NON_GROUP = new Set(['미매칭', '(미기록)'])                // 분류 실패 묶음 : 상태색 판정 제외
const COLS = [['S1', 'lower'], ['S4', 'higher'], ['T1', 'higher'], ['Q1', 'higher'], ['Q2', 'lower'], ['Q3', 'lower'], ['C1', 'lower']]
function metricTable(rows, keyLabel, labelOf) {
  const st = statusCols(rows, COLS)
  return `<table><thead><tr><th>${keyLabel}</th><th>요청</th><th>S1 소요 p50</th><th>S4 생성 속도</th><th>T1 캐시 읽기</th><th>thinking 비중</th><th>Q1 1차 수용률</th><th>Q2 재작업률</th><th>Q3 도구 오류율</th><th>C1 완료 요청당</th></tr></thead><tbody>${rows.map(r => `<tr${r.n < MIN_N || NON_GROUP.has(r.k) ? ' class="thin"' : ''}><td>${esc(labelOf(r))}</td><td>${r.n}</td><td${st(r, 'S1')}>${num(r.S1)}초</td><td${st(r, 'S4')}>${num(r.S4)}</td><td${st(r, 'T1')}>${pct(r.T1)}</td><td>${pct(r.TH)}</td><td${st(r, 'Q1')}>${pct(r.Q1)}</td><td${st(r, 'Q2')}>${pct(r.Q2)}</td><td${st(r, 'Q3')}>${pct(r.Q3)}</td><td${st(r, 'C1')}>${usd(r.C1)}</td></tr>`).join('')}</tbody></table>`
}

const fab = byModel.find(m => m.k === 'claude-fable-5-1'), op = byModel.find(m => m.k === 'claude-opus-5-5')
const pair = (key, f) => [{ v: op?.[key], name: 'Opus 5.5', color: MODEL['claude-opus-5-5'].color }, { v: fab?.[key], name: 'Fable 5.1', color: MODEL['claude-fable-5-1'].color }]
const dumbbells = fab && op ? [
  dumbbell('S4 생성 속도(tok/s)', ...pair('S4'), v => num(v), 'higher'),
  dumbbell('Q1 1차 수용률', ...pair('Q1'), pct, 'higher'),
  dumbbell('Q2 재작업률', ...pair('Q2'), pct, 'lower'),
  dumbbell('C1 완료 요청당 비용(API 환산)', ...pair('C1'), usd, 'lower'),
].join('') : '<p class="note">비교 표본 부족</p>'

const catShare = byCat.slice().sort((a, b) => b.n - a.n)
const ROUTE = [
  ['조회·설명(QUERY)·설정·설치·커밋', 'Opus 5.5', 'medium', '사용 안 함', '불필요', ['QUERY', 'CONFIG', 'INSTALL', 'GIT']],
  ['기능 구현·대시보드·도구 스크립트', 'Opus 5.5', 'high', '설계 단계만', '대량 읽기는 Sonnet', ['FEATURE']],
  ['버그·오류 조사(FIX)', 'Opus 5.5', 'high', '원인 미확정 시만', '불필요', ['FIX']],
  ['장표·공문서 작성(DOCS)', 'Opus 5.5', 'high', '사용 안 함', '검수형 technical-writer(메인 상속)', ['DOCS']],
  ['목표모델 결론부 설계', 'Fable 5.1(세션 시작 시)', 'high', '사용', '불필요', []],
  ['DB 조사 SQL(DATA)', 'Opus 5.5', 'high', '사용 안 함', '불필요', ['DATA']],
  ['코드베이스 조사·통계 집계', 'Opus 5.5', 'medium', '사용 안 함', 'repo-index(Sonnet) 위임', []],
]
const SWITCH = [
  ['산출물·수정 작업 시작', '/effort high', '턴', '5.5 계열은 캐시 유지'],
  ['조회로 복귀', '/effort medium', '턴', '5.5 계열은 캐시 유지'],
  ['결론 설계 세션', 'claude --model fable', '세션', '세션 중 /model 전환은 캐시 전체 재작성'],
  ['대량 조사 위임', 'Agent 호출 model: "sonnet" 또는 정의 model: sonnet', '서브에이전트', '호출 파라미터 > 정의 > 환경변수 > 메인'],
  ['무관한 작업으로 전환', '/clear 또는 /compact', '세션', '새 컨텍스트로 캐시 쓰기량 축소'],
  ['fast mode', '세션 시작 직후 /fast', '세션', '중간 활성화 시 대화 전체 1회 미캐시 과금, headroom 경유 가용성 [확인중]'],
]
const ROUNDS = [
  ['1', 'Opus 5.5 + effort high 일괄', '조회·커밋 턴에 high 적용 시 소요 증가', '보완 필요'],
  ['2', 'Opus 5.5 + 유형별 low/medium/high', 'low는 커밋 규칙·문체 규칙 준수 위험', 'low 제외'],
  ['3', '기본 medium + 산출물 high + 안내 훅', 'medium은 Opus 5.5 기본값(설정 무변경)', '유지'],
  ['4', '3안 + 턴별 모델 전환 안내', '모델 전환 = 캐시 전체 재작성, Fable 비용 대부분이 캐시 쓰기', '모델 전환은 세션 시작·서브에이전트로 한정'],
  ['5', '4안 + ultrathink 안내', '과거 요청 재생 시 발화 36%로 잡음', 'ultrathink 안내 제거 : 최종안'],
]

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>나의 작업 방식에 맞는 Claude 모델 · effort</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--page:#f9f9f7;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--w:#2a78d6;--o:#eb6834;--good:#e8503a;--bad:#1f3a68;--good-bg:#fde6e1;--bad-bg:#e3e9f3;--ring:rgba(11,11,11,.10)}
@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--surface:#1a1a19;--page:#0d0d0d;--ink:#fff;--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--axis:#383835;--w:#3987e5;--o:#d95926;--good:#f0705c;--bad:#5b7fc2;--good-bg:#3a1f1a;--bad-bg:#1c2740;--ring:rgba(255,255,255,.10)}}
:root[data-theme="dark"]{color-scheme:dark;--surface:#1a1a19;--page:#0d0d0d;--ink:#fff;--ink2:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--w:#3987e5;--o:#d95926;--good:#f0705c;--bad:#5b7fc2;--good-bg:#3a1f1a;--bad-bg:#1c2740;--ring:rgba(255,255,255,.10)}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:14px/1.5 "Nanum Gothic","Malgun Gothic",system-ui,sans-serif;font-variant-numeric:tabular-nums}
main{max-width:1280px;margin:0 auto;padding:28px 24px 48px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:36px 0 10px}h2 small,h1 small{font-weight:400;color:var(--ink2);font-size:13px;margin-left:8px}
.meta{color:var(--ink2);font-size:12.5px;margin:0 0 18px}
.card{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:16px 18px;margin:0 0 14px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:0 0 14px}
.tile{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:12px 14px}.tl{color:var(--ink2);font-size:12.5px}.tv{font-size:24px;font-weight:700;margin-top:2px}.ts{color:var(--muted);font-size:12px}
.hero{border-left:4px solid var(--good)}.hero .tv{font-size:20px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(520px,1fr));gap:14px}.grid21{display:grid;grid-template-columns:minmax(0,2fr) minmax(300px,1fr);gap:14px}td.nw,th{white-space:nowrap}
.minis{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
figure.mini{margin:0;background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:10px 12px}figcaption{font-size:13px;font-weight:700}figcaption small{font-weight:400;color:var(--muted);margin-left:6px}
.chart{width:100%;height:auto;display:block}.lab{font-size:12px;fill:var(--ink2)}.val{font-size:11.5px;fill:var(--ink)}.val.goodt{fill:var(--good);font-weight:700}
.legend{display:flex;gap:14px;font-size:12.5px;color:var(--ink2);margin:0 0 4px}.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--grid);padding:6px 8px;text-align:left;vertical-align:top}th{color:var(--ink2);font-weight:700;background:var(--page)}
td.good{color:var(--good);background:var(--good-bg);font-weight:700}td.bad{color:var(--bad);background:var(--bad-bg);font-weight:700}tr.thin td{color:var(--muted)}
.key{font-weight:700}.tag{display:inline-block;border:1px solid var(--axis);border-radius:4px;padding:0 6px;font-size:12px;margin-right:4px}
.tbd{color:#d03b3b;font-weight:700}.note{color:var(--ink2);font-size:12.5px;margin:6px 0 0}code{background:var(--page);border:1px solid var(--grid);border-radius:4px;padding:0 4px;font-size:12.5px}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--page);font-size:12px;padding:4px 8px;border-radius:5px;opacity:0;transition:opacity .08s;z-index:9}
[data-tip]:hover{stroke:var(--ink);stroke-width:1.5}
.toggle{float:right;font-size:12px;border:1px solid var(--axis);background:var(--surface);color:var(--ink);border-radius:6px;padding:3px 9px;cursor:pointer}
</style></head><body><main>
<button class="toggle" onclick="const r=document.documentElement;r.dataset.theme=r.dataset.theme==='dark'?'light':'dark'">밝게/어둡게</button>
<h1>나의 작업 방식에 맞는 Claude 모델 · effort<small>튜닝 분석 6개 항목 지표</small></h1>
<p class="meta">기간 ${days[0]} ~ ${days[days.length - 1]} · 요청 ${turns.length}건 · 세션 ${sessions}개 · 원천 work-history jsonl + 세션 기록 effort · 생성 ${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })} · 과금 구독제 : 비용은 API 단가 환산값(청구액 아님) · 상태색 <span style="color:var(--good);font-weight:700">좋음</span> / <span style="color:var(--bad);font-weight:700">나쁨</span></p>

<div class="tiles">
${tile('최적 모델(강력추천)', 'Opus 5.5 · medium', '산출물·수정 작업만 effort high')}
${tile('요청 수', num(turns.length), `${days.length}일 · ${sessions}세션`)}
${tile('Fable 5.1 사용 비중', pct(fab ? fab.n / turns.length : null), `비용 ${usd(fab?.cost)} (API 환산)`)}
${tile('ultrathink 사용률', pct(utRate), '조회·운영 요청 포함')}
${tile('effort 확인 요청', pct(effortMatched / turns.length), `${effortMatched}건 (세션 기록 보완 ${effortFromLog}건)`)}
${tile('안내 훅 발화율', pct(heads.length ? advFired / heads.length : null), `과거 요청 ${heads.length}건 재생 기준`)}
</div>

<h2>1. 작업요청 패턴<small>카테고리별 요청·비용 비중</small></h2>
<div class="grid2"><div class="card">
${hbar(catShare.map(c => ({ label: `${c.label}(${c.k})`, vals: [
  { v: c.n / turns.length, color: 'var(--axis)', name: '요청 비중', tip: `${c.label} · 요청 ${c.n}건 (${pct(c.n / turns.length)})` },
  { v: c.cost / all.cost, color: 'var(--ink2)', name: '비용 비중', tip: `${c.label} · 비용 ${usd(c.cost)} (${pct(c.cost / all.cost)})` }] })), { fmt: pct, legend: [{ name: '요청 비중', color: 'var(--axis)' }, { name: '비용 비중(API 환산)', color: 'var(--ink2)' }] })}
</div><div class="card"><table><thead><tr><th>패턴 항목</th><th>실측</th></tr></thead><tbody>
<tr><td>단문 요청(100자 미만)</td><td>${pct(shortRate)}</td></tr>
<tr><td>ultrathink 사용 턴</td><td>${pct(utRate)}</td></tr>
<tr><td>비용 비중 최대 카테고리</td><td>${(() => { const c = [...byCat].sort((a, b) => b.cost - a.cost)[0]; return `${esc(c.label)} : 요청 ${pct(c.n / turns.length)} · 비용 ${pct(c.cost / all.cost)}` })()}</td></tr>
<tr><td>모델별 요청</td><td>${byModel.map(m => `${dot(MODEL[m.k]?.color || 'var(--muted)')}${esc(mLabel(m.k))} ${m.n}건`).join(' · ')}</td></tr>
<tr><td>도구 오류율(전체)</td><td>${pct(all.Q3)}</td></tr>
</tbody></table><p class="note">요청 비중은 요청 건수, 비용 비중은 API 단가 환산 금액 기준임(구독제라 청구액과 다름)</p></div></div>

<h2>2. 모델 특징<small>공식 단가(USD/MTok)·기본 effort</small></h2>
<div class="grid21"><div class="card"><table><thead><tr><th>모델</th><th>입력</th><th>출력</th><th>캐시 쓰기(5분)</th><th>캐시 읽기</th><th>기본 effort</th><th>비고</th></tr></thead><tbody>
${SPEC.map(s => { const p = PRICING[s.id]; return `<tr><td class="key nw">${dot(MODEL[s.id].color)}${esc(MODEL[s.id].label)}</td><td>${p.input}</td><td>${p.output}</td><td>${p.cache_create}</td><td>${p.cache_read}</td><td>${s.effort.startsWith('[') ? `<span class="tbd">${esc(s.effort)}</span>` : esc(s.effort)}</td><td>${esc(s.note)}</td></tr>` }).join('')}
</tbody></table><p class="note">출처 docs.claude.com pricing(2026-10-08 확인), 단가는 scripts/work-history-core.mjs PRICING 단일 소스 · 이 PC Claude Code 2.1.293 · 프록시 headroom-proxy 0.37.0</p></div>
<div class="card">${hbar(SPEC.map(s => ({ label: MODEL[s.id].label, vals: [{ v: PRICING[s.id].output, color: MODEL[s.id].color, name: '출력 단가', tip: `${MODEL[s.id].label} · 출력 $${PRICING[s.id].output}/MTok` }] })), { fmt: v => '$' + v, W: 380 })}
<p class="note">출력 단가 비교 : Fable 5.1은 Opus 5.5의 ${(PRICING['claude-fable-5-1'].output / PRICING['claude-opus-5-5'].output).toFixed(1)}배</p></div></div>

<h2>3. 사용효율 지표<small>모델별·effort별 실측 (표본 ${MIN_N}건 미만 행은 회색, 상태색 판정 제외)</small></h2>
<div class="card">${metricTable(byModel, '모델', r => mLabel(r.k))}</div>
<div class="card">${metricTable(byEffort, 'effort', r => r.k)}
<p class="note">effort는 턴 레코드 effort 필드(2026-10-08 로거 반영) 또는 세션 기록 perTurnEffort로 확인. high의 대부분이 Fable 5.1, medium의 대부분이 Opus 5.5여서 effort 효과와 모델 효과는 분리되지 않음</p></div>
<div class="card"><table><thead><tr><th>축</th><th>지표</th><th>산식</th><th>좋은 방향</th></tr></thead><tbody>
<tr><td>토큰 절약</td><td>T1 캐시 읽기 비중</td><td>Σcache_read ÷ Σ(input+cache_read+cache_create)</td><td>높음</td></tr>
<tr><td>처리 속도</td><td>S1 턴 소요 p50 · S4 생성 속도 p50</td><td>elapsed_ms · perf.gen_tps</td><td>낮음 · 높음</td></tr>
<tr><td>처리 성능</td><td>Q1 1차 수용률 · Q2 재작업률 · Q3 도구 오류율</td><td>완료 ÷ 요청 · 교정 턴 ÷ 요청 · 오류 ÷ 도구 호출</td><td>높음 · 낮음 · 낮음</td></tr>
<tr><td>비용</td><td>C1 완료 요청당 비용</td><td>Σ(메인+서브에이전트 비용) ÷ 완료 요청</td><td>낮음</td></tr>
<tr><td>effort</td><td>턴별 effort</td><td>perTurnEffort(low·medium·high·xhigh·max)</td><td>분류 축</td></tr>
</tbody></table></div>

<h2>4. 최적 모델<small>Opus 5.5 대 Fable 5.1</small></h2>
<div class="tiles">
${tile('강력추천', 'Opus 5.5 + effort medium', '현행 설정 유지, 산출물·수정 작업만 high')}
${tile('추천', 'Fable 5.1 (세션 시작 시)', '목표모델 결론부 설계 작업 한정')}
${tile('추천', 'Sonnet 5.5 서브에이전트', '대량 읽기·집계 : repo-index · quality-engineer 적용')}
</div>
<div class="minis">${dumbbells}</div>
<div class="grid2" style="margin-top:14px"><div class="card"><div class="key" style="margin-bottom:6px">단가 치환 계산 : Fable 5.1 요청 ${fableTurns.length}건의 실측 토큰량에 모델별 단가 적용</div>
${hbar(reprice.map(r => ({ label: mLabel(r.k), vals: [{ v: r.v, color: MODEL[r.k].color, name: 'API 환산 비용', tip: `${mLabel(r.k)} 단가 적용 ${usd(r.v)} (${pct(r.v / reprice[0].v)})` }] })), { fmt: usd })}
<p class="note">모델별 토큰량 차이는 반영하지 않음 · Fable 5.1 비용 중 캐시 쓰기 비중 ${pct(cacheCreateShare)} : 모델 교체만큼 세션 운용(컨텍스트 재작성 축소)이 비용을 좌우함</p></div>
<div class="card"><table><thead><tr><th>결론 재검토 조건</th></tr></thead><tbody>
<tr><td>Opus 5.5 high로 FEATURE ${MIN_N}건 이상 수행 후 Q2가 Fable FEATURE 기준을 넘으면 FEATURE 기본값을 Fable 5.1로 환원</td></tr>
<tr><td>같은 요청을 두 모델로 처리한 비교 쌍이 없어 품질 직접 비교는 불가 : Q1·Q2는 행동 기반 대리지표</td></tr>
<tr><td>구독제 기준 : 비용 차이는 청구액에 해당하지 않음, 결론 근거는 S4·Q1·Q2 유지. 모델별 사용 한도 소진 차이는 <span class="tbd">[확인중 : 공식 문서]</span></td></tr>
<tr><td>재평가 예정 : 2026-10-22 (effort 필드 누적 후 모델 × effort 교차 비교)</td></tr>
</tbody></table></div></div>

<h2>5. 작업 유형별 선택안<small>실측 열은 해당 카테고리 전체 요청 기준, 표본 ${MIN_N}건 미만 회색</small></h2>
<div class="card"><table><thead><tr><th>작업 유형</th><th>메인 모델</th><th>effort</th><th>ultrathink</th><th>서브에이전트</th><th>실측 요청</th><th>S1 소요 p50</th><th>Q1</th></tr></thead><tbody>
${ROUTE.map(([t, m, e, u, s, cats]) => { const g = turns.filter(x => cats.includes(x.category)); const mm = g.length ? metrics(g) : null; return `<tr${mm && mm.n < MIN_N ? ' class="thin"' : ''}><td class="key">${esc(t)}</td><td>${esc(m)}</td><td><span class="tag">${esc(e)}</span></td><td>${esc(u)}</td><td>${esc(s)}</td><td>${mm ? mm.n : '-'}</td><td>${mm ? num(mm.S1) + '초' : '-'}</td><td>${mm ? pct(mm.Q1) : '-'}</td></tr>` }).join('')}
</tbody></table></div>

<h2>6. 전환(switch) 방법<small>훅은 모델·effort를 바꿀 수 없음 : 안내와 서브에이전트 위임만 자동화 가능</small></h2>
<div class="grid2"><div class="card"><table><thead><tr><th>상황</th><th>입력</th><th>범위</th><th>캐시 영향</th></tr></thead><tbody>
${SWITCH.map(([a, b, c, d]) => `<tr><td>${esc(a)}</td><td><code>${esc(b)}</code></td><td>${esc(c)}</td><td>${d.includes('[확인중]') ? esc(d.replace(' [확인중]', '')) + ' <span class="tbd">[확인중]</span>' : esc(d)}</td></tr>`).join('')}
</tbody></table></div>
<div class="card"><div class="key" style="margin-bottom:6px">자동 안내 훅 (.claude/hooks/model-advisor.mjs)</div>
${hbar([{ label: '안내 표시', vals: [{ v: advFired / heads.length, color: 'var(--w)', name: '발화', tip: `안내 표시 ${advFired}건 / ${heads.length}건` }] }, { label: '침묵(기본값 유지)', vals: [{ v: 1 - advFired / heads.length, color: 'var(--axis)', name: '침묵', tip: `침묵 ${heads.length - advFired}건` }] }], { fmt: pct, max: 1 })}
<p class="note">요청문을 work-history-core 분류기로 판정해 FEATURE·FIX·REFACTOR·DOCS·DATA(신뢰도 0.25 이상)일 때만 "/effort high" 한 줄 표시 · 모델 전환 안내는 캐시 재작성 비용 때문에 제외</p></div></div>

<h2>Master 5회 반복 검증<small>최종안 = 5회차</small></h2>
<div class="card"><table><thead><tr><th>회차</th><th>후보안</th><th>검증 결과</th><th>결과</th></tr></thead><tbody>
${ROUNDS.map(([n, a, b, c]) => `<tr${n === '5' ? ' style="font-weight:700"' : ''}><td>${n}</td><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}
</tbody></table><p class="note">분석 구성 : 서브에이전트 6개(1~3 Sonnet 집계·조사, 4~6 Opus 판단·설계), 취합 Opus 5.5 · 상세 docs/CLAUDE_CODE_MODEL_TUNING.md</p></div>
</main><div id="tip"></div>
<script>
const tip=document.getElementById('tip');
document.addEventListener('pointerover',e=>{const t=e.target.closest('[data-tip]');if(!t)return;tip.textContent=t.dataset.tip;tip.style.opacity=1});
document.addEventListener('pointermove',e=>{tip.style.left=(e.clientX+12)+'px';tip.style.top=(e.clientY+12)+'px'});
document.addEventListener('pointerout',e=>{if(e.target.closest('[data-tip]'))tip.style.opacity=0});
</script></body></html>`

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, html)
console.log(`${path.relative(PROJECT, OUT)} : 요청 ${turns.length}건, 모델 ${byModel.length}종, effort 확인 ${effortMatched}건(세션 기록 보완 ${effortFromLog}), 안내 발화 ${advFired}/${heads.length}`)
