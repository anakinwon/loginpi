// JDBC 접속 URL 해석·조립(순수, 2026-10-18 마스터 질의 "접속 URL 입력 없이 어떻게 접속하지?") — 화면에서 URL 한 줄을 붙여 넣으면 호스트·포트·DB 칸을 채움
// 지원 : jdbc:postgresql://호스트[:포트]/DB[?…] · postgres(ql)://[사용자[:비밀번호]@]호스트[:포트]/DB(libpq URI)
//  jdbc:oracle:thin:@//호스트:포트/서비스 · jdbc:oracle:thin:@호스트:포트/서비스 · jdbc:oracle:thin:@호스트:포트:SID · jdbc:tibero:thin:@호스트:포트:DB
// IPv6 는 [주소]. 비밀번호는 URL 에 저장하지 않음(해석 결과 pwd 는 비밀번호 칸으로만 옮김)
export interface JdbcParts {
  dbms: '0014' | '0001' | '0013'
  host: string
  port: number
  db: string
  usr?: string
  pwd?: string
}
const DFLT = { '0014': 5432, '0001': 1521, '0013': 8629 } as const
const HOST = '(\\[[0-9A-Fa-f:.]+\\]|[A-Za-z0-9.-]+)'
const port = (s: string | undefined, d: number) => (s ? Number(s) : d)
const ok = (p: JdbcParts) => (p.port >= 1 && p.port <= 65535 && !!p.host && !!p.db ? p : null)

export function parseJdbcUrl(raw: string): JdbcParts | null {
  const u = raw.trim()
  let m = new RegExp(`^(?:jdbc:postgresql|postgres(?:ql)?)://(?:([^:@/]+)(?::([^@/]*))?@)?${HOST}(?::(\\d{1,5}))?/([^?/#]+)`, 'i').exec(u)
  if (m) return ok({ dbms: '0014', usr: m[1] ? decodeURIComponent(m[1]) : undefined, pwd: m[2] ? decodeURIComponent(m[2]) : undefined, host: m[3], port: port(m[4], DFLT['0014']), db: decodeURIComponent(m[5]) })
  m = new RegExp(`^jdbc:oracle:thin:@(?://)?${HOST}(?::(\\d{1,5}))?[/:]([A-Za-z0-9_.$#-]+)$`, 'i').exec(u)
  if (m) return ok({ dbms: '0001', host: m[1], port: port(m[2], DFLT['0001']), db: m[3] })
  m = new RegExp(`^jdbc:tibero:thin:@${HOST}(?::(\\d{1,5}))?:([A-Za-z0-9_.$#-]+)$`, 'i').exec(u)
  if (m) return ok({ dbms: '0013', host: m[1], port: port(m[2], DFLT['0013']), db: m[3] })
  return null
}

// 칸 → JDBC URL(에이전트 기본값 제안·화면 표시)
export function buildJdbcUrl(dbms: string, host: string, p: number, db: string): string {
  if (dbms === '0014') return `jdbc:postgresql://${host}:${p}/${db}`
  if (dbms === '0013') return `jdbc:tibero:thin:@${host}:${p}:${db}`
  return `jdbc:oracle:thin:@//${host}:${p}/${db}`
}

// 저장 가능한 에이전트 URL(보안 검토 2026-10-18) — 세 형식(postgresql·oracle:thin·tibero:thin)만, 접속 DBMS 와 일치, 사용자·비밀번호 없음,
//  인자는 PostgreSQL 허용 목록만(sslmode·ApplicationName·currentSchema·connectTimeout). 임의 드라이버·드라이버 인자(socketFactory 등) 차단. 에이전트(Java)도 같은 규칙
const PG_BASE = /^jdbc:postgresql:\/\/(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(:\d{1,5})?\/[A-Za-z0-9_.$-]+$/
const PG_ARG = /^(sslmode|ApplicationName|currentSchema|connectTimeout)=[\w.-]{1,64}$/
export function urlStorable(u: string, dbms: string): boolean {
  if (u.length > 1000 || /[\s#;]/.test(u) || !/^jdbc:(postgresql:\/\/|oracle:thin:@|tibero:thin:@)/.test(u)) return false
  const p = parseJdbcUrl(u)
  if (!p || p.dbms !== dbms || p.usr || p.pwd) return false
  if (dbms !== '0014') return true // Oracle·Tibero 형식은 해석식이 끝까지 고정(인자 없음)
  const [base, q] = u.split('?', 2)
  return PG_BASE.test(base) && (q === undefined || q.split('&').every((kv) => PG_ARG.test(kv)))
}

// JNDI 이름(보안 검토 2026-10-18) — 로컬 이름만(java:comp/env/… 등 또는 접두 없는 이름). ldap:·rmi: 등 원격 조회(JNDI 주입) 차단. 에이전트도 같은 규칙
export const jndiOk = (n: string) => n.length <= 255 && /^(java:(comp\/env|global|app|module|jboss)\/)?[A-Za-z0-9_][A-Za-z0-9_/.-]*$/.test(n) && !n.includes('..')
