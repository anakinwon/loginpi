-- sql/114_ops_checklist_progress_done.sql
-- DA-APPROVED: ops_checklist(111) 데이터 현행화 — 코드 완료 항목 상태 갱신(스키마 변경 없음).
--
-- 목적: 2026-06-24 세션에서 코드 구현이 완료된 체크리스트 항목을 DONE으로 현행화.
--   (B/D/F/G 섹션 코드 항목 — [마스터]/[외부] 항목은 미변경 유지)
--   ⚠️ staging 먼저 적용·검증 후 운영. 멱등(재실행 시 동일 결과).

UPDATE public.ops_checklist
   SET status_cd = 'DONE',
       modr_id   = 'SYSTEM',
       mod_dtm   = CURRENT_TIMESTAMP
 WHERE del_yn = 'N'
   AND status_cd <> 'DONE'
   AND item_key IN (
     'C_CONSENT_UI',  -- 가입 동의 UI (약관·개인정보·마케팅)
     'C_AGE_GATE',    -- 연령 게이트 (만14세·법정대리인)
     'D_BAL_CRON',    -- Bean 항등식 모니터링 cron
     'D_BAL_CARD',    -- 어드민 항등식 diff 카드(+자동점검 표시)
     'F_ERR_PAGE',    -- error/not-found 글로벌 에러 페이지
     'G_REPORT',      -- 신고 기능(접수·처리 추적)
     'G_FAQ',         -- FAQ 페이지 + 지원채널 노출
     'F_PERF'         -- window.Pi 가드·CAFE WS 폴백·MAP 클러스터링(검증 완료)
   );

-- 참고: C_LBS_CONSENT·B_REDLINE·D_NO_LEAK·G_NOTIFY_DONE·H_HOME_DOC·H_PLEDGE·H_EVENT1·ENV_NO_DESTROY는
--       시드에서 이미 DONE. 나머지(ENV_*·A_*·C_LAW*·C_BIZ·C_VASP·D_SQL_APPLY·D_A2U·E_*·H_EVENT2·H_LOCALE)는
--       [마스터]/[외부] 작업이라 미변경.

-- 검증:
--   SELECT sect_cd, status_cd, count(*) FROM public.ops_checklist WHERE del_yn='N'
--    GROUP BY sect_cd, status_cd ORDER BY sect_cd;
--   SELECT count(*) FILTER (WHERE status_cd='DONE') AS done, count(*) AS total
--     FROM public.ops_checklist WHERE del_yn='N' AND status_cd<>'NA';
