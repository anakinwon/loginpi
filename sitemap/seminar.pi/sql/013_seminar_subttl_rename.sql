-- 013_seminar_subttl_rename.sql — 부제 칼럼 이름 표준 정정 sub_ttl → subttl(마스터 2026-10-28)
-- DA-APPROVED: 마스터 지시(2026-10-28) — 합성어 표준단어는 '_' 없이 한 단어 : 부제 = SUBTTL. 012 는 이미 dev·stg·prod 에 적용돼 고치지 않고 이 파일로 이름만 바꾼다
-- 선행 : 012. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod (2회 실행 멱등 — 이미 바뀌었으면 건너뜀)
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'smn_mst' AND column_name = 'sub_ttl'
  ) THEN
    ALTER TABLE smn_mst RENAME COLUMN sub_ttl TO subttl;
  END IF;
END;
$$;
COMMENT ON COLUMN smn_mst.subttl IS '부제(표준단어 SUBTTL, 합성어) — 개최자·ADMIN 이 언제든 저장·수정. 표시 = 섬 이름 - 부제';

COMMIT;
