// π 시세(USD) — loginpi /api/pi-price 동일(+외부 호출 타임아웃 2초, R-P4)
export { piPriceGET as GET } from '@pi/i18n/routes'
export const revalidate = 300
