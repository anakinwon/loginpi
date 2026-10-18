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
  let cur = '', depth = 0, caseD = 0, between = false, clause = '', prev = ''
  const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = '' }
  let i = 0
  while (i < body.length) {
    if (ws(i)) { if (cur && !cur.endsWith(' ')) cur += ' '; i++; continue } // 문자열 밖 공백 = 한 칸
    const m = mask[i]
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
  return lines.join('\n') + tail
}
