// Oracle 생성식 인라인 : datagen Oracle 방언 SQL 의 gen.* 호출을 Oracle 내장 함수 식(ORA_HASH·POWER·NUMTODSINTERVAL·CASE)으로 펼친다
// 목적 : PostgreSQL 은 gen.* SQL 함수를 플래너가 질의 안에 펼쳐 C 함수로 계산한다. Oracle 도 같은 조건(SQL 엔진이 직접 계산, PL/SQL 호출 없음)으로 맞춘다
// 생성 규칙(키 → 값 공식·분포·NULL 비율·편향)은 datagen 과 같고, 난수 해시만 엔진 내장(PostgreSQL hashint8extended ↔ Oracle ORA_HASH)이라 값 자체는 다르다
// 쓰는 곳 : datagen/datagen.mjs run --target oracle. 시험 : node oracle/inline.mjs --selftest
const T0 = "TIMESTAMP '2010-01-01 00:00:00'"
const T1 = "TIMESTAMP '2026-10-31 23:59:59'"
const SPAN_SEC = 531187199 // t1 - t0 = 6147일 23:59:59
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

// 균등 난수 [0,1) : ORA_HASH 는 0..4294967295, BINARY_DOUBLE 로 나눠 IEEE 실수 계산
const U = (k, s) => `(ORA_HASH(${k}, 4294967295, ${s}) / 4294967296d)`
const uniform = (k, s, n) => `(1 + CAST(FLOOR(${U(k, s)} * ${n}) AS NUMBER))`
const skew = (k, s, n, a) => `LEAST(${n}, 1 + CAST(FLOOR(${n} * POWER(${U(k, s)}, ${a})) AS NUMBER))`
// 가중 선택 : PostgreSQL wpick 의 'r = u × 합, 앞에서부터 빼서 음수가 되는 첫 번째' = u < 누적합 ÷ 합 인 첫 번째
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
const recentDtm = (k, n) => `(${T0} + NUMTODSINTERVAL(${SPAN_SEC} * POWER((${k} - 1 + ${U(k, 7)}) / ${n}, 0.22d), 'SECOND'))`
const afterDtm = (p, k, s, d) => `LEAST(${T1}, ${p} + NUMTODSINTERVAL(${U(k, s)} * ${num(d) * 86400}, 'SECOND'))`
const tod = ts => `(${ts} - CAST(TRUNC(${ts}) AS TIMESTAMP))`
const monthEdge = (ts, k, s, p) =>
  `CASE WHEN ${U(k, s)} >= ${p} THEN ${ts} WHEN ${U(k, num(s) + 1)} < 0.5 THEN CAST(TRUNC(${ts}, 'MM') AS TIMESTAMP) + ${tod(ts)} ELSE CAST(LAST_DAY(TRUNC(${ts})) AS TIMESTAMP) + ${tod(ts)} END`
// repeat(unit, n) = REPLACE(RPAD('x', n, 'x'), 'x', unit) — CLOB 칼럼은 TO_CLOB 로(4,000바이트 넘음)
const memo = (k, s, p, len, lob) => {
  const unit = `('상담 메모 ' || TO_CHAR(${k}) || ' ')`
  const cnt = `(60 + ${uniform(k, num(s) + 1, 180)})`
  const rep = lob ? `REPLACE(TO_CLOB(RPAD('x', ${cnt}, 'x')), 'x', ${unit})` : `REPLACE(RPAD('x', LEAST(${cnt}, CEIL(${len} / LENGTH(${unit}))), 'x'), 'x', ${unit})`
  return `CASE WHEN ${U(k, s)} < ${p} THEN SUBSTR(${rep}, 1, ${len}) END`
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
  ymd: ts => `TO_CHAR(${ts}, 'YYYYMMDD')`,
  fmt: (pre, k, w) => `(${pre} || LPAD(TO_CHAR(${k}), ${w}, '0'))`,
  orphan: (pk, n, k, s) => `CASE WHEN ${U(k, s)} < 0.0005 THEN ${n} + 1 + MOD(${k}, ${Math.max(num(n), 1)}) ELSE ${pk} END`,
  person_nm: k => `(SUBSTR('${SUR}', ${skew(k, 11, 20, '2.0')}, 1) || SUBSTR('${GIV}', 2 * ${uniform(k, 12, 40)} - 1, 2))`,
  corp_nm: k =>
    `(SUBSTR('${CP1}', 2 * ${uniform(k, 13, 10)} - 1, 2) || CASE ${uniform(k, 14, 10)} ${CP2.map((v, i) => `WHEN ${i + 1} THEN ${q(v)}`).join(' ')} END || ${pickCase(k, 15, CP3.map(v => (v ? q(v) : 'NULL')), ['50', '20', '15', '10', '5'])})`,
  phone: k => `('010' || LPAD(TO_CHAR(${uniform(k, 16, 99999999)} - 1), 8, '0'))`,
  amt: (b, k, s) => `CASE WHEN ${U(k, s)} < 0.00001 THEN (${b}) * 1000 WHEN ${U(k, s)} < 0.00101 THEN -(${b}) ELSE (${b}) END`,
  dirty: (v, k, s, p) => `CASE WHEN ${U(k, s)} < ${p} THEN ' ' || ${v} || ' ' ELSE ${v} END`,
  memo: (k, s, p, len) => memo(k, s, p, num(len), false),
  memo_lob: (k, s, p, len) => memo(k, s, p, num(len), true),
  f2n: x => `(${x})`,
}

// gen.이름( … ) 을 안쪽부터 펼침. 문자열 상수 안의 글자는 건드리지 않는다
export function inlineGen(sql) {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'") {
      let j = i + 1
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1
      out += sql.slice(i, j + 1)
      i = j + 1
      continue
    }
    const m = /^gen\.(\w+)\(/.exec(sql.slice(i, i + 40))
    if (m && !/[\w.]/.test(sql[i - 1] || '')) {
      const { args, end } = splitArgs(sql, i + m[0].length)
      const f = T[m[1]]
      if (!f) throw new Error(`인라인 규칙 없음 : gen.${m[1]}`)
      out += f(...args.map(a => inlineGen(a.trim())))
      i = end + 1
      continue
    }
    out += ch
    i++
  }
  return out
}
// 여는 괄호 다음 위치 p 부터 짝 괄호까지 최상위 쉼표로 인자 분리
function splitArgs(s, p) {
  const args = []
  let depth = 0
  let start = p
  for (let i = p; i < s.length; i++) {
    const c = s[i]
    if (c === "'") {
      i++
      while (i < s.length && !(s[i] === "'" && s[i + 1] !== "'")) i += s[i] === "'" ? 2 : 1
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

// sqlplus 한 줄 상한 2,499자 : 문자열 상수 밖의 공백에서 줄을 나눈다
export function wrapLines(sql, max = 1800) {
  return sql
    .split('\n')
    .map(line => {
      if (line.length <= max) return line
      const parts = []
      let cur = ''
      let inQ = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (c === "'") inQ = !inQ
        if (c === ' ' && !inQ && cur.length >= max * 0.8) {
          parts.push(cur)
          cur = ''
          continue
        }
        cur += c
      }
      parts.push(cur)
      return parts.join('\n')
    })
    .join('\n')
}

if (process.argv[1] && process.argv[1].endsWith('inline.mjs') && process.argv.includes('--selftest')) {
  const assert = (await import('node:assert')).strict
  const x = inlineGen("gen.fmt('C', (gen.orphan(gen.skew(k, 11571, 23503, 6), 23503, k, 11572)), 7)")
  assert.ok(!/gen\./.test(x), '남은 gen 호출')
  assert.ok(x.includes('ORA_HASH(k, 4294967295, 11571)') && x.includes("LPAD(TO_CHAR("))
  const w = inlineGen("gen.wcode(k, 364, 'N|Y', '90|10')")
  assert.equal(w, "CASE WHEN (ORA_HASH(k, 4294967295, 364) / 4294967296d) < 0.9 THEN 'N' ELSE 'Y' END")
  assert.ok(!/gen\./.test(inlineGen("NVL(gen.memo_lob(k, 900, 0.005, 4000), TO_CLOB('메모' || ' ' || k))")))
  assert.equal(inlineGen("'gen.u(k, 1)' || gen.t0()"), "'gen.u(k, 1)' || " + T0)
  const long = wrapLines('a '.repeat(3000))
  assert.ok(long.split('\n').every(l => l.length <= 1800))
  console.log('inline selftest ok')
}
