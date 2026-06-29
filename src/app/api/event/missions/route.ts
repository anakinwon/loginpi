import { NextRequest, NextResponse } from 'next/server'
import { publicCacheHeaders } from '@/lib/cache-headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

interface Mission {
  mission_cd: string
  mission_nm: string
  mission_guide_desc?: string
  complete_type_cd: string
  mission_ord?: number
}

// GET /api/event/missions?event_id=evt-20260614-001&page=1&limit=10
// 이벤트 미션 목록 (페이지네이션)
//
// 입력:
//   event_id: 이벤트 ID (필수)
//   page: 페이지번호 1부터 (기본: 1)
//   limit: 페이지당 미션 수 (기본: 10, 최대: 50)
//
// 응답:
//   missions: 페이지네이션된 미션 목록
//   total: 전체 미션 개수
//   page: 현재 페이지
//   limit: 페이지당 항목 수
//   total_pages: 전체 페이지 수
//
// 캐싱: publicCacheHeaders(600) — 10분 캐싱 (공개 미션만)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const eventId = searchParams.get('event_id')?.trim()
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(
    Math.max(1, Number(searchParams.get('limit') ?? '10')),
    50,
  )

  // 입력값 검증
  if (!eventId) {
    return NextResponse.json(
      { error: 'event_id는 필수 필드입니다' },
      { status: 400 },
    )
  }

  try {
    const db = getSupabaseAdmin()

    // 1단계: 전체 미션 개수 조회
    const { count: totalCount } = await db
      .from('evt_mission')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('del_yn', 'N')

    const total = totalCount ?? 0
    const totalPages = Math.max(1, Math.ceil(total / limit))

    // 페이지 범위 검증 (범위 초과 시 마지막 페이지로)
    const actualPage = Math.min(page, totalPages)
    const offset = (actualPage - 1) * limit

    // 2단계: 페이지네이션 미션 조회
    const { data: missionsData, error } = await db
      .from('evt_mission')
      .select(
        'mission_cd, mission_nm, mission_guide_desc, complete_type_cd, mission_ord',
      )
      .eq('event_id', eventId)
      .eq('del_yn', 'N')
      .order('mission_ord', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`미션 조회 실패: ${error.message}`)
    }

    // 3단계: mission_cd 트림 처리 (CHAR 타입 패딩 제거)
    const missions: Mission[] = (missionsData ?? []).map((m) => ({
      ...m,
      mission_cd: (m.mission_cd as string).trim(),
    }))

    return NextResponse.json(
      {
        missions,
        total,
        page: actualPage,
        limit,
        total_pages: totalPages,
      },
      { headers: publicCacheHeaders(600) }, // 10분 캐싱
    )
  } catch (err) {
    console.error('[event/missions] 조회 실패:', err)
    return NextResponse.json({ error: '미션 조회 실패' }, { status: 500 })
  }
}
