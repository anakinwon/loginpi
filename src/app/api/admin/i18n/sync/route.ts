import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'fs/promises'
import { join, resolve, sep } from 'path'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { routing } from '@/i18n/routing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// flat key → 중첩 객체 재구성 ('board.title' → { board: { title: '...' } })
function unflattenJson(flat: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(flat)) {
    const parts = key.split('.')
    let cursor: Record<string, unknown> = result
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {}
      cursor = cursor[parts[i]] as Record<string, unknown>
    }
    cursor[parts[parts.length - 1]] = val
  }
  return result
}

// 허용 locale 집합 (routing.ts 정의 기준)
const ALLOWED_LOCALES = new Set<string>(routing.locales)

// ko는 messages/ko.json이 source of truth — DB→JSON 동기화 대상 제외
const SYNC_SKIP = new Set(['ko'])

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { locale?: string }
  const targetLocale = body.locale

  // ko는 source of truth — 명시적 요청도 거부
  if (targetLocale !== undefined && SYNC_SKIP.has(targetLocale)) {
    return NextResponse.json(
      { error: 'ko는 DB→JSON 동기화 대상이 아닙니다' },
      { status: 400 },
    )
  }

  // 요청 locale이 있으면 허용 목록에서 검증
  if (targetLocale !== undefined && !ALLOWED_LOCALES.has(targetLocale)) {
    return NextResponse.json(
      { error: '유효하지 않은 locale입니다' },
      { status: 400 },
    )
  }

  const { data: locales } = await supabase
    .from('i18n_locale')
    .select('locale_cd')
    .eq('is_active', 'Y')

  // DB에서 실제 존재하는 locale만 사용 (DB 주입 방어 이중화)
  const dbLocales = new Set(
    (locales ?? []).map((l: { locale_cd: string }) => l.locale_cd),
  )

  const localeCodes = targetLocale ? [targetLocale] : [...dbLocales]

  const messagesDir = resolve(process.cwd(), 'messages')
  const synced: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  for (const lc of localeCodes) {
    // ko는 파일이 source of truth — DB에서 덮어쓰지 않음
    if (SYNC_SKIP.has(lc)) continue

    // 허용 목록 + DB 존재 여부 이중 검증
    if (!ALLOWED_LOCALES.has(lc) || !dbLocales.has(lc)) {
      errors.push(`${lc}: 허용되지 않은 locale`)
      continue
    }

    // 경로 탈출 방어: 최종 경로가 messages 디렉토리 하위인지 확인
    const filePath = resolve(messagesDir, `${lc}.json`)
    if (!filePath.startsWith(messagesDir + sep)) {
      errors.push(`${lc}: 경로 검증 실패`)
      continue
    }

    // PostgREST 기본 1,000행 제한 회피 — range 페이징으로 전체 행 수집
    // (누락 시 1,000키 초과 locale의 json이 잘려서 생성되는 치명적 버그)
    const flat: Record<string, string> = {}
    const PAGE = 1000
    let from = 0
    let pageError: string | null = null
    for (;;) {
      const { data: msgs, error } = await supabase
        .from('i18n_message')
        .select('msg_key, msg_val')
        .eq('locale_cd', lc)
        .not('msg_val', 'is', null)
        .order('msg_key')
        .range(from, from + PAGE - 1)
      if (error) {
        pageError = error.message
        break
      }
      for (const { msg_key, msg_val } of msgs ?? []) {
        flat[msg_key] = msg_val
      }
      if (!msgs || msgs.length < PAGE) break
      from += PAGE
    }

    if (pageError) {
      errors.push(`${lc}: ${pageError}`)
      continue
    }

    // DB에 데이터가 없으면 기존 파일을 덮어쓰지 않음 (skip — 오류 아님)
    if (Object.keys(flat).length === 0) {
      skipped.push(lc)
      continue
    }

    const nested = unflattenJson(flat)
    await writeFile(filePath, JSON.stringify(nested, null, 2), 'utf-8')
    synced.push(lc)
  }

  return NextResponse.json({ synced, skipped, errors })
}
