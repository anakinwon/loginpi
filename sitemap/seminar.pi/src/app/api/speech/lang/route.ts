// 자막 번역 언어 등록(마스터 A안 2026-10-31) — POST { smnId, lang } → 204. 청중 화면이 번역 자막을 켜 둔 언어를 세미나별로 남긴다(smn_trans_lang, sql/026 — 10분 안이면 활성).
//  발표자 음성 조각 전사(/api/speech/chunk)가 이 언어들로 서버에서 한 번에 번역해 자막 방송에 싣는다 → 청중 화면의 번역 왕복이 사라진다.
// 화면은 켤 때·언어 바꿀 때·TR_LANG_PING_MS(4분)마다 보낸다(piFetch — Pi Browser 는 쿠키가 없어 X-Pi-Token). 자격 = aiGate(개최자·ADMIN·활성 참가 + LIVE). 비로그인 401(redirect 없음)
// 순서 : 세션·본문 병렬(R-P1) → 언어 코드 검사(TRANSLATE_LANGS) → 자격 1왕복 → upsert 1왕복. 쓰기 1회/4분/청중이라 분당 창은 두지 않는다
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { aiGate, noStore } from '@/lib/engage'
import { isUuid } from '@/lib/seminar-rules'
import { isTranslateLang } from '@/lib/translate-rules'

const Body = z.object({
  smnId: z.string().refine(isUuid),
  lang: z.string().refine(isTranslateLang),
})

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([requireUser(req), parseBody(req, Body)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const smnId = body.smnId.toLowerCase()
    const denied = await aiGate(smnId, user)
    if (denied) return denied
    const now = new Date().toISOString()
    // 갱신 먼저(regr_id 는 처음 등록한 사람으로 두고 modr_id 만 — DA 시스템 컬럼 의미), 행이 없을 때만 INSERT. 같은 (세미나×언어) 동시 첫 등록은 PK 충돌(23505) = 다른 쪽이 넣은 것
    const upd = await db()
      .from('smn_trans_lang')
      .update({ lst_req_dtm: now, modr_id: user.id, mod_dtm: now })
      .eq('smn_id', smnId)
      .eq('lang_cd', body.lang)
      .select('smn_id')
    let error = upd.error
    if (!error && !upd.data?.length) {
      const ins = await db()
        .from('smn_trans_lang')
        .insert({ smn_id: smnId, lang_cd: body.lang, lst_req_dtm: now, regr_id: user.id, modr_id: user.id })
      error = ins.error && ins.error.code !== '23505' ? ins.error : null
    }
    if (error) {
      // sql/026 미적용(테이블 없음 42P01) 이면 조용히 204 — 청중 화면은 이전 경로(번역 요청)로 그대로 동작한다(fail-open, 적용 순서 사고 방지)
      if (error.code === '42P01' || error.code === 'PGRST205') return new NextResponse(null, { status: 204, headers: noStore })
      return dbFail(error)
    }
    return new NextResponse(null, { status: 204, headers: noStore })
  }),
)
