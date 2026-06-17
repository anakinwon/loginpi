/*
 * 백서 PDF 빌드 스크립트 (무의존 · 오프라인)
 *
 * 마크다운 → HTML(자체 변환) → PDF(Edge/Chrome 헤드리스 --print-to-pdf)
 * 사용법: node .whitepaper-build/build.js
 * 출력: docs/dist/*.pdf  (중간 HTML도 .whitepaper-build/ 에 보존)
 */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { pathToFileURL } = require('url')

const ROOT = path.resolve(__dirname, '..')
const BUILD_DIR = __dirname
const DIST_DIR = path.join(ROOT, 'docs', 'dist')

// 빌드 대상: { 소스 마크다운, 출력 파일명, 표지 제목, 언어 }
const TARGETS = [
  { src: 'docs/PRD_12_TOKEN_백서.md', out: 'BEAN_Whitepaper_KO', title: 'BEAN White Paper (한국어)', lang: 'ko' },
  { src: 'docs/PRD_12_TOKEN_WHITEPAPER_EN.md', out: 'BEAN_Whitepaper_EN', title: 'BEAN White Paper (English)', lang: 'en' },
]

// ---------- 마크다운 → HTML (필요한 부분집합만) ----------
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inline(s) {
  s = escapeHtml(s)
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return s
}
function splitRow(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}
function renderList(block) {
  let out = ''
  const stack = []
  for (const raw of block) {
    const m = raw.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/)
    if (!m) {
      out = out.replace(/<\/li>\n?$/, ' ' + inline(raw.trim()) + '</li>\n')
      continue
    }
    const indent = m[1].length
    const type = /\d+\./.test(m[2]) ? 'ol' : 'ul'
    if (stack.length === 0 || indent > stack[stack.length - 1].indent) {
      out += type === 'ol' ? '<ol>\n' : '<ul>\n'
      stack.push({ type, indent })
    } else if (indent < stack[stack.length - 1].indent) {
      while (stack.length && stack[stack.length - 1].indent > indent) {
        out += stack.pop().type === 'ol' ? '</ol>\n' : '</ul>\n'
      }
    }
    out += `<li>${inline(m[3])}</li>\n`
  }
  while (stack.length) out += stack.pop().type === 'ol' ? '</ol>\n' : '</ul>\n'
  return out
}
function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const N = lines.length
  let html = ''
  let i = 0
  while (i < N) {
    const line = lines[i]
    // 코드펜스
    if (/^```/.test(line)) {
      i++
      const code = []
      while (i < N && !/^```\s*$/.test(lines[i])) { code.push(lines[i]); i++ }
      i++
      html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>\n`
      continue
    }
    if (/^\s*$/.test(line)) { i++; continue }
    if (/^---+\s*$/.test(line)) { html += '<hr/>\n'; i++; continue }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) { const l = h[1].length; html += `<h${l}>${inline(h[2])}</h${l}>\n`; i++; continue }
    // 인용
    if (/^>\s?/.test(line)) {
      const buf = []
      while (i < N && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++ }
      html += `<blockquote>${buf.map((b) => (b.trim() === '' ? '' : inline(b))).join('<br/>')}</blockquote>\n`
      continue
    }
    // 표
    if (/^\s*\|/.test(line) && i + 1 < N && /-/.test(lines[i + 1]) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const rows = [splitRow(line)]
      i += 2
      while (i < N && /^\s*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++ }
      let t = '<table>\n<thead><tr>' + rows[0].map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead>\n<tbody>\n'
      for (let r = 1; r < rows.length; r++) t += '<tr>' + rows[r].map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>\n'
      t += '</tbody></table>\n'
      html += t
      continue
    }
    // 목록
    if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
      const block = []
      while (i < N && !/^\s*$/.test(lines[i]) && (/^(\s*)([-*]|\d+\.)\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        block.push(lines[i]); i++
      }
      html += renderList(block)
      continue
    }
    // 문단
    const para = [line]; i++
    while (i < N && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|>|```|---+\s*$|\s*\||(\s*)([-*]|\d+\.)\s+)/.test(lines[i])) {
      para.push(lines[i]); i++
    }
    html += `<p>${inline(para.join(' '))}</p>\n`
  }
  return html
}

// ---------- HTML 템플릿 ----------
function htmlDoc(title, bodyHtml) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Malgun Gothic","Segoe UI",Roboto,"Apple SD Gothic Neo",sans-serif;
         font-size: 10.5pt; line-height: 1.55; color: #1f2937; }
  h1 { font-size: 22pt; border-bottom: 3px solid #16a34a; padding-bottom: 6px; color: #14532d; }
  h2 { font-size: 15pt; margin-top: 22px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; color: #166534; }
  h3 { font-size: 12.5pt; margin-top: 16px; color: #15803d; }
  h4 { font-size: 11pt; margin-top: 12px; color: #374151; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0 6px 4px; padding-left: 20px; }
  li { margin: 3px 0; }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-family: "Consolas",monospace; font-size: 9.5pt; }
  pre { background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 8px; overflow-x: auto; page-break-inside: avoid; }
  pre code { background: transparent; color: inherit; padding: 0; }
  blockquote { border-left: 4px solid #16a34a; background: #f0fdf4; margin: 8px 0; padding: 6px 14px; color: #374151; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #dcfce7; color: #14532d; }
  tr:nth-child(even) td { background: #f8fafc; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 18px 0; }
  a { color: #15803d; text-decoration: none; }
  h1, h2 { page-break-after: avoid; }
</style></head>
<body>
${bodyHtml}
<hr/>
<p style="color:#94a3b8;font-size:8.5pt;text-align:center;">Cafe.pi · BEAN White Paper · Generated ${new Date().toISOString().slice(0, 10)} · Draft — pending legal review</p>
</body></html>`
}

// ---------- 브라우저(헤드리스) 탐색 ----------
function findBrowser() {
  const candidates = [
    process.env.BROWSER_PDF_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean)
  return candidates.find((p) => fs.existsSync(p))
}
function printPdf(browser, htmlPath, pdfPath) {
  const url = pathToFileURL(htmlPath).href
  const baseArgs = ['--disable-gpu', '--no-sandbox', '--print-to-pdf-no-header', `--print-to-pdf=${pdfPath}`, url]
  try {
    execFileSync(browser, ['--headless=new', ...baseArgs], { stdio: 'ignore' })
  } catch (_e) {
    execFileSync(browser, ['--headless', ...baseArgs], { stdio: 'ignore' })
  }
}

// ---------- 실행 ----------
function main() {
  const browser = findBrowser()
  if (!browser) {
    console.error('✘ Edge/Chrome 실행파일을 찾지 못했습니다. BROWSER_PDF_PATH 환경변수로 지정하세요.')
    process.exit(1)
  }
  fs.mkdirSync(DIST_DIR, { recursive: true })
  for (const t of TARGETS) {
    const srcAbs = path.join(ROOT, t.src)
    if (!fs.existsSync(srcAbs)) { console.warn(`- 건너뜀(소스 없음): ${t.src}`); continue }
    const md = fs.readFileSync(srcAbs, 'utf8')
    const html = htmlDoc(t.title, mdToHtml(md))
    const htmlPath = path.join(BUILD_DIR, `${t.out}.html`)
    const pdfPath = path.join(DIST_DIR, `${t.out}.pdf`)
    fs.writeFileSync(htmlPath, html, 'utf8')
    printPdf(browser, htmlPath, pdfPath)
    const ok = fs.existsSync(pdfPath)
    console.log(`${ok ? '✓' : '✘'} ${t.out}.pdf ${ok ? '(' + Math.round(fs.statSync(pdfPath).size / 1024) + ' KB)' : '생성 실패'}`)
  }
  console.log(`\n출력 위치: ${path.relative(ROOT, DIST_DIR)}`)
}
main()
