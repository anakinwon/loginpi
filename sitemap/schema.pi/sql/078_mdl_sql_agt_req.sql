-- 078_mdl_sql_agt_req.sql : SQL 편집기 에이전트 중계 큐(2026-11-07 마스터 지시 "Pi통신 DB 를 schema.pi 에서 접속해 확인·처리") — 로컬 에이전트(AGT) 접속에서도 SQL 편집기 실행·탐색기 메타를 쓰게 한다
-- DA-APPROVED: 2026-11-07 da-governance-expert — 신규 1테이블 mdl_sql_agt_req(mdl_ 접두, 시스템 컬럼 4개 맨 끝, del_yn·del_dtm 논리삭제, service_role 전용), 큐 칼럼 lease_exp_dtm·run_nonce = sql/038 선례, JSONB _val·바이트 _sz 선례, 결과 비움 = 공통표준 RMVL(제거)(CLR 은 공통표준 '접수자'와 충돌해 쓰지 않음), rslt_val 은 중계 버퍼라 행은 남기고 값만 NULL. 조건부 지적 P2(CLR)·P3 3건(err_cd 20자·상태별 필수값 CHECK·기한 정리 인덱스) 반영
-- 흐름 : 화면 → 서버(권한·문장 판정 끝난 지시서 req_val 저장, WAIT) → 에이전트 claim(RUN, 점유 기한·일회값) → 결과 업로드(rslt_val, DONE/FAIL) → 서버가 읽어 화면에 응답 후 즉시 rslt_val = NULL(rslt_rmvl_dtm) — 정리 : WAIT 이 exp_dtm 지나면 EXP, RUN 이 lease_exp_dtm 지나면 FAIL
-- 결과 값 보관 금지 원칙(sql/045 실행 이력은 결과 값 저장 안 함) : rslt_val 은 중계 버퍼 — 읽는 즉시 비우고, 못 읽은 것도 정리 작업이 5분 뒤 비운다. 물리 DELETE 금지라 행은 남고 값만 NULL
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_sql_agt_req (
  req_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 요청ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  conn_id           UUID         NOT NULL,                                 -- 접속ID(AGT 접속만)
  agt_id            UUID         NOT NULL,                                 -- 에이전트ID(요청 시점 접속의 에이전트 — claim 대상)
  req_usr_id        TEXT         NOT NULL,                                 -- 요청자ID
  req_tp_cd         VARCHAR(4)   NOT NULL,                                 -- 요청유형코드 : RUN 실행 / META 탐색기 메타
  req_val           JSONB        NOT NULL,                                 -- 요청값(서버 판정을 마친 지시서 — 문장·실행 방식·행 제한·스키마)
  req_sts_cd        VARCHAR(4)   NOT NULL DEFAULT 'WAIT',                  -- 요청상태코드 : WAIT 대기 / RUN 실행중 / DONE 완료 / FAIL 실패 / EXP 기한 초과 / CNCL 취소
  exp_dtm           TIMESTAMPTZ  NOT NULL,                                 -- 만료일시(이 시각까지 가져가지 않으면 EXP — 화면 대기 상한)
  run_nonce         TEXT,                                                  -- 실행일회값(에이전트 보고 대조)
  lease_exp_dtm     TIMESTAMPTZ,                                           -- 실행점유만료일시
  exec_end_dtm      TIMESTAMPTZ,                                           -- 실행종료일시
  rslt_val          JSONB,                                                 -- 결과값(중계 버퍼 — 읽으면 즉시 NULL)
  rslt_sz           INT,                                                   -- 결과크기(바이트, 비운 뒤에도 남김)
  rslt_rmvl_dtm     TIMESTAMPTZ,                                           -- 결과비움일시
  err_cd            VARCHAR(20),                                           -- 오류코드
  err_msg           VARCHAR(200),                                          -- 오류메시지(200자 절단)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT pk_mdl_sql_agt_req PRIMARY KEY (req_id),
  CONSTRAINT mdl_sql_agt_req_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_sql_agt_req_mdl_db_conn_id_fkey FOREIGN KEY (conn_id) REFERENCES mdl_db_conn (conn_id),
  CONSTRAINT mdl_sql_agt_req_mdl_db_agt_id_fkey FOREIGN KEY (agt_id) REFERENCES mdl_db_agt (agt_id),
  CONSTRAINT mdl_sql_agt_req_tp_check CHECK (req_tp_cd IN ('RUN','META')),
  CONSTRAINT mdl_sql_agt_req_sts_check CHECK (req_sts_cd IN ('WAIT','RUN','DONE','FAIL','EXP','CNCL')),
  CONSTRAINT mdl_sql_agt_req_val_sz_check CHECK (pg_column_size(req_val) <= 1500000),            -- 지시서 상한(편집기 요청 본문 상한과 같은 수준)
  CONSTRAINT mdl_sql_agt_req_rslt_check CHECK (rslt_val IS NULL OR req_sts_cd IN ('DONE','FAIL')), -- 결과는 끝난 요청에만
  CONSTRAINT mdl_sql_agt_req_rslt_sz_check CHECK (rslt_sz IS NULL OR rslt_sz BETWEEN 0 AND 4000000), -- Vercel 응답 4.5MB 안
  CONSTRAINT mdl_sql_agt_req_rmvl_check CHECK (rslt_rmvl_dtm IS NULL OR rslt_val IS NULL),         -- 비웠으면 값 없음
  CONSTRAINT mdl_sql_agt_req_run_check CHECK (req_sts_cd <> 'RUN' OR (run_nonce IS NOT NULL AND lease_exp_dtm IS NOT NULL)),  -- 실행중 = 점유 기한·일회값 필수
  CONSTRAINT mdl_sql_agt_req_end_check CHECK (req_sts_cd NOT IN ('DONE','FAIL') OR exec_end_dtm IS NOT NULL),     -- 끝난 요청 = 종료일시 필수
  CONSTRAINT mdl_sql_agt_req_del_yn_check CHECK (del_yn IN ('Y','N') AND ((del_yn = 'Y') = (del_dtm IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS x_mdl_sql_agt_req_01 ON mdl_sql_agt_req (agt_id, reg_dtm) WHERE req_sts_cd = 'WAIT' AND del_yn = 'N';
CREATE INDEX IF NOT EXISTS x_mdl_sql_agt_req_02 ON mdl_sql_agt_req (area_id, reg_dtm DESC) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS x_mdl_sql_agt_req_03 ON mdl_sql_agt_req (reg_dtm) WHERE rslt_val IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_mdl_sql_agt_req_04 ON mdl_sql_agt_req (exp_dtm) WHERE req_sts_cd IN ('WAIT','RUN') AND del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_sql_agt_req'), fn_grant_svc_only('TABLE', 'mdl_sql_agt_req');

-- 지시서·대상 고정(mdl_ddl_req 의 fn_chk_mdl_ddl_req_fix 선례) — 에이전트가 가져간 뒤 내용이 바뀌면 판정을 우회할 수 있으므로 UPDATE 로 못 바꾼다
CREATE OR REPLACE FUNCTION fn_chk_mdl_sql_agt_req_fix()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.req_val, NEW.req_tp_cd, NEW.conn_id, NEW.agt_id, NEW.req_usr_id, NEW.area_id)
     IS DISTINCT FROM (OLD.req_val, OLD.req_tp_cd, OLD.conn_id, OLD.agt_id, OLD.req_usr_id, OLD.area_id) THEN
    RAISE EXCEPTION 'mdl_sql_agt_req_fixed: 에이전트 SQL 요청의 지시서·대상·요청자는 바꿀 수 없습니다(새로 요청)' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_sql_agt_req_fix()');
DROP TRIGGER IF EXISTS trg_mdl_sql_agt_req_fix ON mdl_sql_agt_req;
CREATE TRIGGER trg_mdl_sql_agt_req_fix BEFORE UPDATE ON mdl_sql_agt_req FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_sql_agt_req_fix();

COMMENT ON TABLE mdl_sql_agt_req IS 'SQL 편집기 에이전트 중계 요청 — 서버 판정 지시서 → 로컬 에이전트 실행 → 결과 버퍼(읽으면 즉시 비움, 5분 뒤 정리)';
COMMENT ON COLUMN mdl_sql_agt_req.req_id IS '요청ID';
COMMENT ON COLUMN mdl_sql_agt_req.area_id IS '분류체계ID';
COMMENT ON COLUMN mdl_sql_agt_req.conn_id IS '접속ID(실행방법 AGT 접속)';
COMMENT ON COLUMN mdl_sql_agt_req.agt_id IS '에이전트ID(요청 시점 접속의 에이전트, claim 대상)';
COMMENT ON COLUMN mdl_sql_agt_req.req_usr_id IS '요청자ID';
COMMENT ON COLUMN mdl_sql_agt_req.req_tp_cd IS '요청유형코드 : RUN 실행 / META 탐색기 메타';
COMMENT ON COLUMN mdl_sql_agt_req.req_val IS '요청값(서버가 권한·문장 판정을 마친 지시서, 변경 불가)';
COMMENT ON COLUMN mdl_sql_agt_req.req_sts_cd IS '요청상태코드 : WAIT 대기 / RUN 실행중 / DONE 완료 / FAIL 실패 / EXP 기한 초과 / CNCL 취소';
COMMENT ON COLUMN mdl_sql_agt_req.exp_dtm IS '만료일시(이때까지 가져가지 않으면 EXP)';
COMMENT ON COLUMN mdl_sql_agt_req.run_nonce IS '실행일회값(에이전트 결과 보고 대조)';
COMMENT ON COLUMN mdl_sql_agt_req.lease_exp_dtm IS '실행점유만료일시';
COMMENT ON COLUMN mdl_sql_agt_req.exec_end_dtm IS '실행종료일시';
COMMENT ON COLUMN mdl_sql_agt_req.rslt_val IS '결과값(중계 버퍼 — 서버가 읽는 즉시 NULL, 결과 값 보관 금지)';
COMMENT ON COLUMN mdl_sql_agt_req.rslt_sz IS '결과크기(바이트)';
COMMENT ON COLUMN mdl_sql_agt_req.rslt_rmvl_dtm IS '결과비움일시';
COMMENT ON COLUMN mdl_sql_agt_req.err_cd IS '오류코드';
COMMENT ON COLUMN mdl_sql_agt_req.err_msg IS '오류메시지(200자 절단, 접속 정보 가림)';
COMMENT ON COLUMN mdl_sql_agt_req.del_yn IS '삭제여부';
COMMENT ON COLUMN mdl_sql_agt_req.del_dtm IS '삭제일시';
COMMENT ON INDEX x_mdl_sql_agt_req_01 IS '에이전트별 대기 요청(claim)';
COMMENT ON INDEX x_mdl_sql_agt_req_02 IS '분류체계별 요청 목록';
COMMENT ON INDEX x_mdl_sql_agt_req_03 IS '비우지 않은 결과 정리 대상';
COMMENT ON INDEX x_mdl_sql_agt_req_04 IS '기한 초과 정리 대상(WAIT 만료·RUN 점유 만료)';

COMMIT;

NOTIFY pgrst, 'reload schema';
