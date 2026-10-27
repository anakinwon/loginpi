// 초대·일정 링크 주소 — 받는 사람이 여는 공개 도메인(마스터 2026-10-28) : 데스크톱 = 배포 주소, Pi Browser = Portal 포워딩 도메인.
// env 가 비었거나 localhost(로컬 .env 값이 배포에 섞임)면 운영 주소로 — 초대 링크가 localhost 로 나가 아무도 못 여는 사고 방지
const WEB = 'https://seminarz.vercel.app'
const PI = 'https://seminar0532.pinet.com'

export const publicUrl = (u?: string) =>
  u && /^https:\/\//.test(u) && !/^https:\/\/(localhost|127\.|\[::1\])/.test(u) ? u.replace(/\/$/, '') : undefined

export const webBase = () => publicUrl(process.env.NEXT_PUBLIC_APP_URL) ?? WEB
export const piBase = () =>
  publicUrl(process.env.NEXT_PUBLIC_PI_APP_DOMAIN && `https://${process.env.NEXT_PUBLIC_PI_APP_DOMAIN.replace(/^https?:\/\//, '')}`) ?? PI

// 지금 보는 곳 기준 대표 주소(링크 복사·공유) — Pi Browser 안(포워딩 도메인으로 열림)이면 Pi 주소, 아니면 데스크톱 주소. 표시용이라 인증 판정과 무관
export const hereBase = (host: string) => (host.endsWith('.pinet.com') ? piBase() : webBase())
