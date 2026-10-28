// AI 회의록 끄기·요약 — POST /api/notes/[id]/end : 기록 시작자·개최자·관리자만. RECORDING|FAILED → 요약(lib/notes finishNote — 조건부 갱신, 두 번 눌러도 요약 1회, R-P5).
//  부르는 곳 : 발표자 끄기·퇴장(pagehide keepalive)·회의록 화면 [기록 끝내고 요약]·FAILED [다시 만들기](마지막 실패 1분 뒤부터, 이르면 409).
//  응답 { status }. 화면은 기다리지 않고 회의록 화면이 5초 간격으로 상태를 본다. 비로그인 401(redirect 없음)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, dbFail, dbRoute, requireUser } from '@/lib/api'
import { finishNote, loadNote } from '@/lib/notes'
import { isUuid } from '@/lib/seminar-rules'
import { planAiOk } from '@/lib/speech-gate'

export const maxDuration = 60 // 요약 30초 + 조회·캡처 읽기 여유
const noStore = { 'Cache-Control': 'no-store' }

export const POST = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [user, { id }] = await Promise.all([
      requireUser(req),
      (ctx as { params: Promise<{ id: string }> }).params,
    ])
    if (user instanceof NextResponse) return user
    if (!isUuid(id)) return apiError('NOT_FOUND', 404)
    const ntId = id.toLowerCase()
    const n = await loadNote(ntId, user)
    if (n.error) return dbFail(n.error)
    if (!n.note)
      return apiError(
        n.forbidden ? 'FORBIDDEN' : 'NOT_FOUND',
        n.forbidden ? 403 : 404,
      )
    if (!n.manage) return apiError('FORBIDDEN', 403)
    // 세미나 회의록 요약 = AI — 무료 개최자 세미나 제외(sql/015, speech-gate 와 같은 판정)
    if (n.note.smn_id) {
      const paid = await planAiOk(n.note.smn_id)
      if (paid instanceof Error) return apiError('DB_UNAVAILABLE', 503)
      if (!paid) return apiError('PLAN_AI_PAID', 402)
    }
    const from = n.note.nt_sts_cd
    if (from !== 'RECORDING' && from !== 'FAILED')
      return NextResponse.json({ status: from }, { headers: noStore })
    const r = await finishNote(ntId, from, user.id)
    if ('error' in r) return dbFail(r.error)
    if (r.status === 'RETRY_SOON') return apiError('NOTE_RETRY_SOON', 409)
    return NextResponse.json({ status: r.status }, { headers: noStore })
  }),
)
