// 대면 노트 원본 음성 1분 파일 — POST multipart { audio(독립 파일 webm/ogg/mp4, 1.5MB 이하), seq, off(노트 시작 뒤 ms) } → { ok }.
//  기록 시작자만, 대면 노트(세미나 없음)가 RECORDING 일 때. 비공개 버킷 smn-note aud/<ntId>/<seq>-<off>.<ext>(같은 seq 재시도는 덮어씀).
//  종료 때 정밀 전사(lib/note-audio refineNote) 입력, 종료 1일 뒤 삭제(STT PoC 1단계, 마스터 2026-10-29). 비로그인 401(redirect 없음, piFetch)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { AUD, audName } from '@/lib/note-rules'
import { NOTE_BUCKET, uploadObj } from '@/lib/notes'
import { isUuid } from '@/lib/seminar-rules'
import { baseMime, sniffBox, speechMaxSec } from '@/lib/speech-rules'
import { env } from '@/env'

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
    const audio = form.get('audio')
    const mime = audio instanceof Blob ? baseMime(audio.type) : null
    // 파일 수 상한 = 음성 처리 상한(분) — 실시간 전사가 멈추는 길이 넘어 원본만 쌓이지 않게(보안 검토 : 무한 업로드)
    const maxSeq = Math.ceil(speechMaxSec(env.SPEECH_MAX_MIN) / 60)
    const name = mime ? audName(Number(form.get('seq')), Number(form.get('off')), mime, maxSeq) : null
    if (!(audio instanceof Blob) || !mime || !name || !audio.size || audio.size > AUD.maxBytes)
      return apiError('NOTE_AUDIO_INVALID', 400)
    const bytes = new Uint8Array(await audio.arrayBuffer())
    // 혼자 재생되는 파일인지(머리 확인) — 'audio/webm' → 'webm' 상자
    if (sniffBox(bytes) !== mime.split('/')[1]) return apiError('NOTE_AUDIO_INVALID', 400)

    const nt = await db()
      .from('smn_nt')
      .select('usr_id, smn_id, nt_sts_cd')
      .eq('nt_id', ntId)
      .eq('del_yn', 'N')
      .maybeSingle<{ usr_id: string; smn_id: string | null; nt_sts_cd: string }>()
    if (nt.error) return dbFail(nt.error)
    if (!nt.data || nt.data.smn_id) return apiError('NOT_FOUND', 404)
    if (nt.data.usr_id !== user.id) return apiError('FORBIDDEN', 403)
    if (nt.data.nt_sts_cd !== 'RECORDING') return apiError('NOTE_NOT_RECORDING', 409)

    // 같은 순번은 1개만 — 이름에 off 가 들어가 off 만 바꿔 보내면 같은 seq 로 객체가 끝없이 쌓였다(보안 검토). 같은 이름 재시도(덮어쓰기)만 허용
    const seqKey = name.slice(0, 7) // '000123-'
    const same = await db().storage.from(NOTE_BUCKET).list(`aud/${ntId}`, { search: seqKey, limit: 2 })
    // 버킷이 아직 없으면(첫 사용) 목록 실패 = 같은 순번 없음 — 올리기가 버킷을 만든다(uploadObj)
    if (same.error && !/not.?found/i.test(same.error.message)) return apiError('INTERNAL', 500)
    if ((same.data ?? []).some((o) => o.name.startsWith(seqKey) && o.name !== name)) return apiError('NOTE_AUDIO_INVALID', 400)
    const upErr = await uploadObj(`aud/${ntId}/${name}`, bytes, mime, true)
    if (upErr) {
      console.error('[notes/audio] 업로드 실패', upErr.message)
      return apiError('INTERNAL', 500)
    }
    return NextResponse.json({ ok: true }, { headers: noStore })
  }),
  { maxBodySize: AUD.maxBytes + 16_384 },
)
