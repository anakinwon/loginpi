-- 012_seminar_sub_ttl.sql — 세미나 부제(개최자가 언제든 저장·수정, 마스터 2026-10-28)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-28) — smn_mst 칼럼 1개(sub_ttl) 추가만. DA 사후 리뷰 대상
-- 선행 : 011. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod
-- 신규 표준단어 : 부제 SUB_TTL(Sub Title) — 행안부 공통표준 '제목'=TTL 승계
-- 표시 규칙 : 세미나 룸 이름 = 섬 이름(smn_nm) + ' - ' + 부제(sub_ttl). 부제가 없으면 섬 이름만(src/lib/seminar-rules.ts smnTitle)
BEGIN;

ALTER TABLE smn_mst ADD COLUMN IF NOT EXISTS sub_ttl VARCHAR(60); -- 부제(NULL = 없음)
COMMENT ON COLUMN smn_mst.sub_ttl IS '부제 — 개최자·ADMIN 이 언제든 저장·수정. 표시 = 섬 이름 - 부제';

COMMIT;
