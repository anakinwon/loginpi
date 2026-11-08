-- sys_batch_log.trigger_cd 코드값 추가 — ONDEMAND (통계 대시보드 자동 최신화)
-- 배경: 어드민 통계 대시보드 접속 시 자동 실행되는 온디맨드 집계가 MANUAL(수동)로 기록되어
--       관리자가 직접 실행하지 않은 작업이 "수동"으로 표시되는 혼선 발생 → 코드 분리
-- 스키마 변경 없음 (CHECK 제약 미존재) — 컬럼 주석만 현행화

COMMENT ON COLUMN public.sys_batch_log.trigger_cd
  IS '실행 주체: CRON(Vercel Cron 매일 00:00 UTC) | ONDEMAND(통계 대시보드 자동 최신화) | MANUAL(어드민 수동) | BACKFILL(기간 백필)';

COMMENT ON COLUMN public.sys_batch_log.regr_id
  IS 'CRON 실행 시 SYSTEM, ONDEMAND·MANUAL·BACKFILL 실행 시 트리거한 어드민 식별자';
