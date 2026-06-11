import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getSessionUser, isAdmin } from '@/lib/auth-check'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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
// Intl.DisplayNames 자동 파생 → override 적용 → 최후 폴백: locale_cd 그대로
function getLocaleName(locale_cd: string): string {
  if (LOCALE_NAME_OVERRIDES[locale_cd]) return LOCALE_NAME_OVERRIDES[locale_cd]
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
    const body = await res.text()
    throw new Error(`${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { locale } = (await req.json()) as { locale: string }

  if (!locale || locale === 'ko') {
    return NextResponse.json(
      { error: '번역 대상 언어가 잘못됐습니다' },
      { status: 400 },
    )
  }

  const localeName = getLocaleName(locale)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'GEMINI_API_KEY가 설정되지 않았습니다. aistudio.google.com/apikey에서 무료 발급 후 .env.local에 추가하세요.',
      },
      { status: 500 },
    )
  }

  const koJsonPath = join(process.cwd(), 'messages', 'ko.json')
  let koFlat: Record<string, string>
  try {
    const raw = await readFile(koJsonPath, 'utf-8')
    const koJson = JSON.parse(raw) as Record<string, unknown>
    koFlat = flattenJson(koJson)
  } catch {
    return NextResponse.json(
      { error: 'ko.json 파일을 읽을 수 없습니다' },
      { status: 500 },
    )
  }

  if (Object.keys(koFlat).length === 0) {
    return NextResponse.json(
      { error: 'ko.json이 비어있습니다' },
      { status: 400 },
    )
  }

  const { data: existingMsgs } = await supabase
    .from('i18n_message')
    .select('msg_key, msg_val')
    .eq('locale_cd', locale)

  const existingKeys = new Set(
    (existingMsgs ?? []).filter((m) => m.msg_val).map((m) => m.msg_key),
  )

  const toTranslate: Record<string, string> = {}
  for (const [key, val] of Object.entries(koFlat)) {
    if (!existingKeys.has(key)) {
      toTranslate[key] = val
    }
  }

  if (Object.keys(toTranslate).length === 0) {
    return NextResponse.json({ translated: 0, message: '번역할 키가 없습니다' })
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
      const msg = apiErr instanceof Error ? apiErr.message : 'Gemini API 오류'
      // 이미 번역된 데이터가 있으면 부분 성공 반환, 없으면 오류
      if (totalUpserted > 0) {
        return NextResponse.json({
          translated: totalUpserted,
          message: `${totalUpserted}개 번역 후 중단: ${msg}`,
        })
      }
      return NextResponse.json({ error: `번역 실패: ${msg}` }, { status: 502 })
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
      await supabase
        .from('i18n_message')
        .upsert(batchRows, { onConflict: 'locale_cd,msg_key' })
      totalUpserted += batchRows.length
    }
  }

  return NextResponse.json({ translated: totalUpserted })
}
