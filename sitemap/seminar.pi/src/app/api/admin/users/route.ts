// 사용자관리(관리자 메뉴, 2026-10-31) — ADMIN 전용. GET ?page=N&q=검색어 → 사용자(최근 로그인 순, 12명씩) + 요금제별(FREE·M·Y) 남은 시간·만료.
//  남은 시간은 그 쪽 사용자들의 유효 이용권을 한 번에 읽어 계산(plan-rules planTimes — 읽기만, 행마다 RPC 를 부르면 무료 이용권을 만들어 버림).
//  검색 = Pi 사용자명·표시 이름 부분일치(2글자 이상, 글자·숫자·_.- 공백만 — PostgREST or 필터 주입 차단). 비로그인 401·비관리자 403(redirect 없음)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { db, dbFail, dbRoute, requireAdmin } from '@/lib/api'
import { PAGE_SIZE, parsePage, planTimes, type PassRow } from '@/lib/seminar-rules'

const noStore = { 'Cache-Control': 'no-store' }

type UserRow = { usr_id: string; dsp_nm: string | null; pi_usr_nm: string | null; role_cd: string; lst_lgn_dtm: string | null }

export const GET = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireAdmin(req)
    if (user instanceof NextResponse) return user
    const sp = req.nextUrl.searchParams
    const page = parsePage(sp.get('page'))
    const raw = (sp.get('q') ?? '').trim()
    // 결합 문자(\p{M} — 태국어 성조·힌디어 모음 기호)는 남긴다(PostgREST 예약 문자 아님)
    const q = raw.replace(/[^\p{L}\p{M}\p{N}_.\- ]/gu, '').trim().slice(0, 40)
    // 검색어를 넣었는데 정리하고 2글자가 안 되면 전체 목록이 아니라 빈 결과(필터가 조용히 빠지지 않게)
    if (raw.length >= 2 && q.length < 2) return NextResponse.json({ rows: [], total: 0, page: 1 }, { headers: noStore })
    let query = db()
      .from('sys_user')
      .select('usr_id, dsp_nm, pi_usr_nm, role_cd, lst_lgn_dtm', { count: 'exact' })
      .eq('del_yn', 'N')
    if (q.length >= 2) query = query.or(`pi_usr_nm.ilike.*${q}*,dsp_nm.ilike.*${q}*`)
    const { data, error, count } = await query
      .order('lst_lgn_dtm', { ascending: false, nullsFirst: false })
      .order('usr_id')
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
      .returns<UserRow[]>()
    if (error) return dbFail(error)
    const ids = data.map((u) => u.usr_id)
    const now = Date.now()
    const passes = new Map<string, PassRow[]>()
    if (ids.length) {
      const iso = new Date(now).toISOString()
      // 이번 달 무료 발급 여부 판정에 쓰는 무료 이용권(시작 = 이번 달 초)도 유효 범위 안이라 이 조건으로 함께 온다
      const { data: ps, error: pe } = await db()
        .from('smn_hst_pln')
        .select('usr_id, plan_cd, grnt_sec_cnt, use_sec_cnt, strt_dtm, end_dtm, grnt_rsn_cd')
        .in('usr_id', ids)
        .eq('del_yn', 'N')
        .lte('strt_dtm', iso)
        .gt('end_dtm', iso)
        .returns<(PassRow & { usr_id: string })[]>()
      if (pe) return dbFail(pe)
      for (const p of ps) passes.set(p.usr_id, [...(passes.get(p.usr_id) ?? []), p])
    }
    return NextResponse.json(
      {
        rows: data.map((u) => ({
          id: u.usr_id,
          name: u.dsp_nm || u.pi_usr_nm || '',
          piName: u.pi_usr_nm,
          admin: u.role_cd === 'ADMIN',
          lastLogin: u.lst_lgn_dtm,
          times: planTimes(passes.get(u.usr_id) ?? [], now),
        })),
        total: count ?? 0,
        page,
      },
      { headers: noStore },
    )
  }),
)
