// 언어 콤보 환율(USD 기준) — loginpi /api/exchange-rates 동일(+외부 호출 타임아웃 2초, R-P4)
export { exchangeRatesGET as GET } from '@pi/i18n/routes'
export const revalidate = 900
