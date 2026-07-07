#!/usr/bin/env node
/**
 * i18n-lang-master-seed — 언어 마스터·국가 연결·충돌 locale 보정 (멱등)
 *
 * 배경(2026-07-07): i18n_cntry_mst.locale_cd는 FK fk_i18n_cntry_locale로
 * i18n_lang_mst(lang_cd)를 참조 — 언어 마스터에 없는 코드는 국가 연결이 실패한다.
 *
 * 1. i18n_lang_mst upsert — LANG_MAP 전체 + 레거시 누락(au·il·mx·ps) (한글 언어명·원어명·RTL)
 * 2. i18n_locale에 ar-AR(아르헨티나·스페인어) 활성화 — 'ar'(아랍어) 충돌 파생
 * 3. i18n_cntry_mst.locale_cd 일괄 연결 (null → 파생 locale, 오류 로깅)
 * 4. i18n_message 잉여 키 정리 — ko.json에 없는 키 삭제 (파생 캐시 정합)
 * 5. 잔여 채움 — 번역 완료 locale(≥2230행)에 en 전용 키 보충 → 100%
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { LANG_MAP } from './i18n-lang-map.mjs'

const envFile = '.env.local'
const env = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, 'utf8').split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,
)

// 언어 영문명 → { ko: 한글명, nat: 원어명, rtl?: true }
const LANG_META = {
  Arabic: { ko: '아랍어', nat: 'العربية', rtl: true },
  French: { ko: '프랑스어', nat: 'Français' },
  Spanish: { ko: '스페인어', nat: 'Español' },
  Portuguese: { ko: '포르투갈어', nat: 'Português' },
  English: { ko: '영어', nat: 'English' },
  German: { ko: '독일어', nat: 'Deutsch' },
  Italian: { ko: '이탈리아어', nat: 'Italiano' },
  Russian: { ko: '러시아어', nat: 'Русский' },
  Malay: { ko: '말레이어', nat: 'Bahasa Melayu' },
  Estonian: { ko: '에스토니아어', nat: 'Eesti' },
  Dutch: { ko: '네덜란드어', nat: 'Nederlands' },
  Greek: { ko: '그리스어', nat: 'Ελληνικά' },
  Romanian: { ko: '루마니아어', nat: 'Română' },
  Serbian: { ko: '세르비아어', nat: 'Српски' },
  Turkish: { ko: '터키어', nat: 'Türkçe' },
  Polish: { ko: '폴란드어', nat: 'Polski' },
  Czech: { ko: '체코어', nat: 'Čeština' },
  Danish: { ko: '덴마크어', nat: 'Dansk' },
  Finnish: { ko: '핀란드어', nat: 'Suomi' },
  Swedish: { ko: '스웨덴어', nat: 'Svenska' },
  'Norwegian (Bokmål)': { ko: '노르웨이어', nat: 'Norsk' },
  Icelandic: { ko: '아이슬란드어', nat: 'Íslenska' },
  Hungarian: { ko: '헝가리어', nat: 'Magyar' },
  Bulgarian: { ko: '불가리아어', nat: 'Български' },
  Croatian: { ko: '크로아티아어', nat: 'Hrvatski' },
  Bosnian: { ko: '보스니아어', nat: 'Bosanski' },
  Slovenian: { ko: '슬로베니아어', nat: 'Slovenščina' },
  Slovak: { ko: '슬로바키아어', nat: 'Slovenčina' },
  Lithuanian: { ko: '리투아니아어', nat: 'Lietuvių' },
  Latvian: { ko: '라트비아어', nat: 'Latviešu' },
  Ukrainian: { ko: '우크라이나어', nat: 'Українська' },
  Georgian: { ko: '조지아어', nat: 'ქართული' },
  Armenian: { ko: '아르메니아어', nat: 'Հայերեն' },
  Azerbaijani: { ko: '아제르바이잔어', nat: 'Azərbaycanca' },
  Kazakh: { ko: '카자흐어', nat: 'Қазақша' },
  Kyrgyz: { ko: '키르기스어', nat: 'Кыргызча' },
  Uzbek: { ko: '우즈베크어', nat: 'Oʻzbekcha' },
  Tajik: { ko: '타지크어', nat: 'Тоҷикӣ' },
  Turkmen: { ko: '투르크멘어', nat: 'Türkmençe' },
  Mongolian: { ko: '몽골어', nat: 'Монгол' },
  'Persian (Farsi)': { ko: '페르시아어', nat: 'فارسی', rtl: true },
  Urdu: { ko: '우르두어', nat: 'اردو', rtl: true },
  Bengali: { ko: '벵골어', nat: 'বাংলা' },
  Nepali: { ko: '네팔어', nat: 'नेपाली' },
  Sinhala: { ko: '싱할라어', nat: 'සිංහල' },
  'Burmese (Myanmar)': { ko: '버마어', nat: 'မြန်မာ' },
  Khmer: { ko: '크메르어', nat: 'ខ្មែរ' },
  Lao: { ko: '라오어', nat: 'ລາວ' },
  Swahili: { ko: '스와힐리어', nat: 'Kiswahili' },
  Somali: { ko: '소말리어', nat: 'Soomaali' },
  Catalan: { ko: '카탈루냐어', nat: 'Català' },
  Dzongkha: { ko: '종카어', nat: 'རྫོང་ཁ' },
  'Dhivehi (Maldivian)': { ko: '디베히어', nat: 'ދިވެހި', rtl: true },
  'Traditional Chinese (Taiwan)': { ko: '중국어(번체)', nat: '繁體中文' },
  Amharic: { ko: '암하라어', nat: 'አማርኛ' },
  Albanian: { ko: '알바니아어', nat: 'Shqip' },
  Hebrew: { ko: '히브리어', nat: 'עברית', rtl: true },
  Pashto: { ko: '파슈토어', nat: 'پښتو', rtl: true },
}

// locale → country_cd 특례 (기본: locale 대문자)
const CC_SPECIAL = { 'ar-AR': 'AR', 'en-ZA': 'ZA', au: 'AU', il: 'IL', et: 'ET', mx: 'MX', ps: 'AF', sq: 'AL' }
const ccOf = (lc) => CC_SPECIAL[lc] ?? lc.toUpperCase()

// ── 1. i18n_lang_mst 시드 ──
const { data: existingLang } = await sb.from('i18n_lang_mst').select('lang_cd, sort_ord')
const haveLang = new Set((existingLang ?? []).map((r) => r.lang_cd))
let sortOrd = Math.max(0, ...(existingLang ?? []).map((r) => r.sort_ord ?? 0))
const targets = { ...LANG_MAP, au: { lang: 'English' }, il: { lang: 'Hebrew' }, mx: { lang: 'Spanish' }, ps: { lang: 'Pashto' } }
let seeded = 0
for (const [lc, cfg] of Object.entries(targets)) {
  if (haveLang.has(lc)) continue
  const meta = LANG_META[cfg.lang]
  if (!meta) { console.error(`⚠️ LANG_META 누락: ${cfg.lang}`); continue }
  sortOrd += 1
  const { error } = await sb.from('i18n_lang_mst').upsert(
    {
      lang_cd: lc, lang_nm: meta.ko, native_nm: meta.nat,
      country_cd: ccOf(lc), font_key: null, dir_cd: meta.rtl ? 'rtl' : 'ltr',
      sort_ord: sortOrd, use_yn: 'Y', regr_id: 'ADMIN', modr_id: 'ADMIN',
    },
    { onConflict: 'lang_cd' },
  )
  if (error) { console.error(`[lang_mst ${lc}] 실패:`, error.message); process.exit(1) }
  seeded++
}
console.log(`i18n_lang_mst 시드: +${seeded} (기존 ${haveLang.size})`)

// ── 2. ar-AR(아르헨티나) 활성화 ──
{
  const { data: act } = await sb.from('i18n_locale').select('locale_cd, sort_ord').eq('is_active', 'Y')
  const activeSet = new Set(act.map((r) => r.locale_cd))
  if (!activeSet.has('ar-AR')) {
    const maxOrd = Math.max(0, ...act.map((r) => r.sort_ord ?? 0))
    const { error } = await sb.from('i18n_locale').upsert(
      { locale_cd: 'ar-AR', locale_nm: 'Argentina', flag_emoji: '🇦🇷', is_active: 'Y', sort_ord: maxOrd + 1 },
      { onConflict: 'locale_cd' },
    )
    if (error) { console.error('[ar-AR] 활성화 실패:', error.message); process.exit(1) }
    console.log('ar-AR (Argentina) 활성화 완료')
  } else console.log('ar-AR 이미 활성')
}

// ── 3. 국가-locale 연결 (null → 파생, 오류 로깅) ──
{
  const { data: cn } = await sb.from('i18n_cntry_mst').select('country_cd, locale_cd')
  const { data: act } = await sb.from('i18n_locale').select('locale_cd').eq('is_active', 'Y')
  const activeSet = new Set(act.map((r) => r.locale_cd))
  let linked = 0, failed = 0
  for (const c of cn.filter((c) => !c.locale_cd)) {
    const base = c.country_cd.toLowerCase()
    // 파생 규칙: 국가 전용 xx-XX가 활성이면 그것, 아니면 base (관리 페이지와 동일)
    const derived = activeSet.has(`${base}-${c.country_cd}`) ? `${base}-${c.country_cd}` : base
    if (!activeSet.has(derived)) { console.log(`  [${c.country_cd}] 활성 locale 없음 — 건너뜀`); continue }
    const { error } = await sb.from('i18n_cntry_mst').update({ locale_cd: derived }).eq('country_cd', c.country_cd)
    if (error) { console.error(`  [${c.country_cd}→${derived}] 연결 실패:`, error.message); failed++ }
    else linked++
  }
  console.log(`국가-locale 연결: +${linked} / 실패 ${failed}`)
}

// ── 4. 잉여 키 정리 — ko.json에 없는 msg_key 삭제 (파생 캐시 정합) ──
{
  function flattenJson(obj, prefix = '') {
    const result = {}
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k
      if (typeof v === 'object' && v !== null) Object.assign(result, flattenJson(v, key))
      else if (typeof v === 'string') result[key] = v
    }
    return result
  }
  const koKeys = new Set(Object.keys(flattenJson(JSON.parse(readFileSync('messages/ko.json', 'utf8')))))
  const stale = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data } = await sb.from('i18n_message').select('locale_cd, msg_key').range(from, from + PAGE - 1)
    for (const r of data ?? []) if (!koKeys.has(r.msg_key)) stale.push(r)
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  console.log(`잉여 키: ${stale.length}건`, stale.slice(0, 5).map((s) => `${s.locale_cd}:${s.msg_key}`).join(' | '))
  for (const s of stale) {
    await sb.from('i18n_message').delete().eq('locale_cd', s.locale_cd).eq('msg_key', s.msg_key)
  }
  if (stale.length) console.log('잉여 키 삭제 완료')
}

// ── 5. 잔여 채움 — 번역 보유 locale(≥2230행)에 en 전용 키 보충 ──
{
  async function fetchMap(lc) {
    const flat = {}
    const PAGE = 1000
    let from = 0
    for (;;) {
      const { data } = await sb.from('i18n_message').select('msg_key, msg_val').eq('locale_cd', lc).range(from, from + PAGE - 1)
      for (const m of data ?? []) if (m.msg_val) flat[m.msg_key] = m.msg_val
      if (!data || data.length < PAGE) break
      from += PAGE
    }
    return flat
  }
  const enMap = await fetchMap('en')
  const enKeys = Object.keys(enMap)
  const counts = {}
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data } = await sb.from('i18n_message').select('locale_cd').range(from, from + PAGE - 1)
    for (const r of data ?? []) counts[r.locale_cd] = (counts[r.locale_cd] ?? 0) + 1
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  let filled = 0
  for (const [lc, n] of Object.entries(counts)) {
    if (lc === 'en' || n < 2230 || n >= enKeys.length) continue
    const cur = await fetchMap(lc)
    const rows = enKeys.filter((k) => !cur[k]).map((k) => ({ locale_cd: lc, msg_key: k, msg_val: enMap[k], is_auto: 'Y' }))
    if (!rows.length) continue
    const { error } = await sb.from('i18n_message').upsert(rows, { onConflict: 'locale_cd,msg_key' })
    if (error) { console.error(`[fill ${lc}] 실패:`, error.message); process.exit(1) }
    filled++
  }
  console.log(`잔여 채움: ${filled}개 locale 100% 완성`)
}
console.log('=== 시드·보정 완료 ===')
