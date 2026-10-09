/**
 * final-metrics-dashboard.mjs — 최종 효율지표 7종(F1~F7) × 도구 6종 대시보드 (정의 docs/AI_EFFICIENCY_METRICS_UNION.md 4절, 2026-10-06)
 *   원천 : work-history/**\/*.jsonl (loadRows 재사용 : id 중복 제거·보정 병합·서브에이전트 귀속)
 *   산출 : 지표 카드 7장(전체값 + 주별 추세 스파크라인) · 지표 × 도구 사용/미사용 덤벨 차트 · 영향 매트릭스 · 표(접근성 뷰)
 *          + 방법론 진단(Prompt·Context·Harness·Loop) : 기존 KPI L2 5개(kpiView 재사용) + 신규 4개(요청 길이별 수용률·ultrathink 비교·Edit→Bash 반복·오류 재시도)
 *   실행 : node scripts/final-metrics-dashboard.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--out 경로]
 *   팔레트 : 계열색은 dataviz 기본값(validate_palette.js 통과 : 사용=#2a78d6 · 기준=#eb6834)
 *            상태색은 사용자 지시(2026-10-06) : 좋음 = 다홍 #e8503a(다크 #f0705c) · 나쁨 = 네이비 #1f3a68(다크 #5b7fc2)
 *            — 표면 대비 3:1 이상·색각이상 ΔE 20 이상 확인(validate_palette.js). 상태는 색만으로 전하지 않고 ●○·경보/정상 글자를 함께 둠
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadRows, isoWeek, kpiView, PROJECT } from './work-history-stats.mjs'
import { METRICS, evaluateSlo } from './work-history-core.mjs'

const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const FROM = argOf('--from', '0000-00-00'), TO = argOf('--to', '9999-99-99')
const OUT = path.resolve(argOf('--out', path.join(PROJECT, 'work-statistics/main-dashboard/final-metrics.html')))   // HTML 시각화 위치 통일(2026-09-22 지시)
const MIN_N = 20                                              // KPI_TREE 증감 판정과 동일한 최소 표본
const ACTIVE_GAP_MS = 10 * 60e3                               // (참고) efficiency_compare 와 동일 상한 — 여기서는 elapsed_ms(요청~응답)만 사용

// ── 레코드 → 턴 ───────────────────────────────────────────────────────────────
const allRows = loadRows({ from: FROM, to: TO })
const rows = allRows.filter(r => r.part === 1 || r.part == null)   // 턴 = part 1 레코드(파트>1은 구간 델타)
if (!rows.length) { console.error('턴 없음'); process.exit(2) }
const isTimed = r => r.elapsed_ms != null && !r.absorbed && !r.superseded && !r.incomplete
const isDelivered = r => !r.superseded && !r.interrupted && !r.incomplete
const costOf = r => (r.cost_usd || 0) + (r.cost_agents_usd || 0)
const has = {                                                 // 도구 사용 판정 : work-history 레코드 기준(efficiency_compare 와 분리 기준 동일)
  Agent: r => (r.agents?.length || 0) > 0,
  MCP: r => (r.mcp?.length || 0) > 0,
  Skill: r => (r.skills || []).some(s => !s.includes(':')),
  Plugin: r => (r.skills || []).some(s => s.includes(':')) || (r.resources?.mcp || []).some(m => m.plugin),
  Hook: r => (r.resources?.hooks?.length || 0) > 0,
}
const TOOLS = ['Agent', 'MCP', 'Skill', 'Plugin']            // 사용/미사용 비교가 성립하는 도구. Hook 은 상시(99%+) → 비중만, Otel 은 수집기 없음 → 경로만
const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0)
const p50 = a => { a = [...a].sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null }

/** 턴 집합 하나의 F1~F7 값 */
function metrics(g) {
  const t = g.filter(isTimed), d = g.filter(isDelivered)
  const elapsed = sum(t, r => r.elapsed_ms), hrs = elapsed / 36e5
  const calls = sum(g, r => r.tools_total), errs = sum(g, r => r.tool_errors)
  const multi = (() => { const ft = {}; for (const r of g) for (const f of (r.files || [])) (ft[f] ||= new Set()).add(r.id); const v = Object.values(ft); return v.length ? v.filter(s => s.size >= 2).length / v.length : null })()
  return {
    n: g.length, n_timed: t.length, n_delivered: d.length,
    F1: t.length ? p50(t.map(r => r.elapsed_ms)) / 6e4 : null,                 // 완료 요청당 소요 p50(분)
    F1_mean: t.length ? elapsed / t.length / 6e4 : null,
    F2: hrs ? d.length / hrs : null,                                             // 활성 시간당 완료 요청
    F2_files: hrs ? sum(g, r => r.files_changed) / hrs : null,                   // 활성 시간당 변경 파일
    F3: g.length ? g.filter(r => r.superseded).length / g.length : null,          // 대체(superseded)율
    F3_rework: multi,                                                            // 2턴 이상 수정 파일 비율
    F4: g.length ? d.length / g.length : null,                                   // 1차 수용률
    F5: d.length ? sum(g, costOf) / d.length : null,                             // 완료 요청당 비용
    F6: calls ? errs / calls : null,                                             // 도구 오류율(호출당)
    F6_turns: g.length ? g.filter(r => r.tool_errors > 0).length / g.length : null,
    F7: elapsed ? sum(g, r => r.perf?.tool_ms) / elapsed : null,                 // 턴 소요 중 도구 실행 비중
    F7_hook: elapsed ? sum(g, r => r.perf?.hook_ms) / elapsed : null,
    F7_ttft: p50(g.filter(r => r.ttft_ms != null).map(r => r.ttft_ms)),
    cost: sum(g, costOf), hours: hrs,
  }
}
const SPEC = [   // 카드·축 정의 (단위·방향·표시 형식). lower = 낮을수록 좋음
  // hue = 카드 막대 고유색(dataviz 범주 팔레트 8색 순서, 상태색 다홍·네이비와 겹치지 않는 슬롯만)
  { k: 'F1', no: 1, name: '완료 요청당 소요', unit: '분(p50)', dir: 'lower', fmt: v => v.toFixed(1), key: 'elapsed_per_request', formula: 'Σ elapsed_ms ÷ 완료 요청', hue: '#2a78d6' },
  { k: 'F2', no: 3, name: '활성 시간당 처리량', unit: '완료 건/h', dir: 'higher', fmt: v => v.toFixed(1), key: '신규 조합', formula: '완료 요청 ÷ 활성 h (보조 : 변경 파일 ÷ 활성 h)', hue: '#1baf7a' },
  { k: 'F3', no: 6, name: '재작업률(대체율)', unit: '%', dir: 'lower', fmt: v => (100 * v).toFixed(1), key: 'correction_rate·rework_rate', formula: 'superseded ÷ 요청 (보조 : 2턴 이상 수정 파일 ÷ 수정 파일)', hue: '#eda100' },
  { k: 'F4', no: 8, name: '1차 수용률', unit: '%', dir: 'higher', fmt: v => (100 * v).toFixed(1), key: 'delivered_requests', formula: '완료 요청 ÷ 요청 (완료 = superseded·interrupted·incomplete 제외)', hue: '#e87ba4' },
  { k: 'F5', no: 9, name: '완료 요청당 비용', unit: 'USD', dir: 'lower', fmt: v => v.toFixed(2), key: 'cost_per_delivered', formula: '(Σ cost_usd + 에이전트 비용) ÷ 완료 요청', hue: '#008300' },
  { k: 'F6', no: 5, name: '도구 오류율', unit: '%', dir: 'lower', fmt: v => (100 * v).toFixed(1), key: '신규', formula: 'Σ tool_errors ÷ Σ tools_total (보조 : 오류 턴 ÷ 턴)', hue: '#4a3aa7' },
  { k: 'F7', no: 13, name: '턴 소요 중 도구 실행 비중', unit: '%', dir: 'context', fmt: v => (100 * v).toFixed(1), key: 'tool_share·hook_ms·ttft_ms', formula: 'Σ perf.tool_ms ÷ Σ elapsed (보조 : 훅 비중 · 첫 응답 p50)', hue: '#eb6834' },
]
// 영향 매트릭스(문서 4-4절 확정값). Otel·Hook 열은 측정 경로/비중 판정이라 계산이 아닌 기록
const MATRIX = {
  F1: { Otel: '○', Agent: '◎', Hook: '△', MCP: '◎', Skill: '◎', Plugin: '◎' },
  F2: { Otel: '○', Agent: '○', Hook: '△', MCP: '◎', Skill: '◎', Plugin: '○' },
  F3: { Otel: '✕', Agent: '○', Hook: '○', MCP: '○', Skill: '○', Plugin: '○' },
  F4: { Otel: '✕', Agent: '○', Hook: '△', MCP: '○', Skill: '△', Plugin: '△' },
  F5: { Otel: '◎', Agent: '◎', Hook: '△', MCP: '◎', Skill: '◎', Plugin: '◎' },
  F6: { Otel: '○', Agent: '△', Hook: '△', MCP: '◎', Skill: '△', Plugin: '○' },
  F7: { Otel: '○', Agent: '△', Hook: '◎', MCP: '○', Skill: '△', Plugin: '△' },
}
const MATRIX_COLS = ['Otel', 'Agent', 'Hook', 'MCP', 'Skill', 'Plugin']

// ── 집계 ─────────────────────────────────────────────────────────────────────
const ALL = metrics(rows)
const byTool = Object.fromEntries(TOOLS.map(k => [k, { with: metrics(rows.filter(has[k])), without: metrics(rows.filter(r => !has[k](r))) }]))
const hookShare = { turns: rows.filter(has.Hook).length, runs: sum(rows, r => r.perf?.hook_runs), min: sum(rows, r => r.perf?.hook_ms) / 6e4 }
const weeks = [...new Set(rows.map(r => isoWeek(r.date).key))].sort()
const weekly = weeks.map(w => { const g = rows.filter(r => isoWeek(r.date).key === w); return { week: w, from: g.map(r => r.date).sort()[0], ...metrics(g) } })
// 도구별 호출·오류·시간(steps[]) — F6·F7 근거
const stepStat = {}; for (const r of rows) for (const s of (r.steps || [])) { const k = s.t.startsWith('mcp__') ? 'MCP' : (s.t === 'Agent' || s.t === 'Task') ? 'Agent' : s.t === 'Skill' ? 'Skill' : '기타'; const o = stepStat[k] ||= { calls: 0, err: 0, ms: 0 }; o.calls++; if (!s.ok) o.err++; o.ms += s.ms || 0 }
const dates = rows.map(r => r.date).sort(), range = { from: dates[0], to: dates.at(-1), days: new Set(dates).size, sessions: new Set(rows.map(r => r.session)).size }

// ── 방법론 진단 (Prompt · Context · Harness · Loop) ─────────────────────────
// 기존 5개 : kpiView(공식 집계기)의 값을 그대로 사용 — 산식·경보 기준은 work-history-core METRICS 정본
const KPI = kpiView(allRows).values
const DIAG_EXISTING = [
  { axis: 'Context', key: 'ctx_growth', note: '세션 끝 턴의 호출당 컨텍스트 ÷ 첫 턴. 클수록 컨텍스트가 비대해짐' },
  { axis: 'Context', key: 'cache_miss_events', note: '직전 고수위 대비 호출당 cache_read 20k 이상 하락 횟수. 컨텍스트가 끊기거나 재구성된 지점' },
  { axis: 'Loop', key: 'api_per_request', note: '요청당 API 호출 수 = 도구 루프 길이' },
  { axis: 'Harness', key: 'unverified_rate', note: '쓰기 후 테스트·실행 확인 없이 끝낸 턴 비율. 검증 장치(훅·스킬)가 작동했는지' },
  { axis: 'Loop', key: 'recovery_multiplier', note: '오류 후 같은 도구가 성공할 때까지 든 시간 ÷ 오류 호출 시간. 루프의 회복 비용' },
].map(d => { const m = METRICS[d.key] || {}, slo = evaluateSlo(KPI).find(a => a.metric === d.key); return { ...d, label: m.label || d.key, value: KPI[d.key] ?? null, unit: m.unit || '', formula: m.formula || '', alert: m.slo?.warn ?? null, direction: m.direction || 'lower', status: slo?.status || null } })   // 경보 판정은 공식 evaluateSlo 결과를 그대로 표시
// 새 지표 4개 : 레코드 필드로 바로 계산 가능한 것만 (프롬프트 구조 품질은 본문 미저장으로 불가)
const rate = (g, f) => g.length ? g.filter(f).length / g.length : null
const bucketLen = r => r.req_chars < 40 ? '40자 미만' : r.req_chars < 200 ? '40~199자' : '200자 이상'
const LEN_ORDER = ['40자 미만', '40~199자', '200자 이상']
const promptLen = LEN_ORDER.map(b => { const g = rows.filter(r => bucketLen(r) === b); return { bucket: b, n: g.length, delivered: rate(g, isDelivered), superseded: rate(g, r => r.superseded), cost: g.length ? sum(g, costOf) / g.length : null } })
const ut = rows.filter(r => r.ultrathink), nut = rows.filter(r => !r.ultrathink)
const cmp = g => ({ n: g.length, delivered: rate(g, isDelivered), cost: g.length ? sum(g, costOf) / g.length : null, elapsed: p50(g.filter(isTimed).map(r => r.elapsed_ms)), api: g.length ? sum(g, r => r.tokens?.api_calls) / g.length : null })
const ultra = { with: cmp(ut), without: cmp(nut) }
// Loop 패턴 : steps[] 순서에서 (Edit|Write → Bash) 연쇄 횟수와 오류 직후 같은 도구 재시도 수
let editRunTurns = 0, editRuns = 0, retries = 0, maxRun = 0
for (const r of rows) { const st = r.steps || []; let run = 0; for (let i = 1; i < st.length; i++) { if (!st[i - 1].ok && st[i].t === st[i - 1].t) retries++; if (st[i].t === 'Bash' && (st[i - 1].t === 'Edit' || st[i - 1].t === 'Write')) run++ } if (run >= 2) editRunTurns++; editRuns += run; maxRun = Math.max(maxRun, run) }
const errTurns = rows.filter(r => r.tool_errors > 0).length
// 신규 4개의 좋음/나쁨 판정(사용자 지시 2026-10-06). 공식 경보 기준이 없으므로 판정 근거를 verdictNote 에 명시
//  · 길이별 수용률 : 전 구간이 전체 수용률 ±5%p 안이면 좋음(길이에 무관하게 완료), 어느 구간이 5%p 넘게 낮으면 나쁨
//  · ultrathink   : 수용률이 미사용 이상이면 좋음, 5%p 이상 낮으면 나쁨, 그 사이 차이 없음(비용·소요는 선택 편향이라 판정 제외)
//  · Edit→Bash 반복 : 반복 2회 이상 턴 비율 ≤ 10% 좋음, > 20% 나쁨 (dataviz·KPI 기준 없음 → 임시 기준, 문서 4-5절 [확인중])
//  · 오류 재시도    : 재시도 ÷ 오류 턴 ≤ 1.0 좋음(한 번에 회복), > 1.5 나쁨
const judgeBand = (v, goodMax, badMin, higherBetter = false) => v == null ? null : higherBetter ? (v >= goodMax ? '좋음' : v < badMin ? '나쁨' : '차이 없음') : (v <= goodMax ? '좋음' : v > badMin ? '나쁨' : '차이 없음')
const lenGap = Math.max(...promptLen.filter(p => p.delivered != null).map(p => ALL.F4 - p.delivered))
const utGap = ultra.with.delivered - ultra.without.delivered
const editRunShare = editRunTurns / rows.length, retryPerErr = errTurns ? retries / errTurns : null
const DIAG_NEW = [
  { axis: 'Prompt', label: '요청 길이 구간별 1차 수용률', value: promptLen.map(p => `${p.bucket} ${p.n}턴 ${p.delivered == null ? '-' : (100 * p.delivered).toFixed(0) + '%'}`).join(' · '), formula: 'req_chars 구간 × (완료 요청 ÷ 요청)', note: '길이는 프롬프트의 양이지 구조 품질이 아님. 긴 요청은 복합 과업이라 수용률이 낮게 나오는 경향', verdict: judgeBand(lenGap, 0.05, 0.05), verdictNote: `최저 구간이 전체 수용률보다 ${(100 * lenGap).toFixed(0)}%p 낮음 (기준 5%p)` },
  { axis: 'Prompt', label: 'ultrathink 사용 vs 미사용', value: `수용 ${(100 * ultra.with.delivered).toFixed(0)}% vs ${(100 * ultra.without.delivered).toFixed(0)}% · 비용 $${ultra.with.cost.toFixed(1)} vs $${ultra.without.cost.toFixed(1)} · 소요 p50 ${(ultra.with.elapsed / 6e4).toFixed(1)} vs ${(ultra.without.elapsed / 6e4).toFixed(1)}분 (${ultra.with.n} vs ${ultra.without.n}턴)`, formula: 'ultrathink 플래그로 분할한 완료율·턴당 비용·소요', note: '어려운 요청에 붙이는 선택 편향이 있어 규모·카테고리 층을 맞추기 전에는 효과로 읽지 않음', verdict: utGap >= 0 ? '좋음' : utGap <= -0.05 ? '나쁨' : '차이 없음', verdictNote: `수용률 차 ${(100 * utGap).toFixed(0)}%p (수용률만 판정, 비용·소요 제외)` },
  { axis: 'Loop', label: 'Edit/Write→Bash 반복', value: `반복 2회 이상 턴 ${editRunTurns}개(${(100 * editRunShare).toFixed(0)}%) · 총 ${editRuns}회 · 최대 ${maxRun}회`, formula: 'steps[]에서 (Edit|Write) 직후 Bash가 오는 횟수', note: '편집→실행 루프의 길이. 길수록 한 턴 안에서 고치고 돌리기를 반복', verdict: judgeBand(editRunShare, 0.10, 0.20), verdictNote: `반복 턴 비율 ${(100 * editRunShare).toFixed(0)}% (좋음 ≤ 10% · 나쁨 > 20%)` },
  { axis: 'Loop', label: '오류 직후 같은 도구 재시도', value: `${retries}회 (오류 턴 ${errTurns}개, 턴당 ${retryPerErr == null ? '-' : retryPerErr.toFixed(2)}회)`, formula: 'steps[i-1].ok=false ∧ steps[i].t = steps[i-1].t', note: '즉시 재시도 횟수. recovery_multiplier(시간)와 짝', verdict: judgeBand(retryPerErr, 1.0, 1.5), verdictNote: `오류 턴당 재시도 ${retryPerErr == null ? '-' : retryPerErr.toFixed(2)}회 (좋음 ≤ 1.0 · 나쁨 > 1.5)` },
]
// 기존 5개의 판정 = 공식 evaluateSlo 상태(ok → 좋음, WARN → 나쁨, 기준 없음 → 판정 없음)
for (const d of DIAG_EXISTING) { d.verdict = d.status === 'ok' ? '좋음' : d.status && d.status !== 'n/a' && !d.status.startsWith('n<') ? '나쁨' : null; d.verdictNote = d.alert == null ? '공식 경보 기준 없음' : `경보 기준 ${d.direction === 'lower' ? '>' : '<'} ${d.unit === '비율' ? (100 * d.alert) + '%' : d.alert}` }
const axisVerdict = axis => { const vs = [...DIAG_EXISTING, ...DIAG_NEW].filter(d => d.axis === axis && d.verdict).map(d => d.verdict); const g = vs.filter(v => v === '좋음').length, b = vs.filter(v => v === '나쁨').length; return !vs.length ? null : b > g ? '나쁨' : g > b ? '좋음' : '차이 없음' }

// ── HTML ─────────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const f = (spec, v) => v == null ? '-' : spec.fmt(v)
const fmtAny = (spec, v) => v == null ? '-' : `${spec.fmt(v)}${spec.unit === 'USD' ? '' : spec.unit.startsWith('%') ? '%' : ''}`
const SYM_KO = { '◎': '직접', '○': '간접', '△': '약함', '✕': '경로 없음' }

/** 스파크라인 : 주별 값(단일 계열, 레전드 불필요), n<MIN_N 주는 점선·속 빈 점 */
function spark(spec) {
  const pts = weekly.map(w => ({ w, v: w[spec.k] })).filter(p => p.v != null)
  if (pts.length < 2) return `<div class="spark muted">주 ${pts.length}개 · 추세 미표시</div>`
  const W = 220, PX = 6, vs = pts.map(p => p.v)
  // 주별 3D 막대(사용자 지시 2026-10-06) : 지표마다 고유 색(SPEC.hue), 마지막 막대만 직전 주 대비 개선 = 다홍 / 악화 = 네이비. 표본 부족 주는 빗금
  // 3D = 앞면 + 윗면·옆면 평행사변형(깊이 DX·DY). 값은 0 기준 막대 높이로 인코딩(절단 축 금지)
  const BH = 72, DX = 5, DY = 4, BASE = BH - 10, top0 = 18, maxV = Math.max(...vs) || 1   // top0 = 윗면(DY) + 값 라벨(8.5px) 공간
  const n = pts.length, slot = (W - 2 * PX - DX) / n, bw = Math.min(26, slot * 0.6)
  const prev = pts.at(-2), last = pts.at(-1), first = pts[0]
  const improved = spec.dir === 'context' || !prev ? null : spec.dir === 'lower' ? last.v < prev.v : last.v > prev.v
  const bars = pts.map((p, i) => {
    const h = Math.max(1.5, (BASE - top0) * p.v / maxV), x0 = PX + slot * i + (slot - bw - DX) / 2, y0 = BASE - h
    const thin = p.w.n < MIN_N, isLast = i === n - 1
    const cls = isLast && improved != null ? (improved ? 'b3 up' : 'b3 down') : 'b3'
    const style = isLast && improved != null ? '' : `style="--c:${spec.hue}"`
    const front = `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" class="front${thin ? ' thin' : ''}"/>`
    const top = `<polygon points="${x0.toFixed(1)},${y0.toFixed(1)} ${(x0 + DX).toFixed(1)},${(y0 - DY).toFixed(1)} ${(x0 + bw + DX).toFixed(1)},${(y0 - DY).toFixed(1)} ${(x0 + bw).toFixed(1)},${y0.toFixed(1)}" class="top"/>`
    const side = `<polygon points="${(x0 + bw).toFixed(1)},${y0.toFixed(1)} ${(x0 + bw + DX).toFixed(1)},${(y0 - DY).toFixed(1)} ${(x0 + bw + DX).toFixed(1)},${(BASE - DY).toFixed(1)} ${(x0 + bw).toFixed(1)},${BASE.toFixed(1)}" class="side"/>`
    const lab = `<text x="${(x0 + bw / 2).toFixed(1)}" y="${(y0 - DY - 2).toFixed(1)}" class="bval" text-anchor="middle">${spec.fmt(p.v)}</text>`
    return `<g class="${cls}" ${style}><title>${esc(p.w.week)} (${p.w.n}턴) : ${fmtAny(spec, p.v)}${thin ? ' · 표본 부족' : ''}${isLast && improved != null ? ` · 직전 주 대비 ${improved ? '개선' : '악화'}` : ''}</title>${side}${top}${front}${lab}</g>`
  }).join('')
  return `<svg class="spark" viewBox="0 0 ${W} ${BH}" role="img" aria-label="${esc(spec.name)} 주별 3D 막대 ${n}주"><defs><pattern id="hatch-${spec.k}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="var(--surface)" opacity=".55"/></pattern></defs><line x1="${PX}" x2="${W - PX}" y1="${BASE}" y2="${BASE}" class="axis"/>${bars}<text x="${PX}" y="${BH - 1}" class="tiny">${esc(first.w.week)}</text><text x="${W - PX}" y="${BH - 1}" class="tiny" text-anchor="end">${esc(last.w.week)}</text></svg>`
}
/** 직전 주 대비 증감 배지(턴 MIN_N 이상인 두 주가 있을 때만) : 개선 = 다홍 ▲, 악화 = 네이비 ▼ */
function trendBadge(spec) {
  if (spec.dir === 'context') return ''
  const ok = weekly.filter(w => w.n >= MIN_N && w[spec.k] != null); if (ok.length < 2) return ''
  const a = ok.at(-2)[spec.k], b = ok.at(-1)[spec.k]; if (!a) return ''
  const delta = (b - a) / a, improved = spec.dir === 'lower' ? b < a : b > a
  return `<span class="trend ${improved ? 'up' : 'down'}" title="${esc(ok.at(-2).week)} → ${esc(ok.at(-1).week)}">${improved ? '▲ 개선' : '▼ 악화'} ${Math.abs(100 * delta).toFixed(0)}%</span>`
}
/** 카드 7장 */
const card = spec => {
  const v = ALL[spec.k]
  const sub = spec.k === 'F1' ? `평균 ${f(spec, ALL.F1_mean)}분 · 측정 턴 ${ALL.n_timed}` : spec.k === 'F2' ? `변경 파일 ${ALL.F2_files?.toFixed(1)}개/h · 활성 ${ALL.hours.toFixed(1)}h` : spec.k === 'F3' ? `파일 재수정률 ${(100 * (ALL.F3_rework || 0)).toFixed(1)}%` : spec.k === 'F4' ? `완료 ${ALL.n_delivered} / 요청 ${ALL.n}` : spec.k === 'F5' ? `총비용 $${ALL.cost.toFixed(0)} · 완료 ${ALL.n_delivered}건` : spec.k === 'F6' ? `오류 턴 ${(100 * ALL.F6_turns).toFixed(1)}%` : `훅 ${(100 * (ALL.F7_hook || 0)).toFixed(1)}% · 첫 응답 p50 ${Math.round((ALL.F7_ttft || 0) / 1e3)}초`
  return `<section class="card" id="${spec.k}"><div class="khead"><span class="k">${spec.k}</span><span class="name">${esc(spec.name)}</span><span class="dir">${spec.dir === 'lower' ? '↓ 낮을수록 좋음' : spec.dir === 'higher' ? '↑ 높을수록 좋음' : '구성 지표'}</span></div>
  <div class="big">${f(spec, v)}<small>${esc(spec.unit)}</small>${trendBadge(spec)}</div>
  <div class="sub">${esc(sub)}</div>${spark(spec)}
  <div class="mini">통합 ${spec.no}번 · <code>${esc(spec.key)}</code></div></section>`
}
/** 효과 히트맵(덤벨 7장 대체, 2026-10-06 가독성 개선 지시)
 *  칸 = 지표 1개 × 도구 1개. 큰 숫자 = 사용 턴의 유불리(%) = 방향을 맞춘 상대차(양수 = 사용 턴이 유리)
 *  배경 = 발산형 2색(유리 다홍 · 불리 네이비, 0% = 무채색), 농도 = |상대차|(100%에서 포화) · 칸 안 막대 2줄 = 원래 값(같은 칸 안에서 같은 척도)
 *  구성 지표(F7)는 방향이 없어 색 없이 상대차만 표시 */
const relOf = (spec, w, o) => { if (w == null || o == null || !o) return null; const d = (w - o) / o; return spec.dir === 'lower' ? -d : d }
// 큰 숫자 표기 : 두 값이 2배 이상 차이 나면 "N.N배"(−515% 같은 100% 초과 백분율 방지), 아니면 방향을 맞춘 ±%
const bigText = (w, o, rel) => { const hi = Math.max(w, o), lo = Math.min(w, o); if (lo > 0 && hi / lo >= 2) return `${(hi / lo).toFixed(1)}배`; return `${rel > 0 ? '+' : rel < 0 ? '−' : ''}${Math.abs(100 * rel).toFixed(0)}%` }
function effectCell(spec, k) {
  const w = byTool[k].with[spec.k], o = byTool[k].without[spec.k], rel = relOf(spec, w, o), dir = spec.dir !== 'context'
  if (rel == null) return `<td class="ec"><div class="ecv muted">-</div><div class="ecs muted">값 없음</div></td>`
  const tone = !dir ? 'neutral' : rel > 0.005 ? 'good' : rel < -0.005 ? 'bad' : 'neutral'
  const pctMix = !dir ? 0 : Math.round(8 + 52 * Math.min(1, Math.abs(rel)))   // 배경 농도 8~60%
  const bg = tone === 'neutral' ? 'var(--surface)' : `color-mix(in oklab, var(--${tone}) ${pctMix}%, var(--surface))`
  const label = !dir ? '구성 지표' : tone === 'good' ? '▲ 사용 턴이 유리' : tone === 'bad' ? '▼ 사용 턴이 불리' : '차이 없음'
  const mx = Math.max(w, o) || 1
  const bar = (v, cls, lab) => `<div class="ecb"><span class="ecl">${lab}</span><span class="ect"><span class="${cls}" style="width:${(100 * v / mx).toFixed(1)}%"></span></span><span class="ecn">${fmtAny(spec, v)}</span></div>`
  return `<td class="ec ${tone}${pctMix > 40 ? ' deep' : ''}" style="background:${bg}" title="${esc(k)} · ${esc(spec.name)} : 사용 ${fmtAny(spec, w)} vs 미사용 ${fmtAny(spec, o)}">
    <div class="ecv">${bigText(w, o, rel)}</div><div class="ecs">${label}</div>${bar(w, 'w', '사용')}${bar(o, 'o', '미사용')}</td>`
}
const effectGrid = () => {
  const tally = TOOLS.map(k => { let g = 0, b = 0; for (const s of SPEC) { if (s.dir === 'context') continue; const r = relOf(s, byTool[k].with[s.k], byTool[k].without[s.k]); if (r == null) continue; if (r > 0.005) g++; else if (r < -0.005) b++ } return { g, b } })
  return `<div class="wrap"><table class="eff"><thead><tr><th class="eh">지표</th>${TOOLS.map(k => `<th class="et">${k}<small>사용 ${byTool[k].with.n}턴</small></th>`).join('')}</tr></thead><tbody>
${SPEC.map(s => `<tr><th class="er"><span class="k">${s.k}</span> ${esc(s.name)}<small>${esc(s.unit)} · ${s.dir === 'lower' ? '↓ 낮을수록 좋음' : s.dir === 'higher' ? '↑ 높을수록 좋음' : '방향 없음'}</small></th>${TOOLS.map(k => effectCell(s, k)).join('')}</tr>`).join('\n')}
<tr class="esum"><th class="er">합계<small>방향 있는 6개 지표</small></th>${tally.map(t => `<td><span class="good">▲ 유리 ${t.g}</span> · <span class="bad">▼ 불리 ${t.b}</span></td>`).join('')}</tr>
</tbody></table></div>`
}
/** 영향 매트릭스 */
const matrix = `<table class="mx"><thead><tr><th>최종</th><th>지표</th>${MATRIX_COLS.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>
${SPEC.map(s => `<tr><td class="k">${s.k}</td><td>${esc(s.name)}</td>${MATRIX_COLS.map(c => { const v = MATRIX[s.k][c]; return `<td class="sym s${{ '◎': 3, '○': 2, '△': 1, '✕': 0 }[v]}" title="${SYM_KO[v]}"><span aria-hidden="true">${v}</span><span class="sr">${SYM_KO[v]}</span></td>` }).join('')}</tr>`).join('\n')}
</tbody></table>`
/** 표(접근성 뷰) : 그림 1장과 같은 열 구성 */
const tableRows = SPEC.map(s => `<tr><td class="k">${s.k}</td><td>${s.no}</td><td>${esc(s.name)}</td><td class="num">${fmtAny(s, ALL[s.k])}</td>${TOOLS.map(k => `<td class="num">${fmtAny(s, byTool[k].with[s.k])} <span class="muted">vs</span> ${fmtAny(s, byTool[k].without[s.k])}</td>`).join('')}<td>${s.k === 'F7' ? `${hookShare.min.toFixed(1)}분(${hookShare.runs}회)` : s.k === 'F1' ? `시간 비중 ${(100 * (ALL.F7_hook || 0)).toFixed(1)}%` : '-'}</td><td><code>${esc(s.formula)}</code></td><td><code>${esc(s.key)}</code></td></tr>`).join('\n')
// 주별 표 : 직전 유효 주 대비 개선 = 다홍, 악화 = 네이비 (표본 부족 주는 색 없음)
const weeklyRows = weekly.map((w, i) => { const prev = weekly.slice(0, i).reverse().find(p => p.n >= MIN_N); return `<tr class="${w.n < MIN_N ? 'dim' : ''}"><td>${esc(w.week)}</td><td class="num">${w.n}${w.n < MIN_N ? ' <span class="muted">(부족)</span>' : ''}</td>${SPEC.map(s => { const v = w[s.k], pv = prev?.[s.k]; const cls = w.n >= MIN_N && prev && v != null && pv != null && s.dir !== 'context' && v !== pv ? ((s.dir === 'lower' ? v < pv : v > pv) ? ' good' : ' bad') : ''; return `<td class="num${cls}">${fmtAny(s, v)}</td>` }).join('')}</tr>` }).join('\n')
const fmtKpi = d => d.value == null ? '-' : d.unit === '비율' ? (100 * d.value).toFixed(1) + '%' : d.unit === '배' ? d.value.toFixed(2) + '배' : d.unit === '회' ? Math.round(d.value).toLocaleString('ko-KR') + '회' : typeof d.value === 'number' ? d.value.toFixed(1) + (d.unit ? ' ' + d.unit : '') : String(d.value)
const alertOf = d => !d.status || d.status === 'n/a' ? '' : d.status === 'ok' ? '<span class="flag ok">정상</span>' : d.status.startsWith('n<') ? `<span class="flag">표본 ${esc(d.status)}</span>` : '<span class="flag bad">경보</span>'
const vflag = (v, note) => v == null ? '<span class="flag">판정 없음</span>' : `<span class="flag ${v === '좋음' ? 'ok' : v === '나쁨' ? 'bad' : ''}" title="${esc(note || '')}">${v}</span>`
const axisBadge = axis => { const v = axisVerdict(axis); return v == null ? '' : `<span class="dir">${vflag(v)}</span>` }
const diagRows = DIAG_EXISTING.map(d => `<tr><td>${d.axis}</td><td>${esc(d.label)} <code>${d.key}</code></td><td class="num"><b>${fmtKpi(d)}</b></td><td class="${d.verdict === '좋음' ? 'good' : d.verdict === '나쁨' ? 'bad' : ''}">${vflag(d.verdict, d.verdictNote)}<div class="tiny muted">${esc(d.verdictNote)}</div></td><td><code>${esc(d.formula)}</code></td><td class="muted">${esc(d.note)}</td><td>기존</td></tr>`)
  .concat(DIAG_NEW.map(d => `<tr><td>${d.axis}</td><td>${esc(d.label)}</td><td>${esc(d.value)}</td><td class="${d.verdict === '좋음' ? 'good' : d.verdict === '나쁨' ? 'bad' : ''}">${vflag(d.verdict, d.verdictNote)}<div class="tiny muted">${esc(d.verdictNote)}</div></td><td><code>${esc(d.formula)}</code></td><td class="muted">${esc(d.note)}</td><td>신규</td></tr>`)).join('\n')
/** 요청 길이 구간별 수용률 막대(단일 계열, 100% 척도) + ultrathink 비교 막대쌍 */
const lenBars = promptLen.map(p => `<div class="row"><span class="lab">${p.bucket}<span class="tiny muted"> ${p.n}턴</span></span><div class="track"><div class="bar w" style="width:${(100 * (p.delivered || 0)).toFixed(1)}%"></div></div><span class="val">${p.delivered == null ? '-' : (100 * p.delivered).toFixed(0) + '%'}</span></div>`).join('')
const utBars = [['1차 수용률', ultra.with.delivered, ultra.without.delivered, v => (100 * v).toFixed(0) + '%', 1], ['턴당 비용 $', ultra.with.cost, ultra.without.cost, v => v.toFixed(1)], ['소요 p50 분', ultra.with.elapsed / 6e4, ultra.without.elapsed / 6e4, v => v.toFixed(1)], ['API 호출/턴', ultra.with.api, ultra.without.api, v => v.toFixed(1)]]
  .map(([lab, w, o, fm, mx]) => { const m = mx || Math.max(w, o) || 1; return `<div class="pairrow"><span class="lab">${lab}</span><div class="pair"><div class="row"><span class="tiny">사용</span><div class="track"><div class="bar w" style="width:${(100 * w / m).toFixed(1)}%"></div></div><span class="val">${fm(w)}</span></div><div class="row"><span class="tiny">미사용</span><div class="track"><div class="bar o" style="width:${(100 * o / m).toFixed(1)}%"></div></div><span class="val">${fm(o)}</span></div></div></div>` }).join('')
const stepRows = Object.entries(stepStat).sort((a, b) => b[1].calls - a[1].calls).map(([k, o]) => `<tr><td>${k}</td><td class="num">${o.calls}</td><td class="num">${o.err}</td><td class="num">${(100 * o.err / o.calls).toFixed(1)}%</td><td class="num">${(o.ms / 6e4).toFixed(1)}</td></tr>`).join('\n')

const generated = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>최종 효율지표 7종 — 작업 이력 기준(F1~F7 × 도구 6종)</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--page:#f9f9f7;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--w:#2a78d6;--o:#eb6834;--good:#e8503a;--bad:#1f3a68;--good-bg:#fde6e1;--bad-bg:#e3e9f3;--ring:rgba(11,11,11,.10);--s3:#cde2fb;--s2:#e8f0fb;--s1:transparent}
@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--surface:#1a1a19;--page:#0d0d0d;--ink:#fff;--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--axis:#383835;--w:#3987e5;--o:#d95926;--good:#f0705c;--bad:#5b7fc2;--good-bg:#3a1f1a;--bad-bg:#1c2740;--ring:rgba(255,255,255,.10);--s3:#184f95;--s2:#1f2f45}}
:root[data-theme="dark"]{color-scheme:dark;--surface:#1a1a19;--page:#0d0d0d;--ink:#fff;--ink2:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--w:#3987e5;--o:#d95926;--good:#f0705c;--bad:#5b7fc2;--good-bg:#3a1f1a;--bad-bg:#1c2740;--ring:rgba(255,255,255,.10);--s3:#184f95;--s2:#1f2f45}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:14px/1.5 "Nanum Gothic","Malgun Gothic",system-ui,sans-serif;font-variant-numeric:tabular-nums}
main{max-width:1480px;margin:0 auto;padding:28px 24px 48px}
h1{font-size:22px;margin:0 0 4px;letter-spacing:-.3px}h2{font-size:17px;margin:34px 0 10px}h2 small,h1 small{font-weight:400;color:var(--ink2);font-size:13px;margin-left:8px}
.meta{color:var(--ink2);font-size:13px}.toolbar{display:flex;gap:10px;align-items:center;margin:10px 0 0;font-size:13px;color:var(--ink2)}
button.theme{border:1px solid var(--ring);background:var(--surface);color:var(--ink);border-radius:6px;padding:3px 10px;cursor:pointer;font:inherit;font-size:12px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:14px}
.card{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:14px 16px 12px}
.khead{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.k{font-weight:700;color:var(--w);font-size:13px}.name{font-weight:600}.dir{margin-left:auto;font-size:11px;color:var(--muted)}
.big{font-size:34px;font-weight:700;letter-spacing:-.5px;margin:6px 0 0}.big small{font-size:13px;font-weight:400;color:var(--ink2);margin-left:6px}
.sub{color:var(--ink2);font-size:12px}.mini{color:var(--muted);font-size:11px;margin-top:6px}code{font-size:11px;background:transparent;color:var(--ink2)}
.spark{display:block;width:100%;height:72px;margin-top:8px}.spark .tiny{font-size:9px;fill:var(--muted)}.spark .axis{stroke:var(--axis)}
.spark .b3 .front{fill:var(--c)}.spark .b3 .top{fill:color-mix(in oklab,var(--c) 70%,white)}.spark .b3 .side{fill:color-mix(in oklab,var(--c) 70%,black)}.spark .b3 .bval{font-size:8.5px;fill:var(--ink2)}
.spark .b3.up{--c:var(--good)}.spark .b3.down{--c:var(--bad)}.spark .b3 .front.thin{fill:url(#none);fill:var(--c);opacity:.45}
.legend{display:flex;gap:16px;font-size:12px;color:var(--ink2);margin:6px 0 10px;flex-wrap:wrap}.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.eff{table-layout:fixed;min-width:980px}.eff th.eh{width:210px}.eff th.et{text-align:center;font-size:14px;color:var(--ink);padding:10px 8px}.eff th.et small,.eff th.er small{display:block;font-weight:400;font-size:11px;color:var(--muted);margin-top:2px}
.eff th.er{font-size:13px;color:var(--ink);font-weight:600;white-space:normal;vertical-align:middle}.eff td.ec{padding:10px 12px;border-left:1px solid var(--grid);vertical-align:top}
.ecv{font-size:24px;font-weight:700;letter-spacing:-.5px;color:var(--ink);line-height:1.1}.ecs{font-size:11.5px;font-weight:600;color:var(--ink2);margin:2px 0 6px}.ec.good .ecs{color:var(--good)}.ec.bad .ecs{color:var(--bad)}.ec.deep .ecs{color:var(--ink)}
.ecb{display:grid;grid-template-columns:40px 1fr 56px;gap:6px;align-items:center;font-size:11px;margin:2px 0}.ecl{color:var(--ink2)}.ect{height:7px;background:color-mix(in oklab,var(--grid) 70%,transparent);border-radius:2px;overflow:hidden;display:block}.ect span{display:block;height:100%}.ect .w{background:var(--w)}.ect .o{background:var(--o)}.ecn{text-align:right;color:var(--ink)}
.eff tr.esum td{text-align:center;font-size:12.5px;font-weight:600;border-left:1px solid var(--grid)}.eff .good{color:var(--good)}.eff .bad{color:var(--bad)}
.legend .scale{display:inline-flex;gap:0}.legend .sw{width:22px;height:12px;border-radius:0;margin:0;border:1px solid var(--ring)}
.muted{color:var(--muted);fill:var(--muted)}
table{border-collapse:collapse;width:100%;background:var(--surface);border:1px solid var(--ring);border-radius:10px;overflow:hidden;font-size:12.5px}th,td{padding:7px 10px;border-bottom:1px solid var(--grid);text-align:left;vertical-align:top}th{background:transparent;color:var(--ink2);font-weight:600;white-space:nowrap}td.num,th.num{text-align:right;white-space:nowrap}td.k{font-weight:700;color:var(--w)}tr.dim td{color:var(--muted)}
.mx{width:auto}.mx td.sym{text-align:center;font-size:15px;width:64px}.mx td.s3{background:var(--s3)}.mx td.s2{background:var(--s2)}.mx td.s0{color:var(--muted)}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.note{font-size:12.5px;color:var(--ink2);margin-top:14px;background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:10px 16px}.note li{margin:3px 0}
.wrap{overflow-x:auto}
.diag{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-bottom:12px}
.bars{margin-top:8px}.row{display:grid;grid-template-columns:76px 1fr 44px;gap:6px;align-items:center;font-size:12px;margin:3px 0}.row .lab{color:var(--ink2)}.row .val{text-align:right}.track{height:9px;background:var(--grid);border-radius:2px;overflow:hidden}.bar{height:100%}.bar.w{background:var(--w)}.bar.o{background:var(--o)}
.pairrow{display:grid;grid-template-columns:76px 1fr;gap:6px;align-items:center;margin:4px 0;font-size:12px}.pairrow .lab{color:var(--ink2)}.pairrow .row{grid-template-columns:38px 1fr 44px;margin:1px 0}
.flag{font-size:10.5px;border-radius:4px;padding:1px 6px;margin-left:4px;font-weight:600}.flag.bad{color:var(--bad);background:var(--bad-bg);border:1px solid var(--bad)}.flag.ok{color:var(--good);background:var(--good-bg);border:1px solid var(--good)}
.legend .good,.legend .bad{font-weight:700}.legend .good{color:var(--good)}.legend .bad{color:var(--bad)}
.trend{font-size:11px;font-weight:700;margin-left:6px}.trend.up{color:var(--good)}.trend.down{color:var(--bad)}
td.good{color:var(--good);font-weight:600}td.bad{color:var(--bad);font-weight:600}
.card.vgood{border-color:var(--good);box-shadow:inset 3px 0 0 var(--good)}.card.vbad{border-color:var(--bad);box-shadow:inset 3px 0 0 var(--bad)}.tiny{font-size:10.5px}
</style></head><body><main>
<h1>최종 효율지표 7종 <small>작업 이력(work-history) 기준 · F1~F7 × 도구 6종</small></h1>
<div class="meta">턴 ${ALL.n}개 · 세션 ${range.sessions}개 · ${range.days}일 (${esc(range.from)} ~ ${esc(range.to)}) · 총비용 $${ALL.cost.toFixed(0)} · 활성 ${ALL.hours.toFixed(1)}h · 생성 ${generated} KST</div>
<div class="toolbar"><button class="theme" type="button" onclick="const r=document.documentElement;r.dataset.theme=r.dataset.theme==='dark'?'light':'dark'">라이트 / 다크</button><span>정의 : <code>docs/AI_EFFICIENCY_METRICS_UNION.md</code> 4절 · 생성기 <code>scripts/final-metrics-dashboard.mjs</code></span></div>

<h2>1. 지표 카드 <small>전체 기간 값 + 주별 3D 막대(지표마다 고유색 · 마지막 주 = 직전 주 대비 <span class="legend good" style="display:inline">개선 다홍</span> / <span class="legend bad" style="display:inline">악화 네이비</span> · 반투명 = 그 주 턴 ${MIN_N}개 미만)</small></h2>
<div class="cards">${SPEC.map(card).join('\n')}</div>

<h2>2. 도구 사용 턴 vs 미사용 턴 <small>칸의 큰 숫자 = 그 도구를 쓴 턴이 쓰지 않은 턴보다 얼마나 유리(+)·불리(−)한가 · 도구 사용 턴은 규모가 큰 턴이라 F1·F5가 불리하게 나오는 것이 정상, 규모를 맞춘 판정은 tool-efficiency.html(v2 층화)</small></h2>
<div class="legend"><span class="scale"><i class="sw" style="background:color-mix(in oklab,var(--bad) 60%,var(--surface))"></i><i class="sw" style="background:color-mix(in oklab,var(--bad) 25%,var(--surface))"></i><i class="sw" style="background:var(--surface)"></i><i class="sw" style="background:color-mix(in oklab,var(--good) 25%,var(--surface))"></i><i class="sw" style="background:color-mix(in oklab,var(--good) 60%,var(--surface))"></i></span><span><span class="bad">▼ 불리(네이비)</span> ← 0% → <span class="good">▲ 유리(다홍)</span> · 진할수록 차이가 큼(100%에서 최대) · 두 값이 2배 이상 차이 나면 "N.N배"로 표기</span><span><i style="background:var(--w)"></i>사용 턴 값</span><span><i style="background:var(--o)"></i>미사용 턴 값</span></div>
${effectGrid()}

<h2>3. 지표 × 도구 영향 매트릭스 <small>◎ 직접(호출·비용·시간이 분자·분모에 들어감) · ○ 간접(사용 턴에서 값이 뚜렷이 다름) · △ 약함 · ✕ 측정 경로 없음</small></h2>
<div class="wrap">${matrix}</div>
<div class="note"><ul>
<li><b>Otel</b> : <code>.claude/settings.json</code>에 텔레메트리 내보내기가 켜져 있으나 수집기(엔드포인트)가 없어 저장된 지표가 없음. 열의 기호는 수집기를 붙이면 공식 메트릭(토큰·비용·세션·도구 결과)으로 교차 검증 가능한 지표를 뜻함 [확인중 : 수집기 구성]</li>
<li><b>Hook</b> : ${hookShare.turns}/${ALL.n}턴에서 실행되어 사용/미사용 비교가 성립하지 않음. 훅 소요 ${hookShare.min.toFixed(1)}분(${hookShare.runs}회) = 활성 시간의 ${(100 * (ALL.F7_hook || 0)).toFixed(1)}%</li>
<li><b>Agent</b> : 서브에이전트 내부 도구 호출·오류는 부모 턴 <code>tools_total</code>에 들어오지 않음 → F6·F7의 Agent 값은 과소. <b>Plugin</b> : 플러그인 MCP(context-mode)는 MCP와 Plugin 양쪽에 집계되어 두 열은 독립이 아님</li>
</ul></div>

<h2>4. 표 <small>그림과 같은 값 · 산식 · 기존 지표 키</small></h2>
<div class="wrap"><table><thead><tr><th>최종</th><th>통합</th><th>지표</th><th class="num">전체</th>${TOOLS.map(k => `<th class="num">${k} <span class="muted">${byTool[k].with.n}턴</span> 사용 vs 미사용</th>`).join('')}<th>Hook</th><th>산식(레코드 필드)</th><th>기존 키</th></tr></thead><tbody>
${tableRows}
</tbody></table></div>

<h2>5. 주별 값 <small>직전 유효 주 대비 <span class="legend good" style="display:inline">개선 = 다홍</span> · <span class="legend bad" style="display:inline">악화 = 네이비</span> · 턴 ${MIN_N}개 미만인 주는 회색(판정 제외)</small></h2>
<div class="wrap"><table><thead><tr><th>주</th><th class="num">턴</th>${SPEC.map(s => `<th class="num">${s.k} <span class="muted">${esc(s.unit)}</span></th>`).join('')}</tr></thead><tbody>
${weeklyRows}
</tbody></table></div>

<h2>6. 방법론 진단 <small>Prompt · Context · Harness · Loop — 방법론 "사용 여부"는 기록되지 않아 각 방법론이 남기는 흔적으로 대리 측정</small></h2>
<div class="diag">
  <section class="card ${DIAG_NEW[0].verdict === '좋음' ? 'vgood' : DIAG_NEW[0].verdict === '나쁨' ? 'vbad' : ''}"><div class="khead"><span class="k">Prompt</span><span class="name">요청 길이 구간별 1차 수용률</span><span class="dir">${vflag(DIAG_NEW[0].verdict, DIAG_NEW[0].verdictNote)}</span></div><div class="bars">${lenBars}</div><div class="mini">${esc(DIAG_NEW[0].verdictNote)} · 길이는 양이지 구조 품질이 아니며, 긴 요청은 복합 과업이라 낮게 나오는 경향</div></section>
  <section class="card ${DIAG_NEW[1].verdict === '좋음' ? 'vgood' : DIAG_NEW[1].verdict === '나쁨' ? 'vbad' : ''}"><div class="khead"><span class="k">Prompt</span><span class="name">ultrathink 사용 vs 미사용</span><span class="dir">${ultra.with.n} vs ${ultra.without.n}턴 ${vflag(DIAG_NEW[1].verdict, DIAG_NEW[1].verdictNote)}</span></div><div class="bars">${utBars}</div><div class="mini">${esc(DIAG_NEW[1].verdictNote)} · 어려운 요청에 붙이는 선택 편향 : 층을 맞추기 전에는 효과로 읽지 않음</div></section>
  <section class="card ${axisVerdict('Context') === '좋음' ? 'vgood' : axisVerdict('Context') === '나쁨' ? 'vbad' : ''}"><div class="khead"><span class="k">Context</span><span class="name">컨텍스트 팽창 · 캐시 미스</span>${axisBadge('Context')}</div><div class="big">${fmtKpi(DIAG_EXISTING[0])}<small>팽창률 ${vflag(DIAG_EXISTING[0].verdict, DIAG_EXISTING[0].verdictNote)}</small></div><div class="sub">캐시 미스 이벤트 ${fmtKpi(DIAG_EXISTING[1])} ${vflag(DIAG_EXISTING[1].verdict, DIAG_EXISTING[1].verdictNote)}</div><div class="mini"><code>ctx_growth</code> · <code>cache_miss_events</code> (기존 L2, 공식 경보 기준)</div></section>
  <section class="card ${DIAG_EXISTING[3].verdict === '좋음' ? 'vgood' : DIAG_EXISTING[3].verdict === '나쁨' ? 'vbad' : ''}"><div class="khead"><span class="k">Harness</span><span class="name">무검증 쓰기 턴 비율</span>${axisBadge('Harness')}</div><div class="big">${fmtKpi(DIAG_EXISTING[3])}<small>${vflag(DIAG_EXISTING[3].verdict, DIAG_EXISTING[3].verdictNote)}</small></div><div class="sub">훅 실행 ${hookShare.runs}회 · 커버 ${hookShare.turns}/${ALL.n}턴</div><div class="mini"><code>unverified_rate</code> (기존 L2) · 검증 턴 vs 무검증 턴 재작업률은 표본 부족으로 미표시</div></section>
  <section class="card ${axisVerdict('Loop') === '좋음' ? 'vgood' : axisVerdict('Loop') === '나쁨' ? 'vbad' : ''}"><div class="khead"><span class="k">Loop</span><span class="name">루프 길이 · 회복 비용</span>${axisBadge('Loop')}</div><div class="big">${fmtKpi(DIAG_EXISTING[2])}<small>요청당 API 호출 (기준 없음)</small></div><div class="sub">오류 회복 배수 ${fmtKpi(DIAG_EXISTING[4])} ${vflag(DIAG_EXISTING[4].verdict, DIAG_EXISTING[4].verdictNote)} · Edit→Bash 반복 ${editRunTurns}턴 ${vflag(DIAG_NEW[2].verdict, DIAG_NEW[2].verdictNote)} · 오류 재시도 ${retries}회 ${vflag(DIAG_NEW[3].verdict, DIAG_NEW[3].verdictNote)}</div><div class="mini"><code>api_per_request</code> · <code>recovery_multiplier</code> (기존) + steps[] 패턴(신규) · 축 판정 = 좋음·나쁨 다수결</div></section>
</div>
<div class="wrap"><table><thead><tr><th>축</th><th>지표</th><th>값</th><th>판정 · 기준</th><th>산식</th><th>읽는 법</th><th>구분</th></tr></thead><tbody>
${diagRows}
</tbody></table></div>
<div class="note"><ul>
<li>이력으로 측정 불가 : 프롬프트 구조 품질(요청 본문 미저장, <code>req_head</code> 80자만), 컨텍스트 내용의 적절성, 훅 보고가 산출물 수정으로 이어졌는지의 인과, 루프 실패 원인(steps[]에 오류 내용 없음).</li>
<li>기존 5개의 값과 경보 기준은 <code>work-history-core.mjs METRICS</code>(KPI L2)와 동일한 공식 집계기(<code>kpiView</code>)에서 가져옴. 판정 = 공식 <code>evaluateSlo</code> 상태(정상 → 좋음, 경보 → 나쁨). 요청당 API 호출은 공식 기준이 없어 판정 없음.</li>
<li>신규 4개의 판정 기준(길이별 수용률 격차 5%p · ultrathink 수용률 차 5%p · 반복 턴 비율 10/20% · 오류 턴당 재시도 1.0/1.5회)은 이 생성기의 임시 기준이며 공식 레지스트리에 등록 전 [확인중]. 축 배지는 그 축 지표들의 좋음·나쁨 다수결.</li>
</ul></div>

<h2>7. 도구 종류별 호출·오류·실행 시간 <small>F6·F7 근거 (steps[] 집계, Agent는 디스패치 시간만)</small></h2>
<div class="wrap"><table style="width:auto"><thead><tr><th>도구</th><th class="num">호출</th><th class="num">오류</th><th class="num">호출당 오류</th><th class="num">실행 시간(분)</th></tr></thead><tbody>
${stepRows}
</tbody></table></div>

<div class="note"><b>읽는 법</b><ul>
<li>절감률·증가율은 "AI 미사용 시" 기준선이 없어 산출하지 않고, 절대값의 주 단위 증감으로만 본다(일 단위는 턴 수 편차로 표본 부족일이 많음).</li>
<li>F6은 도구 호출 오류이지 산출물 결함이 아니다. F7은 기계 쪽 대기 구성이며 사람의 학습·검토 시간은 없다.</li>
<li>한 지표가 좋아지고 다른 지표가 나빠지는 조합(F2↑·F3↑, F5↓·F6↑)은 묶어서 읽고 단일 지표로 좋고 나쁨을 정하지 않는다.</li>
<li>색 규칙 : 계열색은 사용(파랑)·기준(주황) 둘뿐. <b>좋음·개선·유리 = 다홍, 나쁨·악화·불리 = 네이비</b>(2026-10-06 지시). 상태는 색만으로 전하지 않고 ●○·▲▼·경보/정상 글자를 함께 둔다. 표 4·5가 그림의 접근성 뷰.</li>
</ul></div>
</main></body></html>`
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, html)
console.log(`턴 ${ALL.n} (${range.from}~${range.to}, 세션 ${range.sessions}) → ${OUT}`)
for (const s of SPEC) console.log(`${s.k} ${s.name.padEnd(16)} 전체 ${fmtAny(s, ALL[s.k]).padStart(7)} | ${TOOLS.map(k => `${k} ${fmtAny(s, byTool[k].with[s.k])} vs ${fmtAny(s, byTool[k].without[s.k])}`).join(' · ')}`)
for (const d of DIAG_EXISTING) console.log(`[진단·기존] ${d.axis.padEnd(8)} ${d.label} = ${fmtKpi(d)}`)
for (const d of DIAG_NEW) console.log(`[진단·신규] ${d.axis.padEnd(8)} ${d.label} = ${d.value}`)
