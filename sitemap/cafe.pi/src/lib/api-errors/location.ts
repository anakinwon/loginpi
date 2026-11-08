// i18n 에러코드 카탈로그 — location 도메인 (값=한국어 폴백 메시지)
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const LOCATION_ERRORS = {
  LOC_CONSENT_REQUIRED: '위치기반서비스 이용약관에 동의하지 않으셨습니다',
  LOC_SAVE_FIELDS_REQUIRED: 'loc_tp_cd, lat, lng는 필수입니다',
  LOC_TP_CD_INVALID: 'loc_tp_cd: 01(가입), 02(로그인), 03(매장), 04(상품거래)',
  LOC_INVALID_COORD: '유효하지 않은 좌표값입니다',
  LOC_SAVE_FAILED: '위치 저장 중 오류가 발생했습니다',
  LOC_CONSENT_FAILED: '동의 처리 중 오류가 발생했습니다',
  LOC_WITHDRAW_FAILED: '철회 처리 중 오류가 발생했습니다',
  LOC_ADDRESS_REQUIRED: 'address는 2자 이상 필수입니다',
  LOC_GEOCODE_NOT_FOUND: '해당 주소의 좌표를 찾을 수 없습니다',
  LOC_GEOCODE_FAILED: '주소 변환 중 오류가 발생했습니다',
  LOC_LATLNG_REQUIRED: 'lat, lng는 필수입니다',
  LOC_REVERSE_NOT_FOUND: '해당 좌표의 주소를 찾을 수 없습니다',
  LOC_REVERSE_FAILED: '좌표 변환 중 오류가 발생했습니다',
  LOC_LATLNG_WGS84_REQUIRED: 'lat, lng는 필수 유효한 WGS84 좌표입니다',
  LOC_LATLNG_NUMERIC_REQUIRED: 'lat, lng는 필수 숫자 필드입니다',
  LOC_COORD_OUT_OF_RANGE: '좌표 범위를 벗어났습니다',
  LOC_SHOP_QUERY_FAILED: '상점 조회 실패',
} as const
