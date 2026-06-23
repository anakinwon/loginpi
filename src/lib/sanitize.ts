// 서버사이드 입력 sanitization — XSS 심층 방어 (KISA-XS)
// React 텍스트 노드는 자동 이스케이프하지만 DB 저장 시점에도 악성 패턴을 제거.
// (future-proof: dangerouslySetInnerHTML 추가·타 시스템 연동 시 DB 데이터 오염 방지)

const SCRIPT_RE = /<script[\s\S]*?<\/script>/gi
const EVENT_HANDLER_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi
const JS_SCHEME_RE = /javascript\s*:/gi
const DATA_SCHEME_RE = /data\s*:\s*text\/html/gi
const HTML_TAG_RE = /<[^>]+>/g

/**
 * 채팅·알림 등 plain text 필드에 사용.
 * HTML 태그를 완전히 제거하고 순수 텍스트만 유지.
 */
export function sanitizePlain(text: string): string {
  return text
    .replace(SCRIPT_RE, '')
    .replace(HTML_TAG_RE, '')
    .replace(JS_SCHEME_RE, '')
    .trim()
}

/**
 * 게시판 본문·댓글 등 마크다운 가능 필드에 사용.
 * <script>, 이벤트 핸들러(on*=), javascript:/data:text/html 스킴만 제거.
 * 일반 마크다운·줄바꿈은 유지.
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
