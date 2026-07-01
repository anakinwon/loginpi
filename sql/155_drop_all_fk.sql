-- DA-APPROVED: 모든 FK(외래키) 제약 일괄 제거 — 무FK 원칙 고수 (마스터 지시 2026-07-01)
--   배경: 초기 스키마(011~152)에 FK 62개가 광범위하게 존재했으나, 이 프로젝트는
--         참조 무결성을 애플리케이션 레벨(논리삭제 del_yn + 별도 조회·Map 병합)에서 보장한다.
--   목적: FK의 쓰기 성능 저하 제거 + PostgREST 임베디드 조인 미사용 관례와 정합.
--   안전성: FK DROP은 데이터 무손실(제약만 삭제, 행은 그대로). 멱등 — 재실행 시 남은 FK 0개.
--   ⚠️ 이후 참조 무결성(고아 방지)은 애플리케이션 책임. 신규 DDL에 FK 추가 금지(CLAUDE.md 명문화).

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
