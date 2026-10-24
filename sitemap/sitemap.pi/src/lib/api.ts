// sitemap.pi API 공용 — 에러 카탈로그(code → messages apiErrors.<CODE>), DB 가용성 래퍼(미설정·미연결 = 503), 인증·관리자 게이트.
// 사용: export const GET = withGuard(dbRoute(async (req) => { ... }))
import 'server-only'
import { createHmac } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import {
  AUTH_ERRORS,
  COMMON_ERRORS,
  createApiError,
  type Handler,
} from '@pi/guard'
import { getSupabaseAdmin, resolveDbConfig, type UserRow } from '@pi/db'
import { getSessionUser, isAdmin } from './auth'
import {
  BLOCK_REAPPLY_RSN,
  IMG_BUCKET,
  LIMITS,
  OCCUPY_STS,
  OPEN_STS,
} from './site'

export const apiError = createApiError({
  ...COMMON_ERRORS,
  ...AUTH_ERRORS,
  DB_UNAVAILABLE: '데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도하세요',
  NOT_FOUND: '대상을 찾을 수 없습니다',
  DUPLICATE_DOMAIN: '이미 등록(신청 중 포함)된 도메인입니다',
  ALREADY_REPORTED: '이미 신고한 사이트입니다. 처리 결과를 기다려 주세요',
  INVALID_STATE: '현재 상태에서는 할 수 없는 작업입니다',
  IMG_BUCKET_MISSING:
    '이미지 저장소(site-img 버킷)가 준비되지 않았습니다. 관리자에게 문의하세요',
  IMG_TOO_LARGE: '이미지는 2MB 이하만 올릴 수 있습니다',
  IMG_TYPE: 'PNG·JPEG·WebP·GIF 이미지만 올릴 수 있습니다',
  IMG_URL_INVALID: '이 서비스에 업로드한 이미지만 사용할 수 있습니다',
  DOMAIN_REJECTED_POLICY:
    '금지 카테고리 사유로 반려된 도메인은 다시 신청할 수 없습니다. 관리자에게 문의하세요',
  DOMAIN_REJECTED_OWNERSHIP:
    '도메인 소유 확인 불가로 반려된 도메인은 다시 제출할 수 없습니다. 관리자에게 문의하세요',
  SITE_LIMIT: `작성 중·신청 중 사이트는 최대 ${LIMITS.openMax}개까지 둘 수 있습니다`,
  APPLY_COOLDOWN:
    '결제 기한 초과로 반복 반려된 도메인입니다. 잠시 후 다시 신청하세요',
  // Google 로그인 ↔ Pi 계정 연동(sql/003)
  AUTH_GOOGLE_REQUIRED: 'Google 로그인이 필요합니다',
  LINK_CODE_INVALID:
    '연동 코드가 올바르지 않거나 만료되었습니다. Pi Browser 에서 다시 발급하세요',
  LINK_ALREADY_LINKED: '이미 연동된 계정입니다',
  LINK_CODE_GEN_FAILED:
    '연동 코드를 만들지 못했습니다. 잠시 후 다시 시도하세요',
  // 사용료 결제(sql/004·012)
  PLAN_TERM_MISSING:
    '요금제 사용기간이 설정되지 않았습니다. 요금표를 확인하세요',
  PAY_IN_PROGRESS:
    '진행 중인 Pi 결제가 있어 처리할 수 없습니다. 결제가 끝난 뒤 다시 시도하세요',
  PAY_PENDING_REFUND:
    '결제된 신청이 반려되어 환불 처리 전입니다. 관리자에게 문의하세요',
  PAY_NOT_REQUIRED: '이 사이트는 결제가 필요하지 않습니다',
  PAY_ALREADY_PAID: '이미 결제가 완료된 신청입니다',
  PAY_SITE_MISMATCH: '결제 정보가 신청 내용과 일치하지 않습니다',
  PAY_AMOUNT_SHORT: '결제 금액이 요금과 다릅니다',
  PAY_PI_APPROVE_FAILED: 'Pi 결제 승인에 실패했습니다. 잠시 후 다시 시도하세요',
  PAY_PI_COMPLETE_FAILED:
    'Pi 결제 완료 처리에 실패했습니다. 잠시 후 다시 시도하세요',
  PAY_PI_CANCEL_FAILED:
    '결제가 이미 진행되어 취소할 수 없습니다. 다시 로그인하면 완료 처리됩니다',
})

export const db = () => getSupabaseAdmin()

// DB 자격증명 미설정 → 503(빈 화면·크래시 대신 명확한 오류). 처리 중 예외 → 500
export function dbRoute(handler: Handler): Handler {
  return async (req, ctx) => {
    const { url, key } = resolveDbConfig()
    if (!url || !key) return apiError('DB_UNAVAILABLE', 503)
    try {
      return await handler(req, ctx)
    } catch (e) {
      console.error('[api]', req.nextUrl.pathname, e)
      return apiError('INTERNAL', 500)
    }
  }
}

// PostgREST 오류 분류 — 연결 실패(code 없음)·스키마/테이블 미노출(PGRST1xx/2xx·42P01·42883)은 503, 그 외 500
export function dbFail(error: { code?: string; message?: string }) {
  const code = error.code ?? ''
  console.error('[db]', code, error.message)
  const unavailable =
    !code || /^PGRST[12]/.test(code) || code === '42P01' || code === '42883'
  return unavailable
    ? apiError('DB_UNAVAILABLE', 503)
    : apiError('QUERY_FAILED', 500)
}

// 로그인 필수 — null 이면 401 응답(redirect 아님, 클라이언트 게이트가 처리)
export async function requireUser(
  req: NextRequest,
): Promise<UserRow | NextResponse> {
  const user = await getSessionUser(req)
  return user ?? apiError('AUTH_PI_REQUIRED', 401)
}

export async function requireAdmin(
  req: NextRequest,
): Promise<UserRow | NextResponse> {
  const user = await getSessionUser(req)
  if (!user) return apiError('AUTH_PI_REQUIRED', 401)
  return isAdmin(user) ? user : apiError('FORBIDDEN', 403)
}

// 본문 JSON 파싱 + zod 검증 — 실패 시 400 응답
export async function parseBody<T>(
  req: NextRequest,
  schema: {
    safeParse: (v: unknown) => { success: true; data: T } | { success: false }
  },
): Promise<T | NextResponse> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : apiError('INVALID_INPUT', 400)
}

export const pageParam = (req: NextRequest) =>
  Math.max(
    1,
    Math.min(
      1000,
      Math.floor(Number(req.nextUrl.searchParams.get('page'))) || 1,
    ),
  )

// 페이지당 건수(?size=) — 기본값은 호출처 LIMITS, 10~100 으로 클램프(과대 요청 방지)
export const sizeParam = (req: NextRequest, dflt: number) =>
  Math.max(
    10,
    Math.min(
      100,
      Math.floor(Number(req.nextUrl.searchParams.get('size'))) || dflt,
    ),
  )

export const PUBLIC_CACHE = {
  'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
}

// 업로드 이미지 URL 검증 — 이 프로젝트 Storage 공개 버킷의 본인 폴더 파일만(외부 링크·추적 픽셀·타인 이미지 차단).
// 업로드 API 경로 규칙 <userId>/<UUID>.<ext> 와 정확 일치. 경로 조작(.. · %2e)·계정정보·쿼리 포함 URL은 거부
const UUID_SRC = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export function isOwnImgUrl(raw: string, userId: string): boolean {
  if (raw.includes('..') || /%2e/i.test(raw)) return false
  if (!new RegExp(`^${UUID_SRC}$`).test(userId)) return false
  try {
    const u = new URL(raw)
    if (u.origin !== new URL(resolveDbConfig().url).origin) return false
    if (u.username || u.password || u.search || u.hash) return false
    return new RegExp(
      `^/storage/v1/object/public/${IMG_BUCKET}/${userId}/${UUID_SRC}\\.(png|jpe?g|gif|webp)$`,
    ).test(u.pathname)
  } catch {
    return false
  }
}

// 도메인 소유 확인 토큰 — HMAC(SITEMAP_VERIFY_SECRET, 'sitemap-verify:'+site_id+':'+domain) 앞 16자. 컬럼 없이 매번 계산(결정적).
// 도메인 포함 = 도메인 변경 시 토큰도 바뀜(다른 도메인으로 확인 결과 재사용 차단).
// ⚠ SITEMAP_VERIFY_SECRET 미설정 시 PI_SESSION_SECRET 폴백 — 세션 서명 키와 용도 분리가 원칙이므로 운영은 별도 값 등록(OPS_SETUP)
export function verifyToken(siteId: string, domain: string): string | null {
  const secret =
    process.env.SITEMAP_VERIFY_SECRET || process.env.PI_SESSION_SECRET
  if (!secret) return null
  return createHmac('sha256', secret)
    .update(`sitemap-verify:${siteId}:${domain}`)
    .digest('hex')
    .slice(0, 16)
}

// 등록·신청 규칙(앱 레벨) — addsOpen: 새 DRAFT/APPLYING 행이 늘어나면 사용자당 상한 검사,
// submit: APPLYING 으로 들어가면 ① 본인이 같은 도메인으로 OWNERSHIP 반려 이력(상태·삭제 무관, 반려 행 자체 재신청 포함) → 409 DOMAIN_REJECTED_OWNERSHIP
//         ② 본인·같은 도메인 PAY_TIMEOUT 반려가 시간 창 안에 상한 이상 → 409 APPLY_COOLDOWN(무결제 점유 반복 차단)
//         ③ 같은 도메인 점유 상태(OCCUPY_STS, 다른 행) 존재 → 409 DUPLICATE_DOMAIN. 통과 시 null
// ponytail: 조회 후 쓰기라 동시 요청 시 상한 1~2건 초과 가능 — 도메인 중복은 DB UNIQUE 가 최종 방어
export async function checkSiteWrite(
  userId: string,
  domain: string,
  opts: { addsOpen: boolean; submit: boolean; exceptId?: string },
): Promise<NextResponse | null> {
  // 4개 조회는 서로 결과를 쓰지 않음 → 병렬(R-P1). 판정·오류 코드 우선순위는 기존 순서 그대로
  const since = new Date(
    Date.now() - LIMITS.payTimeoutWindowH * 3600_000,
  ).toISOString()
  let occupyQ = db()
    .from('site_mst')
    .select('site_id', { count: 'exact', head: true })
    .eq('site_dom_nm', domain)
    .eq('del_yn', 'N')
    .in('site_sts_cd', OCCUPY_STS)
  if (opts.exceptId) occupyQ = occupyQ.neq('site_id', opts.exceptId)
  const [open, blockedRes, timeoutRes, occupy] = await Promise.all([
    opts.addsOpen
      ? db()
          .from('site_mst')
          .select('site_id', { count: 'exact', head: true })
          .eq('ownr_usr_id', userId)
          .eq('del_yn', 'N')
          .in('site_sts_cd', OPEN_STS)
      : null,
    // 반려 이력(site_sts_hist) 기준 — OWNERSHIP + 금지 7종(BLOCK_REAPPLY_RSN, 마스터 D2). 재신청으로 rjct_* 가 지워진 행도 이력엔 남는다
    opts.submit
      ? db()
          .from('site_sts_hist')
          .select('chg_rsn_cd, site_mst!inner(ownr_usr_id)')
          .eq('site_dom_nm', domain)
          .eq('del_yn', 'N')
          .eq('new_sts_cd', 'REJECTED')
          .in('chg_rsn_cd', BLOCK_REAPPLY_RSN)
          .eq('site_mst.ownr_usr_id', userId)
          .limit(1)
      : null,
    opts.submit
      ? db()
          .from('site_sts_hist')
          .select('hist_id, site_mst!inner(ownr_usr_id)', {
            count: 'exact',
            head: true,
          })
          .eq('site_dom_nm', domain)
          .eq('del_yn', 'N')
          .eq('chg_rsn_cd', 'PAY_TIMEOUT')
          .eq('site_mst.ownr_usr_id', userId)
          .gte('chg_dtm', since)
      : null,
    opts.submit ? occupyQ : null,
  ])
  if (open) {
    if (open.error) return dbFail(open.error)
    if ((open.count ?? 0) >= LIMITS.openMax) return apiError('SITE_LIMIT', 409)
  }
  if (blockedRes && timeoutRes && occupy) {
    const blocked = blockedRes.data
    if (blockedRes.error) return dbFail(blockedRes.error)
    if (blocked?.length)
      return apiError(
        blocked[0].chg_rsn_cd === 'OWNERSHIP'
          ? 'DOMAIN_REJECTED_OWNERSHIP'
          : 'DOMAIN_REJECTED_POLICY',
        409,
      )
    if (timeoutRes.error) return dbFail(timeoutRes.error)
    if ((timeoutRes.count ?? 0) >= LIMITS.payTimeoutMax)
      return apiError('APPLY_COOLDOWN', 409)
    if (occupy.error) return dbFail(occupy.error)
    if (occupy.count) return apiError('DUPLICATE_DOMAIN', 409)
  }
  return null
}

type Ctx = { params: Promise<Record<string, string>> }
export const routeParam = async (ctx: unknown, name: string) =>
  (await (ctx as Ctx).params)[name] ?? ''

// [id] 경로 파라미터 — UUID 아니면 null(호출부 400). DB 캐스팅 오류(22P02 → 500)를 앞단에서 차단
export const uuidParam = async (ctx: unknown) => {
  const id = await routeParam(ctx, 'id')
  return z.uuid().safeParse(id).success ? id : null
}
