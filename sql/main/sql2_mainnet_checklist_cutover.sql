-- sql/main/sql2_mainnet_checklist_cutover.sql
-- ⭐ 운영DB(Product_CafePi · ajdwlcqoljkjamostutc) 적용 전용.
--   ▸ staging(dev) 동일본 = sql/138_mainnet_checklist_cutover.sql (루트). 내용·결과 동일(멱등).
--   ▸ 넘버링 혼선 방지: 운영 적용 SQL은 이 폴더(sql/main/)에 sql1·sql2… 별도 번호로 보관.
--   ▸ 실행: 운영 프로젝트 Supabase SQL Editor(owner 권한 — 읽기전용 모드/readonly_ro 롤과 무관하게 쓰기 가능).
--   ▸ 적용 순서: sql/main/ 내 번호순(sql1 → sql2 → …).
-- 내용: 메인넷 출시 체크리스트(mainnet_checklist) E-4·E-7 운영DB 컷오버 진척 현행화 (2026-06-29)
-- DML(UPDATE)만 — item_key 기준 멱등. 정본: docs/MAINNET_READINESS_CHECKLIST.md

-- E-4 앱 URL: 운영 URL + 운영DB 라이브 확보. 메인넷 포털 도메인검증은 E-3 후로 유지(DOING)
UPDATE public.mainnet_checklist SET status_cd='DOING',
  note_txt='운영 URL+운영DB 라이브 확보: cafepi.vercel.app(운영 Vercel 프로젝트, production 브랜치 게이팅) + 운영DB(ajdwlcqoljkjamostutc) 컷오버 완료. 메인넷 Dev Portal validation-key.txt 도메인검증은 E-3(메인넷 포털 신규 생성) 후. 커스텀 도메인은 후속.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='E-4';

-- E-7 Vercel env+cron: 운영 인프라+운영DB 컷오버 완료. 메인넷 Pi 값만 잔여(DOING 유지)
UPDATE public.mainnet_checklist SET status_cd='DOING',
  note_txt='운영 Vercel env(NEXT_PUBLIC_APP_URL 도메인별·AUTH_SECRET·CRON_SECRET 등)+Cron 등록 완료. 운영DB 컷오버 완료(ajdwlcqoljkjamostutc·센티넬 검증)+읽기전용 보호(SUPABASE_READONLY_MODE). 잔여(메인넷 스왑): PI_API_KEY(메인넷)·PI_WALLET_PRIVATE_SEED(등록지갑 일치)·NEXT_PUBLIC_PI_SANDBOX=false·시크릿 rotate.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='E-7';

-- 검증:
--   SELECT sect_cd, count(*) FILTER (WHERE status_cd='DONE') AS done, count(*) AS total
--     FROM public.mainnet_checklist WHERE del_yn='N' GROUP BY sect_cd ORDER BY sect_cd;
--   SELECT item_key, status_cd, prio_cd FROM public.mainnet_checklist WHERE del_yn='N' ORDER BY sort_ord;
