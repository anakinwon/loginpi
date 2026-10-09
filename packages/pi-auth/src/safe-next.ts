// @pi/auth — 로그인 후 이동(next) 오픈 리다이렉트 방지. 같은 origin의 경로만 정규화해 반환, 아니면 null.
// 정규식 대신 브라우저와 같은 URL 파서로 판정 — 탭·개행 제거, '\'→'/' 변환 후의 //host 우회까지 차단.
export function safeNext(next: string | null, origin: string): string | null {
  if (!next || !next.startsWith('/')) return null
  try {
    const u = new URL(next, origin)
    if (u.origin !== origin || !u.pathname.startsWith('/')) return null
    if (u.pathname.startsWith('//') || u.pathname.startsWith('/\\')) return null // 정규화 결과가 //host 이면 location.assign이 프로토콜 상대 URL로 해석(/.//evil.com 우회, 2026-10-09 재점검)
    return u.pathname + u.search + u.hash
  } catch {
    return null
  }
}
