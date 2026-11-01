// schema.pi 연결 API 클라이언트(서버 전용) — 계약 docs/BUILD_CONTRACT.md 2.3. 기능(F2~F10)은 이 함수들만 쓴다.
//  흐름 : requireLink(로그인 + dbm_lnk 소유자/ADMIN) → linkGet/linkQuery(토큰 복호 → schema.pi /api/link/v1/* 호출, 4초 타임아웃)
//  같은 요청 안 dbm_lnk 조회·토큰 복호는 React cache 로 1번만(R-P2). 라우트 오류 응답은 linkErrorResponse(e)
import 'server-only'
import { cache } from 'react'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/api'
import { getSessionUser, isAdmin } from '@/lib/auth'
import { unseal } from './seal'

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

export type LinkCtx = { linkId: string; areaId: string; areaNm: string; usrId: string } // usrId = 세션 사용자(등록자·변경자 기록용 — 라우트가 세션을 다시 읽지 않게, R-P2)
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

// R-P4 예외(BUILD_DEFECTS 2.7 등재) — schema.pi 가 고객 DB 조회(statement_timeout 5초 상한 중 일반 조회)를 대리하므로 4초
const TIMEOUT_MS = 4000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 서버 한국어 폴백 문구(화면은 link2.errors.<code> 번역 우선)
const LINK_MSG: Record<string, string> = {
  LINK_AUTH: '연결 토큰이 만료되었거나 폐기되었습니다. schema.pi 에서 새 토큰을 발급해 다시 등록하세요',
  LINK_SCOPE: '이 연결의 분류체계에 속한 접속이 아닙니다',
  LINK_DOWN: 'schema.pi 에 연결할 수 없습니다. 잠시 후 다시 시도하세요',
  LINK_NOT_FOUND: '연결을 찾을 수 없습니다',
  CONN_UNSUPPORTED: '지원하지 않는 접속입니다(현재 PostgreSQL 서버 접속만)',
  Q_UNKNOWN: '알 수 없는 조회입니다',
  SQL_NOT_SELECT: 'SELECT(또는 WITH) 1문장만 실행할 수 있습니다',
  PGSS_MISSING: '대상 DB 에 pg_stat_statements 확장이 없습니다',
  TIMEOUT: '응답 시간이 초과되었습니다',
  RATE: '호출이 너무 많습니다. 1분 뒤에 다시 시도하세요',
}

export const schemaBaseUrl = () =>
  (process.env.SCHEMA_API_URL || 'https://schem.vercel.app').replace(/\/+$/, '')

// 토큰 하나로 schema.pi /api/link/v1<path> 호출 — 등록(검증) 단계는 행이 없어 이 함수를 직접 쓴다
export async function schemaFetch<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${schemaBaseUrl()}/api/link/v1${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    throw timeout ? new LinkError('TIMEOUT', 504) : new LinkError('LINK_DOWN', 502)
  }
  const body = (await res.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; code?: string; message?: string }
    | null
  if (body?.ok === true) return body.data
  const code = body && body.ok === false && body.code ? body.code : 'LINK_DOWN'
  // schema.pi 5xx·비 JSON = 상류 장애(502), 4xx 는 그대로
  const status = res.ok || res.status >= 500 ? 502 : res.status
  throw new LinkError(code, status, body && body.ok === false ? body.message : undefined)
}

type LinkRow = { lnk_id: string; usr_id: string; area_id: string; area_nm: string; tkn_enc_txt: string }

const loadLink = cache(async (linkId: string): Promise<LinkRow | null> => {
  if (!UUID_RE.test(linkId)) return null
  const { data, error } = await db()
    .from('dbm_lnk')
    .select('lnk_id, usr_id, area_id, area_nm, tkn_enc_txt')
    .eq('lnk_id', linkId)
    .eq('del_yn', 'N')
    .maybeSingle()
  if (error) throw new LinkError('DB_UNAVAILABLE', 503, error.message)
  return data as LinkRow | null
})

const tokenOf = cache(async (linkId: string): Promise<string> => {
  const row = await loadLink(linkId)
  if (!row) throw new LinkError('LINK_NOT_FOUND', 404)
  try {
    return unseal(row.tkn_enc_txt, row.lnk_id)
  } catch {
    // 봉인 키(PI_SESSION_SECRET) 교체 등 — 재등록 필요
    throw new LinkError('LINK_AUTH', 401)
  }
})

export function linkErrorResponse(e: unknown): NextResponse {
  if (e instanceof LinkError)
    return NextResponse.json({ error: LINK_MSG[e.code] ?? e.code, code: e.code }, { status: e.status })
  throw e // 그 밖은 dbRoute 가 500 처리
}

// 로그인 + 연결 소유자(또는 ADMIN) 확인 — 실패면 Response(401·404). 남의 연결은 존재 노출 없이 404
export async function requireLink(req: NextRequest, linkId: string): Promise<LinkCtx | Response> {
  // R-P1 — 세션 확인과 연결 행 조회는 서로 독립
  const [user, row] = await Promise.all([getSessionUser(req), loadLink(linkId).catch((e: unknown) => e)])
  if (!user) return NextResponse.json({ error: 'Pi 로그인이 필요합니다', code: 'AUTH_PI_REQUIRED' }, { status: 401 })
  if (row instanceof Error) return linkErrorResponse(row)
  const r = row as LinkRow | null
  if (!r || (r.usr_id !== user.id && !isAdmin(user))) return linkErrorResponse(new LinkError('LINK_NOT_FOUND', 404))
  return { linkId: r.lnk_id, areaId: r.area_id, areaNm: r.area_nm, usrId: user.id }
}

export async function linkGet<T>(linkId: string, path: string): Promise<T> {
  return schemaFetch<T>(await tokenOf(linkId), path)
}

export async function linkQuery(
  linkId: string,
  connId: string,
  q: QueryName,
  params?: Record<string, unknown>,
): Promise<QueryResult> {
  return schemaFetch<QueryResult>(await tokenOf(linkId), '/query', {
    method: 'POST',
    body: { connId, q, ...(params ? { params } : {}) },
  })
}
