// 마이크 동의 기록(계획서 A-6·M-4) — GET = 이 세미나에 내가 동의했나, POST = 동의 일시 기록(멱등). 로그인 필수, 비로그인 401(redirect 없음).
//  테이블 smn_agre 는 F-A sql/008 에서 만든다(칼럼 smn_id·usr_id·agre_dtm + 시스템 4·논리삭제, 유일 인덱스 x_smn_agre_01(smn_id, usr_id) WHERE del_yn='N').
//  미적용(PGRST2xx·42P01)이어도 빌드·화면은 그대로 — GET 은 {agreed:false, stored:false}(화면이 묻는다), POST 는 503(화면은 이 기기 기록으로 계속)
import { NextResponse, type NextRequest } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, requireUser } from '@/lib/api'
import { isUuid } from '@/lib/seminar-rules'

const TABLE = 'smn_agre'
const noStore = { 'Cache-Control': 'no-store' }
// 테이블·스키마 미노출 — sql/008 적용 전
const missing = (code?: string) => !!code && (/^PGRST2/.test(code) || code === '42P01')

// 사용자·세미나 ID 확인 — 둘은 서로 독립이라 병렬(R-P1)
async function who(req: NextRequest, ctx: unknown) {
  const [user, { id }] = await Promise.all([requireUser(req), (ctx as { params: Promise<{ id: string }> }).params])
  if (user instanceof NextResponse) return user
  if (!isUuid(id)) return apiError('NOT_FOUND', 404)
  return { user, smnId: id.toLowerCase() }
}

export const GET = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const w = await who(req, ctx)
    if (w instanceof NextResponse) return w
    const { data, error } = await db()
      .from(TABLE)
      .select('agre_dtm')
      .eq('smn_id', w.smnId)
      .eq('usr_id', w.user.id)
      .eq('del_yn', 'N')
      .limit(1)
      .maybeSingle<{ agre_dtm: string }>()
    if (error && missing(error.code)) return NextResponse.json({ agreed: false, stored: false }, { headers: noStore })
    if (error) return dbFail(error)
    return NextResponse.json({ agreed: !!data, at: data?.agre_dtm ?? null, stored: true }, { headers: noStore })
  }),
)

export const POST = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const w = await who(req, ctx)
    if (w instanceof NextResponse) return w
    const { error } = await db().from(TABLE).insert({
      smn_id: w.smnId,
      usr_id: w.user.id,
      agre_dtm: new Date().toISOString(),
      regr_id: w.user.id,
      modr_id: w.user.id,
    })
    // 23505 = 이미 동의(유일 인덱스) → 성공(두 번 눌러도 1행, R-P5). 화면도 동의 뒤엔 다시 묻지 않는다
    if (error && error.code !== '23505') return dbFail(error)
    return NextResponse.json({ ok: true }, { headers: noStore })
  }),
)
