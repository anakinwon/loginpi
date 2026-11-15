// MySQL 생성식 인라인 : datagen MySQL 방언 SQL 의 gen.* · to_char 호출을 MySQL 내장 식으로 펼친다(|| 연결은 세션 PIPES_AS_CONCAT 로 그대로 씀, lpad 는 MySQL LPAD 가 PostgreSQL 과 같은 의미라 그대로)
// 목적 : PostgreSQL·Oracle·MS-SQL 과 같은 조건 = SQL 엔진이 직접 계산, 사용자 함수 호출 없음
// 난수 해시는 MS-SQL 판(mssql/inline.mjs)과 같은 정수 곱셈·XOR·소수 나머지 3단 혼합. MySQL 은 ^ 가 * 보다 먼저 계산되어 괄호를 모두 적는다
// 쓰는 곳 : datagen/datagen.mjs run --target mysql. 시험 : node mysql/inline.mjs --selftest
const T0 = "TIMESTAMP '2010-01-01 00:00:00'"
const T1 = "TIMESTAMP '2026-10-31 23:59:59'"
const SPAN_SEC = 531187199
const SUR = '김이박최정강조윤장임한오서신권황안송류홍'
const GIV = '민준서연도윤서윤시우지우하준하은주원지유지호윤서지후채원준서수아준우지아현우서아도현다은건우예은우진수빈선우지민서진예린민재소율현준하린연우지원유준시은정우유나'
const CP1 = '한빛누리미래대한하나새솔다온푸른태양바른'
const CP2 = ['전자', '물산', '건설', '정보통신', '유통', '식품', '제약', '물류', '금융', '에너지']
const CP3 = ['(주)', '㈜', ' 주식회사', '', ' (유)']
const q = s => "'" + String(s).replace(/'/g, "''") + "'"
const lit = s => {
  const m = /^\s*'((?:[^']|'')*)'\s*$/.exec(s)
  if (!m) throw new Error(`문자열 상수 아님 : ${s.slice(0, 60)}`)
  return m[1].replace(/''/g, "'")
}
const num = s => {
  if (!/^\s*-?\d+(\.\d+)?\s*$/.test(s)) throw new Error(`숫자 상수 아님 : ${s.slice(0, 60)}`)
  return Number(s)
}

const U = (k, s) => `((((((((((${k}) * 1597334677 + (${s}) * 40503 + 12345) % 2147483647) ^ 1431655765) * 1103515245) % 2147483629) ^ 715827882) * 2046665341) % 2147483587) / 2147483587e0)`
const uniform = (k, s, n) => `(1 + CAST(FLOOR(${U(k, s)} * ${n}) AS SIGNED))`
const skew = (k, s, n, a) => `LEAST(${n}, 1 + CAST(FLOOR(${n} * POWER(${U(k, s)}, ${a})) AS SIGNED))`
function cumul(ws) {
  const w = ws.map(Number)
  const sum = w.reduce((a, b) => a + b, 0)
  let c = 0
  return w.map(x => (c += x) / sum)
}
const pickCase = (k, s, vals, ws) => {
  const c = cumul(ws)
  return `CASE ${vals.slice(0, -1).map((v, i) => `WHEN ${U(k, s)} < ${c[i]} THEN ${v}`).join(' ')} ELSE ${vals[vals.length - 1]} END`
}
const recentDtm = (k, n) => `DATE_ADD(${T0}, INTERVAL CAST(${SPAN_SEC}e6 * POWER(((${k}) - 1 + ${U(k, 7)}) / ${n}e0, 0.22e0) AS SIGNED) MICROSECOND)`
const afterDtm = (p, k, s, d) => `LEAST(${T1}, DATE_ADD(${p}, INTERVAL CAST(FLOOR(${U(k, s)} * ${num(d) * 86400}) AS SIGNED) SECOND))`
const monthEdge = (ts, k, s, p) =>
  `CASE WHEN ${U(k, s)} >= ${p} THEN ${ts} WHEN ${U(k, num(s) + 1)} < 0.5 THEN DATE_SUB(${ts}, INTERVAL DAY(${ts}) - 1 DAY) ELSE DATE_ADD(${ts}, INTERVAL DAY(LAST_DAY(${ts})) - DAY(${ts}) DAY) END`
const memo = (k, s, p, len) => {
  const unit = `CONCAT('상담 메모 ', ${k}, ' ')`
  const cnt = `(60 + ${uniform(k, num(s) + 1, 180)})`
  return `CASE WHEN ${U(k, s)} < ${p} THEN LEFT(REPEAT(${unit}, ${cnt}), ${len}) END`
}

const T = {
  t0: () => T0,
  t1: () => T1,
  u: (k, s) => U(k, s),
  uniform,
  skew,
  wpick: (k, s, w) => pickCase(k, s, lit(w).split('|').map((_, i) => String(i + 1)), lit(w).split('|')),
  wcode: (k, s, c, w) => pickCase(k, s, lit(c).split('|').map(q), lit(w).split('|')),
  recent_dtm: recentDtm,
  after_dtm: afterDtm,
  month_edge: monthEdge,
  ymd: ts => `DATE_FORMAT(${ts}, '%Y%m%d')`,
  fmt: (pre, k, w) => `CONCAT(${pre}, LPAD(${k}, ${w}, '0'))`,
  orphan: (pk, n, k, s) => `CASE WHEN ${U(k, s)} < 0.0005 THEN ${n} + 1 + MOD(${k}, ${Math.max(num(n), 1)}) ELSE ${pk} END`,
  person_nm: k => `CONCAT(SUBSTRING('${SUR}', ${skew(k, 11, 20, '2.0')}, 1), SUBSTRING('${GIV}', 2 * ${uniform(k, 12, 40)} - 1, 2))`,
  // 접미어 없음(빈 칸)은 NULL 대신 '' : MySQL CONCAT 은 NULL 이 섞이면 NULL
  corp_nm: k =>
    `CONCAT(SUBSTRING('${CP1}', 2 * ${uniform(k, 13, 10)} - 1, 2), CASE ${uniform(k, 14, 10)} ${CP2.map((v, i) => `WHEN ${i + 1} THEN ${q(v)}`).join(' ')} END, ${pickCase(k, 15, CP3.map(q), ['50', '20', '15', '10', '5'])})`,
  phone: k => `CONCAT('010', LPAD(${uniform(k, 16, 99999999)} - 1, 8, '0'))`,
  amt: (b, k, s) => `CASE WHEN ${U(k, s)} < 0.00001 THEN (${b}) * 1000 WHEN ${U(k, s)} < 0.00101 THEN -(${b}) ELSE (${b}) END`,
  dirty: (v, k, s, p) => `CASE WHEN ${U(k, s)} < ${p} THEN CONCAT(' ', ${v}, ' ') ELSE ${v} END`,
  memo: (k, s, p, len) => memo(k, s, p, num(len)),
  f2n: x => `CAST(${x} AS DECIMAL(38,10))`,
  to_char: (x, f) => {
    if (lit(f) !== 'YYYYMM') throw new Error(`to_char 형식 미지원 : ${f}`)
    return `DATE_FORMAT(${x}, '%Y%m')`
  },
}

export function inlineGen(sql) {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'") {
      const j = endQuote(sql, i)
      out += sql.slice(i, j + 1)
      i = j + 1
      continue
    }
    const m = /^(?:gen\.(\w+)|(to_char))\(/i.exec(sql.slice(i, i + 40))
    if (m && !/[\w.]/.test(sql[i - 1] || '')) {
      const name = m[1] || m[2].toLowerCase()
      const { args, end } = splitArgs(sql, i + m[0].length)
      const f = T[name]
      if (!f) throw new Error(`인라인 규칙 없음 : ${name}`)
      out += f(...args.map(a => inlineGen(a.trim())))
      i = end + 1
      continue
    }
    out += ch
    i++
  }
  return out
}
function endQuote(s, i) {
  let j = i + 1
  while (j < s.length && !(s[j] === "'" && s[j + 1] !== "'")) j += s[j] === "'" ? 2 : 1
  return j
}
function splitArgs(s, p) {
  const args = []
  let depth = 0
  let start = p
  for (let i = p; i < s.length; i++) {
    const c = s[i]
    if (c === "'") {
      i = endQuote(s, i)
      continue
    }
    if (c === '(') depth++
    else if (c === ')') {
      if (depth === 0) {
        args.push(s.slice(start, i))
        return { args: args.filter((a, j) => a.trim() || j > 0), end: i }
      }
      depth--
    } else if (c === ',' && depth === 0) {
      args.push(s.slice(start, i))
      start = i + 1
    }
  }
  throw new Error('괄호 짝 없음')
}

if (process.argv[1] && process.argv[1].endsWith('inline.mjs') && process.argv.includes('--selftest')) {
  const assert = (await import('node:assert')).strict
  const x = inlineGen("gen.fmt('C', (gen.orphan(gen.skew(k, 11571, 23503, 6), 23503, k, 11572)), 7)")
  assert.ok(!/gen\./.test(x), '남은 gen 호출')
  assert.equal(inlineGen("to_char(x, 'YYYYMM')"), "DATE_FORMAT(x, '%Y%m')")
  assert.ok(inlineGen("lpad(CAST(k AS CHAR), 2, '0')").startsWith('lpad('))
  console.log('mysql inline selftest ok')
}
