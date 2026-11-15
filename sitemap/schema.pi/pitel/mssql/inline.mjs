// MS-SQL 생성식 인라인 : datagen MS-SQL 방언 SQL 의 gen.* · lpad · to_char 호출을 T-SQL 내장 식으로 펼치고, || 연결을 CONCAT 으로 바꾼다
// 목적 : PostgreSQL(SQL 함수를 질의 안에 펼침)·Oracle(oracle/inline.mjs)과 같은 조건 = SQL 엔진이 직접 계산, 사용자 함수 호출 없음
// 생성 규칙(키 → 값 공식·분포·NULL 비율·편향)은 datagen 과 같다. 난수 해시는 T-SQL 에 시드 해시 함수가 없어 정수 곱셈·XOR·소수 나머지 3단 혼합(인자를 한 번만 씀)이라 값 자체는 다르다
// 쓰는 곳 : datagen/datagen.mjs run --target mssql. 시험 : node mssql/inline.mjs --selftest
const T0 = "CAST('2010-01-01T00:00:00' AS datetime2(6))"
const T1 = "CAST('2026-10-31T23:59:59' AS datetime2(6))"
const SPAN_SEC = 531187199 // t1 - t0
const SUR = '김이박최정강조윤장임한오서신권황안송류홍'
const GIV = '민준서연도윤서윤시우지우하준하은주원지유지호윤서지후채원준서수아준우지아현우서아도현다은건우예은우진수빈선우지민서진예린민재소율현준하린연우지원유준시은정우유나'
const CP1 = '한빛누리미래대한하나새솔다온푸른태양바른'
const CP2 = ['전자', '물산', '건설', '정보통신', '유통', '식품', '제약', '물류', '금융', '에너지']
const CP3 = ['(주)', '㈜', ' 주식회사', '', ' (유)']
const VMAX = 8000 // varchar(n) 바이트 상한. UTF-8 한글 3바이트
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

// 균등 난수 [0,1) : 상수는 모두 int 범위(곱이 bigint 안에서 넘치지 않음), 인자 k 는 식에 한 번만 나온다(중첩 식 중복 방지)
const U = (k, s) => `(((((((${k}) * 1597334677 + (${s}) * 40503 + 12345) % 2147483647 ^ 1431655765) * 1103515245) % 2147483629 ^ 715827882) * 2046665341) % 2147483587 / 2147483587e0)`
const uniform = (k, s, n) => `(1 + CAST(FLOOR(${U(k, s)} * ${n}) AS bigint))`
const skew = (k, s, n, a) => `LEAST(${n}, 1 + CAST(FLOOR(${n} * POWER(${U(k, s)}, ${a})) AS bigint))`
function cumul(ws) {
  const w = ws.map(Number)
  const sum = w.reduce((a, b) => a + b, 0)
  let c = 0
  return w.map(x => (c += x) / sum)
}
// 가중 선택 : u < 누적합 ÷ 합 인 첫 번째(PostgreSQL wpick 과 같은 규칙)
const pickCase = (k, s, vals, ws) => {
  const c = cumul(ws)
  return `CASE ${vals.slice(0, -1).map((v, i) => `WHEN ${U(k, s)} < ${c[i]} THEN ${v}`).join(' ')} ELSE ${vals[vals.length - 1]} END`
}
// 키 → 일시 : t0 + 초(소수점 아래는 마이크로초로 더함)
const recentDtm = (k, n) => {
  const sec = `(${SPAN_SEC} * POWER(((${k}) - 1 + ${U(k, 7)}) / ${n}e0, 0.22e0))`
  return `DATEADD(microsecond, CAST((${sec} - FLOOR(${sec})) * 1000000 AS int), DATEADD(second, CAST(FLOOR(${sec}) AS int), ${T0}))`
}
const afterDtm = (p, k, s, d) => `LEAST(${T1}, DATEADD(second, CAST(FLOOR(${U(k, s)} * ${num(d) * 86400}) AS int), ${p}))`
// 같은 달 1일·말일 + 같은 시각 : 날짜만 옮겨 시각을 유지
const monthEdge = (ts, k, s, p) =>
  `CASE WHEN ${U(k, s)} >= ${p} THEN ${ts} WHEN ${U(k, num(s) + 1)} < 0.5 THEN DATEADD(day, 1 - DAY(${ts}), ${ts}) ELSE DATEADD(day, DAY(EOMONTH(${ts})) - DAY(${ts}), ${ts}) END`
// lpad(x, w, '0') : 길면 앞 w 글자(PostgreSQL lpad 와 같음), 짧으면 왼쪽 0 채움
const lpad = (x, w, ch = "'0'") => {
  const v = `CAST(${x} AS varchar(60))`
  return `(CASE WHEN LEN(${v}) >= ${w} THEN LEFT(${v}, ${w}) ELSE RIGHT(REPLICATE(${ch}, ${w}) + ${v}, ${w}) END)`
}
const memo = (k, s, p, len) => {
  const big = len * 3 > VMAX
  const unit = `CAST(CONCAT('상담 메모 ', ${k}, ' ') AS varchar(${big ? 'max' : '100'}))`
  const cnt = `(60 + ${uniform(k, num(s) + 1, 180)})`
  return `CASE WHEN ${U(k, s)} < ${p} THEN LEFT(REPLICATE(${unit}, ${cnt}), ${len}) END`
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
  ymd: ts => `CONVERT(char(8), ${ts}, 112)`,
  fmt: (pre, k, w) => `CONCAT(${pre}, ${lpad(k, num(w))})`,
  orphan: (pk, n, k, s) => `CASE WHEN ${U(k, s)} < 0.0005 THEN ${n} + 1 + (${k}) % ${Math.max(num(n), 1)} ELSE ${pk} END`,
  person_nm: k => `CONCAT(SUBSTRING('${SUR}', ${skew(k, 11, 20, '2.0')}, 1), SUBSTRING('${GIV}', 2 * ${uniform(k, 12, 40)} - 1, 2))`,
  corp_nm: k =>
    `CONCAT(SUBSTRING('${CP1}', 2 * ${uniform(k, 13, 10)} - 1, 2), CASE ${uniform(k, 14, 10)} ${CP2.map((v, i) => `WHEN ${i + 1} THEN ${q(v)}`).join(' ')} END, ${pickCase(k, 15, CP3.map(v => (v ? q(v) : 'NULL')), ['50', '20', '15', '10', '5'])})`,
  phone: k => `CONCAT('010', ${lpad(`${uniform(k, 16, 99999999)} - 1`, 8)})`,
  amt: (b, k, s) => `CASE WHEN ${U(k, s)} < 0.00001 THEN (${b}) * 1000 WHEN ${U(k, s)} < 0.00101 THEN -(${b}) ELSE (${b}) END`,
  dirty: (v, k, s, p) => `CASE WHEN ${U(k, s)} < ${p} THEN CONCAT(' ', ${v}, ' ') ELSE ${v} END`,
  memo: (k, s, p, len) => memo(k, s, p, num(len)),
  f2n: x => `CAST(${x} AS decimal(38,10))`,
  // datagen 이 방언 밖에서 그대로 쓰는 함수
  lpad: (x, w, ch) => lpad(x, num(w), ch),
  to_char: (x, f) => {
    if (lit(f) !== 'YYYYMM') throw new Error(`to_char 형식 미지원 : ${f}`)
    return `CONVERT(char(6), ${x}, 112)`
  },
}

// 함수 호출(gen.이름 · lpad · to_char)을 안쪽부터 펼침. 문자열 상수 안의 글자는 건드리지 않는다
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
    const m = /^(?:gen\.(\w+)|(lpad|to_char))\(/i.exec(sql.slice(i, i + 40))
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
// 여는 괄호 다음 위치 p 부터 짝 괄호까지 최상위 쉼표로 인자 분리
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

// a || b || c → CONCAT(a, b, c) : 괄호 단위로 안쪽부터, 최상위 쉼표로 나눈 조각마다 적용
export function concatFix(s) {
  // 괄호 안 먼저
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'") {
      const j = endQuote(s, i)
      out += s.slice(i, j + 1)
      i = j
      continue
    }
    if (c === '(') {
      let depth = 0
      let j = i
      for (; j < s.length; j++) {
        if (s[j] === "'") {
          j = endQuote(s, j)
          continue
        }
        if (s[j] === '(') depth++
        else if (s[j] === ')' && --depth === 0) break
      }
      out += '(' + concatFix(s.slice(i + 1, j)) + ')'
      i = j
      continue
    }
    out += c
  }
  // 최상위 쉼표 조각마다 || 분리
  const parts = splitTop(out, ',')
  return parts.map(p => {
    const xs = splitTop(p, '||')
    return xs.length > 1 ? `${xs[0].match(/^\s*/)[0]}CONCAT(${xs.map(x => x.trim()).join(', ')})` : p
  }).join(',')
}
function splitTop(s, sep) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'") {
      i = endQuote(s, i)
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && s.startsWith(sep, i)) {
      out.push(s.slice(start, i))
      start = i + sep.length
      i += sep.length - 1
    }
  }
  out.push(s.slice(start))
  return out
}

if (process.argv[1] && process.argv[1].endsWith('inline.mjs') && process.argv.includes('--selftest')) {
  const assert = (await import('node:assert')).strict
  const x = inlineGen("gen.fmt('C', (gen.orphan(gen.skew(k, 11571, 23503, 6), 23503, k, 11572)), 7)")
  assert.ok(!/gen\./.test(x), '남은 gen 호출')
  assert.equal(inlineGen("gen.wcode(k, 364, 'N|Y', '90|10')").startsWith('CASE WHEN ((((((('), true)
  assert.equal(concatFix("'a' || gen.uniform(k, 1, 9)"), "CONCAT('a', gen.uniform(k, 1, 9))")
  assert.equal(concatFix("left('x' || ' ' || k, 5)"), "left(CONCAT('x', ' ', k), 5)")
  assert.equal(concatFix("f(a, 'p||q' || b)"), "f(a, CONCAT('p||q', b))")
  assert.equal(inlineGen("to_char(x, 'YYYYMM')"), 'CONVERT(char(6), x, 112)')
  assert.ok(inlineGen("lpad(CAST(k AS varchar(40)), 2, '0')").includes('REPLICATE'))
  console.log('mssql inline selftest ok')
}
