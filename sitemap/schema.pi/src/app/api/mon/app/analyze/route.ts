// 애플리케이션 모니터링 AI 원인 분석 — POST {area_id, route, min, mdl_id?} : 한 API 경로의 오류·느림 원인과 해결 방안(그 분류체계 MON_AI — 요금제1~ SQL 쓰기 역할, 2026-10-22)
//  모델 = mdl_id(설정 > AI 분석 모델에 등록한 모델) 또는 기본 모델, 응답에 사용 모델·요금제·계정·소요·토큰·근거(구간·표본·소스 커밋)·재사용 여부·직전 분석
//  같은 입력이면 이전 결과 재사용(sql/073), AI 수정 배포 직후(배포 중 + 완료 후 30분)는 409 MON_AI_VERIFY — 화면은 실시간 확인으로 대신(2026-10-22 마스터 지시)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { normRoute } from '@/lib/mon'
import { analyzeRoute } from '@/lib/mon-ai'

export const maxDuration = 120

const body = z.object({ area_id: z.string().uuid(), route: z.string().max(200), min: z.number().int().min(5).max(1440), mdl_id: z.string().uuid().optional() })

export async function POST(req: Request) {
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  // 화면이 보낸 경로도 같은 정규화를 통과해야 함(경로 문자만 — 소스 파일 탐색에 쓰임)
  if (normRoute(b.route) !== b.route) return apiError('INVALID_INPUT', 400)
  try {
    const auth = await requireAreaRole(b.area_id, 'MON_AI')
    if (auth instanceof NextResponse) return auth
    const r = await analyzeRoute(b.route, b.min, b.mdl_id, auth.user.usr_id)
    if (r === 'OFF') return apiError('MON_AI_OFF', 503)
    if (r === 'GONE') return apiError('MON_AI_MDL_GONE', 409)
    if (!r) return apiError('MON_AI_FAIL', 502)
    if ('empty' in r) {
      const from = new Date(r.empty.from).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      const msg = `분석할 문제가 없습니다 — ${from}${r.empty.floor ? '(최근 AI 수정 배포 이후)' : ''}부터 이 경로의 오류·느림 0건(요청 ${r.empty.req}건). AI 를 부르지 않았습니다`
      return NextResponse.json({ ok: false, code: 'MON_AI_EMPTY', message: msg, ...r }, { status: 200 })
    }
    if ('block' in r) {
      const msg = r.block === 'DEPLOYING' ? `AI 수정(PR #${r.pr}) 운영 배포 중입니다 — 배포가 끝나면 실시간 확인으로 결과를 보십시오` : `AI 수정(PR #${r.pr}) 배포 직후라 재분석을 막았습니다(배포 전 오류가 섞여 해결된 문제가 미결로 보임) — 실시간 확인으로 판정하십시오`
      return NextResponse.json({ ok: false, code: 'MON_AI_VERIFY', message: msg, ...r }, { status: 409 })
    }
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
