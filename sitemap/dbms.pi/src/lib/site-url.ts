// dbms.pi 공개 주소 — env NEXT_PUBLIC_APP_URL, 없으면 로컬 개발 주소. [TBD : 운영 도메인] 확정 시 운영 폴백 추가
const LOCAL = 'http://localhost:3004'

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || LOCAL).replace(/\/$/, '')
