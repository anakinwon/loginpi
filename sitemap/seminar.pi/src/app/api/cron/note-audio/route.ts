// 대면 노트 원본 음성 보관 정리 cron — GET(Vercel cron, 매일). 종료 1일 지난·RECORDING 고착 오래된·삭제된 노트의 원본을 지운다(lib/note-audio sweepAudio).
//  처리방침 '노트가 끝나고 1일이 지나면 지운다'를 노트 종료가 없어도 지키는 장치(종료 때마다 도는 정리와 이중).
//  Authorization: Bearer CRON_SECRET 확인이 첫 줄 — 값이 없으면 503(아무나 부르지 못하게). 비밀값 설정 : docs/ENV_GUIDE.md
import { NextResponse } from 'next/server'
import { env } from '@/env'
import { sweepAudio } from '@/lib/note-audio'

export const maxDuration = 60

export async function GET(req: Request) {
  const secret = env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'cron_disabled' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const removed = await sweepAudio()
  return NextResponse.json({ ok: true, removed: removed ?? 0 }, { headers: { 'Cache-Control': 'no-store' } })
}
