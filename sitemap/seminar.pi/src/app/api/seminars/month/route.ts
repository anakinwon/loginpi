// 홈 세미나 달력(마스터 2026-10-30) — GET ?from=<ISO>&to=<ISO>(보는 사람 지역 달의 처음·끝, 45일 이하) 기간 안 세미나.
//  지난 이력 포함(예정·진행 중·종료, 취소 제외), 시작 순 최대 CAL_MAX 건. 칼럼은 전체 탭과 같은 공개 정보(제목·시작·상태)이되 종료 이력이 더해진다 —
//  그래서 기간은 화면 범위(지난 12달 ~ 앞 12달, calRangeOk)만 받는다. 로그인 불필요·공개 캐시
//  ponytail: 종료 포함이라 부분 인덱스 x_smn_mst_01(예정·진행 중)을 못 쓴다 — 세미나 수가 커지면 (start_dtm) WHERE del_yn='N' 인덱스 추가
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { CAL_MAX, CAL_STS, calRangeOk, smnTitle } from '@/lib/seminar-rules'

type Row = { smn_id: string; smn_nm: string; subttl: string | null; start_dtm: string; smn_sts_cd: string }

export const GET = withAuthGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const from = Date.parse(sp.get('from') ?? '')
    const to = Date.parse(sp.get('to') ?? '')
    if (!calRangeOk(from, to)) return apiError('INVALID_INPUT', 400)
    const { data, error } = await db()
      .from('smn_mst')
      .select('smn_id, smn_nm, subttl, start_dtm, smn_sts_cd')
      .eq('del_yn', 'N')
      .in('smn_sts_cd', [...CAL_STS])
      .gte('start_dtm', new Date(from).toISOString())
      .lt('start_dtm', new Date(to).toISOString())
      .order('start_dtm', { ascending: true })
      .order('smn_id')
      .limit(CAL_MAX)
      .returns<Row[]>()
    if (error) return dbFail(error)
    return NextResponse.json(
      { rows: data.map((r) => ({ id: r.smn_id, title: smnTitle(r.smn_nm, r.subttl), startAt: r.start_dtm, status: r.smn_sts_cd })) },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    )
  }),
)
