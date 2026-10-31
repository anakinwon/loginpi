// pi-i18n validate — 빌드 게이트(네트워크 없음). ICU 구조 불일치·extra 키·빈 값·카탈로그 밖 파일 = 오류, 누락·용어·한글 = 경고.
// 실행 : 앱 폴더에서 pnpm i18n:validate [--locales a,b] [--strict]  → 오류 1건 이상이면 종료코드 1
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkValue, flatten, icuShape, loadConfig, parseArgs, pickLocales } from './lib.mjs'

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

  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.') && f !== 'ko.json')
  for (const f of files) {
    const l = f.slice(0, -5)
    if (!cfg.locales.includes(l)) err(l, f, '카탈로그·i18n.config.json 에 없는 locale 파일')
  }
  const targets = pickLocales(args.locales, cfg.locales).filter((l) => l !== 'ko' && files.includes(`${l}.json`))
  for (const l of targets) {
    const before = errorCount
    let warns = 0
    let flat
    try {
      flat = flatten(JSON.parse(readFileSync(join(dir, `${l}.json`), 'utf8')))
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
      const { errors, warnings } = checkValue(koFlat[k], v, l, cfg.glossary, cfg.numericArgs)
      for (const m of errors) err(l, k, m)
      for (const m of warnings) (lines.push(`⚠ [${l}] ${k} : ${m}`), warns++)
    }
    const missing = Object.keys(koFlat).filter((k) => typeof koFlat[k] === 'string' && koFlat[k] !== '' && !Object.hasOwn(flat, k)).length
    if (missing && args.strict) err(l, '*', `누락 키 ${missing}개(--strict)`)
    rows.push([l, missing, errorCount - before, warns])
  }
  return { lines, rows, errorCount, untranslated: cfg.locales.filter((l) => l !== 'ko' && !files.includes(`${l}.json`)) }
}

export function run(argv, cwd = process.cwd()) {
  const r = validate(cwd, argv)
  const args = parseArgs(argv)
  const quiet = !args.verbose
  // 경고는 줄 수가 많을 수 있어 기본은 오류만 펼쳐 보이고 경고는 표 숫자로
  for (const line of r.lines) if (!quiet || line.startsWith('✗')) console.log(line)
  console.log('\nlocale\t누락\t오류\t경고')
  for (const row of r.rows) console.log(row.join('\t'))
  if (r.untranslated.length) console.log(`\n파일 없음(ko 폴백) : ${r.untranslated.join(', ')}`)
  console.log(`\n오류 ${r.errorCount}건${r.errorCount ? '' : ' — 통과'}${quiet ? ' (경고 상세는 --verbose)' : ''}`)
  if (r.errorCount) process.exitCode = 1
}
