// seminar.pi 애플리케이션 모니터링 표본 전달(2026-10-31, M5) — 브라우저(MonRum)가 모은 API 응답 표본을 schema.pi 모니터링 수집 API 로 전달
// 로그인 사용자만(Pi 우선·Google 연동, 비로그인 = 401 → 브라우저가 그 화면에서 전송 중단), 운영 배포만 전달(로컬·미리보기 오염 방지)
// 비밀키·주소 = env MON_INGEST_KEY·MON_INGEST_URL(schema.pi 의 MON_INGEST_KEY 와 같은 값), 미설정이면 조용히 204
import type { NextRequest } from 'next/server'
import { monForward, monOn } from '@pi/mon'
import { apiError } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!monOn()) return new Response(null, { status: 204 }) // 운영 아니면 세션 조회도 하지 않음(R-P6)
  const user = await getSessionUser(req)
  if (!user) return apiError('AUTH_PI_REQUIRED', 401)
  return monForward(req, 'SEMINAR')
}
