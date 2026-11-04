#!/usr/bin/env node
/**
 * site-menu-sync — 자사 사이트 메뉴가 바뀌면 sitemap.pi 메뉴 지도(src/data/site-menus.json)를 다시 만드는 Hook (PostToolUse)
 *
 * 대상 : Write·Edit·MultiEdit 한 파일이 scripts/gen-site-menus.mjs 의 WATCH(메뉴 정의·page.tsx·ko/en 번역)에 맞을 때
 * 동작 : 생성 스크립트 실행 → 바뀌었으면 Claude 에 "갱신됨 — 커밋·sitemap.pi 배포 때 반영" 안내(additionalContext)
 * 실패 : 메뉴 소스 구조가 바뀌어 추출이 깨지면 그 오류를 안내(작업은 막지 않음, exit 0)
 * 짝 : sitemap.pi package.json build 도 같은 스크립트를 먼저 돌린다(손 편집·Bash 수정 대비)
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

let input
try {
  input = JSON.parse(raw)
} catch {
  process.exit(0)
}

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
const file = input.tool_input?.file_path
if (!file) process.exit(0)
const rel = path.relative(root, path.resolve(root, file)).replace(/\\/g, '/')

const gen = path.join(root, 'scripts', 'gen-site-menus.mjs')
const { WATCH } = await import(pathToFileURL(gen).href)
if (!WATCH.some((re) => re.test(rel))) process.exit(0)

const r = spawnSync(process.execPath, [gen], { cwd: root, encoding: 'utf8', timeout: 15000 })
const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
const msg =
  r.status !== 0
    ? `[site-menu-sync] ${rel} 수정 후 메뉴 지도 생성 실패 — scripts/gen-site-menus.mjs 의 그 사이트 추출 규칙을 고칠 것:\n${out.slice(-600)}`
    : /갱신/.test(out)
      ? `[site-menu-sync] ${out} — 커밋에 포함하고 sitemap.pi 배포 때 반영됨`
      : ''
if (msg)
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }))
process.exit(0)
