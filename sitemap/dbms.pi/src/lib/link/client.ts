// schema.pi 연결 API 클라이언트(서버 전용) — 계약 docs/BUILD_CONTRACT.md 2.3. 기능(F2~F10)은 이 함수들만 쓴다.
//  [자리표시] F1b(dbms-link) 가 실제 구현으로 교체한다 — 시그니처는 바꾸지 않는다
import 'server-only'
import type { NextRequest } from 'next/server'

export type QueryName =
  | 'explain'
  | 'db_stats'
  | 'top_sql'
  | 'tbl_stats'
  | 'idx_stats'
  | 'sizes'
  | 'activity'
  | 'locks'
  | 'settings'
  | 'roles'
  | 'table_privs'
  | 'catalog_tables'
  | 'catalog_columns'
  | 'catalog_indexes'
  | 'replication'
  | 'archiver'
  | 'version'

export type LinkCtx = { linkId: string; areaId: string; areaNm: string }
export type QueryResult = { cols: string[]; rows: unknown[][]; ms: number }

export class LinkError extends Error {
  code: string
  status: number
  constructor(code: string, status: number, message?: string) {
    super(message ?? code)
    this.code = code
    this.status = status
  }
}

// 로그인 + 연결 소유자(또는 ADMIN) 확인 — 실패면 Response(401·403·404)
export async function requireLink(req: NextRequest, linkId: string): Promise<LinkCtx | Response> {
  void req
  void linkId
  throw new LinkError('NOT_IMPLEMENTED', 501)
}

export async function linkGet<T>(linkId: string, path: string): Promise<T> {
  void linkId
  void path
  throw new LinkError('NOT_IMPLEMENTED', 501)
}

export async function linkQuery(
  linkId: string,
  connId: string,
  q: QueryName,
  params?: Record<string, unknown>,
): Promise<QueryResult> {
  void linkId
  void connId
  void q
  void params
  throw new LinkError('NOT_IMPLEMENTED', 501)
}
