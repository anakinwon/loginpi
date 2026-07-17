import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { apiError } from '@/lib/api-errors'
import { apiMessage } from '@/lib/api-errors/messages'
import { resolveLangName } from '@/lib/locale-lang'

// Gemini 프롬프트 품질을 위한 언어명 override
// - Intl.DisplayNames가 모호하거나 locale_cd가 언어코드가 아닌 경우만 등록
// - 새 locale 추가 시 이 맵을 건드릴 필요 없음 (Intl.DisplayNames가 자동 처리)
const LOCALE_NAME_OVERRIDES: Record<string, string> = {
  zh: 'Chinese (Simplified)', // Intl은 'Chinese'로만 반환
  ar: 'Egyptian Arabic', // 아랍어 방언 명확화
  au: 'Australian English', // country code 기반 locale
  fil: 'Filipino', // Intl 미인식
  af: 'Afrikaans', // Intl 미인식 가능
  il: 'Hebrew', // country code 기반 locale → 히브리어
}

// locale_cd → Gemini용 언어명
// override → locale-lang 단일소스(국가 파생 locale 해석: ye→Arabic, bn→Malay) →
// Intl.DisplayNames 자동 파생 → 최후 폴백: locale_cd 그대로
// ⚠️ Intl.DisplayNames는 코드를 "언어코드"로 해석하므로 국가 파생 locale(bn=브루나이,
//    mt=몰타, am=아르메니아)을 벵골어·몰타어·암하라어로 오판한다 — locale-lang이 우선
function getLocaleName(locale_cd: string): string {
  if (LOCALE_NAME_OVERRIDES[locale_cd]) return LOCALE_NAME_OVERRIDES[locale_cd]
  const resolved = resolveLangName(locale_cd)
  if (resolved) return resolved
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language' })
    const name = names.of(locale_cd)
    if (name && name !== locale_cd) return name
  } catch {}
  return locale_cd
}

function flattenJson(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null) {
      Object.assign(result, flattenJson(v as Record<string, unknown>, key))
    } else if (typeof v === 'string') {
      result[key] = v
    }
  }
  return result
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// Gemini REST API 호출 (SDK 불필요)
async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  })
  if (!res.ok) {
    // KISA IL 완화: 에러 응답 크기 제한 후 로깅 (민감한 정보 노출 금지)
    let bodySlice = ''
    try {
      const contentLength = res.headers.get('content-length')
      const maxLen = contentLength
        ? Math.min(parseInt(contentLength), 500)
        : 500
      bodySlice = (await res.text()).slice(0, maxLen)
    } catch {
      bodySlice = '(읽기 실패)'
    }
    console.error('[api/admin/i18n/translate/post] Gemini API 오류:', {
      status: res.status,
      statusText: res.statusText,
      bodySlice,
    })
    throw new Error('API 응답 처리 중 오류가 발생했습니다')
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

export async function POST(req: NextRequest) {
  // admin 세션 또는 cron(CRON_SECRET) 둘 다 허용 — 백그라운드 자동 번역 cron이 재사용
  const user = await getSessionUser()
  const cronOk =
    !!process.env.CRON_SECRET &&
    req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!isAdmin(user) && !cronOk) {
    return apiError('AUTH_REQUIRED', 401)
  }

  const { locale } = (await req.json()) as { locale: string }

  if (!locale || locale === 'ko') {
    return apiError('ADM_I18N_INVALID_TARGET_LANG', 400)
  }

  const localeName = getLocaleName(locale)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return apiError('ADM_I18N_GEMINI_KEY_MISSING', 500)
  }

  const koJsonPath = join(process.cwd(), 'messages', 'ko.json')
  let koFlat: Record<string, string>
  try {
    const raw = await readFile(koJsonPath, 'utf-8')
    const koJson = JSON.parse(raw) as Record<string, unknown>
    koFlat = flattenJson(koJson)
  } catch {
    return apiError('ADM_I18N_KO_JSON_UNREADABLE', 500)
  }

  if (Object.keys(koFlat).length === 0) {
    return apiError('ADM_I18N_KO_JSON_EMPTY', 400)
  }

  // PostgREST 기본 1,000행 제한 회피 — 전체 기존 키를 페이징 수집
  // (누락 시 1,000키 초과분을 미번역으로 오판 → Gemini 재번역이 수동 번역을 덮어씀)
  const existingKeys = new Set<string>()
  {
    const PAGE = 1000
    let from = 0
    for (;;) {
      const { data: existingMsgs } = await getSupabaseAdmin()
        .from('i18n_message')
        .select('msg_key, msg_val')
        .eq('locale_cd', locale)
        .order('msg_key')
        .range(from, from + PAGE - 1)
      for (const m of existingMsgs ?? []) {
        if (m.msg_val) existingKeys.add(m.msg_key)
      }
      if (!existingMsgs || existingMsgs.length < PAGE) break
      from += PAGE
    }
  }

  const toTranslate: Record<string, string> = {}
  for (const [key, val] of Object.entries(koFlat)) {
    if (!existingKeys.has(key)) {
      toTranslate[key] = val
    }
  }

  if (Object.keys(toTranslate).length === 0) {
    return NextResponse.json({ translated: 0, ...apiMessage('I18N_NO_KEYS') })
  }

  const entries = Object.entries(toTranslate)
  const BATCH = 50
  // Gemini 무료 15 RPM 제한: 첫 배치 이후 4.5초 대기
  const RATE_LIMIT_DELAY = 4500
  let totalUpserted = 0

  for (let i = 0; i < entries.length; i += BATCH) {
    if (i > 0) await sleep(RATE_LIMIT_DELAY)

    const batch = Object.fromEntries(entries.slice(i, i + BATCH))
    const prompt = `Translate the following Korean UI strings to ${localeName}.
Rules:
- Korean loanwords originally from English (대시보드, 보드, 데이터, 콘텐츠, 카테고리 etc.) must be translated back to the original English word (Dashboard, Board, Data, Content, Category etc.)
- Technical abbreviations (DDL, API, JSON, DB, SQL, HTML, ICU) must remain unchanged
- Keep the same JSON key names
- Return ONLY a valid JSON object with no markdown or explanation

${JSON.stringify(batch, null, 2)}`

    let text: string
    try {
      text = await callGemini(prompt, apiKey)
    } catch (apiErr) {
      // KISA IL 완화: 에러 메시지 정제 (Error 객체 직렬화 금지)
      console.error('[api/admin/i18n/translate/post] Gemini 호출 실패:', {
        locale,
        batchIndex: Math.floor(i / BATCH),
        error: apiErr instanceof Error ? apiErr.message : String(apiErr),
      })
      // 이미 번역된 데이터가 있으면 부분 성공 반환, 없으면 오류
      if (totalUpserted > 0) {
        return NextResponse.json({
          translated: totalUpserted,
          ...apiMessage('I18N_PARTIAL_STOP'),
        })
      }
      return apiError('ADM_I18N_TRANSLATE_FAILED', 502)
    }

    let translated: Record<string, string> = {}
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) translated = JSON.parse(jsonMatch[0])
    } catch {
      continue
    }

    const batchRows: {
      locale_cd: string
      msg_key: string
      msg_val: string
      is_auto: string
    }[] = []
    for (const [key, val] of Object.entries(translated)) {
      if (typeof val === 'string') {
        batchRows.push({
          locale_cd: locale,
          msg_key: key,
          msg_val: val,
          is_auto: 'Y',
        })
      }
    }

    // 배치별 즉시 upsert — Gemini 실패 시에도 이전 배치 데이터 보존
    if (batchRows.length > 0) {
      await getSupabaseAdmin()
        .from('i18n_message')
        .upsert(batchRows, { onConflict: 'locale_cd,msg_key' })
      totalUpserted += batchRows.length
    }
  }

  return NextResponse.json({ translated: totalUpserted })
}
