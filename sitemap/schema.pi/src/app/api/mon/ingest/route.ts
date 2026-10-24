// 다른 시스템 애플리케이션 모니터링 수집(2026-10-24 마스터 지시 — cafe.pi·sitemap.pi 를 이 모니터링 화면에서 선택)
// POST { sys, s } : 그 앱 서버가 로그인 세션 확인 후 @pi/mon monForward 로 전달(헤더 x-mon-key = MON_INGEST_KEY). 브라우저는 자기 앱 /api/mon/app 만 부름
// schema.pi 자신(SCHEMA)은 받지 않음 — 자기 표본은 /api/mon/app(로그인 사용자) 경로. 운영 배포만 저장(로컬·미리보기 오염 방지, T2)
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, parseBody } from '@/lib/api'
import { bucketize, evtCd, isSys, toSamples } from '@/lib/mon'
import { addApp, addAppEvt } from '@/lib/mon-srv'

const body = z.object({ sys: z.string().max(20), s: z.array(z.object({ r: z.string().max(2000), t: z.number(), ms: z.number(), st: z.number().int().min(0).max(999), p: z.string().max(300).optional() })).max(500) })

const keyOk = (got: string | null) => {
  const want = process.env.MON_INGEST_KEY
  if (!want || !got) return false
  const a = Buffer.from(got)
  const b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (process.env.VERCEL_ENV !== 'production') return new NextResponse(null, { status: 204 })
  if (!keyOk(req.headers.get('x-mon-key'))) return apiError('AUTH_REQUIRED', 401)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  if (!isSys(b.sys) || b.sys === 'SCHEMA') return apiError('INVALID_INPUT', 400)
  const ss = toSamples(b.s)
  try {
    await Promise.all([addApp(bucketize(ss), b.sys), addAppEvt(null, ss.filter((s) => evtCd(s.ms, s.status)).slice(-50), b.sys)])
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
