-- 045_mdl_sql_exec_hist.sql : SQL 편집기 실행 이력(마스터 지시 2026-10-18 "Universal SQL Editor" — DBeaver Query Manager 참고)
-- DA-APPROVED: 마스터 지시 2026-10-18 — 신규 1테이블, 약어 SQL·EXEC(실행)·HIST(이력)·MODE(방식)·CNT(수)·RSLT(결과) 표준단어 [확인중 : da-standards]
-- 실행 1번 = 1행(조회 포함), 결과 값은 저장하지 않음(문장·행 수·소요·오류만). 쓰기 실행은 std_audit_log 에도 남김(앱)
-- 문장 원문은 4000자까지(리터럴에 개인정보가 들어갈 수 있음 — 보존 기간 [확인중 : 마스터])
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_sql_exec_hist (
  sql_exec_id       UUID         NOT NULL DEFAULT gen_random_uuid(),       -- SQL실행ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  conn_id           UUID         NOT NULL,                                 -- 접속ID
  usr_id            TEXT         NOT NULL,                                 -- 실행자ID
  sql_txt           TEXT         NOT NULL,                                 -- SQL내용(4000자까지)
  stmt_cnt          INT          NOT NULL,                                 -- 문장수
  exec_mode_cd      VARCHAR(5)   NOT NULL,                                 -- 실행방식코드 : READ 조회 전용 / WRITE 쓰기 포함
  rslt_cd           VARCHAR(4)   NOT NULL,                                 -- 결과코드 : OK 성공 / ERR 오류 / PART 일부 실행
  row_cnt           BIGINT,                                                -- 행수(조회 행 + 반영 행)
  elapsed_ms        INT,                                                   -- 소요밀리초
  err_cd            VARCHAR(20),                                           -- 오류코드
  err_msg           VARCHAR(200),                                          -- 오류메시지(접속 정보 가림)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_sql_exec_hist_pkey PRIMARY KEY (sql_exec_id),
  CONSTRAINT mdl_sql_exec_hist_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_sql_exec_hist_mdl_db_conn_id_fkey FOREIGN KEY (conn_id) REFERENCES mdl_db_conn (conn_id),
  CONSTRAINT mdl_sql_exec_hist_sql_txt_check CHECK (char_length(sql_txt) <= 4000),
  CONSTRAINT mdl_sql_exec_hist_mode_check CHECK (exec_mode_cd IN ('READ','WRITE')),
  CONSTRAINT mdl_sql_exec_hist_rslt_check CHECK (rslt_cd IN ('OK','ERR','PART')),
  CONSTRAINT mdl_sql_exec_hist_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE INDEX IF NOT EXISTS ix_mdl_sql_exec_hist_area_usr ON mdl_sql_exec_hist (area_id, usr_id, reg_dtm DESC) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS ix_mdl_sql_exec_hist_area ON mdl_sql_exec_hist (area_id, reg_dtm DESC) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_sql_exec_hist'), fn_grant_svc_only('TABLE', 'mdl_sql_exec_hist');
COMMENT ON TABLE mdl_sql_exec_hist IS 'SQL 편집기 실행 이력 — 실행 1번 1행, 결과 값 저장 안 함';

COMMIT;

NOTIFY pgrst, 'reload schema';
