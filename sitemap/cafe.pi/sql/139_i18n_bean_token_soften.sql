-- 139_i18n_bean_token_soften.sql
-- A-5(Pi 전용 거래) 대응: 사용자 노출 'Bean Token' → 'Bean' 순화 (거래 토큰 표현 절제).
--   심사관 인상 관리 — Bean은 "Pi로 충전하는 외부 환전 불가 인앱 적립금"이지 거래 토큰이 아니다.
--   정본 경로: ko = messages/ko.json 직접 수정 / ko 외 locale = i18n_message(DB→JSON 동기화 원본).
--   messages/*.json도 동일 치환 완료 → DB 갱신 후 sync해도 값이 일치(충돌 없음).
-- ⚠️ 적용 후 /admin/i18n/sync로 JSON 재생성(또는 이미 치환된 json 유지). staging·운영 양쪽 적용.
-- 멱등: LIKE 가드 + replace. 재실행 안전. DML(UPDATE)만.

UPDATE public.i18n_message
SET msg_val = replace(replace(msg_val, 'Bean Tokens', 'Beans'), 'Bean Token', 'Bean'),
    mod_dtm = NOW()
WHERE msg_val LIKE '%Bean Token%';

-- 검증:
--   SELECT count(*) FROM public.i18n_message WHERE msg_val LIKE '%Bean Token%';  -- 기대: 0
--   SELECT locale_cd, msg_key, msg_val FROM public.i18n_message
--     WHERE msg_key LIKE '%bean%' AND msg_val LIKE '%Bean%' ORDER BY locale_cd LIMIT 20;
