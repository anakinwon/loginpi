-- DA-APPROVED: af·ar locale 국가 매핑 추가 (DML only — 채팅 언어콤보 미노출 locale 해소, 2026-07-10)
--
-- 배경: 채팅 번역 언어콤보는 i18n_cntry_mst(locale_cd 매핑 국가)만 노출한다.
--       활성 189개 locale 중 af(아프리칸스)·ar(아랍어 표준)만 매핑 국가가 없어 선택 불가였다.
-- 방안: ① ar → 팔레스타인(PS) 신규 국가 등록 (미등록 아랍어권, 순수 추가)
--       ② af → 나미비아(NA) 재매핑 (아프리칸스=나미비아 실질 공통어 — 언어선정 기준 '실사용 우위' 부합.
--          기존 na locale은 영어 복사본이라 자산 손실 0 → 비활성. 남아공 ZA는 영어(en-ZA) 유지)
--       ③ 선행조건: i18n_cntry_mst.locale_cd FK가 i18n_lang_mst 참조 → af·ar 언어마스터 먼저 등재
-- 결과: 활성 locale 188 = 콤보 노출 188 (na 비활성, 선택불가 0 — staging 검증 완료)
-- 복구: na 재활성(is_active='Y')·NA locale_cd='na' 원복으로 되돌림 가능 (물리삭제 없음)

-- ① 언어마스터 등재 (FK 선행) — 멱등
INSERT INTO public.i18n_lang_mst
  (lang_cd, lang_nm, native_nm, country_cd, font_key, dir_cd, sort_ord, use_yn, regr_id, modr_id)
VALUES
  ('af', '아프리칸스어', 'Afrikaans', NULL, NULL, 'ltr', 272, 'Y', 'ADMIN', 'ADMIN'),
  ('ar', '아랍어',       'العربية',   NULL, NULL, 'rtl', 273, 'Y', 'ADMIN', 'ADMIN')
ON CONFLICT (lang_cd) DO NOTHING;

-- ② 팔레스타인(PS) 신규 국가 → locale 'ar' — 멱등
INSERT INTO public.i18n_cntry_mst
  (country_cd, dis_ord_seq, country_eng_nm, country_mot_nm, currency_cd, currency_eng_nm,
   flag_emoji, locale_cd, use_yn, regr_id, modr_id)
VALUES
  ('PS', 188, 'Palestine', 'فلسطين', 'ILS', 'Israeli New Shekel', NULL, 'ar', 'Y', 'ADMIN', 'ADMIN')
ON CONFLICT (country_cd) DO NOTHING;

-- ③ 나미비아(NA) 재매핑 na → af
UPDATE public.i18n_cntry_mst
   SET locale_cd = 'af',
       modr_id   = 'ADMIN',
       mod_dtm   = CURRENT_TIMESTAMP
 WHERE country_cd = 'NA'
   AND locale_cd = 'na';

-- ④ 고아 locale 'na' 비활성 (영어 복사본 — 콘텐츠는 보존, 재활성 가능)
UPDATE public.i18n_locale
   SET is_active = 'N',
       modr_id   = 'ADMIN',
       mod_dtm   = CURRENT_TIMESTAMP
 WHERE locale_cd = 'na';

UPDATE public.i18n_lang_mst
   SET use_yn  = 'N',
       modr_id = 'ADMIN',
       mod_dtm = CURRENT_TIMESTAMP
 WHERE lang_cd = 'na';

-- 검증: 활성 locale = 콤보 노출 locale (선택불가 0이어야 함)
-- SELECT (SELECT count(*) FROM public.i18n_locale WHERE is_active='Y') AS active_locales,
--        (SELECT count(DISTINCT locale_cd) FROM public.i18n_cntry_mst WHERE use_yn='Y' AND locale_cd IS NOT NULL) AS combo_locales;
