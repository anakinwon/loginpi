// 화면 캡처 1장 — POST multipart { image: JPEG(600KB 이하) } → { ok }. 기록 시작자(발표자)만, 회의록이 RECORDING 일 때.
//  분당 2장(최근 60초 캡처 건수 — 서버도 막는다 R-P5) → Storage 비공개 버킷 smn-note `<ntId>/<시각>.jpg` → smn_nt_seg(img_key) 1행.
//  공개 URL 은 저장하지 않는다(서명 URL 로만 노출). 비로그인 401(redirect 없음, piFetch)
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { isJpeg, MAX_SHOT_BYTES, SHOT_PER_MIN } from '@/lib/note-rules'
import { uploadShot } from '@/lib/notes'
import { isUuid } from '@/lib/seminar-rules'

const noStore = { 'Cache-Control': 'no-store' }

export const POST = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [user, form, { id }] = await Promise.all([
      getSessionUser(req),
      req.formData().catch(() => null),
      (ctx as { params: Promise<{ id: string }> }).params,
    ])
    if (!user) return apiError('AUTH_PI_REQUIRED', 401)
    if (!isUuid(id)) return apiError('NOT_FOUND', 404)
    if (!form) return apiError('BAD_REQUEST_BODY', 400)
    const ntId = id.toLowerCase()
    const img = form.get('image')
    if (!(img instanceof Blob) || img.size > MAX_SHOT_BYTES)
      return apiError('NOTE_SHOT_INVALID', 400)
    const bytes = new Uint8Array(await img.arrayBuffer())
    if (!isJpeg(bytes)) return apiError('NOTE_SHOT_INVALID', 400)

    // 회의록 확인과 최근 캡처 건수는 독립 — 병렬(R-P1)
    const since = new Date(Date.now() - 60_000).toISOString()
    const [nt, recent] = await Promise.all([
      db()
        .from('smn_nt')
        .select('usr_id, nt_sts_cd')
        .eq('nt_id', ntId)
        .eq('del_yn', 'N')
        .maybeSingle<{ usr_id: string; nt_sts_cd: string }>(),
      db()
        .from('smn_nt_seg')
        .select('seg_id', { count: 'exact', head: true })
        .eq('nt_id', ntId)
        .eq('del_yn', 'N')
        .not('img_key', 'is', null)
        .gte('seg_dtm', since),
    ])
    if (nt.error) return dbFail(nt.error)
    if (recent.error) return dbFail(recent.error)
    if (!nt.data) return apiError('NOT_FOUND', 404)
    if (nt.data.usr_id !== user.id) return apiError('FORBIDDEN', 403)
    if (nt.data.nt_sts_cd !== 'RECORDING')
      return apiError('NOTE_NOT_RECORDING', 409)
    // ponytail: 건수 확인과 저장 사이 경합으로 동시 요청이면 3장이 될 수 있다 — 화면이 1장씩 순서대로 보내므로 충분
    if ((recent.count ?? 0) >= SHOT_PER_MIN)
      return apiError('NOTE_SHOT_RATE', 429)

    const now = new Date()
    const key = `${ntId}/${now.getTime()}-${randomUUID().slice(0, 8)}.jpg`
    const upErr = await uploadShot(key, bytes)
    if (upErr) {
      console.error('[notes/shot] 업로드 실패', upErr.message)
      return apiError('INTERNAL', 500)
    }
    const { error } = await db()
      .from('smn_nt_seg')
      .insert({
        nt_id: ntId,
        spk_usr_id: user.id,
        spk_nm: (user.display_name || user.pi_username || '').slice(0, 100),
        img_key: key,
        seg_dtm: now.toISOString(),
        regr_id: user.id,
        modr_id: user.id,
      })
    if (error) return dbFail(error)
    return NextResponse.json({ ok: true }, { headers: noStore })
  }),
  { maxBodySize: MAX_SHOT_BYTES + 16_384 },
)
