-- ⚠️⚠️⚠️ 무효 / 폐기 (DO NOT RUN) — 2026-07-01 무FK 정책 철회로 폐기됨.
--
-- 이 스크립트는 public 스키마의 FK 62개를 일괄 제거했으나, 이 프로젝트는 PostgREST
-- 임베디드 조인(.select('*, mps_shop(...)')·msg_theme(...) 등)을 광범위하게 사용하며
-- 이는 DB의 FK 관계에 의존한다. FK를 지우자 PGRST200이 발생해 카페·매장·상품 목록
-- 조회가 붕괴하는 장애가 났고, sql/156_restore_fk.sql 로 FK를 전량 복구했다.
--
-- 결론: 이 프로젝트는 FK를 유지한다(무FK 원칙 폐기). 무FK로 전환하려면 반드시
--       "임베디드 조인 → 별도 조회+Map 대체" 를 먼저 하고 나서 개별 FK를 제거해야 한다.
--       (CLAUDE.md DB 규칙 참고)
--
-- 아래 원본 코드는 이력 보존용으로만 남기며, 절대 실행하지 않는다(주석 처리).
/* ===================== 폐기된 원본 (실행 금지) =====================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    RAISE NOTICE 'dropped FK: % on %', r.conname, r.tbl;
  END LOOP;
END $$;
==================================================================== */
