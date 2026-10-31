// pi-i18n expand — 언어 소스(messages/ko·en.json + messages/lang/<언어>.json)를 routing locale 파일(messages/<locale>.json)로 펼친다.
// locale → 언어는 loginpi 와 같다(src/data/locale-lang.json : ae → ar, am → hy(아르메니아어), et → am(암하라어) …). 파일 내용 = 언어 소스 그대로 복사.
// 언어 매핑이 없는 locale(loginpi 도 파일 없음)·소스가 없는 언어는 만들지 않는다 → 런타임 ko → en 폴백. 내용이 같으면 쓰지 않음(git diff 안정)
// 실행 : 앱 폴더에서 pnpm i18n:expand  (translate 끝에 자동 실행, validate 가 동기화 여부를 검사)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCALE_LANG, loadConfig, sourceFile } from './lib.mjs'

// locale → { lang, src, want(기대 내용 | null) } — validate 도 같은 판정을 쓴다
export function plan(cwd) {
  const cfg = loadConfig(cwd)
  const dir = join(cwd, 'messages')
  const out = []
  for (const locale of cfg.locales) {
    if (locale === 'ko' || locale === 'en') continue // 자기 자신이 소스
    const lang = LOCALE_LANG[locale]
    const src = lang ? sourceFile(dir, lang) : null
    out.push({ locale, lang, file: join(dir, `${locale}.json`), want: src && existsSync(src) ? readFileSync(src, 'utf8') : null })
  }
  return { cfg, dir, items: out }
}

// messages/ 바로 아래 json 중 routing locale 이 아닌 파일 (lang/ 폴더·상태 파일 제외)
export function strays(dir, locales) {
  return readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.') && !locales.includes(f.slice(0, -5)))
}

export function expand(cwd) {
  const { cfg, dir, items } = plan(cwd)
  const r = { written: [], same: 0, noSource: [], strays: strays(dir, cfg.locales) }
  for (const it of items) {
    if (it.want === null) {
      if (it.lang) r.noSource.push(`${it.locale}(${it.lang})`)
      continue
    }
    if (existsSync(it.file) && readFileSync(it.file, 'utf8') === it.want) r.same++
    else (writeFileSync(it.file, it.want), r.written.push(it.locale))
  }
  return r
}

export function run(argv, cwd = process.cwd()) {
  const r = expand(cwd)
  console.log(`expand : 갱신 ${r.written.length} · 그대로 ${r.same} · 소스 없음(폴백) ${r.noSource.length}`)
  if (r.noSource.length) console.log(`  소스 없는 locale : ${r.noSource.join(', ')}`)
  if (r.strays.length) console.log(`⚠ routing 에 없는 파일(언어 소스면 messages/lang/ 으로 옮길 것) : ${r.strays.join(', ')}`)
}
