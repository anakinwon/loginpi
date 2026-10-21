-- 072_mon_ai_fix.sql : 모니터링 AI 수정 요청 — 'PR 로 해결' 1회 = 1행, 진행 단계·결재 요청자·승인자·PR·배포 결과(마스터 지시 2026-10-22 "진행상태와 요청 주체, 결재 요청자, 승인자 등의 프로세스를 보고서 형태의 목록으로")
-- DA-APPROVED: 마스터 지시 2026-10-22 — 신규 1테이블(mon_ 접두 = 모니터링 주제영역), 상태 변경 테이블이라 논리 삭제(del_yn·del_dtm), 시스템 컬럼 4개 맨 끝, service_role 전용
--   약어 FIX(수정)·STS(상태)·REQ(요청)·APV(승인)·CAUS(원인)·MDL(모델)·CMT(커밋)·MRG(병합)·DPLY(배포)·AHEAD(앞선)·ERR(오류). FK 없음(RI 물리 미구현 결정 — usr_id 는 sys_user.usr_id 값만 보관)
--   요청 주체 = AI 모델(mdl_dsp_nm·mdl_nm 당시 값 보관, 설정에서 지워져도 이력 유지) / 결재 요청자 = 'PR 로 해결'을 누른 사람(req_usr_id) / 승인자 = '승인'을 누른 사람(apv_usr_id)
BEGIN;

CREATE TABLE IF NOT EXISTS mon_ai_fix (
  fix_id            UUID          NOT NULL DEFAULT gen_random_uuid(),      -- 수정ID
  route_txt         VARCHAR(200)  NOT NULL,                                -- API 경로(:id 정규화)
  caus_txt          VARCHAR(200)  NOT NULL,                                -- 원인(AI 분석 원인 제목)
  fix_txt           VARCHAR(200)  NOT NULL,                                -- 해결방안(AI 해결 방안 제목)
  file_txt          VARCHAR(1000),                                         -- 바뀐 파일(src 기준, ' · ' 구분)
  mdl_nm            VARCHAR(100)  NOT NULL,                                -- 모델명(요청 주체 AI, 제공사 API 이름)
  mdl_dsp_nm        VARCHAR(100)  NOT NULL,                                -- 모델표시명
  fix_sts_cd        VARCHAR(10)   NOT NULL DEFAULT 'REQ',                  -- 수정상태코드
  req_usr_id        UUID          NOT NULL,                                -- 요청사용자ID(결재 요청자)
  req_dtm           TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,      -- 요청일시
  pr_no             INT,                                                   -- PR번호(GitHub)
  pr_url            VARCHAR(300),                                          -- PR주소
  head_cmt_txt      CHAR(40),                                              -- 머리커밋(AI 가 만든 커밋 sha — 승인은 이 커밋만)
  apv_usr_id        UUID,                                                  -- 승인사용자ID(승인자)
  apv_dtm           TIMESTAMPTZ,                                           -- 승인일시
  mrg_cmt_txt       CHAR(40),                                              -- 병합커밋(운영 배포 커밋 sha)
  ahead_cnt         INT,                                                   -- 앞선커밋수(이번 운영 배포에 함께 나간 커밋 수)
  dply_dtm          TIMESTAMPTZ,                                           -- 배포일시(배포 결과 확인 시각)
  err_txt           VARCHAR(500),                                          -- 오류내용(실패 단계의 이유)
  del_yn            CHAR(1)       NOT NULL DEFAULT 'N',                    -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT          NOT NULL DEFAULT 'ADMIN',                -- 등록자ID
  reg_dtm           TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,      -- 등록일시
  modr_id           TEXT          NOT NULL DEFAULT 'ADMIN',                -- 변경자ID
  mod_dtm           TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,      -- 변경일시
  CONSTRAINT pk_mon_ai_fix PRIMARY KEY (fix_id),
  -- REQ 수정안 요청 중 · REQ_FAIL 요청 실패 · PR 커밋·PR 완료(승인 대기) · APV 승인 처리 중 · APV_FAIL 승인 실패 · DPLY 병합·운영 배포 중 · DONE 배포 완료 · DPLY_FAIL 배포 실패
  CONSTRAINT mon_ai_fix_fix_sts_cd_check CHECK (fix_sts_cd IN ('REQ', 'REQ_FAIL', 'PR', 'APV', 'APV_FAIL', 'DPLY', 'DONE', 'DPLY_FAIL')),
  CONSTRAINT mon_ai_fix_del_yn_check CHECK (del_yn IN ('Y', 'N')),
  CONSTRAINT mon_ai_fix_sha_check CHECK ((head_cmt_txt IS NULL OR head_cmt_txt ~ '^[0-9a-f]{40}$') AND (mrg_cmt_txt IS NULL OR mrg_cmt_txt ~ '^[0-9a-f]{40}$'))
);
CREATE INDEX IF NOT EXISTS x_mon_ai_fix_01 ON mon_ai_fix (req_dtm DESC) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS x_mon_ai_fix_02 ON mon_ai_fix (pr_no) WHERE pr_no IS NOT NULL;

SELECT fn_add_mod_dtm_trg('mon_ai_fix');
SELECT fn_grant_svc_only('TABLE', 'mon_ai_fix');

COMMENT ON TABLE mon_ai_fix IS '모니터링 AI 수정 요청 — PR 로 해결 1회 = 1행, 진행 단계(요청 → PR → 승인 → 배포)·요청 주체(AI 모델)·결재 요청자·승인자·PR·배포 결과';
COMMENT ON COLUMN mon_ai_fix.fix_id IS '수정ID';
COMMENT ON COLUMN mon_ai_fix.route_txt IS 'API 경로(:id 정규화)';
COMMENT ON COLUMN mon_ai_fix.caus_txt IS '원인(AI 분석 원인 제목)';
COMMENT ON COLUMN mon_ai_fix.fix_txt IS '해결방안(AI 해결 방안 제목)';
COMMENT ON COLUMN mon_ai_fix.file_txt IS '바뀐 파일(src 기준)';
COMMENT ON COLUMN mon_ai_fix.mdl_nm IS '모델명(요청 주체 AI)';
COMMENT ON COLUMN mon_ai_fix.mdl_dsp_nm IS '모델표시명';
COMMENT ON COLUMN mon_ai_fix.fix_sts_cd IS '수정상태코드(REQ·REQ_FAIL·PR·APV·APV_FAIL·DPLY·DONE·DPLY_FAIL)';
COMMENT ON COLUMN mon_ai_fix.req_usr_id IS '요청사용자ID(결재 요청자 — PR 로 해결을 누른 사람)';
COMMENT ON COLUMN mon_ai_fix.req_dtm IS '요청일시';
COMMENT ON COLUMN mon_ai_fix.pr_no IS 'PR번호(GitHub)';
COMMENT ON COLUMN mon_ai_fix.pr_url IS 'PR주소';
COMMENT ON COLUMN mon_ai_fix.head_cmt_txt IS '머리커밋(AI 가 만든 커밋 sha)';
COMMENT ON COLUMN mon_ai_fix.apv_usr_id IS '승인사용자ID(승인자)';
COMMENT ON COLUMN mon_ai_fix.apv_dtm IS '승인일시';
COMMENT ON COLUMN mon_ai_fix.mrg_cmt_txt IS '병합커밋(운영 배포 커밋 sha)';
COMMENT ON COLUMN mon_ai_fix.ahead_cnt IS '앞선커밋수(이번 운영 배포에 함께 나간 커밋 수)';
COMMENT ON COLUMN mon_ai_fix.dply_dtm IS '배포일시(배포 결과 확인 시각)';
COMMENT ON COLUMN mon_ai_fix.err_txt IS '오류내용(실패 단계의 이유)';
COMMENT ON COLUMN mon_ai_fix.del_yn IS '삭제여부';
COMMENT ON COLUMN mon_ai_fix.del_dtm IS '삭제일시';
COMMENT ON COLUMN mon_ai_fix.regr_id IS '등록자ID';
COMMENT ON COLUMN mon_ai_fix.reg_dtm IS '등록일시';
COMMENT ON COLUMN mon_ai_fix.modr_id IS '변경자ID';
COMMENT ON COLUMN mon_ai_fix.mod_dtm IS '변경일시';
COMMENT ON INDEX x_mon_ai_fix_01 IS '보고서 목록(최신 요청순, 활성 행)';
COMMENT ON INDEX x_mon_ai_fix_02 IS 'PR 번호 유일(승인·배포 상태를 PR 로 찾음)';

COMMIT;

NOTIFY pgrst, 'reload schema';
