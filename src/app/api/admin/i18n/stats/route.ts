import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getSessionUser, isAdmin } from '@/lib/auth-check'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ko.json의 전체 flat 키 목록 반환 (source of truth)
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null) {
      keys.push(...flattenKeys(v as Record<string, unknown>, key))
    } else if (typeof v === 'string') {
      keys.push(key)
    }
  }
  return keys
}

export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 전체 번역 키 수: DB가 아닌 ko.json 파일에서 계산 (한국어가 source of truth)
  let totalKeys = 0
  try {
    const raw = await readFile(
      join(process.cwd(), 'messages', 'ko.json'),
      'utf-8',
    )
    const koJson = JSON.parse(raw) as Record<string, unknown>
    totalKeys = flattenKeys(koJson).length
  } catch {
    totalKeys = 0
  }

  const { data: locales } = await supabase
    .from('i18n_locale')
    .select('*')
    .eq('is_active', 'Y')
    .order('sort_ord')

  // 각 locale의 번역 완료 키 수 — locale별 COUNT 쿼리 (전체 행 조회 시 1000행 제한 회피)
  const nonKoLocales = (locales ?? []).filter((loc) => loc.locale_cd !== 'ko')
  const countEntries = await Promise.all(
    nonKoLocales.map(async (loc) => {
      const { count } = await supabase
        .from('i18n_message')
        .select('*', { count: 'exact', head: true })
        .eq('locale_cd', loc.locale_cd)
        .not('msg_val', 'is', null)
      return [loc.locale_cd, count ?? 0] as [string, number]
    }),
  )
  const countMap = Object.fromEntries(countEntries)

  const stats = (locales ?? []).map((loc) => {
    // 한국어는 ko.json이 source of truth → 항상 100% 완료
    const translated =
      loc.locale_cd === 'ko' ? totalKeys : (countMap[loc.locale_cd] ?? 0)
    // pct는 표시용 — Math.round는 99.x%를 100%로 올려 '2개 미번역'을 완료로
    // 오표기하므로 floor(+100 clamp) 사용. 완료 판정은 키 수 일치(complete)로 분리해,
    // 반올림된 pct가 자동 번역 대상 선정/완료 카운트를 왜곡하지 않게 한다.
    return {
      ...loc,
      translated,
      total: totalKeys,
      pct:
        totalKeys > 0
          ? Math.min(100, Math.floor((translated / totalKeys) * 100))
          : 0,
      complete: totalKeys > 0 && translated >= totalKeys,
    }
  })

  const completed = stats.filter((s) => s.complete).length

  return NextResponse.json({ locales: stats, totalKeys, completed })
}
