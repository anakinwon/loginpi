// 사이트 연결 API(/api/link/v1/*, 서버 간 전용) 인증·응답 공용 — Bearer slk_… → SHA-256 → 활성·미만료 토큰(sql/077) → 분류체계, 토큰별 분당 60회
// 사용자 세션·쿠키는 보지 않음(사이트 간 사용자 대조 금지, 결정 D1). 응답 = { ok:true, data } | { ok:false, code, message } — 접속 정보 원문 노출 금지(maskErr 는 호출 측)
import 'server-only'
import { after, NextResponse } from 'next/server'
import { db } from '../db'
import { bearerOf, rateOk, tokenHash } from './rules'

export const LINK_ERRORS = {
  LINK_AUTH: '연결 토큰이 없거나 폐기·만료되었습니다',
  LINK_SCOPE: '이 토큰의 분류체계에 속하지 않은 대상입니다',
  CONN_UNSUPPORTED: '이 접속은 연결 조회를 지원하지 않습니다(PostgreSQL 서버 직접 접속만)',
  Q_UNKNOWN: '알 수 없는 조회 이름입니다',
  SQL_NOT_SELECT: 'SELECT·WITH 한 문장만 실행 계획을 볼 수 있습니다',
  PGSS_MISSING: 'pg_stat_statements 확장이 설치되어 있지 않습니다',
  TIMEOUT: '조회 시간(5초)을 넘었습니다',
  RATE: '호출이 너무 많습니다 — 1분 뒤 다시 시도하십시오',
  INVALID_INPUT: '입력값이 올바르지 않습니다',
  NOT_FOUND: '대상을 찾을 수 없습니다',
  CONN_DISABLED: '이 schema.pi 배포에서 DB 접속 기능이 꺼져 있습니다',
  CONN_FAIL: '대상 DB 에 접속하거나 조회하지 못했습니다',
  DB_FAILED: '처리 중 오류가 발생했습니다',
} as const
export type LinkCode = keyof typeof LINK_ERRORS

const NO_STORE = { 'Cache-Control': 'no-store' }
export const linkOk = (data: unknown) => NextResponse.json({ ok: true, data }, { headers: NO_STORE })
export const linkFail = (code: LinkCode, status: number, message?: string) => NextResponse.json({ ok: false, code, message: message ?? LINK_ERRORS[code] }, { status, headers: NO_STORE })

export interface LinkAuth {
  tknId: string
  areaId: string
}
const hits = new Map<string, { w: number; n: number }>()
const USE_MS = 60_000 // 최종 사용 일시는 1분 단위로만 갱신(호출마다 쓰기 방지)

export async function linkAuth(req: Request): Promise<LinkAuth | NextResponse> {
  const raw = bearerOf(req.headers.get('authorization'))
  if (!raw) return linkFail('LINK_AUTH', 401)
  const h = tokenHash(raw)
  const r = await db().from('sys_lnk_tkn').select('tkn_id, area_id, lst_use_dtm').eq('tkn_hash', h).eq('del_yn', 'N').gt('exp_dtm', new Date().toISOString()).maybeSingle()
  if (r.error) {
    console.error('[link] auth', r.error.code, r.error.message)
    return linkFail('DB_FAILED', 500)
  }
  const t = r.data as { tkn_id: string; area_id: string; lst_use_dtm: string | null } | null
  if (!t) return linkFail('LINK_AUTH', 401)
  // 상한 기록은 유효 토큰만(무작위 Bearer 로 메모리 버킷이 불어나지 않게 — 팀장 검토 m-b)
  if (!rateOk(hits, h)) return linkFail('RATE', 429)
  if (!t.lst_use_dtm || Date.now() - new Date(t.lst_use_dtm).getTime() >= USE_MS)
    after(async () => {
      const u = await db().from('sys_lnk_tkn').update({ lst_use_dtm: new Date().toISOString() }).eq('tkn_id', t.tkn_id)
      if (u.error) console.error('[link] lst_use', u.error.code, u.error.message)
    })
  return { tknId: t.tkn_id, areaId: t.area_id }
}

// 목록 쪽 나누기 ?offset=&limit= (기본 dflt, 최대 max)
export function pageOf(req: Request, dflt: number, max: number) {
  const sp = new URL(req.url).searchParams
  return { off: Math.max(0, Math.floor(Number(sp.get('offset')) || 0)), lim: Math.min(max, Math.max(1, Math.floor(Number(sp.get('limit')) || dflt))) }
}

// 라우트 감싸기 — 인증 → 처리, 예외는 500(원문은 서버 로그에 코드만)
export function linkRoute(fn: (req: Request, a: LinkAuth) => Promise<NextResponse>) {
  return async (req: Request) => {
    try {
      const a = await linkAuth(req)
      if (a instanceof NextResponse) return a
      return await fn(req, a)
    } catch (e) {
      const x = e as { code?: string; message?: string }
      console.error('[link]', x.code, x.message?.slice(0, 200))
      return linkFail('DB_FAILED', 500)
    }
  }
}
