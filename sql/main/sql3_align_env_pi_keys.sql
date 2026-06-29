-- sql/main/sql3_align_env_pi_keys.sql
-- ⭐ 운영DB(Product_CafePi · ajdwlcqoljkjamostutc) 전용 — drift 교정.
--   ▸ staging은 이미 DOING이라 대상 아님(루트 sql/ 동일본 없음). 운영에만 적용.
--   ▸ 실행: 운영 프로젝트 Supabase SQL Editor(owner 권한).
-- 배경(2026-06-29 검증): 운영 ops_checklist.ENV_PI_KEYS가 DONE으로 되어 staging(DOING)과 불일치.
--   ENV_PI_KEYS="Pi testnet/mainnet 키 환경별 분리" — 메인넷 Pi 키 미발급(메인넷 컷오버 잔여)이라
--   DOING이 정확. → 운영을 staging 기준(DOING)으로 정렬.
-- 멱등: 이미 DOING이면 no-op(status_cd<>'DOING' 가드).

UPDATE public.ops_checklist
  SET status_cd='DOING', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP
  WHERE item_key='ENV_PI_KEYS' AND status_cd<>'DOING';

-- 검증:
--   SELECT item_key, status_cd FROM public.ops_checklist WHERE sect_cd='0' AND del_yn='N' ORDER BY sort_ord;
--   → ENV_PI_KEYS=DOING, 섹션0 집계 9 DONE/2 DOING (staging과 일치)
