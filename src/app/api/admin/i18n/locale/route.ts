import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { LOCALE_CURRENCY } from '@/lib/locale-currency'
import { LOCALE_COUNTRY } from '@/lib/locale-country'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// alpha-2 코드 → 국기 이모지 (Regional Indicator Symbol 변환)
// ⚠️ 베이스는 U+1F1E6('A'). 과거 0x1f1e0 오계산으로 il·et·ps·sq 국기가 깨졌음(sql/167 보정)
function toFlagEmoji(cc: string): string {
  return [...cc.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('')
}

// 허용 locale_cd 형식: "ko", "fil", "af-AF" 등 (2~3 소문자 + 선택적 하이픈+2대문자)
const LOCALE_CD_RE = /^[a-z]{2,3}(-[A-Z]{2,3})?$/

// routing.ts의 locales 배열에 새 locale_cd를 추가한다.
// Vercel 서버리스에서는 소스 파일이 읽기 전용이므로 실패할 수 있음 → 무시.
// 로컬 개발 환경에서는 파일이 즉시 수정되어 재시작 없이 적용됨.
async function addLocaleToRouting(locale_cd: string): Promise<boolean> {
  // 화이트리스트 검증: 파일 쓰기 전 반드시 형식 확인
  if (!LOCALE_CD_RE.test(locale_cd)) return false

  try {
    const routingPath = join(process.cwd(), 'src', 'i18n', 'routing.ts')
    const content = await readFile(routingPath, 'utf-8')

    // includes()로 정확히 일치 확인 (RegExp 특수문자 오염 방지)
    if (content.includes(`'${locale_cd}'`)) return true

    // 충돌 변형 섹션 앞에 삽입 (없으면 배열 끝에 추가)
    const marker = '// ── 충돌 변형'
    let updated: string
    if (content.includes(marker)) {
      updated = content.replace(marker, `'${locale_cd}',\n\n    ${marker}`)
    } else {
      updated = content.replace(
        /(\s+)(\],\s*\n\s*defaultLocale)/,
        `$1'${locale_cd}',\n$1$2`,
      )
    }

    if (updated === content) return false
    await writeFile(routingPath, updated, 'utf-8')
    return true
  } catch {
    // Vercel 프로덕션에서는 실패 (소스 파일 쓰기 불가) — 무시
    return false
  }
}

// PATCH: locale 활성/비활성 토글
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    locale_cd: string
    is_active: 'Y' | 'N'
    locale_nm?: string
    country_cd?: string
  }
  const { locale_cd, is_active, locale_nm, country_cd } = body

  if (!locale_cd) {
    return NextResponse.json({ error: 'locale_cd required' }, { status: 400 })
  }

  // 기본 언어(ko) 비활성화 방지
  if (locale_cd === 'ko' && is_active === 'N') {
    return NextResponse.json(
      { error: '기본 언어(ko)는 비활성화할 수 없습니다' },
      { status: 400 },
    )
  }

  // 새 locale 활성화: sort_ord = 현재 최대값 + 1
  let sort_ord = 0
  if (is_active === 'Y') {
    const { data } = await supabase
      .from('i18n_locale')
      .select('sort_ord')
      .order('sort_ord', { ascending: false })
      .limit(1)
      .single()
    sort_ord = (data?.sort_ord ?? 0) + 1
  }

  const flag_emoji = country_cd ? toFlagEmoji(country_cd) : null
  const nm = locale_nm ?? locale_cd

  const { error } = await supabase
    .from('i18n_locale')
    .upsert(
      { locale_cd, locale_nm: nm, flag_emoji, is_active, sort_ord },
      { onConflict: 'locale_cd' },
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // locale_cd가 null이었던 국가를 활성화할 때 i18n_cntry_mst.locale_cd 연결
  if (country_cd && is_active === 'Y') {
    await supabase
      .from('i18n_cntry_mst')
      .update({ locale_cd })
      .eq('country_cd', country_cd.toUpperCase())
      .is('locale_cd', null)
  }

  // 신규 활성화 시 routing.ts 자동 수정 시도 (로컬 개발 환경에서만 적용됨)
  let routingUpdated = false
  if (is_active === 'Y') {
    routingUpdated = await addLocaleToRouting(locale_cd)
  }

  // 매핑 완전성 사전 경고 — et/mx 통화 USD 오표시 재발 방지 (2026-06-08)
  // 빌드된 번들 기준 체크: 누락 시 locale-currency/country.ts 수정 + 재배포 전까지 USD/fallback 표시됨
  const mappingWarnings: string[] = []
  if (is_active === 'Y') {
    if (!LOCALE_CURRENCY[locale_cd]) {
      mappingWarnings.push(
        `통화 매핑 누락: src/lib/locale-currency.ts에 '${locale_cd}' 추가 후 재배포 필요 (현재 π 시세가 USD로 표시됨)`,
      )
    }
    if (!LOCALE_COUNTRY[locale_cd]) {
      mappingWarnings.push(
        `국가 매핑 누락: src/lib/locale-country.ts에 '${locale_cd}' 추가 후 재배포 필요 (국기·중복필터 fallback 동작)`,
      )
    }
    if (mappingWarnings.length > 0) {
      console.warn(
        `[i18n/locale] '${locale_cd}' 활성화 — 매핑 경고:\n  ${mappingWarnings.join('\n  ')}`,
      )
    }
  }

  return NextResponse.json({
    ok: true,
    locale_cd,
    is_active,
    routingUpdated,
    mappingWarnings,
  })
}
