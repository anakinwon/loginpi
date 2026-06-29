-- 139_align_e_env_prod.sql  (staging/dev 적용)
-- ops_checklist drift 교정: E_ENV_PROD를 DOING으로 정렬 (2026-06-29)
--   배경: staging=TODO·운영=DONE 불일치(전체 대조에서 발견). E_ENV_PROD="프로덕션 env
--   (CRON_SECRET·WALLET_SEED·API_KEY·SECRET류) 등록" — 운영 env 골격은 컷오버로 등록됐으나
--   메인넷 PI_API_KEY·PI_WALLET_PRIVATE_SEED는 testnet/shadow 잔여 → DOING이 사실에 부합.
--   ▸ 운영DB 동일본 = sql/main/sql4_align_e_env_prod.sql
--   ▸ (ENV_PI_KEYS는 staging 이미 DOING이라 여기 대상 아님 — 운영 전용 교정은 sql/main/sql3)
-- 멱등: 이미 DOING이면 no-op(status_cd<>'DOING' 가드).

UPDATE public.ops_checklist
  SET status_cd='DOING', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP
  WHERE item_key='E_ENV_PROD' AND status_cd<>'DOING';

-- 검증:
--   SELECT item_key, status_cd FROM public.ops_checklist WHERE sect_cd='E' AND del_yn='N' ORDER BY sort_ord;
