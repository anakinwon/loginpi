// DBMS 4종 11억 행 적재 실증의 실행 기록 · 문제 해결(Troubleshoot) 보고서 생성 : bench/TEST_RECORD.md 의 표를 그대로 읽어 장표 HTML 로 만든다(내용 정본 = TEST_RECORD.md)
// 실행 : node bench/report-troubleshoot.mjs ../public/restore/dbms_load_troubleshoot.html
import fs from 'node:fs'

const OUT = process.argv[2]
if (!OUT) throw new Error('사용 : node bench/report-troubleshoot.mjs <출력 html>')
const CSS = fs.readFileSync(new URL('./deck.css', import.meta.url), 'utf8')
const MD = fs.readFileSync(new URL('./TEST_RECORD.md', import.meta.url), 'utf8').split('\n')

// 마크다운 → HTML 조각 : `코드`, **굵게**, 이스케이프
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
const cells = l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replaceAll('\\|', '|'))
// 제목(접두 일치) 아래 첫 표
function table(head) {
  const i = MD.findIndex(l => l.startsWith(head))
  if (i < 0) throw new Error(`제목 없음 : ${head}`)
  let j = i + 1
  while (!MD[j].startsWith('|')) j++
  const rows = []
  for (; j < MD.length && MD[j].startsWith('|'); j++) rows.push(cells(MD[j]))
  return { th: rows[0], align: rows[1].map(a => (a.endsWith(':') ? 'n' : '')), rows: rows.slice(2) }
}
// 제목 아래 첫 단락(표 · 코드 앞)
function para(head) {
  const i = MD.findIndex(l => l.startsWith(head))
  const out = []
  for (let j = i + 1; j < MD.length && !MD[j].startsWith('#') && !MD[j].startsWith('|') && !MD[j].startsWith('```'); j++) if (MD[j].trim()) out.push(MD[j].trim())
  return out.join(' ')
}
// 제목 아래 첫 표 다음 문단
function after(head) {
  const i = MD.findIndex(l => l.startsWith(head))
  let j = i + 1
  while (!MD[j].startsWith('|')) j++
  while (MD[j].startsWith('|')) j++
  const out = []
  for (; j < MD.length && !MD[j].startsWith('#') && !MD[j].startsWith('|'); j++) if (MD[j].trim()) out.push(MD[j].trim())
  return out.join(' ')
}
function code(head) {
  const i = MD.findIndex(l => l.startsWith(head))
  const a = MD.findIndex((l, j) => j > i && l.startsWith('```'))
  const b = MD.findIndex((l, j) => j > a && l.startsWith('```'))
  return MD.slice(a + 1, b).join('\n')
}
const htmlTable = (t, cls = 'tight', widths = []) =>
  `<table class="${cls}"><tr>${t.th.map((h, i) => `<th class="${t.align[i]}"${widths[i] ? ` style="width:${widths[i]}"` : ''}>${inline(h)}</th>`).join('')}</tr>${t.rows.map(r => `<tr>${r.map((c, i) => `<td class="${t.align[i]}">${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`

let page = 0
const slide = (title, gov, body, finding, src) => {
  page++
  return `  <section class="slide">
    <header><h2>${title}</h2><div class="crumb">DBMS 4종 11억 행 적재 실증<br>실행 기록 · 문제 해결<br>${title.replace(/^\d+\. /, '')}</div></header>
    <p class="gov">${gov}</p>
    <div class="body">${body}</div>
    ${finding ? `<div class="finding">${finding}</div>` : ''}
    ${src ? `<p class="src">※ 출처 : ${src}</p>` : ''}
    <div class="pg">${page}</div>
  </section>
`
}

const R = table('## 1. 결과 한눈에')
const H = table('## 2. 실행 이력')
const TS = ['### 3.1', '### 3.2', '### 3.3', '### 3.4', '### 3.5'].map(table)
const nTs = TS.reduce((s, t) => s + t.rows.length, 0)
const W = ['7%', '22%', '25%', '23%', '23%']
const src = 'pitel/bench/TEST_RECORD.md(내용 정본), DBMS 별 실행 기록 oracle/S1_LOG.md · mssql/MSSQL_LOG.md · mysql/MYSQL_LOG.md'

page++
const cover = `  <section class="slide cover">
    <p>Pi통신 과금 시스템(pitel) 초기 데이터 적재 실증 · 2026-11-15</p>
    <h1>DBMS 4종 11억 행 적재 : 실행 기록과 문제 해결</h1>
    <div class="big">실행 ${H.rows.length}회 · 문제 해결 ${nTs}건</div>
    <p>PostgreSQL 17 · Oracle 21c 완료, MS-SQL 2022 · MySQL 26.10 테스트 불가</p>
    <p style="margin-top:18px;font-size:13px">목적 : 다음 재시험 때 같은 문제를 다시 겪지 않도록 증상 · 원인 · 조치 · 다음에 할 일을 남긴다</p>
    <p style="font-size:13px">결과 보고서 : compare_pos_with_Oracle_scale1.html · 비교 방식 정본 : dbms.pi PRD 11.7</p>
  </section>
`
const s1 = slide('1. 요약', '끝까지 적재한 DBMS 는 <b>PostgreSQL · Oracle</b> 두 개이고, <b>MS-SQL · MySQL</b> 은 실행 환경 문제로 끝내지 못했다',
  `${htmlTable(R, '')}<p style="font-size:13px;margin:10px 0 0">${inline(after('## 1. 결과 한눈에'))}</p>`,
  '<b>Key Finding</b> : 비교 결론은 Oracle · PostgreSQL 두 DB 로만 낸다. 나머지 두 DBMS 는 6장 점검표를 통과한 뒤 다시 시험한다.', src)
const s2 = slide('2. 실행 이력', `${H.rows.length}회 가운데 <b>완료는 2회</b>(PostgreSQL · Oracle 5번), 나머지는 중단 또는 실패 사례다`,
  htmlTable(H),
  `<b>Key Finding</b> : ${inline(after('## 2. 실행 이력'))}`, src)
const tsSlide = (n, nm, t, gov) => slide(`${n}. 문제 해결 : ${nm}`, gov, htmlTable(t, 'tight', W), null, src)
const s3 = tsSlide(3, '진행 방식', TS[0], '진행 방식의 실수 4건은 모두 <b>요청 조건을 그대로 지키지 않은 데서</b> 나왔다')
const s4 = tsSlide(4, 'Oracle 21c', TS[1], 'Oracle 은 <b>컨테이너 제약(NATIVE 컴파일 · OMF)</b> 과 <b>쓰기 설정(DBWR · 비동기 I/O)</b> 을 먼저 맞춰야 한다')
const s5 = tsSlide(5, 'MS-SQL 2022', TS[2], 'MS-SQL 은 <b>메모리 할당 · 잠금 메모리</b> 가 대량 동시 적재의 첫 병목이다')
const s6 = tsSlide(6, 'MySQL 26.10', TS[3], 'MySQL 은 <b>연산자 · 연결 · 이름 규칙</b> 차이를 맞춘 뒤 실패 0 으로 진행했고, <b>Docker 무응답</b> 으로 멈췄다')
const s7 = tsSlide(7, '실행 환경 · 도구', TS[4], '도구 쪽 문제는 모두 고쳤고, 재시험 절차(9장)에 반영했다')
const s8 = slide('8. DBMS 별 설정 대응표', '다음 시험은 이 설정에서 출발한다', htmlTable(table('## 4.'), 'tight'), null, src)
const s9 = slide('9. 재시험 절차', '준비 → 기능 점검 → 독립 프로세스 적재 → 5분 진행 보고 → 건수 대조 순서를 <b>그대로 따른다</b>',
  `<pre style="margin:0;background:var(--soft);border:1px solid var(--line);border-radius:4px;padding:10px 12px;font-size:11.5px;line-height:1.5;white-space:pre-wrap;overflow:hidden">${esc(code('## 5.'))}</pre>`,
  '<b>Key Finding</b> : 기능 점검(키 2,000개) 뒤에는 DB 를 다시 만들고, 방언 plan 을 만든 뒤에는 PostgreSQL plan 을 복원한다(TS-26).', src)
const s10 = slide('10. 재시험 전 점검표', '9개 항목을 모두 통과해야 <b>배율 1 적재를 시작</b>한다', htmlTable(table('## 6.'), 'tight'), '<b>판단</b> : MS-SQL · MySQL 재시험의 첫 관문은 1 · 2번(PC 여유 메모리, WSL · Docker 메모리 한도)이다.', src)
const inv = table('## 7.')
const s11 = slide('11. 분석 사례 : 수납(INV) 은 왜 PostgreSQL 이 빨랐나', '수납 영역은 <b>가중 선택이 적고 일반 함수가 많아</b> Oracle 의 행당 고정 비용이 드러났다',
  `<div class="c2" style="display:grid;gap:14px"><div>${htmlTable(inv, 'tight')}</div><div class="box"><h3>근거</h3><div class="in" style="font-size:12.5px">${inline(para('## 7.'))}<br><br>${inline(after('## 7.'))}</div></div></div>`,
  null, '결과 보고서 7장(행당 비용 분해) · 9장(테이블별 차이 사례), 두 적재 로그의 테이블별 소요 합')
const s12 = slide('12. 결론과 후속 조치', '두 DBMS 의 결과와 30건의 문제 해결 기록을 남겼고, <b>재시험은 점검표 통과 뒤</b> 한다',
  `<div class="c2" style="display:grid;gap:14px">
      <div class="box"><h3>결론</h3><div class="in"><ul>
        <li>같은 조건에서 Oracle 이 PostgreSQL 의 0.83배 시간(7,120초 · 8,569초)에 11억 행을 넣었다</li>
        <li>MS-SQL 은 엔진 메모리 설정(1차)과 PC 메모리 부족(2차)으로, MySQL 은 Docker 무응답으로 끝내지 못했다</li>
        <li>중단 전까지의 중간 완료율은 참고값이며 비교 결론에 쓰지 않는다</li>
      </ul></div></div>
      <div class="box"><h3>후속 조치</h3><div class="in"><table class="tight">
        <tr><th>할 일</th><th>확정하는 것</th></tr>
        <tr><td>WSL · Docker 메모리 한도 조정, PC 여유 메모리 확보(10장 1 · 2번)</td><td>재시험 가능 여부</td></tr>
        <tr><td>MS-SQL · MySQL 배율 1 재시험(9장 절차)</td><td>DBMS 별 데이터 적재 시간</td></tr>
        <tr><td>PostgreSQL 가중 선택 SQL 식 판 재측정</td><td>엔진 성능과 생성 방식의 몫 분리</td></tr>
        <tr><td>PK · 인덱스 · 통계 단계 비교</td><td>적재 뒤 단계 시간</td></tr>
      </table></div></div>
    </div>`,
  '<b>결론</b> : 이번 실증의 가장 큰 교훈은 실행 환경(메모리 · Docker)이다. 재시험 전에 환경부터 점검한다.', src)

const html = `<!DOCTYPE html>
<!-- DBMS 4종 11억 행 적재 실증 : 실행 기록 · 문제 해결 보고서. 생성기 pitel/bench/report-troubleshoot.mjs, 내용 정본 pitel/bench/TEST_RECORD.md. 공개 경로라 비밀 · 개인 경로 금지 -->
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DBMS 4종 11억 행 적재 : 실행 기록과 문제 해결</title>
<style>
${CSS}
  .tight td, .tight th { padding:2px 6px; font-size:11px; line-height:1.35 }
  code { font-family:Consolas, monospace; font-size:.92em; background:var(--soft); padding:0 3px; border-radius:2px }
</style>
</head>
<body>
<main class="deck">
${cover}${s1}${s2}${s3}${s4}${s5}${s6}${s7}${s8}${s9}${s10}${s11}${s12}</main>
</body>
</html>
`
fs.writeFileSync(OUT, html)
console.log('ok', page, '장', html.length, 'bytes', '문제 해결', nTs, '건')
