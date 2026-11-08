-- DA-APPROVED: i18n 구버전(레거시) 테이블 2종 + 데드 함수 제거(물리 DROP 허용).
--   i18n_country·i18n_msg는 sql/011의 초기 i18n 설계 잔재로, 현행 i18n_cntry_mst·
--   i18n_message로 완전 대체됨. 판별 근거(2026-06-28):
--   ①코드 참조 0(현행 i18n_cntry_mst 4파일·i18n_message 3파일 사용 vs 레거시 0)
--   ②이 둘을 FK로 참조하는 테이블 0(드롭 안전) ③유일한 DB 참조 함수
--   get_i18n_msg_counts()도 앱 호출 0 = 데드 → 테이블과 함께 제거.
--   sql/102가 시스템컬럼을 추가했으나(유지보수 흔적) 실사용은 없음. (staging·운영 양쪽 적용)

DROP FUNCTION IF EXISTS public.get_i18n_msg_counts();

DROP TABLE IF EXISTS
  public.i18n_msg,      -- 구 메시지 테이블 → 현행 i18n_message
  public.i18n_country   -- 구 국가 테이블 → 현행 i18n_cntry_mst
CASCADE;
