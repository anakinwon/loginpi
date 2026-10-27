// 회의록 조회 — GET /api/notes/[id] : 기록 시작자·개최자·관리자·참가 등록자만(그 밖 403, 비로그인 401 — redirect 없음, piFetch).
//  ?part 없음 = 머리(제목·시각·상태·요약·manage) / ?part=segs&page=N = 전체 기록 50줄(데이터 패칭 표준 ①, 쪽 수용 건수 포함)
//  / ?part=shots = 화면 캡처 서명 URL(1시간, 최대 120장) / ?part=md&tz= = Markdown 본문(내려받기 — 화면이 Blob 으로 저장)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, requireUser } from '@/lib/api'
import {
  hhmm,
  MAX_MD_SEGS,
  MAX_SHOTS_LIST,
  noteMarkdown,
  SEG_PAGE,
} from '@/lib/note-rules'
import { loadNote, readSegs, signShots } from '@/lib/notes'
import { isUuid } from '@/lib/seminar-rules'

const noStore = { 'Cache-Control': 'no-store' }
type Seg = {
  seg_dtm: string
  spk_nm: string
  seg_cont: string | null
  img_key: string | null
}

// Markdown 라벨 — 언어별(ko 원본·en). 화면 문구 키와 같은 뜻
const MD_L: Record<
  string,
  {
    points: string
    decisions: string
    todos: string
    transcript: string
    shot: string
    cut: string
  }
> = {
  ko: {
    points: '요점',
    decisions: '결정 사항',
    todos: '할 일',
    transcript: '전체 기록',
    shot: '화면 캡처',
    cut: '이하 생략(기록이 길어 뒷부분은 들어가지 않았습니다)',
  },
  en: {
    points: 'Key points',
    decisions: 'Decisions',
    todos: 'Action items',
    transcript: 'Transcript',
    shot: 'Screen capture',
    cut: 'Truncated (the rest of a long transcript is not included)',
  },
}

export const GET = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [user, { id }] = await Promise.all([
      requireUser(req),
      (ctx as { params: Promise<{ id: string }> }).params,
    ])
    if (user instanceof NextResponse) return user
    if (!isUuid(id)) return apiError('NOT_FOUND', 404)
    const ntId = id.toLowerCase()
    const q = req.nextUrl.searchParams
    const part = q.get('part')
    const segs = () =>
      db()
        .from('smn_nt_seg')
        .select('seg_dtm, spk_nm, seg_cont, img_key')
        .eq('nt_id', ntId)
        .eq('del_yn', 'N')

    if (part === 'segs') {
      const page = Math.max(1, Math.floor(Number(q.get('page')) || 1))
      // 권한 확인과 쪽 조회는 독립 — 병렬(R-P1), 권한이 없으면 결과를 버린다. 글 조각만(캡처는 shots)
      const [n, r] = await Promise.all([
        loadNote(ntId, user),
        db()
          .from('smn_nt_seg')
          .select('seg_dtm, spk_nm, seg_cont', { count: 'exact' })
          .eq('nt_id', ntId)
          .eq('del_yn', 'N')
          .not('seg_cont', 'is', null)
          .order('seg_dtm')
          .range((page - 1) * SEG_PAGE, page * SEG_PAGE - 1),
      ])
      if (n.error) return dbFail(n.error)
      if (!n.note)
        return apiError(
          n.forbidden ? 'FORBIDDEN' : 'NOT_FOUND',
          n.forbidden ? 403 : 404,
        )
      if (r.error) return dbFail(r.error)
      return NextResponse.json(
        {
          segs: (r.data ?? []).map((s) => ({
            at: s.seg_dtm,
            spk: s.spk_nm,
            text: s.seg_cont,
          })),
          total: r.count ?? 0,
        },
        { headers: noStore },
      )
    }

    if (part === 'shots') {
      const [n, r] = await Promise.all([
        loadNote(ntId, user),
        segs()
          .not('img_key', 'is', null)
          .order('seg_dtm')
          .limit(MAX_SHOTS_LIST),
      ])
      if (n.error) return dbFail(n.error)
      if (!n.note)
        return apiError(
          n.forbidden ? 'FORBIDDEN' : 'NOT_FOUND',
          n.forbidden ? 403 : 404,
        )
      if (r.error) return dbFail(r.error)
      const rows = (r.data ?? []) as Seg[]
      const urls = await signShots(rows.map((s) => s.img_key!))
      return NextResponse.json(
        {
          shots: rows
            .map((s, i) => ({ at: s.seg_dtm, url: urls[i] ?? null }))
            .filter((s) => s.url),
        },
        { headers: noStore },
      )
    }

    if (part === 'md') {
      const [n, r] = await Promise.all([
        loadNote(ntId, user),
        readSegs(ntId, MAX_MD_SEGS), // 1000행 상한에 안 잘리게 이어 읽기
      ])
      if (n.error) return dbFail(n.error)
      if (!n.note)
        return apiError(
          n.forbidden ? 'FORBIDDEN' : 'NOT_FOUND',
          n.forbidden ? 403 : 404,
        )
      if ('error' in r) return dbFail(r.error)
      const tz = q.get('tz') || undefined
      const L = MD_L[q.get('lang') ?? ''] ?? MD_L.ko
      const at = (iso: string) => hhmm(iso, tz)
      const day = (iso: string) => {
        try {
          return new Date(iso).toLocaleString(q.get('lang') ?? 'ko', {
            timeZone: tz,
          })
        } catch {
          return iso
        }
      }
      const md = noteMarkdown(
        {
          title: n.note.nt_nm,
          start: day(n.note.start_dtm),
          end: n.note.end_dtm ? day(n.note.end_dtm) : null,
          summary: n.note.smr_val,
        },
        r.rows.map((s) => ({
          at: at(s.seg_dtm),
          spk: s.spk_nm,
          text: s.seg_cont,
          shot: !!s.img_key,
        })),
        L,
        r.cut,
      )
      return new NextResponse(md, {
        headers: { ...noStore, 'Content-Type': 'text/markdown; charset=utf-8' },
      })
    }

    const n = await loadNote(ntId, user)
    if (n.error) return dbFail(n.error)
    if (!n.note)
      return apiError(
        n.forbidden ? 'FORBIDDEN' : 'NOT_FOUND',
        n.forbidden ? 403 : 404,
      )
    const { nt_nm, smn_id, start_dtm, end_dtm, nt_sts_cd, smr_val } = n.note
    return NextResponse.json(
      {
        title: nt_nm,
        smnId: smn_id,
        start: start_dtm,
        end: end_dtm,
        status: nt_sts_cd,
        summary: smr_val,
        manage: n.manage,
      },
      { headers: noStore },
    )
  }),
)
