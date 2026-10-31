// pi-i18n validate — 빌드 게이트(네트워크 없음). 언어 소스(messages/en.json·lang/<언어>.json)를 검사하고, routing locale 파일(messages/<locale>.json)은
// 언어 소스를 그대로 펼친 것(expand)인지 확인한다. ICU 구조 불일치·extra 키·빈 값·카탈로그/routing 밖 파일·expand 미동기 = 오류, 누락·용어·한글 = 경고.
// 실행 : 앱 폴더에서 pnpm i18n:validate [--langs a,b] [--strict] [--verbose]  → 오류 1건 이상이면 종료코드 1
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { plan, strays } from './expand.mjs'
import { checkValue, flatten, icuShape, loadConfig, parseArgs, pickLocales, sourceFile } from './lib.mjs'

export function validate(cwd, argv = []) {
  const args = parseArgs(argv)
  const cfg = loadConfig(cwd)
  const dir = join(cwd, 'messages')
  const lines = []
  const rows = []
  let errorCount = 0
  const err = (l, k, m) => (lines.push(`✗ [${l}] ${k} : ${m}`), errorCount++)

  const koFlat = flatten(JSON.parse(readFileSync(join(dir, 'ko.json'), 'utf8')))
  for (const [k, v] of Object.entries(koFlat)) {
    if (k.split('.').some((p) => p.startsWith('_'))) lines.push(`⚠ [ko] ${k} : 메타 키('_')`)
    if (typeof v !== 'string') continue
    if (v === '') err('ko', k, '빈 값(폐기 키는 삭제)')
    else {
      try {
        icuShape(v)
      } catch (e) {
        err('ko', k, `ICU 파싱 실패(${e.message})`)
      }
    }
  }

  // ① 언어 소스 — lang/ 파일 이름은 카탈로그 언어만
  const langDir = join(dir, 'lang')
  const langFiles = existsSync(langDir) ? readdirSync(langDir).filter((f) => f.endsWith('.json')) : []
  for (const f of langFiles) {
    const l = f.slice(0, -5)
    if (l === 'ko' || l === 'en') err(l, `lang/${f}`, 'ko·en 소스는 messages/ko.json·en.json 에 둔다')
    else if (!cfg.languages.includes(l)) err(l, `lang/${f}`, '언어 카탈로그·i18n.config.json languages 에 없는 언어 파일')
  }
  const targets = pickLocales(args.langs, cfg.languages).filter((l) => l !== 'ko' && existsSync(sourceFile(dir, l)))
  for (const l of targets) {
    const before = errorCount
    let warns = 0
    let flat
    try {
      flat = flatten(JSON.parse(readFileSync(sourceFile(dir, l), 'utf8')))
    } catch (e) {
      err(l, `${l}.json`, `JSON 형식 오류(${e.message})`)
      rows.push([l, '-', errorCount - before, 0])
      continue
    }
    for (const [k, v] of Object.entries(flat)) {
      if (!Object.hasOwn(koFlat, k)) {
        err(l, k, 'ko 에 없는 키(extra) — ko 에 먼저 추가하거나 삭제')
        continue
      }
      if (typeof koFlat[k] !== 'string') continue
      // 언어 코드로 검사 — plural 범주는 언어 기준(locale 'am' 은 아르메니아어지만 언어 코드 hy)
      const { errors, warnings } = checkValue(koFlat[k], v, l, cfg.glossary, cfg.numericArgs)
      for (const m of errors) err(l, k, m)
      for (const m of warnings) (lines.push(`⚠ [${l}] ${k} : ${m}`), warns++)
    }
    const missing = Object.keys(koFlat).filter((k) => typeof koFlat[k] === 'string' && koFlat[k] !== '' && !Object.hasOwn(flat, k)).length
    if (missing && args.strict) err(l, '*', `누락 키 ${missing}개(--strict)`)
    rows.push([l, missing, errorCount - before, warns])
  }

  // ② routing locale 파일 — 언어 소스와 바이트 동일해야(expand 동기), routing 밖 파일 금지
  for (const f of strays(dir, cfg.locales)) err(f.slice(0, -5), f, 'routing(loginpi) 목록에 없는 파일 — 언어 소스면 messages/lang/ 으로 옮길 것')
  const fallback = []
  for (const it of plan(cwd).items) {
    const has = existsSync(it.file)
    if (it.want === null) {
      if (has) err(it.locale, `${it.locale}.json`, it.lang ? `언어 소스(${it.lang}) 없음 — 파일 삭제 또는 소스 추가` : '언어 매핑 없는 locale(ko·en 폴백) — 파일 삭제')
      else fallback.push(it.locale)
    } else if (!has || readFileSync(it.file, 'utf8') !== it.want) err(it.locale, `${it.locale}.json`, `언어 소스(${it.lang})와 다름 — pnpm i18n:expand`)
  }
  return { lines, rows, errorCount, untranslated: fallback }
}

export function run(argv, cwd = process.cwd()) {
  const r = validate(cwd, argv)
  const args = parseArgs(argv)
  const quiet = !args.verbose
  // 경고는 줄 수가 많을 수 있어 기본은 오류만 펼쳐 보이고 경고는 표 숫자로
  for (const line of r.lines) if (!quiet || line.startsWith('✗')) console.log(line)
  console.log('\n언어\t누락\t오류\t경고')
  for (const row of r.rows) console.log(row.join('\t'))
  if (r.untranslated.length) console.log(`\n파일 없음(ko·en 폴백) locale ${r.untranslated.length}개 : ${r.untranslated.join(', ')}`)
  console.log(`\n오류 ${r.errorCount}건${r.errorCount ? '' : ' — 통과'}${quiet ? ' (경고 상세는 --verbose)' : ''}`)
  if (r.errorCount) process.exitCode = 1
}
