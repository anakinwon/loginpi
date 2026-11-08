// Pi통신 적재 기록 HTML 렌더러 — run-init.mjs 가 갱신마다 동적 import(파일 수정 시각 쿼리)로 다시 읽어 init_data.html 을 그림(실행기 재시작 없이 화면 수정 반영)

// 실행 : 직접 실행 안 함. 미리보기 = node database/run-init.mjs preview → database/init_data.preview.html

import fs from 'node:fs'

let C = {}
let AREA_NM = {}
// verify.mjs 진행 기록(FK별 분할 검증) — 없거나 쓰는 중이면 표시 생략
const readVerify = () => {
  try {
    return JSON.parse(fs.readFileSync(new URL('./verify_state.json', import.meta.url), 'utf8'))
  } catch {
    return null
  }
}
let alive = () => false

export const setCtx = ctx => ({ C, AREA_NM, alive } = ctx)

export const fmt = t => (t ? new Date(t).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 19) : '')
export const dur = ms => {
  if (ms == null || ms < 0) return ''
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 3600)}시간 ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}분 ${String(s % 60).padStart(2, '0')}초`
}

export const allChunks = S => Object.values(S.tables).flatMap(t => Object.entries(t.chunks).map(([id, c]) => ({ id, ...c, tbl: t.tbl })))

export function tableView(t, now, chunkEnd) {
  const cs = Object.entries(t.chunks).map(([id, c]) => ({ id, ...c }))
  const fin = cs.filter(c => c.st === '완료')
  const starts = cs.map(c => c.s).filter(Boolean)
  const st = fin.length === cs.length ? '완료' : cs.some(c => c.st === '진행') ? '진행' : cs.some(c => c.st === '실패') ? '실패' : fin.length ? '진행' : '대기'
  const start = starts.length ? Math.min(...starts) : null
  const end = st === '완료' ? Math.max(...fin.map(c => c.e || 0)) || null : null
  const etas = cs.map(c => (c.st === '완료' ? c.e : chunkEnd?.[c.id])).filter(Boolean)
  return { st, start, end, eta: end || (etas.length ? Math.max(...etas) : null), actual: fin.reduce((s, c) => s + c.sz, 0), done: fin.length, total: cs.length, elapsed: start ? (end || now) - start : null, err: cs.find(c => c.err)?.err }
}

// ---------- 예상종료 : 생성기 큐(plan 순서·동시 jobs)를 그대로 모의 ----------
export function simulate(now, inflight, queue, rate, workers) {
  const end = {}
  const free = inflight.map(c => {
    const f = Math.max(now + 1000, c.s + (c.sz / rate + C.chunkOvhS) * 1000)
    end[c.id] = f
    return f
  })
  while (free.length < workers) free.push(now)
  for (const c of queue) {
    free.sort((a, b) => a - b)
    free[0] += (c.sz / rate + C.chunkOvhS) * 1000
    end[c.id] = free[0]
  }
  return end
}

export function computeEta(S, now = Date.now()) {
  const cs = allChunks(S)
  // 전체 처리율 = 최근 60분(적재 시작 이후) 완료 조각 행 합 ÷ 경과(조각 행 수 가중). 조각별 행/초 평균은 빨리 끝난 작은 조각만 잡혀 과대(생존 편향 — 11,086×7 오류)
  // 10분 미만이면 1% 시험 실측(백엔드 1개 × jobs). 모의 큐에는 백엔드 1개 = 전체 ÷ jobs
  const win = C.rateWinMs || 3600000
  const from = Math.max(S.loadStart || now, now - win)
  const span = (now - from) / 1000
  const winRows = cs.filter(c => c.st === '완료' && c.e >= from && !c.recon).reduce((s, c) => s + c.sz, 0)
  const measured = span >= 600 && winRows > 0
  const total = measured ? winRows / span : C.rate1pct * C.jobs
  const rate = total / C.jobs
  const byId = new Map(cs.map(c => [c.id, c]))
  const inflight = cs.filter(c => c.st === '진행' && c.s)
  const queue = S.order.map(id => byId.get(id)).filter(c => c && (c.st === '대기' || c.st === '실패' || (c.st === '진행' && !c.s)))
  const chunkEnd = simulate(now, inflight, queue, rate, C.jobs)
  const ends = cs.map(c => (c.st === '완료' ? c.e : chunkEnd[c.id])).filter(Boolean)
  const loadEnd = ends.length ? Math.max(...ends) : now
  // 제약 : 동시 3 세션, 영역 행 / 처리율(완료 단계 실측 있으면 그 값)
  const areaRows = a => Object.values(S.tables).filter(t => t.area === a).reduce((s, t) => s + t.n, 0)
  const conDone = C.conOrder.map(a => S.steps['CON_' + a]).filter(x => x?.st === '완료' && x.e > x.s)
  const conRate = conDone.length ? conDone.reduce((s, x) => s + x.rows, 0) / conDone.reduce((s, x) => s + (x.e - x.s) / 1000, 0) : C.conRowsPerS
  const stepEnd = {}
  const slots = Array(C.conSessions).fill(Math.max(loadEnd, now))
  for (const a of C.conOrder) {
    const x = S.steps['CON_' + a]
    slots.sort((p, q) => p - q)
    const est = (areaRows(a) / conRate) * 1000
    if (x?.st === '완료') stepEnd['CON_' + a] = x.e
    else if (x?.st === '진행') stepEnd['CON_' + a] = Math.max(now + 1000, x.s + est)
    else stepEnd['CON_' + a] = slots[0] + est
    if (x?.st !== '완료') slots[0] = stepEnd['CON_' + a]
  }
  let t = Math.max(...Object.values(stepEnd))
  for (const [id, s] of [['ANALYZE', C.analyzeS], ['VERIFY', C.verifyS], ['RESTORE', 5]]) {
    const x = S.steps[id]
    t = x?.st === '완료' ? x.e : x?.st === '진행' ? Math.max(now + 1000, x.s + s * 1000) : t + s * 1000
    stepEnd[id] = t
  }
  return { rate, total, measured, conRate, conAssumed: !conDone.length, chunkEnd, loadEnd, stepEnd, allEnd: t }
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const num = n => (n == null ? '' : Math.round(n).toLocaleString())
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '')
const badge = st => `<span class="b ${{ 완료: 'ok', 진행: 'run', 실패: 'bad', 중단: 'bad', 대기: 'wait' }[st] || 'wait'}">${esc(st)}</span>`

export function renderHtml(S, now = Date.now(), ctx) {
  if (ctx) setCtx(ctx)
  const E = S.order?.length ? computeEta(S, now) : null
  const views = Object.values(S.tables || {}).map(t => ({ t, v: tableView(t, now, E?.chunkEnd) }))
  const target = views.reduce((s, x) => s + x.t.n, 0)
  const doneRows = views.reduce((s, x) => s + x.v.actual, 0)
  const areaRows = C.modelOrder
    .map(a => {
      const vs = views.filter(x => x.t.area === a)
      if (!vs.length) return ''
      const tg = vs.reduce((s, x) => s + x.t.n, 0)
      const dn = vs.reduce((s, x) => s + x.v.actual, 0)
      const starts = vs.map(x => x.v.start).filter(Boolean)
      const allDone = vs.every(x => x.v.st === '완료')
      const st = allDone ? '완료' : vs.some(x => x.v.st === '실패') ? '실패' : starts.length ? '진행' : '대기'
      const con = S.steps?.['CON_' + a]
      return `<tr><td>${a} ${AREA_NM[a]}</td><td class="n">${vs.filter(x => x.v.st === '완료').length} / ${vs.length}</td><td class="n">${num(tg)}</td><td class="n">${num(dn)}</td><td class="n">${pct(dn, tg)}</td><td>${fmt(starts.length ? Math.min(...starts) : null)}</td><td>${fmt(Math.max(...vs.map(x => x.v.eta || 0)) || null)}</td><td>${allDone ? fmt(Math.max(...vs.map(x => x.v.end || 0))) : ''}</td><td>${badge(st)}</td><td>${con ? badge(con.st) : badge('대기')}</td></tr>`
    })
    .join('')
  const tblRows = C.modelOrder
    .flatMap(a => views.filter(x => x.t.area === a))
    .map(({ t, v }) => `<tr class="${v.st === '실패' ? 'fail' : v.st === '진행' ? 'running' : ''}"><td>${t.area}</td><td class="m">${esc(t.tbl)}</td><td class="n">${num(t.n)}</td><td class="n">${v.done ? num(v.actual) : ''}</td><td class="n">${v.done} / ${v.total}</td><td>${fmt(v.start)}</td><td>${fmt(v.eta)}</td><td>${fmt(v.end)}</td><td>${badge(v.st)}${v.err ? `<div class="err">${esc(v.err)}</div>` : ''}</td><td>${dur(v.elapsed)}</td></tr>`)
    .join('')
  const stepDefs = [['LOAD', `적재(생성기 1프로세스 동시 ${C.jobs})`], ...C.conOrder.map(a => ['CON_' + a, `제약 ${a}(${AREA_NM[a]}) PK·인덱스`]), ['ANALYZE', 'ANALYZE(본 DB 전체)'], ['VERIFY', '검증 verify.mjs'], ['RESTORE', 'autovacuum·절전 원복']]
  const stepRows = stepDefs
    .map(([id, nm]) => {
      const x = id === 'LOAD' ? { rows: target, s: S.loadStart, e: S.loadEnd, st: S.loadEnd ? '완료' : S.loadStart ? '진행' : '대기' } : S.steps?.[id] || {}
      // [가정] = 실측 없이 상수로 낸 예상(제약은 완료 영역 실측이 생기면 해제, ANALYZE·검증·원복은 끝날 때까지)
      const assumed = x.st !== '완료' && ((id.startsWith('CON_') && E?.conAssumed) || ['ANALYZE', 'VERIFY', 'RESTORE'].includes(id))
      const etaAt = x.st === '완료' ? x.e : id === 'LOAD' ? E?.loadEnd : E?.stepEnd[id]
      return `<tr class="${x.st === '실패' ? 'fail' : ''}"><td>${esc(nm)}</td><td class="n">${x.rows ? num(x.rows) : ''}</td><td>${fmt(x.s)}</td><td>${fmt(etaAt)}${assumed && etaAt ? ' <span class="as">[가정]</span>' : ''}</td><td>${fmt(x.st === '완료' || x.st === '실패' ? x.e : null)}</td><td>${badge(x.st || '대기')}</td><td>${dur(x.s ? (x.e || now) - x.s : null)}</td><td class="note">${esc(x.note)}</td></tr>`
    })
    .join('')
  const d = S.disk || {}
  const low = d.freeGB != null && d.freeGB < C.diskGateGB
  const pre = (S.precheck?.items || []).map(i => `<tr class="${i.ok ? '' : 'fail'}"><td>${esc(i.nm)}</td><td>${badge(i.ok ? '완료' : '실패')}</td><td class="note">${esc(i.note)}</td></tr>`).join('')
  const g = S.gate
  // 적재 시작 전 경고 = 사전점검 재시도로 해소된 이전 회차 → 회색 접힘, 그 뒤 경고만 빨간 상자
  const li = w => `<li><b>${fmt(w.at)}</b> ${esc(w.m)}</li>`
  const resolved = w => S.loadStart && w.at < S.loadStart
  const warns = (S.warns || []).filter(w => !resolved(w)).slice(-40).reverse().map(li).join('')
  const oldWarns = (S.warns || []).filter(resolved)
  const inflight = allChunks(S).filter(c => c.st === '진행').length
  const V = readVerify()
  const vr = V ? Object.entries(V.results || {}).map(([id, r]) => ({ id, ...r })) : []
  const vCnt = st => vr.filter(r => r.st === st).length
  const vRow = r => `<tr class="${r.st === '진행' ? 'running' : r.st === '완료' ? '' : 'fail'}"><td class="m">${esc(r.id)}</td><td>${badge(r.st === '시간초과' ? '실패' : r.st)}${r.st === '시간초과' ? ' 시간초과' : ''}</td><td>${fmt(r.s)}</td><td>${dur((r.e || now) - r.s)}</td><td class="n">${num(r.total)}</td><td class="n">${num(r.orph)}</td><td class="n">${r.total ? ((r.orph / r.total) * 100).toFixed(3) + '%' : esc(r.val ?? '')}</td><td class="note">${esc(r.err)}</td></tr>`
  const vHead = '<tr><th>FK·지표</th><th>상태</th><th>시작(KST)</th><th>소요</th><th>자식 행</th><th>고아</th><th>고아 비율·값</th><th>오류</th></tr>'
  const vSec = V
    ? `<h2>검증 진행 (FK별 분할 · 동시 ${V.conc} · 건별 상한 ${V.timeoutMin}분 · ${esc(V.key)})</h2>
<p>완료 <b>${V.done} / ${V.total}</b> (${pct(V.done, V.total)}) · 진행 ${vCnt('진행')} · 시간초과 ${vCnt('시간초과')} · 실패 ${vCnt('실패')} · 시작 ${fmt(V.startedAt)} · 기록 갱신 ${fmt(V.updatedAt)}${V.endAt ? ` · 종료 ${fmt(V.endAt)}` : ''} · 건별 로그 database/verify.log</p>
<table>${vHead}${vr.filter(r => r.st !== '완료').sort((a, b) => a.s - b.s).map(vRow).join('')}</table>
<p>느린 순 상위 10 (완료)</p><table>${vHead}${vr.filter(r => r.st === '완료').sort((a, b) => b.ms - a.ms).slice(0, 10).map(vRow).join('')}</table>`
    : ''
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="refresh" content="30"><title>Pi통신 테스트 데이터 100% 적재 기록</title>
<style>
body{font-family:'Malgun Gothic','Noto Sans KR',sans-serif;margin:20px;color:#222;background:#fafafa;font-size:13px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px;border-left:4px solid #1f4e79;padding-left:8px}
.sub{color:#666;margin-bottom:12px}.cards{display:flex;flex-wrap:wrap;gap:10px}
.card{background:#fff;border:1px solid #ddd;border-radius:6px;padding:10px 14px;min-width:150px}.card .k{color:#666;font-size:12px}.card .v{font-size:18px;font-weight:bold;margin-top:2px}
.bar{height:10px;background:#e5e5e5;border-radius:5px;overflow:hidden;margin-top:6px}.bar i{display:block;height:100%;background:#2e7d32}
table{border-collapse:collapse;background:#fff;width:100%}th,td{border:1px solid #ddd;padding:4px 7px;text-align:left;white-space:nowrap}th{background:#1f4e79;color:#fff;font-weight:normal;position:sticky;top:0}
td.n{text-align:right;font-variant-numeric:tabular-nums}td.m{font-family:Consolas,monospace}td.note{white-space:pre-wrap;max-width:620px;font-size:12px}
tr.fail td{background:#fde8e8}tr.running td{background:#eef6ff}.err{color:#c00;font-size:11px;white-space:normal;max-width:360px}
.b{padding:1px 7px;border-radius:9px;font-size:12px}.b.ok{background:#e3f2e5;color:#1b5e20}.b.run{background:#dbeafe;color:#1e40af}.b.bad{background:#c62828;color:#fff}.b.wait{background:#eee;color:#666}
.warn{background:#fff3f3;border:1px solid #e57373;color:#b71c1c;padding:8px 12px;border-radius:6px;margin:10px 0}.warn ul{margin:4px 0;padding-left:18px}
.as{color:#c00;font-size:11px;font-weight:normal}.old{color:#888;margin:6px 0}.old ul{margin:4px 0}
.foot{color:#888;font-size:11px;margin-top:16px}
</style></head><body>
<h1>Pi통신 테스트 데이터 100%(배율 ${C.scale}) 적재 기록</h1>
<div class="sub">대상 DB pitel · public · 생성기 1프로세스 동시 ${C.jobs} · 단계 <b>${esc(S.phase || '시작 전')}</b> · 갱신 ${fmt(S.savedAt || now)} (30초 자동 새로고침) · 시각은 모두 KST(Asia/Seoul)</div>
${S.phase === '중단' ? `<div class="warn"><b>중단</b> ${fmt(S.stopRec?.at)} — ${esc(S.stopRec?.reason)}<br>재시작 : <code>node sitemap/schema.pi/pitel/database/run-init.mjs start</code></div>` : ''}
${low ? `<div class="warn"><b>디스크 경고</b> C: 여유 ${d.freeGB.toFixed(1)}GB (중단선 ${C.diskStopGB}GB)</div>` : ''}
<div class="cards">
<div class="card"><div class="k">전체 목표 행</div><div class="v">${num(target)}</div></div>
<div class="card"><div class="k">완료 행(완료 조각 합)</div><div class="v">${num(doneRows)}</div><div class="bar"><i style="width:${target ? ((doneRows / target) * 100).toFixed(2) : 0}%"></i></div></div>
<div class="card"><div class="k">적재 진행률</div><div class="v">${pct(doneRows, target) || '0%'}</div></div>
<div class="card"><div class="k">시작일시(KST)</div><div class="v">${fmt(S.startedAt)}</div></div>
<div class="card"><div class="k">적재 예상종료</div><div class="v">${S.loadEnd ? fmt(S.loadEnd) + ' (완료)' : fmt(E?.loadEnd)}</div></div>
<div class="card"><div class="k">전체 예상종료(제약·검증 포함)</div><div class="v">${S.endAt ? fmt(S.endAt) + ' (완료)' : fmt(E?.allEnd) + (E ? ' <span class="as">[가정 포함]</span>' : '')}</div></div>
<div class="card"><div class="k">C: 여유 / DB 크기 / Docker vhdx</div><div class="v">${d.freeGB?.toFixed(1) ?? '-'} / ${d.dbGB?.toFixed(1) ?? '-'} / ${d.vhdxGB?.toFixed(1) ?? '-'} GB</div></div>
<div class="card"><div class="k">전체 처리율</div><div class="v">${num(E?.total)} 행/초</div><div class="k">${E?.measured ? '최근 60분 완료 조각 행 합 실측' : '<span class="as">[가정] 1% 시험 기준(10분 뒤 실측)</span>'} · 진행 조각 ${inflight}/${C.jobs}</div></div>
<div class="card"><div class="k">생성기 / 실행기 PID</div><div class="v">${S.genPid ?? '-'} / ${S.pid ?? '-'}</div><div class="k">${alive(S.genPid) ? '생성기 실행 중' : '생성기 정지'} · ${S.genRuns || 0}회 기동</div></div>
</div>
${warns ? `<div class="warn"><b>실패·경고</b><ul>${warns}</ul></div>` : ''}
${oldWarns.length ? `<details class="old"><summary>해소된 이전 회차 경고 ${oldWarns.length}건(사전점검 재시도 후 통과)</summary><ul>${oldWarns.map(li).join('')}</ul></details>` : ''}
<h2>주제영역별 소계 (레인 = 기록·제약 단위, 적재는 생성기 큐가 조각 단위로 균형)</h2>
<table><tr><th>주제영역</th><th>테이블(완료/전체)</th><th>목표 건수</th><th>완료 건수</th><th>진행률</th><th>시작일시(KST)</th><th>예상종료일시(KST)</th><th>실제종료일시(KST)</th><th>적재 상태</th><th>제약 상태</th></tr>${areaRows}</table>
<h2>단계 (적재 → 제약 동시 ${C.conSessions}세션 ${C.conOrder.join('·')} 순)</h2>
<table><tr><th>단계</th><th>대상 행</th><th>시작일시(KST)</th><th>예상종료일시(KST)</th><th>실제종료일시(KST)</th><th>상태</th><th>소요</th><th>결과</th></tr>${stepRows}</table>
${vSec}
${g ? `<p>디스크 게이트(${fmt(g.at)}) : DB ${g.dbGB.toFixed(1)}GB × r ${g.r.toFixed(3)} + WAL ${C.walReserveGB}GB = 예상 ${g.needGB.toFixed(1)}GB, 여유 ${g.freeGB.toFixed(1)}GB → 제약 후 ${g.afterGB.toFixed(1)}GB · <b>${g.defer ? `큰 4영역 보조 인덱스 ${g.list.length}개 지연(database/deferred_indexes.sql)` : '지연 없음(전부 생성)'}</b></p>` : ''}
<h2>테이블별 (${views.length}개)</h2>
<table><tr><th>주제영역</th><th>테이블명</th><th>목표 건수</th><th>실제 건수</th><th>조각</th><th>시작일시(KST)</th><th>예상종료일시(KST)</th><th>실제종료일시(KST)</th><th>상태</th><th>소요</th></tr>${tblRows}</table>
<h2>0단계 사전점검</h2>
<table><tr><th>항목</th><th>결과</th><th>내용</th></tr>${pre}</table>
<div class="foot">실제 건수 = 완료 조각 행 합(조각 1개 = INSERT 1문, 원자적) · 시작 = 첫 조각 시작, 종료 = 마지막 조각 완료 · 예상종료 = 생성기 큐(plan 순서·동시 ${C.jobs}) 모의 × 백엔드 처리율(= 전체 처리율 ÷ ${C.jobs}, 전체 = 최근 60분 완료 조각 행 합 ÷ 경과, 10분 미만이면 1% 시험 ${num(C.rate1pct * C.jobs)} 행/초) · 제약 처리율 [가정] ${num(C.conRowsPerS)} 행/초/세션(완료 영역 실측으로 대체), ANALYZE ${C.analyzeS / 60}분·검증 ${C.verifyS / 60}분 [가정] · 설정 원래값 ${esc(Object.entries(S.sysOrig || {}).map(([k, v]) => `${k}=${v}`).join(', '))}</div>
</body></html>`
}
