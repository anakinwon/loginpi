/**
 * 비관리자 뷰어에게 username을 마스킹한다.
 * - ≤ 10자: 뒷 4자리 ****
 * - > 10자: 뒷 5자리 *****
 */
export function maskUsername(username: string | null | undefined): string {
  if (!username) return '—'
  const len = username.length
  if (len <= 10) return username.slice(0, Math.max(0, len - 4)) + '****'
  return username.slice(0, len - 5) + '*****'
}
