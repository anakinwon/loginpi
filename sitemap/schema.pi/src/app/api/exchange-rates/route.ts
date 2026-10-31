// 언어 콤보 환율(1 USD 기준) — loginpi 같은 처리기(@pi/i18n/routes, 외부 호출 2초 타임아웃)
export { exchangeRatesGET as GET } from '@pi/i18n/routes'
export const revalidate = 900
