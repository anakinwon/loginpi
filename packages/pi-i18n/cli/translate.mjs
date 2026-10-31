// pi-i18n translate — ko.json 기준 증분 번역(Gemini). 단위 = 언어(카탈로그 67개 — en 은 messages/en.json, 나머지는 messages/lang/<언어>.json).
// 대상 = 언어 파일에 없는 키 ∪ ko 원문 해시가 바뀐 키. 끝나면 expand 로 routing locale 파일(messages/<locale>.json)을 다시 펼친다.
// 배치마다 locale 파일·상태(messages/.i18n-state.json)를 바로 저장 → 중단돼도 다시 실행하면 이어서. 검증 탈락 키는 쓰지 않음(폴백이 메움)
// 실행 : 앱 폴더에서 pnpm i18n:translate [--langs a,b] [--force] [--dry-run] [--batch 250] [--concurrency 6] [--model gemini-2.5-flash]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expand } from './expand.mjs'
import { checkValue, findGeminiKey, flatten, getInfo, hash, loadConfig, parseArgs, pickLocales, readJson, rebuild, sourceFile } from './lib.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function systemPrompt(glossary, numericArgs) {
  return [
    'You translate UI strings of a web app from Korean into the requested target language.',
    'Input: a JSON object { "<key>": "<Korean text>" }. Output: a JSON object with exactly the same keys, values translated. Return JSON only, no markdown.',
    'Rules:',
    '1. Translate values only; never change keys.',
    '2. Keep ICU MessageFormat syntax intact: variable names in {braces}, the keywords plural/select/selectordinal, "#", exact selectors like =0, and select option keys must stay unchanged. Plural categories may be adapted to the target language CLDR categories, but "other" must always remain.',
    `2a. Do not turn a plain {arg} into {arg, number} or {arg, plural, …} unless the arg name is one of: ${numericArgs.join(', ')} (other args may be preformatted strings).`,
    '3. Keep tags like <b>…</b> or <link>…</link> exactly (same names, same pairs); translate only the text inside.',
    `4. Never translate these terms; keep them verbatim (including ™ and accents): ${glossary.join(', ')}. Multi-word product names (e.g. Pi Browser, Pi Wallet) stay in English as a whole — never translate a part such as Browser; if the grammar needs a case ending, append it after the full unchanged term (e.g. Pi Browseru, Googlea).`,
    '5. Keep code identifiers (snake_case, camelCase, text in backticks), URLs and e-mail addresses unchanged.',
    '6. These are short UI labels and messages: write natural, concise text. Korean loanwords from English should become the natural term in the target language (or the English original).',
    '7. Output must not contain any Korean characters.',
  ].join('\n')
}

async function callGemini({ key, model, system, user }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        }),
        // Node fetch 는 기본 무한 대기 — 소켓 유실 시 hang(loginpi 2026-07-09 실측)
        signal: AbortSignal.timeout(420_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
      const j = await res.json()
      const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      const out = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
      if (!out || typeof out !== 'object' || Array.isArray(out)) throw new Error('JSON 객체가 아님')
      return out
    } catch (e) {
      const is429 = /HTTP 429/.test(e.message)
      if (attempt + 1 >= (is429 ? 5 : 3)) throw e
      await sleep((is429 ? 60_000 : 10_000) * (attempt + 1))
    }
  }
}

// 대상 언어의 CLDR plural 범주 — 프롬프트에 알려 범주 부적합 탈락을 줄인다(예 : vi 는 other 만)
function pluralHint(locale) {
  try {
    return new Intl.PluralRules(locale).resolvedOptions().pluralCategories.join(', ')
  } catch {
    return 'other'
  }
}

// 동시 실행 n 개로 작업 목록 소화
async function pool(jobs, n) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (i < jobs.length) await jobs[i++]()
  }))
}

export async function run(argv, cwd = process.cwd()) {
  const args = parseArgs(argv)
  const cfg = loadConfig(cwd)
  const dir = join(cwd, 'messages')
  const ko = readJson(join(dir, 'ko.json'), null)
  if (!ko) throw new Error('messages/ko.json 이 없습니다')
  const koFlat = Object.fromEntries(Object.entries(flatten(ko)).filter(([, v]) => typeof v === 'string' && v !== ''))
  const enFlat = flatten(readJson(join(dir, 'en.json'), {}))
  const statePath = join(dir, '.i18n-state.json')
  const state = readJson(statePath, {})
  // --langs(구 --locales 도 받음) = 언어 코드. 상태 파일 키도 언어 코드
  const locales = pickLocales(args.langs ?? args.locales, cfg.languages).filter((l) => l !== 'ko')
  const batch = Number(args.batch ?? 250)
  const model = typeof args.model === 'string' ? args.model : 'gemini-2.5-flash'
  // 키를 정렬해 저장 — git diff 가 번역 순서에 따라 흔들리지 않게
  const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
  const saveState = () =>
    writeFileSync(statePath, `${JSON.stringify(Object.fromEntries(Object.entries(sorted(state)).map(([l, s]) => [l, sorted(s)])), null, 2)}\n`)

  const bad = locales.filter((l) => !cfg.languages.includes(l))
  if (bad.length) throw new Error(`언어 카탈로그·i18n.config.json languages 에 없는 언어 : ${bad.join(', ')}`)
  mkdirSync(join(dir, 'lang'), { recursive: true })

  const jobs = []
  const summary = {}
  const files = {}
  for (const locale of locales) {
    const file = sourceFile(dir, locale)
    const flat = flatten(readJson(file, {}))
    const st = (state[locale] ??= {})
    let removed = 0
    // ko 에 없는 키 삭제(폐기 키 정리)
    for (const k of Object.keys(flat)) if (!Object.hasOwn(koFlat, k) && typeof flat[k] === 'string') (delete flat[k], removed++)
    for (const k of Object.keys(st)) if (!Object.hasOwn(koFlat, k)) delete st[k]
    const targets = []
    for (const [k, v] of Object.entries(koFlat)) {
      const h = hash(v)
      const have = Object.hasOwn(flat, k) && flat[k] !== ''
      if (args.force || !have) targets.push(k)
      else if (!st[k]) st[k] = h // 사람이 쓴 기존 번역(상태 없음)은 현재 ko 기준으로 채택
      else if (st[k] !== h) targets.push(k)
    }
    summary[locale] = { targets: targets.length, done: 0, rejected: 0, removed }
    files[locale] = { file, flat }
    if (args['dry-run']) continue
    if (removed) writeFileSync(file, `${JSON.stringify(rebuild(ko, flat) ?? {}, null, 2)}\n`)
    const info = getInfo(locale)
    for (let i = 0; i < targets.length; i += batch) {
      const keys = targets.slice(i, i + batch)
      jobs.push(async () => {
        const input = Object.fromEntries(keys.map((k) => [k, koFlat[k]]))
        // en 참조는 en 이 지금 ko 원문 기준일 때만(상태 해시 일치) — 바뀐 ko 에 옛 영어 뜻을 물려주지 않게. 같은 실행에서 en 이 먼저 갱신되면 갱신본을 쓴다
        const enNow = files.en?.flat ?? enFlat
        const ref = locale === 'en' ? {} : Object.fromEntries(keys.filter((k) => enNow[k] && state.en?.[k] === hash(koFlat[k])).map((k) => [k, enNow[k]]))
        const user = [
          `Target language: ${info.englishName} (${info.nativeName}, BCP-47 ${locale}).`,
          `ICU plural categories allowed in this language: ${pluralHint(locale)} (plus exact selectors like =0).`,
          Object.keys(ref).length ? `English reference for context (translate from Korean, use this only to resolve meaning):\n${JSON.stringify(ref)}` : '',
          `Translate:\n${JSON.stringify(input)}`,
        ].filter(Boolean).join('\n\n')
        let out
        try {
          out = await callGemini({ key: apiKey, model, system: systemPrompt(cfg.glossary, cfg.numericArgs), user })
        } catch (e) {
          summary[locale].rejected += keys.length
          console.error(`[${locale}] 배치 실패 ${keys.length}키 — ${e.message.slice(0, 160)}`)
          return
        }
        let ok = 0
        for (const k of keys) {
          const { errors, warnings } = checkValue(koFlat[k], out[k], locale, cfg.glossary, cfg.numericArgs)
          if (errors.length || warnings.length) {
            summary[locale].rejected++
            console.error(`[${locale}] 탈락 ${k} : ${[...errors, ...warnings].join(' / ')} ← ${JSON.stringify(out[k] ?? null).slice(0, 80)}`)
            continue
          }
          flat[k] = out[k]
          st[k] = hash(koFlat[k])
          ok++
        }
        summary[locale].done += ok
        // 배치 단위 즉시 저장(동기 쓰기 — 같은 locale 의 다른 배치와 경합 없음)
        writeFileSync(files[locale].file, `${JSON.stringify(rebuild(ko, flat) ?? {}, null, 2)}\n`)
        saveState()
        console.log(`[${locale}] 배치 ${ok}/${keys.length} 저장`)
      })
    }
  }

  let apiKey = null
  if (jobs.length) {
    apiKey = findGeminiKey(cwd)
    if (!apiKey) throw new Error('GEMINI_API_KEY 를 찾지 못했습니다(환경변수 · 앱/루트 .env.local)')
  }
  if (!args['dry-run']) saveState()
  await pool(jobs, Number(args.concurrency ?? 6))

  console.log(args['dry-run'] ? '\nlocale\t대상 키' : '\nlocale\t대상\t번역\t탈락\t삭제')
  for (const [l, s] of Object.entries(summary)) {
    console.log(args['dry-run'] ? `${l}\t${s.targets}` : `${l}\t${s.targets}\t${s.done}\t${s.rejected}\t${s.removed}`)
  }
  const left = Object.values(summary).reduce((n, s) => n + s.rejected, 0)
  if (!args['dry-run']) {
    const e = expand(cwd)
    console.log(`\nexpand : routing locale 파일 갱신 ${e.written.length}개`)
  }
  if (!args['dry-run']) console.log(left ? `\n남은 키 ${left}개 — 다시 실행하면 재시도합니다` : '\n완료 — 남은 키 없음')
}
