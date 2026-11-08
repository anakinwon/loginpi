-- 137_ops_checklist_prod_cutover.sql
-- Open Beta 준비 체크리스트(ops_checklist) 섹션0 환경구성 진척 현행화 (2026-06-29)
-- 반영: 운영DB 신설·dev 100% 미러 컷오버 완료 + 읽기전용 스위치/쓰기 가드 + 외부·레거시 테이블 정리
--   근거: ROADMAP Phase 24 ⓔ~ⓗ · sql/134(외부12종 DROP)·135(i18n 레거시2종)·136(읽기전용 롤)
--   정본: docs/PROD_DB_SETUP.md · docs/DEPLOY_STRATEGY.md · 메모리 prod-db-bootstrap-and-supabase-conn
-- DML(UPDATE)만 + 신규 1개(NOT EXISTS 가드) — item_key 기준 멱등. 재적용 안전.

-- ── 완료(DONE) ─────────────────────────────────────────────
-- 운영 DB 신설(=별도 staging/운영 DB 확보) — dev 100% 미러로 재구성
UPDATE public.ops_checklist SET status_cd='DONE',
  note_txt='운영DB(ajdwlcqoljkjamostutc) 신설 완료 — 마스터 지시로 dev 전체 100% 미러로 재구성(96테이블·59,280행, sys_user=45). pg_dump 스키마 복제 + data-only 덤프(session_replication_role=replica) 적재. 접속=aws-1-ap-northeast-2 Session pooler(직접연결 DNS 폐지).',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_STG_DB';

-- 스테이징 DB 스위칭 + 운영DB 읽기전용
UPDATE public.ops_checklist SET status_cd='DONE',
  note_txt='완료: ⓐ 운영DB 읽기전용 보호(SUPABASE_READONLY_MODE env + 쓰기 가드 완성 + read-only 롤 sql/136) ⓑ 읽기전용 전용 JWT 발급 스크립트(읽기전용 모드 로그인 세션 유지) ⓒ Staging DB 스위치 관리자 화면(배포 컨트롤)으로 무재배포 전환. 라우터=supabase-admin.ts.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_DB_SWITCH';

-- 스키마↑/데이터↓ 동기화 방식 — 확정 + 1차 전량 동기 실행
UPDATE public.ops_checklist SET status_cd='DONE',
  note_txt='동기화 방식 확정+실행: 스키마=pg_dump 복제, 데이터=전량 동기(기존행 비우기→data-only 덤프→session_replication_role=replica 적재). 정리: cafe.pi 무관 외부 테이블 12종(sql/134)+i18n 레거시 2종·데드 함수(sql/135)를 staging·운영 양쪽 제거. ⚠️ 컷오버 직전 테스트 금전데이터 초기화 필요.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_DB_SYNC';

-- SQL 마이그레이션 게이트 — 운영DB 신설로 게이트 확립
UPDATE public.ops_checklist SET status_cd='DONE',
  note_txt='운영DB=pg_dump 스키마 복제로 신설 완료(git 통짜 replay는 sql/003 genesis 누락·044 인라인 부분UNIQUE로 불가). da-ddl-guard 유지. 운영 절차: SQL은 git에만 작성→마스터가 staging·운영 양쪽 적용(운영 선적용 금지).',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_SQL_GATE';

-- ── 진행 중(DOING) ─────────────────────────────────────────
-- 데이터·시크릿 환경 격리 — 물리 분리 완료, 마무리 잔여
UPDATE public.ops_checklist SET status_cd='DOING',
  note_txt='운영DB 물리 분리 완료 + 환경별 키 분리(⭐NEXT_PUBLIC_APP_URL 도메인별 필수 — 통짜 복사 시 api-guard Origin 검증으로 /api/auth/pi 403→로그인 깨짐). 잔여: 현재 운영DB는 dev 100% 미러(테스트 데이터 포함)→오픈 직전 테스트 금전데이터 초기화 + 시크릿(비밀번호·SERVICE_ROLE_KEY) rotate.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_DATA_ISOLATE';

-- 미적용 SQL 적용 — 운영DB가 dev 100% 미러라 누적 SQL 반영됨, 컷오버 시점 재확인
UPDATE public.ops_checklist SET status_cd='DOING',
  note_txt='운영DB가 dev 100% 미러로 신설되어 누적 마이그레이션(101·107·108·109·110 포함) 반영 상태. 메인넷 컷오버 직전 staging↔운영 스키마 drift 재검증 권장.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='D_SQL_APPLY';

-- ── 신규 항목 1개 ─────────────────────────────────────────
INSERT INTO public.ops_checklist (item_key, sect_cd, sect_nm, title, note_txt, prio_cd, owner_cd, status_cd, sort_ord)
SELECT 'ENV_PROD_CUTOVER','0','환경 구성(Local→Staging→운영)','운영DB 컷오버(앱 연결 전환) + 센티넬 검증','운영 Vercel 프로젝트(cafepi) DB 연결을 개발DB→운영DB(ajdwlcqoljkjamostutc)로 전환 완료. 센티넬 행 검증으로 라이브 연결 확인. ⚠️ 컷오버 함정: SUPABASE_SERVICE_ROLE_KEY가 service_role이 아니면 sys_user RLS로 0행→세션 미인지(레거시 JWT eyJ 또는 sb_secret_ 사용·publishable 금지·캐시 없는 빌드).','BLOCKING','MASTER','DONE',55
WHERE NOT EXISTS (SELECT 1 FROM public.ops_checklist WHERE item_key='ENV_PROD_CUTOVER');

-- 검증:
--   SELECT sect_cd, count(*) FILTER (WHERE status_cd='DONE') AS done, count(*) AS total
--     FROM public.ops_checklist WHERE del_yn='N' AND status_cd<>'NA' GROUP BY sect_cd ORDER BY sect_cd;
--   SELECT item_key, status_cd FROM public.ops_checklist WHERE sect_cd='0' AND del_yn='N' ORDER BY sort_ord;
