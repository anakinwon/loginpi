import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LOCALE_NAMES: Record<string, string> = {
  en: 'English', zh: 'Chinese (Simplified)', ja: 'Japanese', hi: 'Hindi',
  vi: 'Vietnamese', af: 'Afrikaans', fil: 'Filipino', th: 'Thai',
  id: 'Indonesian', ms: 'Malay', es: 'Spanish', fr: 'French',
  de: 'German', it: 'Italian',
}

// ko.json에서 flat key-value 추출 (중첩 객체 → 'board.title' 형식)
function flattenJson(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
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

export async function POST(req: NextRequest) {
  const { locale } = (await req.json()) as { locale: string }

  if (!locale || locale === 'ko') {
    return NextResponse.json({ error: '번역 대상 언어가 잘못됐습니다' }, { status: 400 })
  }

  const localeName = LOCALE_NAMES[locale]
  if (!localeName) {
    return NextResponse.json({ error: '지원하지 않는 언어입니다' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다' }, { status: 500 })
  }

  // ko 기준 전체 키 조회
  const { data: koMsgs } = await supabase
    .from('i18n_message')
    .select('msg_key, msg_val')
    .eq('locale_cd', 'ko')
    .not('msg_val', 'is', null)

  // 대상 언어 기존 번역 조회
  const { data: existingMsgs } = await supabase
    .from('i18n_message')
    .select('msg_key, msg_val')
    .eq('locale_cd', locale)

  const existingKeys = new Set((existingMsgs ?? []).filter((m) => m.msg_val).map((m) => m.msg_key))

  // 미번역 키만 추출
  const toTranslate: Record<string, string> = {}
  for (const msg of koMsgs ?? []) {
    if (!existingKeys.has(msg.msg_key)) {
      toTranslate[msg.msg_key] = msg.msg_val
    }
  }

  if (Object.keys(toTranslate).length === 0) {
    return NextResponse.json({ translated: 0, message: '번역할 키가 없습니다' })
  }

  const client = new Anthropic({ apiKey })

  // 50개씩 배치 처리
  const entries = Object.entries(toTranslate)
  const BATCH = 50
  const upsertRows: { locale_cd: string; msg_key: string; msg_val: string; is_auto: string }[] = []

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = Object.fromEntries(entries.slice(i, i + BATCH))
    const prompt = `Translate the following Korean UI strings to ${localeName}.
Keep the same JSON key names. Return ONLY a valid JSON object with the translated values.
Do not add explanations or markdown code blocks.

${JSON.stringify(batch, null, 2)}`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text.trim()
    let translated: Record<string, string> = {}
    try {
      // JSON 블록 감지 후 파싱
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) translated = JSON.parse(jsonMatch[0])
    } catch {
      continue
    }

    for (const [key, val] of Object.entries(translated)) {
      if (typeof val === 'string') {
        upsertRows.push({ locale_cd: locale, msg_key: key, msg_val: val, is_auto: 'Y' })
      }
    }
  }

  if (upsertRows.length > 0) {
    await supabase
      .from('i18n_message')
      .upsert(upsertRows, { onConflict: 'locale_cd,msg_key' })
  }

  return NextResponse.json({ translated: upsertRows.length })
}
