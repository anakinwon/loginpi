// 마이크 동의 기록(계획서 A-6·M-4) — GET = 이 세미나에 내가 동의했나, POST = 동의 일시 기록(멱등). 로그인 필수, 비로그인 401(redirect 없음).
//  테이블 smn_agr 는 F-A sql/008 10절 : agr_id·usr_id·smn_id·agr_tp_cd(SPEECH_XFER)·agr_ver_cd(처리방침 문안 버전)·agr_dtm + 시스템 4·논리삭제,
//  유일 인덱스 x_smn_agr_01(smn_id, usr_id, agr_tp_cd) WHERE del_yn='N'. /api/speech/chunk 의 fn_use_smn_vc 가 이 행으로 NO_AGR 을 가른다.
//  미적용(PGRST2xx·42P01)이어도 빌드·화면은 그대로 — GET 은 {agreed:false, stored:false}(화면은 이 기기 기록을 대신 쓴다), POST 는 503
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { agreeGate, noStore, who } from '@/lib/engage'
import { PRIVACY_VER } from '@/lib/speech-rules'

const TABLE = 'smn_agr'
const TP = 'SPEECH_XFER' // 세미나 음성 처리·국외 이전 동의(대면 노트 NOTE_NOTICE 는 /api/speech/agree)
// 테이블·스키마 미노출 — sql/008 적용 전
const missing = (code?: string) => !!code && (/^PGRST2/.test(code) || code === '42P01')

export const GET = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const w = await who(req, ctx)
    if (w instanceof NextResponse) return w
    const { data, error } = await db()
      .from(TABLE)
      .select('agr_dtm')
      .eq('smn_id', w.smnId)
      .eq('usr_id', w.user.id)
      .eq('agr_tp_cd', TP)
      .eq('del_yn', 'N')
      .limit(1)
      .maybeSingle<{ agr_dtm: string }>()
    if (error && missing(error.code)) return NextResponse.json({ agreed: false, stored: false }, { headers: noStore })
    if (error) return dbFail(error)
    return NextResponse.json({ agreed: !!data, at: data?.agr_dtm ?? null, stored: true }, { headers: noStore })
  }),
)

export const POST = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const w = await who(req, ctx)
    if (w instanceof NextResponse) return w
    // 자격 = /api/speech/agree 와 같은 판정(개최자·ADMIN·활성 참가 등록자, D-3) + 종료·취소 세미나 409(T04) — agreeGate 한 곳
    const denied = await agreeGate(w.smnId, w.user)
    if (denied) return denied
    const { error } = await db().from(TABLE).insert({
      smn_id: w.smnId,
      usr_id: w.user.id,
      agr_tp_cd: TP,
      agr_ver_cd: PRIVACY_VER,
      agr_dtm: new Date().toISOString(),
      regr_id: w.user.id,
      modr_id: w.user.id,
    })
    // 23505 = 이미 동의(유일 인덱스) → 성공(두 번 눌러도 1행, R-P5). 23503 = 없는 세미나(FK) → 404
    if (error?.code === '23503') return apiError('NOT_FOUND', 404)
    if (error && error.code !== '23505') return dbFail(error)
    return NextResponse.json({ ok: true }, { headers: noStore })
  }),
)
