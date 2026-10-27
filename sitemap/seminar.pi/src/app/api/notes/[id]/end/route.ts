// AI 회의록 끄기·요약 — POST /api/notes/[id]/end : 기록 시작자·개최자·관리자만. RECORDING → SUMMARIZING(조건부 갱신 — 두 번 눌러도 요약 1회, R-P5)
//  → 조각 글 + 캡처(최대 12장) → 외부 AI 요약(30초, BUILD_DEFECTS 2.7) → DONE{smr_val} | FAILED. FAILED 는 같은 호출로 다시 만들기(설계서 15.9).
//  응답 { status }. 화면은 기다리지 않고 회의록 화면이 5초 간격으로 상태를 본다. 비로그인 401(redirect 없음)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, requireUser } from '@/lib/api'
import { MAX_SUMMARY_IMAGES, summarize } from '@/lib/gemini'
import { hhmm } from '@/lib/note-rules'
import { loadNote, readShots } from '@/lib/notes'
import { isUuid } from '@/lib/seminar-rules'

export const maxDuration = 60 // 요약 30초 + 조회·캡처 읽기 여유
const noStore = { 'Cache-Control': 'no-store' }
const MAX_SUMMARY_SEGS = 3000 // 요약 입력 조각 상한(5초 조각 약 4시간)

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
    const from = n.note.nt_sts_cd
    if (from !== 'RECORDING' && from !== 'FAILED')
      return NextResponse.json({ status: from }, { headers: noStore })

    // 상태 선점 — 이 갱신에 성공한 요청 1건만 요약한다
    const { data: won, error: upErr } = await db()
      .from('smn_nt')
      .update({
        nt_sts_cd: 'SUMMARIZING',
        ...(from === 'RECORDING' ? { end_dtm: new Date().toISOString() } : {}),
        modr_id: user.id,
        mod_dtm: new Date().toISOString(),
      })
      .eq('nt_id', ntId)
      .eq('nt_sts_cd', from)
      .select('nt_id')
    if (upErr) return dbFail(upErr)
    if (!won?.length)
      return NextResponse.json({ status: 'SUMMARIZING' }, { headers: noStore })

    // 글 조각·캡처 키는 서로 독립 — 병렬(R-P1)
    const base = () =>
      db()
        .from('smn_nt_seg')
        .select('seg_dtm, spk_nm, seg_cont, img_key')
        .eq('nt_id', ntId)
        .eq('del_yn', 'N')
    const [t, s] = await Promise.all([
      base()
        .not('seg_cont', 'is', null)
        .order('seg_dtm')
        .limit(MAX_SUMMARY_SEGS),
      base()
        .not('img_key', 'is', null)
        .order('seg_dtm')
        .limit(MAX_SUMMARY_IMAGES),
    ])
    // ponytail: 함수가 요약 중 죽으면(시간 초과) SUMMARIZING 에 남는다 — 화면은 2분 뒤 새로 고침 안내. 잦으면 mod_dtm 2분 지난 SUMMARIZING 도 다시 만들기 허용
    let smr: { points: string[]; decisions: string[]; todos: string[] } | null =
      null
    if (!t.error && !s.error && !t.data?.length)
      smr = { points: [], decisions: [], todos: [] } // 말한 내용이 없다 = 빈 요약(실패 아님)
    else if (!t.error && !s.error) {
      const images = await readShots(
        (s.data ?? []).map((x) => x.img_key as string),
      )
      smr = await summarize(
        (t.data ?? []).map((x) => ({
          at: hhmm(x.seg_dtm),
          spk: x.spk_nm,
          text: x.seg_cont ?? '',
        })),
        images,
      )
    }
    const status = smr ? 'DONE' : 'FAILED'
    const { error } = await db()
      .from('smn_nt')
      .update({
        nt_sts_cd: status,
        smr_val: smr,
        modr_id: user.id,
        mod_dtm: new Date().toISOString(),
      })
      .eq('nt_id', ntId)
    if (error) return dbFail(error)
    return NextResponse.json({ status }, { headers: noStore })
  }),
)
