// 언어 콤보 데이터(활성 locale·국가 마스터) — loginpi /api/i18n/countries 와 같은 응답 {locales, countries}, @pi/i18n 스냅숏 제공
export { countriesGET as GET } from '@pi/i18n/routes'
export const revalidate = 600
