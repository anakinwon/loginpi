// 회의록 조회 — GET /api/notes/[id] : 기록 시작자·개최자·관리자·참가 등록자만(그 밖 403, 비로그인 401 — redirect 없음, piFetch).
//  ?part 없음 = 머리(제목·시각·상태·요약·manage) / ?part=segs&page=N = 전체 기록 50줄(데이터 패칭 표준 ①, 쪽 수용 건수 포함)
//  / ?part=shots = 화면 캡처 서명 URL(1시간, 최대 120장) / ?part=md&tz= = Markdown 본문(내려받기 — 화면이 Blob 으로 저장)
// 회의록 삭제 — DELETE /api/notes/[id] : 기록 시작자(소유자)·ADMIN 만. smn_nt → smn_nt_seg 순서로 논리삭제(del_yn·del_dtm, 물리 DELETE 금지).
//  이미 삭제된 회의록을 소유자·ADMIN 이 다시 지우면 조각 논리삭제만 다시 실행(멱등, 200). 삭제 뒤엔 모든 조회(머리·기록·캡처 서명 URL·Markdown·끝내기·캡처 올리기·음성 조각 저장)가 del_yn='N' 조건이라 404 — 캡처 원본은 서명 URL 발급이 막힌다
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, requireUser } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import {
  hhmm,
  MAX_MD_SEGS,
  MAX_SHOTS_LIST,
  noteMarkdown,
  pickLabels,
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
    blank: string
  }
> = {
  ko: {
    points: '요점',
    decisions: '결정 사항',
    todos: '할 일',
    transcript: '전체 기록',
    shot: '화면 캡처',
    cut: '이하 생략(기록이 길어 뒷부분은 들어가지 않았습니다)',
    blank: '기록된 내용이 없습니다',
  },
  en: {
    points: 'Key points',
    decisions: 'Decisions',
    todos: 'Action items',
    transcript: 'Transcript',
    shot: 'Screen capture',
    cut: 'Truncated (the rest of a long transcript is not included)',
    blank: 'Nothing was recorded',
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
          .order('seg_id') // 같은 시각 조각(동시 화자) — 쪽 경계에서 중복·누락 없게
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
      const L = pickLabels(MD_L, q.get('lang'))
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
        del: n.note.usr_id === user.id || isAdmin(user),
      },
      { headers: noStore },
    )
  }),
)

export const DELETE = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [user, { id }] = await Promise.all([
      requireUser(req),
      (ctx as { params: Promise<{ id: string }> }).params,
    ])
    if (user instanceof NextResponse) return user
    if (!isUuid(id)) return apiError('NOT_FOUND', 404)
    const ntId = id.toLowerCase()
    const now = new Date().toISOString()
    const off = { del_yn: 'Y', del_dtm: now, modr_id: user.id, mod_dtm: now }
    // 소유자·ADMIN 확인과 삭제를 한 문장으로(조건부 갱신 — 남의 회의록은 0행, 두 번 눌러도 두 번째는 0행 R-P5)
    let q = db().from('smn_nt').update(off).eq('nt_id', ntId).eq('del_yn', 'N')
    if (!isAdmin(user)) q = q.eq('usr_id', user.id)
    const { data, error } = await q.select('nt_id')
    if (error) return dbFail(error)
    // 0행 = 없음·이미 삭제·권한 없음. 이미 삭제된 내 회의록(ADMIN 은 아무 회의록)이면 조각 논리삭제를 다시 돌린다(멱등 —
    //  이전 삭제의 조각 갱신이 실패했거나, 삭제 직전에 읽은 음성 조각이 삭제 뒤 저장된 경우 다시 누르면 정리된다). 그 밖은 404 하나로(존재 여부 비공개)
    if (!data?.length) {
      const { data: g, error: ge } = await db()
        .from('smn_nt')
        .select('usr_id, del_yn')
        .eq('nt_id', ntId)
        .maybeSingle<{ usr_id: string; del_yn: string }>()
      if (ge) return dbFail(ge)
      if (!g || g.del_yn !== 'Y' || (g.usr_id !== user.id && !isAdmin(user)))
        return apiError('NOT_FOUND', 404)
    }
    // 조각은 회의록 뒤에 — 회의록이 먼저 닫혀야 조각이 실패해도 노출되지 않는다(모든 조각 조회는 회의록 권한 확인을 거친다)
    const seg = await db()
      .from('smn_nt_seg')
      .update(off)
      .eq('nt_id', ntId)
      .eq('del_yn', 'N')
    if (seg.error) return dbFail(seg.error)
    return NextResponse.json({ ok: true }, { headers: noStore })
  }),
)
