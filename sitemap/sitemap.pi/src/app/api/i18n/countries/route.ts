// 다국어 콤보 데이터(활성 locale·국가) — @pi/i18n 스냅숏(loginpi DB 동일) 그대로 응답 {locales, countries}
export { countriesGET as GET } from '@pi/i18n/routes'
export const revalidate = 600
