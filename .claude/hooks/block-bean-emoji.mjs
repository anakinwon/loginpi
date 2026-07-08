#!/usr/bin/env node
/**
 * block-bean-emoji — 🫘(콩 이모지) 사용 차단 Hook (PreToolUse)
 *
 * 규칙(정본): 메모리 bean-means-coffee-bean
 *   Bean·빈·커피빈·카페빈·커피콩·콩 등 모든 Bean 시각 표현은
 *   <BeanIcon/> 컴포넌트(@/components/ui/bean-icon, public/bean.png)로만.
 *   🫘(콩 이모지, U+1FAD8) 절대 금지.
 *
 * 동작:
 *   - 🫘 미포함 → exit 0 (통과)
 *   - 🫘 포함   → exit 2 (차단 + 안내 메시지)
 *   - 파싱 불가 → exit 0 (가드 오작동으로 작업 차단 방지)
 *
 * 대상: Write(content) · Edit(new_string) · MultiEdit(edits[].new_string)
 */

// ---------- stdin 수신 ----------
let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

let input
try {
  input = JSON.parse(raw)
} catch {
  process.exit(0)
}

const toolInput = input.tool_input ?? {}

// ---------- 검사 대상 텍스트 수집 ----------
const texts = []
if (typeof toolInput.content === 'string') texts.push(toolInput.content)
if (typeof toolInput.new_string === 'string') texts.push(toolInput.new_string)
if (Array.isArray(toolInput.edits)) {
  for (const e of toolInput.edits) {
    if (e && typeof e.new_string === 'string') texts.push(e.new_string)
  }
}

// ---------- 🫘 검사 ----------
const BEAN_EMOJI = '\u{1FAD8}' // 🫘
if (texts.some((t) => t.includes(BEAN_EMOJI))) {
  console.error(
    [
      '⛔ 🫘(콩 이모지) 사용이 차단되었습니다.',
      '',
      'Bean·빈·커피빈·카페빈·커피콩·콩 등 모든 Bean 시각 표현은',
      '  → <BeanIcon className="h-N w-N" />  (@/components/ui/bean-icon, public/bean.png)',
      '만 사용하세요. 🫘 이모지는 절대 금지입니다.',
      '',
      'DB 문자열(memo/메시지)이라면 🫘를 넣지 말고, 렌더링하는 컴포넌트에서',
      'BeanIcon으로 표시하세요. (정본: 메모리 bean-means-coffee-bean)',
    ].join('\n'),
  )
  process.exit(2)
}

process.exit(0)
