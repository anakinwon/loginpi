// SQL 편집기 바인드 변수(순수, 2026-10-18 마스터 지시 + DBeaver 'Bind parameter(s)' 화면) — :이름 찾기·값 넣기
//  값 = 그대로 넣는 SQL 식(DBeaver 와 같음 : 문자열은 '따옴표'로, 식 사용 가능) → 서버가 넣은 결과를 다시 분리·분류·위험 판정
//  제외 : 문자열·주석·따옴표 식별자 안, PG 형 변환 ::, PL/SQL 대입 :=, 배열 범위 a[1:n](앞 글자가 낱말 글자), Oracle 트리거 :new.칼럼·:old.칼럼
import { maskSql, type Dialect } from './sql-split.ts'

const BIND = /(?<![:\w$#]):(?!(?:new|old)\.)([A-Za-z_][\w$#]*)/gi

// 바인드 변수 위치(나온 순서) — name 은 ':' 뺀 이름
export function findBinds(text: string, d: Dialect): { name: string; from: number; to: number }[] {
  const m = maskSql(text, d)
  return [...m.matchAll(BIND)].map((x) => ({ name: x[1], from: x.index, to: x.index + x[0].length }))
}

// 이름 목록(처음 나온 순서, 중복 제거)
export const bindNames = (text: string, d: Dialect) => [...new Set(findBinds(text, d).map((b) => b.name))]

// 값 넣기 — 없는 이름은 그대로 둠(뒤에서부터 바꿔 위치 유지)
export function applyBinds(text: string, d: Dialect, vals: Record<string, string>): string {
  let out = text
  for (const b of findBinds(text, d).reverse()) if (b.name in vals) out = out.slice(0, b.from) + vals[b.name] + out.slice(b.to)
  return out
}
