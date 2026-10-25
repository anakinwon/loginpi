// 연동 완료 — POST /api/auth/link-complete { code }. Google(NextAuth) 세션 필수, 아직 연동되지 않은 Google 만.
//  유효 코드(미사용·미만료) → 코드 선점(use_dtm, 1회만) → sys_usr_auth_lnk(usr_id ↔ Google sub) 생성.
//  성공 후 클라이언트는 useSession().update() 로 JWT 의 userId 를 재조회한다(src/auth.ts jwt trigger='update').
//  무차별 대입 방어(2026-10-25) : 시도를 먼저 DB(sys_auth_lnk_try_hist, 인스턴스 공유)에 실패로 기록한 뒤 최근 TRY_WINDOW_MIN 분 실패를 센다.
//   ① Google sub 당 TRY_MAX 초과 ② 전체(모든 계정 합계) GLOBAL_MAX 초과 — 둘 중 하나면 429. ②는 Google 계정을 여러 개 동원해도 막히는 상한
//   (6자리 = 100만, 15분 30회 = 하루 2,880회 → 활성 코드 1개 기준 첫 적중까지 평균 약 1년, 활성 코드 k개면 1/k).
//   대가 : 거절된 시도도 'N' 으로 남아 Google 계정 1개로 15분 31회만 보내도 전체 연동을 계속 막을 수 있음(값싼 서비스 거부 — 연동은 일회성이라 감수, 문제 시 거절 시도 별도 상태로 분리 검토).
//   기록 테이블이 없으면(DDL 미적용) 연동 자체를 503 으로 막는다(fail-closed). 성공 시 시도 행을 Y 로. IP 제한은 withAuthGuard(메모리)가 별도
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { auth, googleEnabled } from '@/auth'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'

const TRY_MAX = 5
const GLOBAL_MAX = 30
const TRY_WINDOW_MIN = 15

const bodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
})

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    if (!googleEnabled()) return apiError('NOT_FOUND', 404)
    const session = await auth()
    const sub = session?.user?.sub
    if (!sub) return apiError('AUTH_GOOGLE_REQUIRED', 401)
    if (session.user.id) return apiError('LINK_ALREADY_LINKED', 409)
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body

    // 시도를 먼저 기록(실패로 가정, 성공 시 Y 로 바꿈) → 그 뒤 세기. 동시 다발 요청도 서로의 행을 보게 되어 한도를 넘지 못함(검사-후-기록 경합 차단)
    const { data: attempt, error: tryErr } = await db()
      .from('sys_auth_lnk_try_hist')
      .insert({ prvd_cd: 'GOOGLE', prvd_sub_txt: sub, succ_yn: 'N' })
      .select('try_id')
      .maybeSingle<{ try_id: string }>()
    // 테이블 없음(42P01·PGRST205)도 dbFail → 503 : 제한 없이 열어 두지 않는다
    if (tryErr || !attempt) return dbFail(tryErr ?? { message: '시도 기록 실패' })

    // 실패 횟수(방금 기록 포함)와 코드 조회는 서로 결과를 쓰지 않음 → 병렬(R-P1)
    const since = new Date(Date.now() - TRY_WINDOW_MIN * 60_000).toISOString()
    const fails = () =>
      db()
        .from('sys_auth_lnk_try_hist')
        .select('try_id', { count: 'exact', head: true })
        .eq('prvd_cd', 'GOOGLE')
        .eq('succ_yn', 'N')
        .gte('reg_dtm', since)
    const [mine, all, found] = await Promise.all([
      fails().eq('prvd_sub_txt', sub),
      fails(),
      db()
        .from('sys_auth_lnk_cd')
        .select('lnk_cd_id, usr_id, exp_dtm')
        .eq('lnk_cd', body.code)
        .eq('del_yn', 'N')
        .is('use_dtm', null)
        .maybeSingle<{ lnk_cd_id: string; usr_id: string; exp_dtm: string }>(),
    ])
    if (mine.error) return dbFail(mine.error)
    if (all.error) return dbFail(all.error)
    if ((mine.count ?? 0) > TRY_MAX || (all.count ?? 0) > GLOBAL_MAX)
      return apiError('LINK_TRY_LIMIT', 429)
    if (found.error) return dbFail(found.error)

    const cd = found.data
    if (!cd || new Date(cd.exp_dtm).getTime() < Date.now())
      return apiError('LINK_CODE_INVALID', 400)

    // 코드 선점 — use_dtm 이 비어 있을 때만 1행 갱신. 동시 입력 중 하나만 성공(나머지는 무효 코드)
    const { data: claimed, error: useErr } = await db()
      .from('sys_auth_lnk_cd')
      .update({
        use_dtm: new Date().toISOString(),
        use_prvd_cd: 'GOOGLE',
        use_prvd_sub_txt: sub,
        modr_id: cd.usr_id,
      })
      .eq('lnk_cd_id', cd.lnk_cd_id)
      .is('use_dtm', null)
      .select('lnk_cd_id')
      .maybeSingle()
    if (useErr) return dbFail(useErr)
    if (!claimed) return apiError('LINK_CODE_INVALID', 400)

    // 연동 생성 — 같은 Google 이 타인 계정에 이미 붙었거나(prvd UNIQUE) 이 사용자가 이미 Google 을 연동했으면(usr UNIQUE) 409.
    // 이때 코드는 이미 사용 처리됨 — Pi Browser 에서 재발급(ponytail: 코드 반환 없음, 409 는 재시도해도 같은 결과)
    const { error: lnkErr } = await db()
      .from('sys_usr_auth_lnk')
      .insert({
        usr_id: cd.usr_id,
        prvd_cd: 'GOOGLE',
        prvd_sub_txt: sub,
        prvd_eml_txt: session.user.email ?? null,
        regr_id: cd.usr_id,
        modr_id: cd.usr_id,
      })
    if (lnkErr) {
      if (lnkErr.code === '23505') return apiError('LINK_ALREADY_LINKED', 409)
      return dbFail(lnkErr)
    }

    // 성공 — 이 시도를 실패 건수에서 뺀다(실패 시 로그만, 응답은 성공 유지)
    const { error: okErr } = await db()
      .from('sys_auth_lnk_try_hist')
      .update({ succ_yn: 'Y' })
      .eq('try_id', attempt.try_id)
    if (okErr)
      console.error('[auth/link-complete] 시도 성공 표시 실패', okErr.message)

    return NextResponse.json({ ok: true, userId: cd.usr_id })
  }),
)
