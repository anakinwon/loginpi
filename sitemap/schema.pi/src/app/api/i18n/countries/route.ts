// 언어 콤보 데이터(활성 locale + 국가 마스터) — loginpi 같은 응답 {locales, countries}, @pi/i18n 스냅숏(표준 8절)
export { countriesGET as GET } from '@pi/i18n/routes'
export const revalidate = 600
