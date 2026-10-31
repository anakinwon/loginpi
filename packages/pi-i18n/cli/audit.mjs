// pi-i18n audit — src 아래 .ts/.tsx 의 하드코딩 한글(주석 제외) 파일별 건수. 앱에 설치된 typescript 로 구문 트리를 만들어
// 문자열 리터럴·템플릿 조각·JSX 텍스트만 센다(주석은 노드가 아니라 자동 제외). 줄 끝 '// i18n-ignore' 는 건너뜀.
// 실행 : 앱 폴더에서 pnpm i18n:audit [--src src] [--md docs/I18N_BACKLOG.md] [--json]  — 종료코드 항상 0
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, matchesGlob, relative } from 'node:path'
import { HANGUL, loadConfig, parseArgs } from './lib.mjs'

export function audit(cwd, srcDir = 'src', exclude = []) {
  const ts = createRequire(join(cwd, 'package.json'))('typescript')
  const root = join(cwd, srcDir)
  const result = []
  const files = readdirSync(root, { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
  for (const f of files) {
    const rel = relative(cwd, join(root, f)).replaceAll('\\', '/')
    if (exclude.some((g) => matchesGlob(rel, g))) continue
    const text = readFileSync(join(root, f), 'utf8')
    if (!HANGUL.test(text)) continue
    const lines = text.split('\n')
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    let count = 0
    let first = ''
    const visit = (node) => {
      const k = node.kind
      const isText =
        k === ts.SyntaxKind.StringLiteral ||
        k === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
        k === ts.SyntaxKind.TemplateHead ||
        k === ts.SyntaxKind.TemplateMiddle ||
        k === ts.SyntaxKind.TemplateTail ||
        k === ts.SyntaxKind.JsxText
      if (isText && HANGUL.test(node.text ?? '')) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line
        if (!/\/\/\s*i18n-ignore\s*$/.test(lines[line]?.trimEnd() ?? '')) {
          count++
          if (!first) first = `${line + 1}: ${node.text.trim().replace(/\s+/g, ' ').slice(0, 40)}`
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    if (count) result.push({ file: rel, count, first })
  }
  return result.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
}

export function run(argv, cwd = process.cwd()) {
  const args = parseArgs(argv)
  const cfg = loadConfig(cwd)
  const rows = audit(cwd, typeof args.src === 'string' ? args.src : 'src', cfg.exclude)
  const total = rows.reduce((n, r) => n + r.count, 0)
  if (args.json) console.log(JSON.stringify({ total, files: rows }, null, 2))
  else {
    for (const r of rows) console.log(`${String(r.count).padStart(5)}  ${r.file}`)
    console.log(`\n합계 ${total}건 · 파일 ${rows.length}개`)
  }
  if (typeof args.md === 'string') {
    const md = [
      '| 파일 | 건수 | 첫 예시 |',
      '|---|---|---|',
      ...rows.map((r) => `| \`${r.file}\` | ${r.count} | ${r.first.replaceAll('|', '\\|')} |`),
      '',
      `합계 ${total}건 · 파일 ${rows.length}개 (pi-i18n audit, ${new Date().toISOString().slice(0, 10)})`,
      '',
    ].join('\n')
    writeFileSync(join(cwd, args.md), md)
    console.log(`→ ${args.md}`)
  }
}
