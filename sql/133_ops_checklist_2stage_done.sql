-- 133_ops_checklist_2stage_done.sql
-- Open Beta 준비 체크리스트(ops_checklist) 섹션0 환경구성 진척 현행화 (2026-06-28)
-- 반영: 2단계 배포(staging/운영 2-프로젝트) 분리 완료 + 운영 WAS 신설
-- DML(UPDATE)만 — item_key 기준 멱등. 정본: docs/DEPLOY_STRATEGY.md · docs/DEPLOY_NOTICE.md

-- ── 완료(DONE) ─────────────────────────────────────────────
-- 환경 분리 실태 점검 → 토폴로지 확정
UPDATE public.ops_checklist SET status_cd='DONE',
  note_txt='토폴로지 확정(2026-06-28): cafepi·loginpi가 1개 Vercel 프로젝트+도메인 별칭이었음(🧪 STAGING 배너 양쪽 노출로 판정) → 2-프로젝트 분리 결정.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_AUDIT';

-- staging 일급 환경화(브랜치·도메인·env 분리)
UPDATE public.ops_checklist SET status_cd='DONE',
  note_txt='2-프로젝트 분리 완료: staging(loginpi.vercel.app·master·APP_TIER=staging·🧪배너) / 운영(cafepi.vercel.app·production 브랜치·배너없음). env·도메인·브랜치 분리. 같은 repo 다중 연결.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_SCOPE';

-- WAS 승격 게이트(local→staging→운영)
UPDATE public.ops_checklist SET status_cd='DONE',
  note_txt='production 브랜치 게이팅 + scripts/promote-to-prod.mjs(master→production ff-only 승격·dry-run 기본·작업트리 무손상). master push=staging 자동배포만, 운영=의도적 승격으로만. WIP 운영 유출 차단.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_PROMOTE';

-- ── 진행 중(DOING) ─────────────────────────────────────────
-- Pi 키 분리(Dev/Staging=Testnet, Prod=Mainnet)
UPDATE public.ops_checklist SET status_cd='DOING',
  note_txt='운영 프로젝트 분리됨. 현재 shadow=Testnet/sandbox(NEXT_PUBLIC_PI_SANDBOX=true). 메인넷 키·지갑은 컷오버 시(mainnet_checklist E-5/E-6).',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_PI_KEYS';

-- 데이터·시크릿 환경 격리
UPDATE public.ops_checklist SET status_cd='DOING',
  note_txt='환경별 키 분리 적용 — ⭐NEXT_PUBLIC_APP_URL 도메인별 필수(api-guard Origin 검증, loginpi 복사 시 /api/auth/pi 403→인증 깨짐), GOOGLE_CLIENT_SECRET 운영 재설정. DB는 현재 개발DB shadow → 운영DB는 pg_dump 스키마 복제 예정(docs/PROD_DB_SETUP.md).',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_DATA_ISOLATE';

-- SQL 게이트 — 운영DB 신설 방식 확정
UPDATE public.ops_checklist SET status_cd='DOING',
  note_txt='운영DB 신설=pg_dump 스키마 복제 확정(git 통짜 replay는 sql/003 genesis 누락·sql/044 인라인UNIQUE로 불가). 참조 시드만 allowlist data-only 이관. docs/PROD_DB_SETUP.md.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='ENV_SQL_GATE';
