import { NextRequest, NextResponse, after } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { routing } from '@/i18n/routing'

const ALLOWED = new Set<string>(routing.locales)

// POST /api/admin/i18n/translate-all
// 미완료 locale 목록을 받아 백그라운드(after)로 순차 translate + sync 처리한다.
// 응답은 즉시 반환되고, 실제 작업은 서버가 응답 이후에도 계속 수행하므로
// admin이 페이지를 벗어나거나 브라우저를 닫아도 번역이 끝까지 진행된다.
//
// 주의: sync는 messages/*.json을 writeFile 하므로 파일시스템 쓰기가 가능한
//   로컬 개발 환경 운영을 전제로 한다(Vercel 프로덕션 fs는 read-only).
//   번역 결과는 이후 git 커밋·배포로 반영한다.
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { locales } = (await req.json().catch(() => ({}))) as {
    locales?: string[]
  }
  const targets = [...new Set(locales ?? [])].filter(
    (lc) => lc !== 'ko' && ALLOWED.has(lc),
  )
  if (targets.length === 0) {
    return NextResponse.json({ started: 0, message: '대상 locale이 없습니다' })
  }

  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'CRON_SECRET이 설정되지 않아 백그라운드 작업을 시작할 수 없습니다',
      },
      { status: 500 },
    )
  }

  const base = req.nextUrl.origin
  const authHeader = { authorization: `Bearer ${secret}` }

  // 백그라운드 실행: 응답 이후에도 로컬 서버가 순차 처리.
  // translate(DB upsert) → sync(DB→json writeFile)를 locale마다 반복.
  // 한 locale 실패해도 다음으로 계속 진행한다.
  after(async () => {
    let done = 0
    for (const lc of targets) {
      try {
        const tr = await fetch(`${base}/api/admin/i18n/translate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...authHeader },
          body: JSON.stringify({ locale: lc }),
        })
        if (!tr.ok) {
          console.error(`[i18n-bg] translate 실패 ${lc}: ${tr.status}`)
          continue
        }
        const sy = await fetch(`${base}/api/admin/i18n/sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...authHeader },
          body: JSON.stringify({ locale: lc }),
        })
        if (!sy.ok) {
          console.error(`[i18n-bg] sync 실패 ${lc}: ${sy.status}`)
          continue
        }
        done++
        console.log(`[i18n-bg] ${lc} 완료 (${done}/${targets.length})`)
      } catch (e) {
        console.error(`[i18n-bg] ${lc} 처리 오류:`, e)
      }
    }
    console.log(
      `[i18n-bg] 백그라운드 자동 번역 종료 — ${done}/${targets.length} 완료`,
    )
  })

  return NextResponse.json({ started: targets.length })
}
