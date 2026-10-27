// 음성 처리 동의 기록·철회 — POST { smnId 또는 ntId, agree: boolean } → { ok, already? }. 계획 A-6 : 말하는 역할이 마이크를 처음 켜기 직전 모달에서 1회.
// smnId = 세미나 음성 처리·국외 이전 동의(SPEECH_XFER), ntId = 대면 노트 참석자 고지 확인(NOTE_NOTICE, 노트 시작자 본인만).
// 동의가 없으면 /api/speech/chunk 가 403 SPEECH_NO_AGR. 철회 = 논리삭제(이후 조각 거부). 비로그인 401(redirect 없음, piFetch 로 호출)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  parseBody,
  requireUser,
} from '@/lib/api'
import { isUuid } from '@/lib/seminar-rules'
import { PRIVACY_VER } from '@/lib/speech-rules'

const Body = z
  .object({
    smnId: z.string().refine(isUuid).optional(),
    ntId: z.string().refine(isUuid).optional(),
    agree: z.boolean(),
  })
  .refine((b) => !!b.smnId !== !!b.ntId)

const noStore = { 'Cache-Control': 'no-store' }

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([
      requireUser(req),
      parseBody(req, Body),
    ])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const smnId = body.smnId?.toLowerCase() ?? null
    const ntId = body.ntId?.toLowerCase() ?? null
    const tp = smnId ? 'SPEECH_XFER' : 'NOTE_NOTICE'

    // 대면 노트는 시작자 본인만(남의 노트에 동의 행을 만들지 않게)
    if (ntId) {
      const { data, error } = await db()
        .from('smn_nt')
        .select('nt_id')
        .eq('nt_id', ntId)
        .eq('usr_id', user.id)
        .is('smn_id', null)
        .eq('del_yn', 'N')
        .maybeSingle()
      if (error) return dbFail(error)
      if (!data) return apiError('NOT_FOUND', 404)
    }

    if (!body.agree) {
      const q = db()
        .from('smn_agr')
        .update({
          del_yn: 'Y',
          del_dtm: new Date().toISOString(),
          modr_id: user.id,
        })
        .eq('usr_id', user.id)
        .eq('agr_tp_cd', tp)
        .eq('del_yn', 'N')
      const { error } = await (smnId
        ? q.eq('smn_id', smnId)
        : q.eq('nt_id', ntId as string))
      if (error) return dbFail(error)
      return NextResponse.json({ ok: true }, { headers: noStore })
    }

    const { error } = await db().from('smn_agr').insert({
      usr_id: user.id,
      smn_id: smnId,
      nt_id: ntId,
      agr_tp_cd: tp,
      agr_ver_cd: PRIVACY_VER,
      regr_id: user.id,
      modr_id: user.id,
    })
    // 이미 동의(x_smn_agr_01·02 유일 위반) = 성공, 없는 세미나(FK) = 404 — 동시 두 번 눌러도 1행(R-P5)
    if (error?.code === '23505')
      return NextResponse.json(
        { ok: true, already: true },
        { headers: noStore },
      )
    if (error?.code === '23503') return apiError('NOT_FOUND', 404)
    if (error) return dbFail(error)
    return NextResponse.json({ ok: true }, { headers: noStore })
  }),
)
