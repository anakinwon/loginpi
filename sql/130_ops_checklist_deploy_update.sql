-- 130_ops_checklist_deploy_update.sql
-- Open Beta 준비 체크리스트(ops_checklist) 섹션 0 "환경 구성(Local→Staging→운영)" 현행화
-- 2026-06-26 배포전략 논의 반영: Vercel Custom Environments · Edge Config DB 스위칭 · 운영DB 읽기전용
-- 정본 그림: docs/Infrastructure.pptx
-- 멱등: 기존 항목은 item_key 기준 UPDATE, 신규는 NOT EXISTS 가드 INSERT (재적용 안전).

-- ── 기존 7개 항목 note 현행화 ──────────────────────────────
UPDATE public.ops_checklist SET note_txt='현재: 단일 DB·스테이징 없음 → 3환경 분리 실태 점검. 상세: docs/Infrastructure.pptx', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_AUDIT';
UPDATE public.ops_checklist SET note_txt='Supabase Staging 프로젝트 신설 → sql/NNN 재생으로 스키마 복제 + 합성/익명화 데이터. 무료티어 배치: Dev=로컬 Supabase(CLI)·Staging+Prod=클라우드 2개', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_STG_DB';
UPDATE public.ops_checklist SET note_txt='Vercel Custom Environments(Pro)로 staging 일급 환경화 — 브랜치·도메인·env 분리. 각 환경이 자기 DB·Pi 설정 가리킴', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_SCOPE';
UPDATE public.ops_checklist SET note_txt='WAS: 로컬→스테이징(우선배포)→운영(최종배포). Staged Production Deployments로 운영 라이브 전 검증 게이트', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_PROMOTE';
UPDATE public.ops_checklist SET note_txt='sql/NNN 순서·da-ddl-guard 유지. Dev→Staging 검증 후 운영 적용. 운영 선적용 금지. DDL은 Staging DB에서만', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_SQL_GATE';
UPDATE public.ops_checklist SET note_txt='Dev/Staging=Pi Testnet · Prod=Pi Mainnet. 메인넷은 별도 프로젝트·새 API Key(테스트넷 키 재사용 불가)·메인넷 지갑', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_PI_KEYS';
UPDATE public.ops_checklist SET note_txt='논리삭제(del_yn) 유지. 운영 직접 변경 금지 — 항상 스테이징 리허설 후 반영', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_NO_DESTROY';

-- ── 신규 항목 2개 ─────────────────────────────────────────
INSERT INTO public.ops_checklist (item_key, sect_cd, sect_nm, title, note_txt, prio_cd, owner_cd, status_cd, sort_ord)
SELECT 'ENV_DB_SWITCH','0','환경 구성(Local→Staging→운영)','스테이징 DB 스위칭(Edge Config) + 운영DB 읽기전용','Vercel Edge Config 플래그(dev⟷prod)로 무재배포 전환. 운영DB는 read-only(롤/Read Replica/Supabase Branch)만 — 쓰기·DDL 경로 차단. 라우터=supabase-admin.ts. 상세: Infrastructure.pptx 슬라이드4','IMPORTANT','CODE','TODO',25
WHERE NOT EXISTS (SELECT 1 FROM public.ops_checklist WHERE item_key='ENV_DB_SWITCH');

INSERT INTO public.ops_checklist (item_key, sect_cd, sect_nm, title, note_txt, prio_cd, owner_cd, status_cd, sort_ord)
SELECT 'ENV_DATA_ISOLATE','0','환경 구성(Local→Staging→운영)','데이터·시크릿 환경 격리','운영 PII는 하위 환경에 원본 복제 금지(마스킹/합성). 환경별 키 완전 분리: SUPABASE_SERVICE_ROLE_KEY·PI_API_KEY·PI_SESSION_SECRET·AUTH_SECRET·CRON_SECRET','IMPORTANT','MASTER','TODO',65
WHERE NOT EXISTS (SELECT 1 FROM public.ops_checklist WHERE item_key='ENV_DATA_ISOLATE');
