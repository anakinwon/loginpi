import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { resolveLangName } from './locale-lang'

// PyTranslate™ 번역 엔진 (Phase 12 — TASK-091)
// 1차: Gemini 2.5 Flash (저비용·고속 — PRD의 2.0-flash는 2026-06 기준 단종되어 404 반환)
// 2차: Claude Haiku fallback (Gemini API 장애 시 번역 단절 방지)

export const GEMINI_TRANSLATE_MODEL = 'gemini-2.5-flash'
export const CLAUDE_FALLBACK_MODEL = 'claude-haiku-4-5-20251001'

// locale_cd 화이트리스트 — 코드 인젝션 방지 (Phase 6 보안 패치와 동일 규칙)
export const LOCALE_CD_RE = /^[a-z]{2,3}(-[A-Z]{2,3})?$/

// locale의 기본 언어 코드 — 'pt-BR' → 'pt' (원본 언어와 비교용)
export function baseLang(locale: string): string {
  return locale.split('-')[0].toLowerCase()
}

export interface TranslateResult {
  translated: string
  srcLangCd: string | null // ISO 639-1 — 감지 실패 시 null
  modelVer: string
}

// 번역 + 언어감지 단일 호출 프롬프트 (JSON 응답 강제)
// ⚠️ locale_cd는 국가 파생 코드(ye=아랍어, il=히브리어, bn=말레이어)라 raw 코드를 그대로 넘기면
//    엔진이 언어를 특정 못 해 원문 반환/오역한다 → locale-lang 해석기로 실제 언어명을 지시한다
function buildPrompt(text: string, targetLocale: string): string {
  const langName = resolveLangName(targetLocale)
  const target = langName ?? `the language of locale "${targetLocale}"`
  return [
    `You are a chat message translator.`,
    `Translate the chat message below into ${target}.`,
    `Rules:`,
    `- Preserve emojis, slang, tone, and line breaks exactly.`,
    `- If the message is already in the target language, return it unchanged.`,
    `- Detect the source language as an ISO 639-1 code.`,
    `- Return ONLY valid JSON: {"translated":"...","lang":"xx"}`,
    ``,
    `Message:`,
    text,
  ].join('\n')
}

function parseJsonResponse(raw: string): { translated: string; lang?: string } {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('번역 응답 JSON 파싱 실패')
  const parsed = JSON.parse(jsonMatch[0]) as {
    translated?: unknown
    lang?: unknown
  }
  if (typeof parsed.translated !== 'string' || !parsed.translated) {
    throw new Error('번역 응답에 translated 필드 없음')
  }
  return {
    translated: parsed.translated,
    lang: typeof parsed.lang === 'string' ? parsed.lang : undefined,
  }
}

// Gemini REST API 호출 (SDK 불필요 — admin i18n translate 라우트와 동일 패턴)
async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TRANSLATE_MODEL}:generateContent?key=${apiKey}`
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
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini 응답 비어있음')
  return text
}

async function callClaudeHaiku(
  prompt: string,
  apiKey: string,
): Promise<string> {
  const anthropic = new Anthropic({ apiKey, timeout: 15_000 })
  const message = await anthropic.messages.create({
    model: CLAUDE_FALLBACK_MODEL,
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = message.content[0]
  if (block?.type !== 'text') throw new Error('Claude 응답에 텍스트 블록 없음')
  return block.text
}

// 카페 메시지 1건 번역 — Gemini 실패 시 Claude Haiku 자동 fallback
export async function translateMessage(
  text: string,
  targetLocale: string,
): Promise<TranslateResult> {
  const prompt = buildPrompt(text, targetLocale)
  const geminiKey = process.env.GEMINI_API_KEY

  if (geminiKey) {
    try {
      const raw = await callGemini(prompt, geminiKey)
      const { translated, lang } = parseJsonResponse(raw)
      return {
        translated,
        srcLangCd: lang ?? null,
        modelVer: GEMINI_TRANSLATE_MODEL,
      }
    } catch (err) {
      console.error(
        '[chat-translate] Gemini 실패 — Claude Haiku fallback:',
        err,
      )
    }
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey)
    throw new Error('번역 엔진 미설정 (GEMINI_API_KEY / ANTHROPIC_API_KEY)')

  const raw = await callClaudeHaiku(prompt, anthropicKey)
  const { translated, lang } = parseJsonResponse(raw)
  return {
    translated,
    srcLangCd: lang ?? null,
    modelVer: CLAUDE_FALLBACK_MODEL,
  }
}
