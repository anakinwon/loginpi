// 세미나 일정 파일(.ics, RFC 5545) — GET, 세션 없이 열리는 공개 라우트(UI 설계 15.8 : <a download> 는 X-Pi-Token 을 못 붙인다).
//  내보내는 값 = 제목·시작일시·상세 딥링크·(있으면) 회의록 링크뿐 — 상세 API 비로그인 응답과 같은 공개 범위. 조회 2건 병렬(R-P1)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { buildIcs, icsNotesLabel } from '@/lib/calendar-rules'
import { isUuid } from '@/lib/seminar-rules'

export const GET = withGuard(
  dbRoute(async (req, ctx) => {
    const { id: raw } = await (ctx as { params: Promise<{ id: string }> }).params
    if (!isUuid(raw)) return apiError('NOT_FOUND', 404)
    const id = raw.toLowerCase()

    const [smn, nt] = await Promise.all([
      db()
        .from('smn_mst')
        .select('smn_nm, start_dtm, smn_sts_cd, mod_dtm')
        .eq('smn_id', id)
        .eq('del_yn', 'N')
        .maybeSingle<{ smn_nm: string; start_dtm: string; smn_sts_cd: string; mod_dtm: string }>(),
      // 완성된 회의록 최신 1건(R-P3, x_smn_nt_01 순서)
      db()
        .from('smn_nt')
        .select('nt_id')
        .eq('smn_id', id)
        .eq('nt_sts_cd', 'DONE')
        .eq('del_yn', 'N')
        .order('start_dtm', { ascending: false })
        .limit(1),
    ])
    if (smn.error) return dbFail(smn.error)
    if (nt.error) return dbFail(nt.error)
    if (!smn.data) return apiError('NOT_FOUND', 404)

    // 링크는 배포 주소 기준 — Pi Browser 포워딩 도메인이 아니라 누구나 여는 주소. locale 접두 없음(as-needed + 자동 감지)
    const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
    const ntId = nt.data?.[0]?.nt_id as string | undefined
    const body = buildIcs({
      id,
      title: smn.data.smn_nm,
      startAt: smn.data.start_dtm,
      url: `${base}/s/${id}`,
      notesUrl: ntId ? `${base}/notes/${ntId}` : null,
      canceled: smn.data.smn_sts_cd === 'CANCELED',
      modAt: smn.data.mod_dtm,
      notesLabel: icsNotesLabel(req.nextUrl.searchParams.get('hl')),
    })
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="seminar-${id.slice(0, 8)}.ics"`,
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  }),
)
