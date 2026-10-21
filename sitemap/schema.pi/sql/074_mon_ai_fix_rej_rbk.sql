-- 074_mon_ai_fix_rej_rbk.sql : 모니터링 AI 수정 반려·되돌리기(마스터 지시 2026-10-22 "수정 > 배포요청 > 반려 > 수정 이전상태로 rollback")
--  반려 = 승인 대기 PR 을 닫고 브랜치 삭제(운영·master 코드는 수정 전 그대로), 되돌리기 = 이미 운영 배포된 AI 수정을 수정 전 내용으로 되돌리는 커밋 + 운영 배포
-- DA-APPROVED: 마스터 지시 2026-10-22 — mon_ai_fix 칼럼 8개(fn_add_cols_keep_sys, 시스템 컬럼 맨 끝 유지) + 수정상태코드 CHECK 확장, 약어 REJ(반려)·RBK(되돌림)·RSN(사유)·CMT(커밋)·DPLY(배포)
--   상태 추가 : REJ 반려(수정 전 유지) · RBK 되돌림 배포 중 · RBK_DONE 되돌림 완료 · RBK_FAIL 되돌림 실패. 기존 행 값 변경 없음
BEGIN;

SELECT fn_add_cols_keep_sys('mon_ai_fix', $c$
  ADD COLUMN rej_usr_id    UUID,
  ADD COLUMN rej_dtm       TIMESTAMPTZ,
  ADD COLUMN rej_rsn_txt   VARCHAR(500),
  ADD COLUMN rbk_usr_id    UUID,
  ADD COLUMN rbk_dtm       TIMESTAMPTZ,
  ADD COLUMN rbk_rsn_txt   VARCHAR(500),
  ADD COLUMN rbk_cmt_txt   CHAR(40) CONSTRAINT mon_ai_fix_rbk_cmt_check CHECK (rbk_cmt_txt IS NULL OR rbk_cmt_txt ~ '^[0-9a-f]{40}$'),
  ADD COLUMN rbk_dply_dtm  TIMESTAMPTZ$c$);

ALTER TABLE mon_ai_fix DROP CONSTRAINT mon_ai_fix_fix_sts_cd_check;
ALTER TABLE mon_ai_fix ADD CONSTRAINT mon_ai_fix_fix_sts_cd_check
  CHECK (fix_sts_cd IN ('REQ', 'REQ_FAIL', 'PR', 'APV', 'APV_FAIL', 'REJ', 'DPLY', 'DONE', 'DPLY_FAIL', 'RBK', 'RBK_DONE', 'RBK_FAIL'));

COMMENT ON COLUMN mon_ai_fix.fix_sts_cd IS '수정상태코드(REQ·REQ_FAIL·PR·APV·APV_FAIL·REJ 반려·DPLY·DONE·DPLY_FAIL·RBK 되돌림 배포 중·RBK_DONE 되돌림 완료·RBK_FAIL 되돌림 실패)';
COMMENT ON COLUMN mon_ai_fix.rej_usr_id IS '반려사용자ID(반려자)';
COMMENT ON COLUMN mon_ai_fix.rej_dtm IS '반려일시';
COMMENT ON COLUMN mon_ai_fix.rej_rsn_txt IS '반려사유';
COMMENT ON COLUMN mon_ai_fix.rbk_usr_id IS '되돌림사용자ID';
COMMENT ON COLUMN mon_ai_fix.rbk_dtm IS '되돌림일시(요청 시각)';
COMMENT ON COLUMN mon_ai_fix.rbk_rsn_txt IS '되돌림사유';
COMMENT ON COLUMN mon_ai_fix.rbk_cmt_txt IS '되돌림커밋(수정 전 내용으로 되돌린 커밋 sha = 운영 배포 커밋)';
COMMENT ON COLUMN mon_ai_fix.rbk_dply_dtm IS '되돌림배포일시(배포 결과 확인 시각)';

COMMIT;

NOTIFY pgrst, 'reload schema';
