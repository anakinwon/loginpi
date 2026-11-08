// 서버사이드 입력 sanitization — XSS 심층 방어 (KISA-XS)
//
// ⚠️ 설계 원칙:
//   Primary defense: React 텍스트 노드({text})는 innerHTML이 아닌 textContent로 설정 → XSS 불가
//   Secondary defense: 이 파일의 함수들 — DB 저장 시점에 악성 패턴 제거 (defense-in-depth)
//
// ⚠️ 한계 (regex sanitizer의 근본 제약):
//   - 정규식은 malformed/중첩 태그 변형을 100% 커버하지 못함
//   - dangerouslySetInnerHTML 또는 innerHTML로 렌더링 시 이 함수만으로는 불충분
//   - 그 경우 반드시 `sanitize-html` 또는 DOMPurify(jsdom) 라이브러리로 교체할 것

const SCRIPT_RE = /<script[\s\S]*?<\/script>/gi
// on\w+= : 공백 0개 이상 허용 → <img onerror=...> (공백 없는 케이스) 도 제거
const EVENT_HANDLER_RE = /\s*\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi
const JS_SCHEME_RE = /javascript\s*:/gi
const DATA_SCHEME_RE = /data\s*:\s*text\/html/gi
const HTML_TAG_RE = /<[^>]+>/g

/**
 * 채팅·알림 등 plain text 필드.
 * HTML 태그 완전 제거 — React 텍스트 노드 렌더링과 조합하면 XSS 불가.
 * ⚠️ HTML-encode 방식(& → &amp;)은 사용하지 않음: React text node가 &amp;를 그대로 표시해
 *    사용자 화면에 &lt;script&gt; 글자가 보이는 UX 문제 발생.
 */
export function sanitizePlain(text: string): string {
  return text
    .replace(SCRIPT_RE, '')
    .replace(HTML_TAG_RE, '')
    .replace(JS_SCHEME_RE, '')
    .trim()
}

/**
 * 게시판 본문·댓글 등 마크다운 가능 필드.
 * <script>, 이벤트 핸들러(on*=), javascript:/data:text/html 스킴 제거.
 * ⚠️ 현재 이 필드는 React 텍스트 노드로만 렌더링됨 — 안전.
 *    dangerouslySetInnerHTML 도입 시 `sanitize-html` 라이브러리로 교체 필수.
 */
export function sanitizeMarkdown(text: string): string {
  return text
    .replace(SCRIPT_RE, '')
    .replace(EVENT_HANDLER_RE, '')
    .replace(JS_SCHEME_RE, '')
    .replace(DATA_SCHEME_RE, '')
    .trim()
}

/**
 * 제목·별명 등 단일 라인 필드.
 * HTML 태그 완전 제거 + 줄바꿈 제거.
 */
export function sanitizeTitle(text: string): string {
  return text
    .replace(HTML_TAG_RE, '')
    .replace(JS_SCHEME_RE, '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
}
