// π 시세(USD) — loginpi 같은 처리기(@pi/i18n/routes, 외부 호출 2초 타임아웃)
export { piPriceGET as GET } from '@pi/i18n/routes'
export const revalidate = 300
