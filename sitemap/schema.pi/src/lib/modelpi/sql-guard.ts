// 실행 문장 허용 형태(순수, 2026-10-18) — 직접 실행 전 문장마다 화이트리스트 판정(fail-closed). 로컬 에이전트(Java)도 같은 벡터(test/fixtures/sql-guard.json)로 검사
// 허용 : CREATE TABLE <ID> (…) / COMMENT ON TABLE <ID> IS '…' / COMMENT ON COLUMN <ID>.<ID> IS '…' / CREATE UNIQUE INDEX <ID> ON <ID> (<ID>,…)
//  ALTER TABLE <ID> ADD CONSTRAINT <ID> PRIMARY KEY [(<ID>,…)] USING INDEX <ID> / CREATE SEQUENCE <ID> START WITH n INCREMENT BY n NOCACHE
//  DROP TABLE IF EXISTS <ID> CASCADE / DROP TABLE <ID> CASCADE CONSTRAINTS — 스크립트에서 바로 다음 문장이 같은 테이블 CREATE TABLE 일 때만(deniedAt, 마스터 지시 2026-10-20 'CREATE 직전 DROP')
// FK·그 밖의 DROP·DML·권한·블록·주석은 모두 거부(마스터 지시 : FK 미생성, PK = 인덱스 먼저)
const ID = '[A-Za-z][A-Za-z0-9_]*'
const IDS = `${ID}(?:\\s*,\\s*${ID})*`
const STR = "'(?:[^']|'')*'"
const FIXED = [
  new RegExp(`^COMMENT\\s+ON\\s+TABLE\\s+${ID}\\s+IS\\s+${STR}$`, 'i'),
  new RegExp(`^COMMENT\\s+ON\\s+COLUMN\\s+${ID}\\.${ID}\\s+IS\\s+${STR}$`, 'i'),
  new RegExp(`^CREATE\\s+UNIQUE\\s+INDEX\\s+${ID}\\s+ON\\s+${ID}\\s*\\(\\s*${IDS}\\s*\\)$`, 'i'),
  new RegExp(`^ALTER\\s+TABLE\\s+${ID}\\s+ADD\\s+CONSTRAINT\\s+${ID}\\s+PRIMARY\\s+KEY\\s+(?:\\(\\s*${IDS}\\s*\\)\\s+)?USING\\s+INDEX\\s+${ID}$`, 'i'),
  new RegExp(`^CREATE\\s+SEQUENCE\\s+${ID}\\s+START\\s+WITH\\s+\\d{1,18}\\s+INCREMENT\\s+BY\\s+\\d{1,18}\\s+NOCACHE$`, 'i'),
]
const DROP_RE = [new RegExp(`^DROP\\s+TABLE\\s+IF\\s+EXISTS\\s+(${ID})\\s+CASCADE$`, 'i'), new RegExp(`^DROP\\s+TABLE\\s+(${ID})\\s+CASCADE\\s+CONSTRAINTS$`, 'i')]
const CREATE_RE = new RegExp(`^CREATE\\s+TABLE\\s+(${ID})\\s*\\(`, 'i')
// DROP 대상 테이블(대문자), DROP 문장이 아니면 null
export const dropTarget = (stmt: string) => DROP_RE.map((re) => re.exec(stmt.trim())?.[1]).find(Boolean)?.toUpperCase() ?? null
// CREATE TABLE 본문 — 문자열 상수를 지운 뒤 허용 문자·금지어 검사
const BAD_WORD = /\b(SELECT|INSERT|UPDATE|DELETE|MERGE|DROP|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC|BEGIN|DECLARE|CALL|COPY|REFERENCES|FOREIGN|AS\s+SELECT|INTO|FUNCTION|PROCEDURE|TRIGGER|LANGUAGE|DO)\b/i

export function stmtAllowed(stmt: string): boolean {
  const s = stmt.trim()
  // 문자열 상수를 비운 나머지에 문장 구분자·주석·따옴표 식별자·달러 인용이 있으면 거부(문자열 안의 ; 는 허용)
  const bare = s.replace(new RegExp(STR, 'g'), "''")
  if (!s || bare.split("'").length % 2 === 0 || /;|--|\/\*|\*\/|"|\$|\\/.test(bare)) return false
  if (FIXED.some((re) => re.test(s)) || dropTarget(s)) return true
  const m = new RegExp(`^CREATE\\s+TABLE\\s+${ID}\\s*\\(([\\s\\S]*)\\)$`, 'i').exec(bare)
  if (!m) return false
  if (!/^[A-Za-z0-9_\s,().'-]*$/.test(m[1])) return false
  return !BAD_WORD.test(m[1])
}

// 스크립트 판정 — 거부할 첫 문장 순번(0부터), 없으면 -1. 문장마다 stmtAllowed + DROP 은 바로 다음 문장이 같은 테이블 CREATE TABLE 이어야 함
export function deniedAt(stmts: string[]): number {
  return stmts.findIndex((s, i) => {
    if (!stmtAllowed(s)) return true
    const d = dropTarget(s)
    return d !== null && CREATE_RE.exec((stmts[i + 1] ?? '').trim())?.[1].toUpperCase() !== d
  })
}
