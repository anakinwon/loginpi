import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'fs/promises'
import { join } from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { locale?: string }
  const targetLocale = body.locale // 특정 locale만 동기화, 없으면 전체

  // 대상 locale 결정
  const { data: locales } = await supabase
    .from('i18n_locale')
    .select('locale_cd')
    .eq('is_active', 'Y')

  const localeCodes = targetLocale
    ? [targetLocale]
    : (locales ?? []).map((l: { locale_cd: string }) => l.locale_cd)

  const messagesDir = join(process.cwd(), 'messages')
  const synced: string[] = []
  const errors: string[] = []

  for (const lc of localeCodes) {
    const { data: msgs, error } = await supabase
      .from('i18n_message')
      .select('msg_key, msg_val')
      .eq('locale_cd', lc)
      .not('msg_val', 'is', null)

    if (error) {
      errors.push(`${lc}: ${error.message}`)
      continue
    }

    const flat: Record<string, string> = {}
    for (const { msg_key, msg_val } of msgs ?? []) {
      flat[msg_key] = msg_val
    }

    const nested = unflattenJson(flat)
    await writeFile(
      join(messagesDir, `${lc}.json`),
      JSON.stringify(nested, null, 2),
      'utf-8'
    )
    synced.push(lc)
  }

  return NextResponse.json({ synced, errors })
}
