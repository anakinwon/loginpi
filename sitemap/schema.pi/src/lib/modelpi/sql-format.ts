// SQL 편집기 들여쓰기(순수, 2026-10-18 마스터 지시 "SQL 편집 시 들여쓰기 자동") — 강(river) 정렬 : 절 키워드 끝을 SELECT 끝(6열)에 맞춤
//   SELECT a        ← 키워드 끝 = 6열
//        , b        ← 쉼표 = 그 절 내용 열 − 2(항목이 첫 항목 아래) : SELECT 6열, GROUP BY·ORDER BY 9열
//     FROM t
//    WHERE x = 1
//      AND y = 2
//    GROUP BY a     ← 두 단어 키워드는 첫 단어 기준
//     ;             ← 문장 끝 ; = 2칸
// riverIndent = 줄 첫 낱말로 들여쓰기(입력 중 정렬), contIndent = Enter 다음 줄(내용 열 7), riverFormat = 문장 다시 배치(정렬 버튼·Ctrl+Shift+F)
import { KW, maskSql, type Dialect } from './sql-split.ts'

export const RIVER = 6
// 줄 맨 앞에 오면 강 정렬하는 절 키워드
const RIVER_KW = new Set(('SELECT FROM WHERE AND OR GROUP ORDER HAVING LIMIT OFFSET FETCH UNION INTERSECT EXCEPT MINUS JOIN INNER LEFT RIGHT FULL CROSS NATURAL ON USING ' +
  'SET VALUES INTO UPDATE DELETE INSERT MERGE RETURNING WITH WINDOW').split(' '))

// 줄의 첫 낱말·쉼표·; 로 원하는 들여쓰기 칸 수 — 해당 없으면 null
export function riverIndent(line: string): number | null {
  const t = line.trimStart()
  if (t.startsWith(',')) return RIVER - 1
  if (t.startsWith(';')) return 2
  const w = /^([A-Za-z]+)\b/.exec(t)?.[1]?.toUpperCase()
  return w && RIVER_KW.has(w) ? Math.max(0, RIVER - w.length) : null
}

// 줄의 내용 시작 열(0부터) — 절 키워드(+ BY) 뒤 첫 글자, 쉼표 줄은 ', ' 뒤. 해당 없으면 null
export function contentCol(line: string): number | null {
  const c = /^(\s*,\s*)(?=\S)/.exec(line)
  if (c) return c[1].length
  const m = /^(\s*)([A-Za-z]+)((?:\s+BY)?)(\s+)(?=\S)/i.exec(line)
  return m && RIVER_KW.has(m[2].toUpperCase()) ? m[0].length : null
}

// 줄 맨 앞 쉼표 들여쓰기 — 위로 가장 가까운 절 줄(쉼표·AND·OR·ON 줄 제외)의 내용 열 − 2(항목이 첫 항목 아래 오게)
export function commaIndent(prev: string[]): number {
  for (let k = prev.length - 1; k >= 0; k--) {
    const l = prev[k], w = /^\s*([A-Za-z]+)/.exec(l)?.[1]?.toUpperCase()
    if (!w || ['AND', 'OR', 'ON'].includes(w) || riverIndent(l) == null) continue
    const c = contentCol(l)
    return c == null ? RIVER - 1 : Math.max(0, c - 2)
  }
  return RIVER - 1
}

// Enter 다음 줄 들여쓰기 — 절 키워드·쉼표 줄 다음은 그 줄의 내용 열, 키워드만 있는 줄은 7, 그 밖은 이전 줄과 같게
export function contIndent(line: string): number {
  const c = contentCol(line)
  if (c != null) return c
  if (riverIndent(line) != null && !line.trimStart().startsWith(';')) return RIVER + 1
  return line.length - line.trimStart().length
}

// 괄호 밖(깊이 0)에서 줄을 나누는 키워드, 쉼표로 줄을 나누는 절
const BREAK = new Set(('SELECT FROM WHERE AND OR GROUP ORDER HAVING LIMIT OFFSET FETCH UNION INTERSECT EXCEPT MINUS JOIN INNER LEFT RIGHT FULL CROSS NATURAL ON USING ' +
  'SET VALUES RETURNING WINDOW').split(' '))
const JOIN_PRE = new Set(['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'OUTER'])
const COMMA_CLAUSE = new Set(['SELECT', 'GROUP', 'ORDER', 'SET', 'RETURNING'])
const COND = new Set(['AND', 'OR', 'ON', 'USING']) // 절을 바꾸지 않는 줄바꿈

// 문장 다시 배치 — 문자열·괄호 안(하위 질의)·CASE…END·BETWEEN…AND 는 그대로, 키워드는 대문자
// 주석이 있으면 줄 나눔은 그대로 두고 각 줄 들여쓰기만 맞춤(주석 위치 보존)
export function riverFormat(text: string, d: Dialect): string {
  const semi = /;\s*$/.test(text)
  const body = text.replace(/;\s*$/, '').trim()
  if (!body) return text
  const tail = semi ? '\n  ;' : ''
  if (maskSql(body, d, false, '\u0002').includes('\u0002')) {
    const lines: string[] = []
    for (const l of body.split('\n')) {
      const n = l.trimStart().startsWith(',') ? commaIndent(lines) : riverIndent(l)
      lines.push(n == null ? (lines.length ? l.trimEnd() : l.trim()) : ' '.repeat(n) + l.trim())
    }
    return lines.join('\n') + tail
  }
  const mask = maskSql(body, d)
  // 문자열 밖 공백 표시 — 공백을 표지 글자로 바꿔 가린 마스크(문자열 안 공백은 가려져 표지가 사라짐)
  const sent = maskSql(body.replace(/[ \t\r]/g, '\u0001'), d)
  const ws = (k: number) => sent[k] === '\u0001' || sent[k] === '\n'
  const out: string[] = []
  const subs: string[] = [] // 하위 질의 = 따로 정렬한 결과, 줄에는 자리표시 (\u0003n\u0003)
  let cur = '', depth = 0, caseD = 0, between = false, clause = '', prev = ''
  const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = '' }
  let i = 0
  while (i < body.length) {
    if (ws(i)) { if (cur && !cur.endsWith(' ')) cur += ' '; i++; continue } // 문자열 밖 공백 = 한 칸
    const m = mask[i]
    if (m === '(' && /^\(\s*(SELECT|WITH)\b/i.test(mask.slice(i, i + 64))) {
      const j = closeParen(mask, i)
      if (j > 0) {
        subs.push(riverFormat(body.slice(i + 1, j).trim(), d))
        cur += `(\u0003${subs.length - 1}\u0003)`
        prev = ')'
        i = j + 1
        continue
      }
    }
    if (m === '(') depth++
    if (m === ')') depth = Math.max(0, depth - 1)
    if (m === ',' && depth === 0 && caseD === 0 && COMMA_CLAUSE.has(clause)) {
      flush(); cur = ', '; i++
      while (i < body.length && ws(i)) i++
      continue
    }
    const wm = /^[A-Za-z_][A-Za-z0-9_$#]*/.exec(mask.slice(i, i + 64))
    if (wm && !/[\w$#."]/.test(mask[i - 1] ?? '')) {
      const w = wm[0], up = w.toUpperCase()
      if (depth === 0) {
        if (up === 'CASE') caseD++
        else if (up === 'END' && caseD) caseD--
        const brk = caseD === 0 && BREAK.has(up) && !(up === 'AND' && between) && !(JOIN_PRE.has(prev) && (up === 'JOIN' || JOIN_PRE.has(up))) && !(up === 'FROM' && prev === 'DELETE')
        if (up === 'AND' && between) between = false
        else if (up === 'BETWEEN') between = true
        if (brk) { flush(); if (!COND.has(up)) clause = up }
      }
      cur += KW.has(up) ? up : body.slice(i, i + w.length)
      prev = up
      i += w.length
      continue
    }
    cur += body[i]
    i++
  }
  flush()
  const lines: string[] = []
  for (const l of out) lines.push(' '.repeat(l.startsWith(',') ? commaIndent(lines) : (riverIndent(l) ?? (lines.length ? RIVER + 1 : 0))) + l)
  return expandSubs(selectAliases(lines, d), subs).join('\n') + tail
}

// 짝 괄호 위치(마스크 기준 — 문자열·주석 안 괄호 무시), 없으면 -1
function closeParen(mask: string, i: number): number {
  let dp = 0
  for (let k = i; k < mask.length; k++) {
    if (mask[k] === '(') dp++
    else if (mask[k] === ')' && --dp === 0) return k
  }
  return -1
}

// 하위 질의 펼치기(2026-10-18 마스터 이미지) — 여는 괄호 열 = c 일 때
//   LEFT JOIN ( SELECT a        ← 첫 줄은 '( ' 뒤
//                 FROM t        ← 나머지 = c + 2 칸 들여쓰기(하위 질의 안도 강 정렬)
//             ) f               ← 닫는 괄호 = 여는 괄호 열, 뒤 이어 별칭 등
function expandSubs(lines: string[], subs: string[]): string[] {
  if (!subs.length) return lines
  const out: string[] = []
  const todo = [...lines]
  while (todo.length) {
    const l = todo.shift()!
    const m = /\(\u0003(\d+)\u0003\)/.exec(l)
    if (!m) { out.push(l); continue }
    const c = m.index, sl = subs[+m[1]].split('\n')
    out.push(l.slice(0, c) + '( ' + sl[0])
    for (const x of sl.slice(1)) out.push(' '.repeat(c + 2) + x)
    todo.unshift((' '.repeat(c) + ')' + l.slice(c + m[0].length)).trimEnd()) // 같은 줄 뒤에 다른 하위 질의가 있으면 이어서 펼침
  }
  return out
}

// SELECT 목록 별칭(2026-10-18 마스터 지시 + 이미지) — 별칭 없는 칼럼(a·t.a) = AS 칼럼명, 있는 별칭은 AS 로 통일, AS 를 한 열(가장 긴 식 + 2칸)에 맞춤
//   SELECT std_sts_cd  AS std_sts_cd
//        , COUNT(*)    AS cnt
const ALIAS_MAX = 48 // 이보다 긴 식은 맞춤 열 계산에서 빼고 한 칸만 띄움
const IDENT = /^[A-Za-z_][\w$#]*$/
// 칼럼명이 이 예약어면 AS 를 붙이지 않음(Oracle 에서 `AS date`·`AS user` 는 오류)
const NO_ALIAS = new Set('DATE USER UID LEVEL SIZE ROWID ROWNUM COMMENT NUMBER RESOURCE ACCESS FILE MODE SESSION SYSDATE'.split(' '))

// 항목 → 식·별칭(없으면 null). 문자열·괄호 안은 가린 마스크로 판정
export function splitItem(item: string, d: Dialect): { expr: string; alias: string | null } {
  const t = item.trim(), m = maskSql(t, d)
  const flat = (s: string) => !/[()]/.test(s.replace(/\([^()]*\)/g, '').replace(/\([^()]*\)/g, '').replace(/\([^()]*\)/g, '')) // 괄호 짝 맞음(3단까지)
  const ex = /\s+AS\s+("[^"]*"|[^\s"]+)$/i.exec(m)
  if (ex && flat(m.slice(0, ex.index))) return { expr: t.slice(0, ex.index), alias: t.slice(ex.index + ex[0].length - ex[1].length) }
  const im = /^(.*[\w)\]"'])\s+([A-Za-z_][\w$#]*)$/.exec(m)
  if (im && !KW.has(im[2].toUpperCase()) && flat(im[1])) {
    const last = /([A-Za-z_][\w$#]*)$/.exec(im[1])?.[1]?.toUpperCase()
    if (!last || !KW.has(last) || last === 'END') return { expr: t.slice(0, im[1].length), alias: t.slice(t.length - im[2].length) }
    return { expr: t, alias: null }
  }
  const parts = t.split('.')
  const col = parts[parts.length - 1]
  if (parts.every((p) => IDENT.test(p)) && !KW.has(col.toUpperCase()) && !NO_ALIAS.has(col.toUpperCase())) return { expr: t, alias: col }
  return { expr: t, alias: null }
}

function selectAliases(lines: string[], d: Dialect): string[] {
  const out = [...lines]
  for (let s = 0; s < out.length; s++) {
    const h = /^(\s*SELECT\s+(?:(?:DISTINCT|ALL)\s+)?(?:(?:TOP\s*\(?\s*\d+\s*\)?|FIRST\s+\d+)\s+)?)(\S.*)$/i.exec(out[s])
    if (!h) continue
    const rows = [{ k: s, pre: h[1], item: h[2] }]
    for (let k = s + 1; k < out.length; k++) {
      const c = /^(\s*,\s+)(\S.*)$/.exec(out[k])
      if (!c) break
      rows.push({ k, pre: c[1], item: c[2] })
    }
    s = rows[rows.length - 1].k
    // SELECT … INTO 변수 목록(PL/SQL·PL/pgSQL) — 쉼표 줄이 변수라 별칭을 붙이면 문법 오류 → 그 묶음 전체 그대로
    if (rows.some((r) => /\bINTO\b/i.test(maskSql(r.item, d)))) continue
    const parts = rows.map((r) => ({ ...r, ...splitItem(r.item, d) }))
    // 하위 질의 항목(자리표시 \u0003)은 펼친 뒤 ') AS 별칭' 한 칸 — 맞춤 열 계산에서 뺌
    const sub = (p: { expr: string }) => p.expr.includes('\u0003')
    const ends = parts.filter((p) => p.alias && !sub(p) && p.pre.length + p.expr.length <= ALIAS_MAX).map((p) => p.pre.length + p.expr.length)
    const col = Math.max(0, ...ends) + 2
    for (const p of parts) if (p.alias) out[p.k] = p.pre + p.expr + ' '.repeat(sub(p) ? 1 : Math.max(1, col - p.pre.length - p.expr.length)) + 'AS ' + p.alias
  }
  return out
}
