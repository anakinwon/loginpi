-- sql/main/sql4_align_e_env_prod.sql
-- ⭐ 운영DB(Product_CafePi · ajdwlcqoljkjamostutc) 적용 전용.
--   ▸ staging(dev) 동일본 = sql/139_align_e_env_prod.sql (루트). 내용·결과 동일(멱등).
--   ▸ 실행: 운영 프로젝트 Supabase SQL Editor(owner 권한).
-- 내용: ops_checklist E_ENV_PROD drift 교정 — 운영 DONE → DOING 정렬 (2026-06-29)
--   E_ENV_PROD="프로덕션 env 등록" — 운영 env 골격은 등록됐으나 메인넷 PI_API_KEY·
--   PI_WALLET_PRIVATE_SEED는 testnet/shadow 잔여 → DOING이 사실에 부합(staging과 일치).
-- 멱등: 이미 DOING이면 no-op.

UPDATE public.ops_checklist
  SET status_cd='DOING', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP
  WHERE item_key='E_ENV_PROD' AND status_cd<>'DOING';

-- 검증:
--   SELECT item_key, status_cd FROM public.ops_checklist WHERE sect_cd='E' AND del_yn='N' ORDER BY sort_ord;
