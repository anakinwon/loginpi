-- 131_ops_checklist_db_sync.sql
-- Open Beta 체크리스트 섹션 0에 "스키마↑/데이터↓ 동기화 방식" 항목 추가
-- 2026-06-26 Supabase CDC/마이그레이션 검토 반영. 정본 그림: docs/Infrastructure.pptx 슬라이드5
-- 멱등: NOT EXISTS 가드.

INSERT INTO public.ops_checklist (item_key, sect_cd, sect_nm, title, note_txt, prio_cd, owner_cd, status_cd, sort_ord)
SELECT 'ENV_DB_SYNC','0','환경 구성(Local→Staging→운영)','스키마↑(마이그레이션)/데이터↓(마스킹 스냅샷) 동기화 방식','스키마=개발→운영 마이그레이션(supabase db diff/db push·Branching). 데이터=운영→개발 마스킹 스냅샷(db dump+익명화/seed.sql). CDC(ETL/Realtime)는 분석·라이브용 — dev-prod 미러링·운영 PII 연속복제·Kafka CDC 불필요. 상세: Infrastructure.pptx 슬라이드5','IMPORTANT','CODE','TODO',27
WHERE NOT EXISTS (SELECT 1 FROM public.ops_checklist WHERE item_key='ENV_DB_SYNC');
