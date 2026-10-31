// 접속 국가(IP) 조회 — 하루 첫 접속 언어 자동 선택용(@pi/i18n PreferredLocaleScript, 표준 4.3). Vercel x-vercel-ip-country, 사람마다 달라 캐시 금지
export { geoGET as GET } from '@pi/i18n/routes'
export const dynamic = 'force-dynamic'
