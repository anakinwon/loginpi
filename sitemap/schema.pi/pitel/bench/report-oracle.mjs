// 11억 행 초기 적재 비교 보고서(PostgreSQL 17 ↔ Oracle 21c) 생성 : 로그·분석 JSON·측정값 → 한 파일 HTML
// 실행 : node bench/report-oracle.mjs <pitel 경로> ../public/restore/compare_pos_with_Oracle_scale1.html  (입력 : bench/analyze.mjs 결과 oracle/out/full_analysis.json, full_waits.txt, full_verify.log, full_load.size.jsonl)
import fs from 'node:fs'
import path from 'node:path'

const R = process.argv[2]
const OUT = process.argv[3]
const CSS = fs.readFileSync(new URL('./deck.css', import.meta.url), 'utf8')
const A = JSON.parse(fs.readFileSync(path.join(R, 'oracle/out/full_analysis.json')))
const plan = JSON.parse(fs.readFileSync(path.join(R, 'datagen/out/plan.json')))
const sizeHist = fs.readFileSync(path.join(R, 'oracle/out/full_load.size.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
const oSize = sizeHist[sizeHist.length - 1]
const waits = fs.readFileSync(path.join(R, 'oracle/out/full_waits.txt'), 'utf8').trim().split('\n').map(l => l.split('|'))
const verify = fs.readFileSync(path.join(R, 'oracle/out/full_verify.log'), 'utf8').trim()

// 이번에 직접 잰 값(2026-11-15) : PostgreSQL 크기는 pg_table_size·pg_indexes_size, 행당 비용은 테이블 133개 최소제곱
const PG_SIZE = { COL: 32397451264, CUS: 10483326976, INV: 30977449984, ORD: 26558709760, PAY: 66298216448, PRD: 374628352, PRM: 7848656896 }
const PG_IDX = 108770910208
const FIT = { pg: { fixed: 6.87, w: 14.07, o: 0.86, r2: 0.8 }, or: { fixed: 13.85, w: 0.49, o: 1.33, r2: 0.6 }, tables: 133 }
const GROUP = [
  { k: '가중 선택 0개', n: 5, r: 2.16 },
  { k: '가중 선택 1~2개', n: 74, r: 0.89 },
  { k: '가중 선택 3개 이상', n: 54, r: 0.57 },
]
const WCALLS = 2299190207 // 테이블 행 × 가중 선택 호출 수 합

const AREAS = ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM']
const AREA_NM = { PRD: '상품', CUS: '고객', ORD: '주문·가입', PAY: '과금·청구', INV: '수납', COL: '미납·채권', PRM: '정산·제휴' }
const f = x => Math.round(x).toLocaleString('ko-KR')
const f1 = x => x.toFixed(1)
const gb = b => (b / 1e9).toFixed(1)
const pct = (a, b) => ((a / b) * 100).toFixed(1) + '%'
const hms = s => {
  s = Math.round(s)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return (h ? `${h}시간 ` : '') + (h || m ? `${m}분 ` : '') + `${x}초`
}
const T = A.target
const PG = A.pg.total, OR = A.tg.total
const ratio = OR / PG
const pgSizeAll = Object.values(PG_SIZE).reduce((a, b) => a + b, 0)
const orSizeAll = Object.values(oSize.sz).reduce((a, b) => a + b, 0) + oSize.lob
const ev = waits.filter(w => w[0] === 'EV')
const tm = Object.fromEntries(waits.filter(w => w[0] === 'TM').map(w => [w[1], +w[2]]))
const st = Object.fromEntries(waits.filter(w => w[0] === 'ST').map(w => [w[1], +w[2]]))
const logSw = +waits.find(w => w[0] === 'LOG')[1]
const ioWait = ev.filter(w => w[2] === 'User I/O').reduce((s, w) => s + +w[4], 0)

// 10분 단위 표
const S = A.series
let prevP = 0, prevO = 0
const rowsS = S.map(s => {
  const r = { ...s, dP: s.pg - prevP, dO: s.tg - prevO }
  prevP = s.pg
  prevO = s.tg
  return r
})
const maxDP = Math.max(...rowsS.map(r => r.dP)), maxDO = Math.max(...rowsS.map(r => r.dO))
const avgP = T / (PG / 600), avgO = T / (OR / 600)

// MS-SQL·MySQL 실행(테스트 불가) : 적재 로그에서 10분 누적 완료 행 · 마지막 완료 시각 · 작업 단위 · 실패
const nOf = new Map(plan.map(p => [p.tbl, p.n]))
const tA = Date.UTC(2010, 0, 1), tB = Date.UTC(2026, 9, 31, 23, 59, 59)
const kOf = (y, N) => Math.max(0, Math.min(N, Math.floor(N * Math.pow((Date.UTC(y, 0, 1) - tA) / (tB - tA), 1 / 0.22))))
const unitRows = id => {
  const [t, y] = id.split(':'), N = nOf.get(t)
  if (y === 'all') return N
  const yy = +y
  return Math.max(0, (yy === 2026 ? N : kOf(yy + 1, N)) - (yy === 2010 ? 1 : kOf(yy, N) + 1) + 1)
}
function runOf(file) {
  let first
  let fails = 0
  const done = []
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (l.startsWith('실패 ')) fails++
    const m = l.match(/^(시작|완료) (\S+:\S+) (\S+)$/)
    if (!m) continue
    const t = new Date(m[3]).getTime()
    if (m[1] === '시작' && (!first || t < first)) first = t
    if (m[1] === '완료') done.push({ id: m[2], t })
  }
  const list = done.map(d => ({ sec: (d.t - first) / 1000, rows: unitRows(d.id) }))
  return { last: Math.max(...list.map(x => x.sec)), units: list.length, rows: list.reduce((s, x) => s + x.rows, 0), fails, at: m => list.filter(x => x.sec <= m * 60).reduce((s, x) => s + x.rows, 0) }
}
const RUNS = [
  { nm: 'MS-SQL 1차', file: 'mssql/out/full_load_grant_wait_stopped.log', c: '#f4b183', kst: '15:08 ~ 16:05', why: '메모리 할당 대기(세션 6개 RESOURCE_SEMAPHORE)와 잠금 메모리 부족(오류 1204·701)' },
  { nm: 'MS-SQL 2차', file: 'mssql/out/full_load_mem_reaped_stopped.log', c: '#ed7d31', kst: '17:00 ~ 17:56', why: 'PC 여유 메모리 부족으로 적재 프로세스가 강제 종료됨' },
  { nm: 'MySQL', file: 'mysql/out/full_load.log', c: '#548235', kst: '18:18 ~ 19:47', why: 'Docker Desktop 무응답(엔진 API 500, docker ps 시간 초과)' },
].map(r => ({ ...r, ...runOf(path.join(R, r.file)) }))
const MS2 = RUNS[1], MY = RUNS[2]

// 4개 DBMS 누적 완료율 선 그래프 : 끝난 DBMS 는 끝 시각 100% 동그라미, 중단된 실행은 마지막 완료 지점 X 표시
function chart4() {
  const W = 560, H = 400, L = 40, B = 26, Tp = 10, Rr = 12
  const xmax = 150
  const x = m => L + (m / xmax) * (W - L - Rr)
  const y = p => Tp + (1 - p) * (H - Tp - B)
  const poly = (pts, c, dash) => `<polyline fill="none" stroke="${c}" stroke-width="2.4"${dash ? ' stroke-dasharray="5 4"' : ''} points="${pts.map(([m, v]) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`
  const fin = (k, end, c) => {
    const p = [[0, 0], ...S.filter(s => s.min < end / 60).map(s => [s.min, s[k] / T]), [end / 60, 1]]
    return poly(p, c) + `<circle cx="${x(end / 60).toFixed(1)}" cy="${y(1)}" r="5" fill="#fff" stroke="${c}" stroke-width="2.4"/>`
  }
  const cut = r => {
    const p = [[0, 0]]
    for (let m = 10; m * 60 <= r.last; m += 10) p.push([m, r.at(m) / T])
    p.push([r.last / 60, r.rows / T])
    const [ex, ey] = [x(r.last / 60), y(r.rows / T)]
    return poly(p, r.c, true) + `<path d="M${ex - 5} ${ey - 5}L${ex + 5} ${ey + 5}M${ex + 5} ${ey - 5}L${ex - 5} ${ey + 5}" stroke="${r.c}" stroke-width="2.4"/>`
  }
  let g = ''
  for (let p = 0; p <= 1.0001; p += 0.25) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(p)}" y2="${y(p)}" stroke="#e5e7ea"/><text x="${L - 6}" y="${y(p) + 4}" text-anchor="end" font-size="11" fill="#59636e">${Math.round(p * 100)}%</text>`
  for (let m = 0; m <= xmax; m += 30) g += `<text x="${x(m)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#59636e">${m}분</text>`
  const lab = (c, t, row) => `<circle cx="${L + 14}" cy="${Tp + 16 + row * 18}" r="5" fill="${c}"/><text x="${L + 26}" y="${Tp + 20 + row * 18}" font-size="12" font-weight="700" fill="${c}">${t}</text>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-height:330px" role="img" aria-label="DBMS 4종 누적 완료율">${g}${fin('pg', PG, '#8c959f')}${fin('tg', OR, '#2e75b6')}${RUNS.map(cut).join('')}${lab('#2e75b6', `Oracle 끝 ${hms(OR)}`, 0)}${lab('#8c959f', `PostgreSQL 끝 ${hms(PG)}`, 1)}${RUNS.map((r, i) => lab(r.c, `${r.nm} 중단 ${pct(r.rows, T)}`, i + 2)).join('')}</svg>`
}

// 누적 완료율 선 그래프(SVG)
function chart() {
  const W = 560, H = 400, L = 40, B = 26, Tp = 10, Rr = 12
  const xmax = 150
  const x = m => L + (m / xmax) * (W - L - Rr)
  const y = p => Tp + (1 - p) * (H - Tp - B)
  const pts = k => [[0, 0], ...S.map(s => [s.min, s[k] / T])]
  const line = (k, c) => {
    // 끝 시각에서 100% 로 닫음
    const end = (k === 'pg' ? PG : OR) / 60
    const p = pts(k).filter(([m]) => m < end)
    p.push([end, 1])
    return `<polyline fill="none" stroke="${c}" stroke-width="2.6" points="${p.map(([m, v]) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>` + p.slice(1, -1).map(([m, v]) => `<circle cx="${x(m).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${c}"/>`).join('') + `<circle cx="${x(end).toFixed(1)}" cy="${y(1)}" r="5" fill="#fff" stroke="${c}" stroke-width="2.4"/>`
  }
  let g = ''
  for (let p = 0; p <= 1.0001; p += 0.25) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(p)}" y2="${y(p)}" stroke="#e5e7ea"/><text x="${L - 6}" y="${y(p) + 4}" text-anchor="end" font-size="11" fill="#59636e">${Math.round(p * 100)}%</text>`
  for (let m = 0; m <= xmax; m += 30) g += `<text x="${x(m)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#59636e">${m}분</text>`
  const lab = (c, t, row) => `<circle cx="${L + 14}" cy="${Tp + 18 + row * 20}" r="5" fill="${c}"/><text x="${L + 26}" y="${Tp + 22 + row * 20}" font-size="13" font-weight="700" fill="${c}">${t}</text>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="10분 단위 누적 완료율">${g}${line('pg', '#8c959f')}${line('tg', '#2e75b6')}${lab('#2e75b6', `Oracle 끝 ${hms(OR)}`, 0)}${lab('#8c959f', `PostgreSQL 끝 ${hms(PG)}`, 1)}</svg>`
}

const crumb = (a, b) => `<div class="crumb">Pi통신 과금 11억 행 적재<br>PostgreSQL · Oracle 비교<br>${b || a}</div>`
let page = 0
const slide = (title, gov, body, finding, src, extraCls = '') => {
  page++
  return `  <section class="slide ${extraCls}">
    <header><h2>${title}</h2>${crumb(title.replace(/^\d+\. /, ''))}</header>
    <p class="gov">${gov}</p>
    ${body}
    ${finding ? `<div class="finding">${finding}</div>` : ''}
    ${src ? `<p class="src">※ 출처 : ${src}</p>` : ''}
    <div class="pg">${page}</div>
  </section>
`
}

const S0 = (() => {
  page++
  return `  <section class="slide cover">
    <p>Pi통신 과금 시스템(pitel) 초기 데이터 적재 실증 · 2026-11-15</p>
    <h1>11억 행 초기 적재 : PostgreSQL 17 · Oracle 21c 비교</h1>
    <div class="big">${hms(PG)} → ${hms(OR)} <small>· ${ratio.toFixed(2)}배</small></div>
    <p>같은 생성 규칙 · 같은 작업 단위 2,086개 · 동시 7개 · 1,101,170,707행 · 준비 단계를 뺀 데이터 적재 시간</p>
    <p style="margin-top:18px;font-size:13px">근거 : PostgreSQL 적재 로그(2026-11-14 배율 1) · Oracle 적재 로그(2026-11-15 배율 1) · 테이블 214개 건수 대조 · Oracle 대기 이벤트(v$system_event) · 두 DB 크기 조회 · 테이블 133개 행당 비용 분석</p>
    <p style="font-size:13px">MS-SQL 2022 · MySQL 26.10 : 같은 방식으로 적재했으나 실행 환경 문제로 중단되어 테스트 불가(3 · 10장)</p>
    <p style="font-size:13px">생성 값 : 규칙(키 → 값 공식·분포·NULL 비율)은 같고, 난수 해시는 엔진 내장 함수(PostgreSQL hashint8extended · Oracle ORA_HASH)라 개별 값은 다르다</p>
  </section>
`
})()

const S1 = slide('1. 요약', `11억 행을 Oracle 은 <b>${hms(OR)}</b>, PostgreSQL 은 <b>${hms(PG)}</b>에 넣었다. Oracle 이 <b>${hms(PG - OR)}</b> 빨랐다`,
  `<div class="body" style="grid-template-rows:auto 1fr">
      <div class="kpis">
        <div class="kpi"><div class="v">${ratio.toFixed(2)}배</div><div class="l">데이터 적재 시간 Oracle ÷ PostgreSQL</div></div>
        <div class="kpi"><div class="v">100.0% · 실패 0</div><div class="l">두 DB 모두 1,101,170,707행 · 작업 단위 2,086개 완료</div></div>
        <div class="kpi"><div class="v">${gb(pgSizeAll)} · ${gb(orSizeAll)} GB</div><div class="l">데이터 크기 PostgreSQL · Oracle (인덱스 제외)</div></div>
      </div>
      <table>
        <tr><th>DBMS</th><th class="n">목표 건수</th><th class="n">적재(완료) 건수</th><th class="n">완료율</th><th class="n">적재 시간</th><th class="n">10분당 평균 적재</th><th class="n">10분당 최대 적재</th><th class="n">실패</th></tr>
        <tr><td>PostgreSQL 17.12</td><td class="n">${f(T)}</td><td class="n">${f(T)}</td><td class="n">100.0%</td><td class="n">${hms(PG)}</td><td class="n">${f(avgP)}</td><td class="n">${f(maxDP)}</td><td class="n">0</td></tr>
        <tr><td><b>Oracle 21.3 EE</b></td><td class="n">${f(T)}</td><td class="n">${f(T)}</td><td class="n">100.0%</td><td class="n"><b>${hms(OR)}</b></td><td class="n"><b>${f(avgO)}</b></td><td class="n">${f(maxDO)}</td><td class="n">0</td></tr>
        <tr><td>MS-SQL 2022</td><td class="n">${f(T)}</td><td class="n">${f(MS2.rows)}</td><td class="n">${pct(MS2.rows, T)}</td><td colspan="4"><span class="tbd">테스트 불가</span> : 메모리 이상 2회 중단(2차 기준 도달, 10장)</td></tr>
        <tr><td>MySQL 26.10</td><td class="n">${f(T)}</td><td class="n">${f(MY.rows)}</td><td class="n">${pct(MY.rows, T)}</td><td colspan="4"><span class="tbd">테스트 불가</span> : Docker Desktop 무응답으로 중단(10장)</td></tr>
      </table>
    </div>`,
  `<b>Key Finding</b> : 시간 차이는 디스크 쓰기에서 생기지 않았다. 두 DB 모두 세션 7개가 끝까지 계산으로 바빴고, 값을 만드는 생성식 계산 방식의 차이가 시간을 갈랐다(7~9장).`,
  `적재 로그 database/datagen_pitel-pg.log · oracle/out/full_load.log, 건수 대조 oracle/out/full_verify.log(${verify.replace(/ · \d+초$/, '')}). 10분당 평균 = 목표 건수 ÷ 적재 시간(10분 단위)`)

const S2 = slide('2. 10분 단위 적재 현황', `30분에 Oracle <b>${pct(S[2].tg, T)}</b> · PostgreSQL ${pct(S[2].pg, T)}, 110분에 Oracle <b>${pct(S[10].tg, T)}</b> · PostgreSQL ${pct(S[10].pg, T)} : Oracle 이 처음부터 앞섰다`,
  `<div class="body" style="grid-template-columns:1.18fr .82fr;gap:16px">
      <table class="tight">
        <tr><th class="n">경과</th><th class="n">PG 10분 적재</th><th class="n">PG 누적</th><th class="n">PG 완료율</th><th class="n">Oracle 10분 적재</th><th class="n">Oracle 누적</th><th class="n">Oracle 완료율</th></tr>
        ${rowsS.map(r => `<tr><td class="n">${r.min}분</td><td class="n">${f(r.dP)}</td><td class="n">${f(r.pg)}</td><td class="n">${pct(r.pg, T)}</td><td class="n">${r.dO ? f(r.dO) : '-'}</td><td class="n">${f(r.tg)}</td><td class="n"><b>${pct(r.tg, T)}</b></td></tr>`).join('\n        ')}
        <tr><th class="n">목표</th><th class="n" colspan="3">${f(T)}</th><th class="n" colspan="3">${f(T)}</th></tr>
      </table>
      <div class="box"><h3>누적 완료율</h3><div class="in" style="display:flex;align-items:center">${chart().replace('width="100%"', 'width="100%" style="max-height:330px"')}</div></div>
    </div>`,
  `<b>Key Finding</b> : 적재 건수는 끝난 작업 단위의 행 합이다. 큰 테이블의 작업 단위가 끝나는 10분 구간에서 적재 건수가 크게 뛴다(Oracle 110~120분 ${f(rowsS[11].dO)}행).`,
  `두 적재 로그의 작업 단위별 시작·완료 시각(bench/analyze.mjs). PostgreSQL 은 2026-11-14 실측, Oracle 은 2026-11-15 실측`)

const pctRun = (r, m) => (m * 60 <= r.last ? pct(r.at(m), T) : (m - 10) * 60 <= r.last ? `<span class="tbd">중단 ${Math.round(r.last / 60)}분</span>` : '')
const S2b = slide('3. DBMS 4종 10분 단위 완료율', `끝까지 간 DBMS 는 <b>Oracle · PostgreSQL</b> 두 개이고, <b>MS-SQL 2차 · MySQL</b> 은 중단 전까지 매 10분 두 DB 보다 앞섰다`,
  `<div class="body" style="grid-template-columns:1.18fr .82fr;gap:16px">
      <table class="tight">
        <tr><th class="n">경과</th><th class="n">PostgreSQL</th><th class="n">Oracle</th>${RUNS.map(r => `<th class="n">${r.nm}</th>`).join('')}</tr>
        ${S.map(s => `<tr><td class="n">${s.min}분</td><td class="n">${pct(s.pg, T)}</td><td class="n">${pct(s.tg, T)}</td>${RUNS.map(r => `<td class="n">${pctRun(r, s.min)}</td>`).join('')}</tr>`).join('\n        ')}
        <tr><th class="n">결과</th><th class="n">${hms(PG)}</th><th class="n">${hms(OR)}</th>${RUNS.map(r => `<th class="n"><span class="tbd">테스트 불가</span></th>`).join('')}</tr>
      </table>
      <div class="box"><h3>누적 완료율 (점선 = 중단된 실행)</h3><div class="in" style="display:flex;align-items:center">${chart4()}</div></div>
    </div>`,
  `<b>Key Finding</b> : MS-SQL · MySQL 의 중간 완료율은 참고값이다. 적재를 끝내지 못해 데이터 적재 시간을 비교할 수 없고, 비교 결론은 Oracle · PostgreSQL 두 DB 로만 낸다(10장).`,
  '네 DBMS 적재 로그의 작업 단위 완료 시각(같은 작업 단위 2,086개 · 같은 순서 · 동시 7개). 완료율 = 끝난 작업 단위의 행 합 ÷ 1,101,170,707')

const S3 = slide('4. 시험 조건', '규모·작업 단위·동시 수·적재 방식은 <b>같고</b>, 엔진 설정과 생성식 계산 방식이 <b>다르다</b>',
  `<div class="body"><table style="font-size:12.5px">
      <tr><th style="width:15%">항목</th><th>PostgreSQL</th><th>Oracle</th><th style="width:8%">판정</th></tr>
      <tr><td>제품</td><td>PostgreSQL 17.12 (Docker pitel-pg)</td><td>Oracle Database 21.3 Enterprise Edition (Docker oracle21c, PDB ORCLPDB)</td><td class="diff">다름</td></tr>
      <tr><td>규모</td><td colspan="2">배율 1 : 테이블 214개 · 파티션 2,306개 · 1,101,170,707행 · 칼럼 2,124개</td><td class="same">같음</td></tr>
      <tr><td>작업 단위·순서</td><td colspan="2">datagen.mjs run : 작업 단위 2,086개(테이블 × 연도) · 같은 순서 · 동시 7개(--jobs 7)</td><td class="same">같음</td></tr>
      <tr><td>적재 방식</td><td colspan="2">일반 INSERT … SELECT(대량 적재 힌트 없음), PK·인덱스·통계는 적재 뒤 단계(이번 비교에서 제외)</td><td class="same">같음</td></tr>
      <tr><td>생성 규칙</td><td colspan="2">키 → 값 공식 · 분포 · NULL 비율 · 편향 같음. 난수 해시만 엔진 내장 함수</td><td class="same">같음</td></tr>
      <tr><td>생성식 계산</td><td>SQL 함수 gen.* 21개 : 20개는 SQL 함수(플래너가 질의 안에 펼침), <b>가중 선택 gen.wpick 은 plpgsql</b>(펼치지 못하고 행마다 호출)</td><td>gen.* 를 모두 내장 함수 식(ORA_HASH · POWER · CASE)으로 펼침(oracle/inline.mjs), PL/SQL 호출 없음</td><td class="diff">다름</td></tr>
      <tr><td>키 생성</td><td>generate_series</td><td>CONNECT BY 행 생성기 2단 교차 결합(10만 × 묶음)</td><td class="diff">다름</td></tr>
      <tr><td>메모리</td><td>shared_buffers 2GB · work_mem 64MB</td><td>SGA 3GB(버퍼 캐시 2,336MB) · PGA 1,317MB(SGA:PGA 7:3)</td><td class="diff">다름</td></tr>
      <tr><td>로그·쓰기</td><td>WAL : max_wal_size 16GB · synchronous_commit off · full_page_writes on · wal_level logical</td><td>redo 4GB × 4 · DBWR 4 · filesystemio_options SETALL(비동기 I/O)</td><td class="diff">다름</td></tr>
      <tr><td>호스트</td><td colspan="2">같은 PC(CPU 8 · 메모리 15.7GB), 측정 중 다른 DB 컨테이너는 정지</td><td class="same">같음</td></tr>
    </table></div>`,
  null, 'pitel/REBUILD.md(2026-11-14 본 구축), pg_settings · v$parameter 조회(2026-11-15), datagen/00_gen_functions.sql, oracle/inline.mjs')

const S4 = slide('5. 주제영역별 결과', `7개 영역 가운데 <b>6개</b>에서 Oracle 작업 단위가 더 많은 행을 처리했고, <b>수납(INV)</b>은 PostgreSQL 이 빨랐다`,
  `<div class="body"><table style="font-size:12.5px">
      <tr><th>주제영역</th><th class="n">목표 행</th><th class="n">작업 단위</th><th class="n">PG 끝난 시각</th><th class="n">Oracle 끝난 시각</th><th class="n">PG 행/초</th><th class="n">Oracle 행/초</th><th class="n">배수</th><th class="n">PG 크기(GB)</th><th class="n">Oracle 크기(GB)</th></tr>
      ${A.areas.map(a => `<tr><td>${a.area} ${AREA_NM[a.area]}</td><td class="n">${f(a.target)}</td><td class="n">${a.pg.units}</td><td class="n">${Math.round(a.pg.end / 60)}분</td><td class="n">${Math.round(a.tg.end / 60)}분</td><td class="n">${f(a.pg.rps)}</td><td class="n">${f(a.tg.rps)}</td><td class="n ${a.tg.rps > a.pg.rps ? 'same' : 'diff'}">${(a.tg.rps / a.pg.rps).toFixed(2)}</td><td class="n">${gb(PG_SIZE[a.area])}</td><td class="n">${gb(oSize.sz[a.area])}</td></tr>`).join('\n      ')}
      <tr><th>합계</th><th class="n">${f(T)}</th><th class="n">2,086</th><th class="n">${Math.round(PG / 60)}분</th><th class="n">${Math.round(OR / 60)}분</th><th class="n">${f(T / A.pg.busy)}</th><th class="n">${f(T / A.tg.busy)}</th><th class="n">${(A.pg.busy / A.tg.busy).toFixed(2)}</th><th class="n">${gb(pgSizeAll)}</th><th class="n">${gb(orSizeAll)} (LOB ${gb(oSize.lob)} 포함)</th></tr>
    </table></div>`,
  `<b>Key Finding</b> : 데이터 크기는 ${gb(pgSizeAll)} GB · ${gb(orSizeAll)} GB 로 거의 같다(차이 ${((1 - orSizeAll / pgSizeAll) * 100).toFixed(1)}%). 두 DB 가 같은 양을 썼으므로 시간 차이는 쓰기 양에서 나오지 않았다.`,
  `행/초 = 영역 행 ÷ 그 영역 작업 단위 소요 합(세션 하나 기준), 배수 = Oracle ÷ PostgreSQL. 크기 PostgreSQL pg_table_size(인덱스 ${gb(PG_IDX)} GB 별도), Oracle dba_segments`)

const S5 = slide('6. 자원 사용', `두 DB 모두 세션 7개가 적재 시간의 <b>99.9%</b> 동안 일했고, Oracle 은 그 시간의 <b>${pct(tm['DB CPU'], tm['DB time'])}</b>를 CPU 계산에 썼다`,
  `<div class="body c2 tight">
      <div class="box"><h3>세션 가동 (두 적재 로그)</h3><div class="in"><table>
        <tr><th></th><th class="n">PostgreSQL</th><th class="n">Oracle</th></tr>
        <tr><td>적재 시간</td><td class="n">${f(PG)}초</td><td class="n">${f(OR)}초</td></tr>
        <tr><td>작업 단위 소요 합</td><td class="n">${f(A.pg.busy)}초</td><td class="n">${f(A.tg.busy)}초</td></tr>
        <tr><td>세션 가동률(소요 합 ÷ 7 ÷ 적재 시간)</td><td class="n">${pct(A.pg.busy / 7, PG)}</td><td class="n">${pct(A.tg.busy / 7, OR)}</td></tr>
        <tr><td>행 하나 평균(소요 합 ÷ 행)</td><td class="n">${f1((A.pg.busy / T) * 1e6)} µs</td><td class="n">${f1((A.tg.busy / T) * 1e6)} µs</td></tr>
        <tr><td>대기 이벤트</td><td class="n" colspan="2" style="text-align:center"><span class="tbd">[확인중 : PostgreSQL 은 2026-11-14 적재 때 대기 표본을 남기지 않음]</span></td></tr>
      </table></div></div>
      <div class="box"><h3>Oracle 인스턴스 통계 (시작 이후 누적, 적재 + 건수 대조 119초)</h3><div class="in"><table style="font-size:12px">
        <tr><td>DB time · DB CPU</td><td class="n">${f(tm['DB time'])}초 · ${f(tm['DB CPU'])}초 (${pct(tm['DB CPU'], tm['DB time'])})</td></tr>
        <tr><td>User I/O 대기 합</td><td class="n">${f(ioWait)}초 (${pct(ioWait, tm['DB time'])})</td></tr>
        ${ev.slice(0, 5).map(w => `<tr><td>&nbsp;&nbsp;${w[1]}</td><td class="n">${f(+w[4])}초 · ${f(+w[3])}회</td></tr>`).join('\n        ')}
        <tr><td>redo 생성 · 로그 전환</td><td class="n">${gb(st['redo size'])} GB · ${logSw}회</td></tr>
        <tr><td>데이터 파일 쓰기</td><td class="n">${gb(st['physical write total bytes'])} GB</td></tr>
        <tr><td>블록 변경</td><td class="n">${f(st['db block changes'])}회</td></tr>
      </table></div></div>
    </div>`,
  `<b>Key Finding</b> : Oracle 의 I/O 대기는 DB time 의 ${pct(ioWait, tm['DB time'])}다. 적재는 계산(CPU)이 묶은 작업이었고, 세션 하나가 행 하나에 쓴 시간이 ${f1((A.pg.busy / T) * 1e6)} µs → ${f1((A.tg.busy / T) * 1e6)} µs 로 줄어 전체 시간이 ${ratio.toFixed(2)}배가 되었다.`,
  'oracle/out/full_waits.txt(v$system_event · v$sys_time_model · v$sysstat · v$log_history, 2026-11-15 05:3x 조회), 인스턴스 시작 03:25:28(적재 시작 03:26:07)')

const S6 = slide('7. 행당 비용 분해', `행 하나의 비용을 나누면 PostgreSQL 은 <b>가중 선택 호출</b>(${FIT.pg.w} µs), Oracle 은 <b>행마다 드는 고정 비용</b>(${FIT.or.fixed} µs)이 크다`,
  `<div class="body c2">
      <div class="box"><h3>행 하나 비용 모형 (테이블 ${FIT.tables}개, µs/행)</h3><div class="in"><table>
        <tr><th>항목</th><th class="n">PostgreSQL</th><th class="n">Oracle</th><th class="n">배수</th></tr>
        <tr><td>행마다 고정 비용</td><td class="n">${FIT.pg.fixed}</td><td class="n"><b>${FIT.or.fixed}</b></td><td class="n diff">${(FIT.or.fixed / FIT.pg.fixed).toFixed(2)}</td></tr>
        <tr><td>가중 선택 1회(gen.wpick · gen.wcode)</td><td class="n"><b>${FIT.pg.w}</b></td><td class="n">${FIT.or.w}</td><td class="n same">${(FIT.or.w / FIT.pg.w).toFixed(2)}</td></tr>
        <tr><td>그 밖의 생성 함수 1회</td><td class="n">${FIT.pg.o}</td><td class="n">${FIT.or.o}</td><td class="n diff">${(FIT.or.o / FIT.pg.o).toFixed(2)}</td></tr>
        <tr><td>설명력(R²)</td><td class="n">${FIT.pg.r2}</td><td class="n">${FIT.or.r2}</td><td></td></tr>
      </table>
      <p style="font-size:12px;color:var(--sub);margin:8px 0 0">행 하나 시간 = 고정 + 가중 선택 수 × 단가 + 그 밖의 함수 수 × 단가. 두 DB 모두 20초 넘게 걸린 테이블로 최소제곱 추정</p></div></div>
      <div class="box"><h3>가중 선택 수에 따른 시간 배수 (Oracle ÷ PostgreSQL, 기하평균)</h3><div class="in bars">
        ${GROUP.map(g => `<div class="bar"><span>${g.k} (테이블 ${g.n}개)</span><div class="track ${g.r > 1 ? 'o' : 'w'}"><i style="width:${Math.min(100, (g.r / 2.4) * 100)}%"></i></div><b style="text-align:right">${g.r.toFixed(2)}배</b></div>`).join('\n        ')}
        <p style="font-size:12.5px;margin:12px 0 0">가중 선택이 없는 단순 테이블은 Oracle 이 <b>2.16배 느리고</b>, 3개 이상 쓰는 테이블은 Oracle 이 <b>0.57배</b> 시간에 끝난다. pitel 전체 칼럼에서 가중 선택은 ${plan.reduce((s, p) => s + (p.sql.match(/gen\.(wpick|wcode)\(/g) || []).length, 0)}곳, 행 × 호출은 ${f(WCALLS)}회다.</p>
      </div></div>
    </div>`,
  '<b>Key Finding</b> : 두 엔진의 강점이 반대로 나타났다. pitel 은 코드형 칼럼(상태·유형 코드)이 많아 가중 선택 호출이 많고, 이 비용이 큰 PostgreSQL 이 전체 시간에서 뒤졌다.',
  '테이블별 작업 단위 소요 합(두 적재 로그) ÷ 행 수, 함수 호출 수는 datagen/out/plan.json 생성 SQL 에서 셈. 가중 선택 = 코드 값을 비율대로 고르는 함수(예 상태코드 정상 90% · 정지 10%)')

const S7 = slide('8. 원인 분석', '시간 차이의 주원인은 <b>PostgreSQL 가중 선택 함수의 plpgsql 호출</b>이고, Oracle 의 <b>행당 고정 비용</b>이 그 이득의 일부를 깎았다',
  `<div class="body"><table style="font-size:12.5px">
      <tr><th style="width:4%">#</th><th style="width:24%">원인 후보</th><th>근거</th><th style="width:9%">가능성</th></tr>
      <tr><td>1</td><td>PostgreSQL gen.wpick 이 plpgsql 이라 질의 안에 펼쳐지지 못함</td><td>호출 1회 ${FIT.pg.w} µs(그 밖의 SQL 함수 ${FIT.pg.o} µs 의 ${(FIT.pg.w / FIT.pg.o).toFixed(0)}배). 가중 선택이 많은 테이블일수록 Oracle 이 빨라짐(0개 2.16배 → 3개 이상 0.57배). 고객 이력 ptl_cus_cust_h 는 0.32배</td><td><span class="tag t-h">높음</span></td></tr>
      <tr><td>2</td><td>Oracle 행마다 고정 비용이 PostgreSQL 의 2배</td><td>고정 비용 ${FIT.or.fixed} µs · ${FIT.pg.fixed} µs. 단순 테이블(가중 선택 0개) 5개 모두 Oracle 이 느림(가입 신청 상세 ptl_ord_sbsc_aply_d 3.14배). 후보 : CONNECT BY 행 생성기, 일반 INSERT 의 undo·redo 기록(블록 변경 ${f(st['db block changes'])}회). 둘의 몫은 나누어 재지 않음</td><td><span class="tag t-h">높음</span></td></tr>
      <tr><td>3</td><td>그 밖의 생성 함수 비용</td><td>Oracle ${FIT.or.o} µs · PostgreSQL ${FIT.pg.o} µs. 펼친 식에서 같은 해시를 CASE 분기마다 다시 계산(예 가중 선택 한 번에 ORA_HASH 가 선택지 수만큼). 영향은 고정 비용보다 작음</td><td><span class="tag t-m">중간</span></td></tr>
      <tr><td>4</td><td>디스크 쓰기 속도</td><td>Oracle I/O 대기 ${pct(ioWait, tm['DB time'])}, CPU ${pct(tm['DB CPU'], tm['DB time'])}. 두 DB 데이터 크기 ${gb(pgSizeAll)} · ${gb(orSizeAll)} GB 로 같음</td><td><span class="tag t-l">낮음</span></td></tr>
      <tr><td>5</td><td>메모리 크기(SGA 3GB · shared_buffers 2GB)</td><td>계산이 묶은 작업이고 읽기 대기가 작음(db file sequential read ${f(+ev.find(w => w[1] === 'db file sequential read')[4])}초)</td><td><span class="tag t-l">낮음</span></td></tr>
      <tr><td>6</td><td>실행 순서·동시성 차이</td><td>같은 작업 단위 2,086개·같은 순서·동시 7개, 두 DB 세션 가동률 99.9%</td><td><span class="tag t-l">배제</span></td></tr>
    </table></div>`,
  `<b>판단</b> : 이번 차이는 엔진 쓰기 성능보다 <b>생성식 계산 방식</b>에서 나왔다. 회귀로 추정하면 gen.wpick 을 SQL 식으로 바꿀 때 PostgreSQL 적재가 약 ${f((WCALLS * (FIT.pg.w - FIT.pg.o) * 1e-6) / 7 / 60)}분 줄어 Oracle 보다 빨라질 수 있다(추정, 11장 재측정으로 확정).`,
  '7장 비용 모형, 6장 Oracle 통계, oracle/out/full_analysis.json(테이블별 소요 비교)')

const fast = A.fastest.slice(0, 5), slow = A.slowest.slice(0, 5)
const gcount = t => (plan.find(p => p.tbl === t).sql.match(/gen\.(wpick|wcode)\(/g) || []).length
const S8 = slide('9. 테이블별 차이 사례', `Oracle 이 빠른 테이블 5개는 가중 선택을 <b>2~6개</b>, 느린 테이블 5개는 <b>0~2개</b> 쓴다`,
  `<div class="body c2">
      ${[['Oracle 이 빠른 테이블 5개', fast], ['Oracle 이 느린 테이블 5개', slow]].map(([h, L]) => `<div class="box"><h3>${h}</h3><div class="in"><table style="font-size:12px">
        <tr><th>테이블</th><th class="n">행</th><th class="n">가중 선택</th><th class="n">PG 초</th><th class="n">Oracle 초</th><th class="n">배수</th></tr>
        ${L.map(t => `<tr><td>${t.tbl}</td><td class="n">${f(t.rows)}</td><td class="n">${gcount(t.tbl)}</td><td class="n">${f(t.pg)}</td><td class="n">${f(t.tg)}</td><td class="n ${t.ratio < 1 ? 'same' : 'diff'}">${t.ratio.toFixed(2)}</td></tr>`).join('\n        ')}
      </table></div></div>`).join('\n      ')}
    </div>`,
  '<b>Key Finding</b> : 같은 Oracle 안에서도 테이블 성격에 따라 0.32배 ~ 3.14배로 갈린다. DBMS 비교는 전체 시간과 함께 테이블 성격별 배수를 같이 보아야 한다.',
  '테이블별 작업 단위 소요 합(두 DB 모두 30초 넘는 테이블), 배수 = Oracle ÷ PostgreSQL')

const S9b = slide('10. MS-SQL · MySQL 테스트 불가', `MS-SQL 2회 · MySQL 1회 모두 <b>실행 환경 문제</b>로 적재를 끝내지 못해 시간 비교에서 뺐다`,
  `<div class="body" style="grid-template-rows:auto 1fr">
      <table class="tight">
        <tr><th>실행</th><th>시각(KST)</th><th class="n">경과</th><th class="n">작업 단위</th><th class="n">완료 행</th><th class="n">완료율</th><th class="n">실패</th><th>중단 원인</th></tr>
        ${RUNS.map(r => `<tr><td>${r.nm}</td><td>${r.kst}</td><td class="n">${hms(r.last)}</td><td class="n">${f(r.units)} / 2,086</td><td class="n">${f(r.rows)}</td><td class="n">${pct(r.rows, T)}</td><td class="n">${r.fails}</td><td>${r.why}</td></tr>`).join('\n        ')}
      </table>
      <div class="c2" style="display:grid;gap:14px">
        <div class="box"><h3>MS-SQL 2022 조건과 조치</h3><div class="in"><ul>
          <li>메모리 상한 4,317 MB(Oracle SGA + PGA 와 같게), 로그 16 GB · SIMPLE, UTF-8 정렬</li>
          <li>VARCHAR(n) → varchar(n×3), CHAR(n) → nchar(n)(마스터 선택), 파티션 2,306개</li>
          <li>1차 중단 뒤 마스터 선택 : 문장별 메모리 상한 MAX_GRANT_PERCENT 12 · 페이지 잠금 PAGLOCK 을 넣고 처음부터 다시 적재</li>
          <li>2차는 메모리 대기가 풀렸으나(7문장 중 6개 실행) PC 메모리 부족으로 적재 프로세스가 끊겼다</li>
        </ul></div></div>
        <div class="box"><h3>MySQL 26.10 조건과 조치</h3><div class="in"><ul>
          <li>버퍼 풀 3,072 MB, redo 16 GB, 바이너리 로그 켬(기본값), utf8mb4</li>
          <li>MS-SQL 2차 중단을 막으려고 적재 프로그램을 Windows 독립 프로세스로 실행</li>
          <li>실패 0건으로 진행하다 Docker 엔진이 응답을 멈췄다. 이때 WSL 메모리 사용은 586 MB 로 줄어 있었다</li>
          <li>마스터 지시로 적재를 멈췄고, Docker 재시작 · DB 정리는 하지 않았다</li>
        </ul></div></div>
      </div>
    </div>`,
  `<b>판단</b> : MS-SQL 1차 중단은 엔진 메모리 설정(할당 · 잠금)에서, MS-SQL 2차와 MySQL 중단은 호스트(PC 메모리 16 GB · Docker · WSL)에서 생겼다. 재시험 전에 Docker · WSL 메모리 한도를 먼저 점검한다.`,
  'pitel/mssql/MSSQL_LOG.md · pitel/mysql/MYSQL_LOG.md, 적재 로그 mssql/out · mysql/out')

const S9 = slide('11. 시사점과 후속 조치', `11억 행 적재는 <b>Oracle ${hms(OR)} · PostgreSQL ${hms(PG)}</b>로 끝났고, <b>MS-SQL · MySQL</b> 은 실행 환경 문제로 테스트 불가였다`,
  `<div class="body c2">
      <div class="box"><h3>시사점</h3><div class="in"><ul>
        <li>DBMS 비교의 첫째 측정값은 <b>시간 · 작업 건수 · 완료율</b>이다. 10분 단위 표와 주제영역별 표를 같은 도구(bench/progress.mjs · bench/analyze.mjs)로 남긴다</li>
        <li>적재 시간은 엔진보다 <b>생성 방식</b>에 크게 흔들린다. 엔진마다 생성식을 바꿀 때는 함수가 질의 안에 펼쳐지는지(인라인)를 먼저 본다</li>
        <li>Oracle 은 행마다 고정 비용이 크다. 단순 테이블이 많은 업무는 PostgreSQL 이 유리하다</li>
        <li>두 DB 의 데이터 크기는 같다(${gb(pgSizeAll)} · ${gb(orSizeAll)} GB). 저장 공간은 DBMS 선택 기준에서 차이를 만들지 않았다</li>
      </ul></div></div>
      <div class="box"><h3>후속 조치</h3><div class="in"><table class="tight nw3">
        <tr><th>할 일</th><th>확정하는 것</th><th>상태</th></tr>
        <tr><td>MS-SQL · MySQL 재시험 : 호스트 메모리 16GB · Docker · WSL 메모리 한도 점검 뒤</td><td>DBMS 별 시간 · 건수 · 완료율</td><td>대기</td></tr>
        <tr><td>PostgreSQL gen.wpick SQL 식 판으로 표본 재측정</td><td>원인 1 의 크기(8장 추정 확인)</td><td>제안</td></tr>
        <tr><td>Oracle 행 생성기 단독 시간 측정</td><td>원인 2 의 몫(행 생성기 · undo/redo)</td><td>제안</td></tr>
        <tr><td>다음 적재부터 대기 표본 1분 간격 기록</td><td>6장 PostgreSQL 대기 공백 해소</td><td>제안</td></tr>
        <tr><td>PK · 인덱스 · 통계 단계 비교</td><td>적재 뒤 단계 시간</td><td>제안</td></tr>
      </table></div></div>
    </div>`,
  `<b>결론</b> : 같은 조건에서 Oracle 이 ${ratio.toFixed(2)}배 시간에 11억 행을 넣었다. 이 차이는 생성식 계산 방식에서 나왔으므로, 엔진 성능 결론은 재측정(PostgreSQL 가중 선택 SQL 식 판) 뒤에 확정한다.`,
  'dbms.pi docs/PRD.md 11.7(비교 방식 정본), docs/ROADMAP.md 실증 트랙')

const html = `<!DOCTYPE html>
<!-- Pi통신 과금 11억 행 초기 적재 비교 보고서 : PostgreSQL 17 ↔ Oracle 21c(배율 1, 2026-11-15). 근거 = pitel 적재 로그·oracle/out 측정 파일, 공개 경로라 비밀·개인 경로 금지 -->
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pi통신 과금 11억 행 적재 : PostgreSQL · Oracle 비교</title>
<style>
${CSS}
  .tight td, .tight th { padding:2px 6px; font-size:11.5px; line-height:1.35 }
  .tight .in { padding:6px 10px }
  .nw3 td:nth-child(3), .nw3 th:nth-child(3) { white-space:nowrap }
</style>
</head>
<body>
<main class="deck">
${S0}${S1}${S2}${S2b}${S3}${S4}${S5}${S6}${S7}${S8}${S9b}${S9}</main>
</body>
</html>
`
fs.writeFileSync(OUT, html)
console.log('ok', page, '장', html.length, 'bytes')
