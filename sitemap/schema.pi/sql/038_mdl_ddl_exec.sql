-- 038_mdl_ddl_exec.sql : DDL 직접 실행(마스터 지시 2026-10-18 "선택한 테이블을 직접 연결(JDBC·JNDI 등)로 DB 연결 후 직접 생성")
-- DA-APPROVED: 마스터 지시 2026-10-18 — 신규 3테이블, 약어 CONN(접속)·EXEC(실행)·MTHD(방법)·PWD(비밀번호)·ENC(암호화)·FP(지문)·STMT(문장)·RSLT(결과)·TRY(시도)·AGT(에이전트) 표준단어 등재 [확인중 : da-standards]
-- 보안 결정(마스터 확정) : 접속 비밀번호는 서버 키(env DB_PROFILE_KEY, AES-256-GCM) 암호문만 저장, 실행은 DA 승인 후(요청자 ≠ 승인자, DB CHECK)
--  실행 문장 = 요청 때 서버가 만든 ddl_txt 스냅샷만(INSERT 뒤 수정 금지 트리거), 승인은 해시(expect_hash) 대조, 접속 지문(conn_fp) 이 바뀌면 실행 거부(앱)
--  서버 직접 실행(SRV) = PostgreSQL·Oracle, Tibero·사내망 = 로컬 에이전트(AGT, sql/039) 전용
BEGIN;

-- 접속 프로파일
CREATE TABLE IF NOT EXISTS mdl_db_conn (
  conn_id           UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 접속ID(앱이 미리 만들어 암호화 AAD 에 사용)
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  conn_nm           VARCHAR(100) NOT NULL,                                 -- 접속명
  dbms_cd           VARCHAR(4)   NOT NULL,                                 -- DBMS코드
  exec_mthd_cd      VARCHAR(3)   NOT NULL,                                 -- 실행방법코드 : SRV 서버 직접 / AGT 로컬 에이전트
  host_nm           VARCHAR(255),                                          -- 호스트명(SRV)
  port_no           INT,                                                   -- 포트번호(SRV)
  db_nm             VARCHAR(128),                                          -- DB명(PostgreSQL DB·Oracle 서비스명, SRV)
  usr_nm            VARCHAR(128),                                          -- 사용자명(SRV)
  pwd_enc_txt       TEXT,                                                  -- 비밀번호암호문(v1:iv.tag.ct, SRV)
  agt_id            UUID,                                                  -- 에이전트ID(AGT, sql/039 에서 FK)
  conn_desc         TEXT,                                                  -- 접속설명
  lst_test_dtm      TIMESTAMPTZ,                                           -- 최종시험일시
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_db_conn_pkey PRIMARY KEY (conn_id),
  CONSTRAINT mdl_db_conn_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_db_conn_std_dbms_cd_fkey FOREIGN KEY (dbms_cd) REFERENCES std_dbms (dbms_cd),
  CONSTRAINT mdl_db_conn_mthd_check CHECK (exec_mthd_cd IN ('SRV','AGT') AND (exec_mthd_cd = 'AGT' OR dbms_cd IN ('0014','0001'))),
  CONSTRAINT mdl_db_conn_srv_check CHECK (exec_mthd_cd <> 'SRV' OR (host_nm IS NOT NULL AND port_no BETWEEN 1 AND 65535 AND db_nm IS NOT NULL AND usr_nm IS NOT NULL)),
  CONSTRAINT mdl_db_conn_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_db_conn_area_nm_actv ON mdl_db_conn (area_id, conn_nm) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_db_conn'), fn_grant_svc_only('TABLE', 'mdl_db_conn');
COMMENT ON TABLE mdl_db_conn IS 'DB 접속 프로파일 — 서버 직접(PostgreSQL·Oracle) 또는 로컬 에이전트, 비밀번호는 암호문만';

-- 실행 요청(요청 → DA 승인 → 실행)
CREATE TABLE IF NOT EXISTS mdl_ddl_req (
  req_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 요청ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  prj_id            UUID         NOT NULL,                                 -- 프로젝트ID
  phy_mdl_id        UUID         NOT NULL,                                 -- 물리모델ID
  conn_id           UUID         NOT NULL,                                 -- 접속ID
  dbms_cd           VARCHAR(4)   NOT NULL,                                 -- DBMS코드(요청 시점)
  exec_mthd_cd      VARCHAR(3)   NOT NULL,                                 -- 실행방법코드(요청 시점)
  tbl_ids           JSONB        NOT NULL,                                 -- 테이블ID목록(물리 테이블)
  ddl_txt           TEXT         NOT NULL,                                 -- DDL내용(서버 생성 스냅샷, 수정 불가)
  ddl_hash          CHAR(64)     NOT NULL,                                 -- DDL해시(실행 문장 SHA-256)
  stmt_cnt          INT          NOT NULL,                                 -- 문장수
  conn_fp           CHAR(64)     NOT NULL,                                 -- 접속지문(접속 정보·버전 SHA-256)
  req_sts_cd        VARCHAR(4)   NOT NULL DEFAULT 'REQ',                   -- 요청상태코드 : REQ 대기 / APV 승인 / RJCT 반려 / CNCL 취소 / RUN 실행중 / DONE 완료 / FAIL 실패 / PART 일부 실행
  req_usr_id        TEXT         NOT NULL,                                 -- 요청자ID
  apv_usr_id        TEXT,                                                  -- 승인자ID
  apv_dtm           TIMESTAMPTZ,                                           -- 승인일시
  rjct_rsn          TEXT,                                                  -- 반려사유
  exec_try_no       INT          NOT NULL DEFAULT 0,                       -- 실행시도번호
  lease_exp_dtm     TIMESTAMPTZ,                                           -- 실행점유만료일시
  run_nonce         TEXT,                                                  -- 실행일회값(에이전트 보고 대조)
  exec_end_dtm      TIMESTAMPTZ,                                           -- 실행종료일시
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_ddl_req_pkey PRIMARY KEY (req_id),
  CONSTRAINT mdl_ddl_req_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_ddl_req_mdl_prj_id_fkey FOREIGN KEY (prj_id) REFERENCES mdl_prj (prj_id),
  CONSTRAINT mdl_ddl_req_mdl_phy_mdl_id_fkey FOREIGN KEY (phy_mdl_id) REFERENCES mdl_phy_mdl (phy_mdl_id),
  CONSTRAINT mdl_ddl_req_mdl_db_conn_id_fkey FOREIGN KEY (conn_id) REFERENCES mdl_db_conn (conn_id),
  CONSTRAINT mdl_ddl_req_sts_check CHECK (req_sts_cd IN ('REQ','APV','RJCT','CNCL','RUN','DONE','FAIL','PART')),
  CONSTRAINT mdl_ddl_req_self_apv_check CHECK (apv_usr_id IS NULL OR apv_usr_id <> req_usr_id), -- 자기 승인 금지(마스터 확정)
  CONSTRAINT mdl_ddl_req_hash_check CHECK (ddl_hash ~ '^[0-9a-f]{64}$' AND conn_fp ~ '^[0-9a-f]{64}$'),
  CONSTRAINT mdl_ddl_req_rjct_check CHECK (req_sts_cd <> 'RJCT' OR rjct_rsn IS NOT NULL),
  CONSTRAINT mdl_ddl_req_del_yn_check CHECK (del_yn IN ('Y','N'))
);
-- 접속 1개당 승인·실행중 요청 1건(동시 실행 차단)
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_ddl_req_conn_live ON mdl_ddl_req (conn_id) WHERE req_sts_cd IN ('APV','RUN') AND del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_mdl_ddl_req_area_reg ON mdl_ddl_req (area_id, reg_dtm DESC);
SELECT fn_add_mod_dtm_trg('mdl_ddl_req'), fn_grant_svc_only('TABLE', 'mdl_ddl_req');
COMMENT ON TABLE mdl_ddl_req IS 'DDL 실행 요청 — 서버 생성 DDL 스냅샷, DA 승인(자기 승인 금지) 후 실행';

-- 문장별 실행 결과(시도마다)
CREATE TABLE IF NOT EXISTS mdl_ddl_exec_stmt (
  exec_stmt_id      UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 실행문장ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  req_id            UUID         NOT NULL,                                 -- 요청ID
  exec_try_no       INT          NOT NULL,                                 -- 실행시도번호
  stmt_seq          INT          NOT NULL,                                 -- 문장순번(1부터)
  stmt_txt          TEXT         NOT NULL,                                 -- 문장내용
  rslt_cd           VARCHAR(4)   NOT NULL,                                 -- 결과코드 : OK 성공 / ERR 오류 / SKIP 건너뜀 / RBK 되돌림
  err_cd            VARCHAR(20),                                           -- 오류코드(DB 오류 코드)
  err_msg           VARCHAR(200),                                          -- 오류메시지(접속 정보 가림, 200자)
  elapsed_ms        INT,                                                   -- 소요밀리초
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_ddl_exec_stmt_pkey PRIMARY KEY (exec_stmt_id),
  CONSTRAINT mdl_ddl_exec_stmt_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_ddl_exec_stmt_mdl_ddl_req_id_fkey FOREIGN KEY (req_id) REFERENCES mdl_ddl_req (req_id),
  CONSTRAINT mdl_ddl_exec_stmt_rslt_check CHECK (rslt_cd IN ('OK','ERR','SKIP','RBK')),
  CONSTRAINT mdl_ddl_exec_stmt_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_ddl_exec_stmt_req_try_seq ON mdl_ddl_exec_stmt (req_id, exec_try_no, stmt_seq) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_ddl_exec_stmt'), fn_grant_svc_only('TABLE', 'mdl_ddl_exec_stmt');
COMMENT ON TABLE mdl_ddl_exec_stmt IS 'DDL 문장별 실행 결과 — 요청 × 시도 × 문장';

-- 요청 스냅샷 보호 : 실행 내용·대상·요청자는 INSERT 뒤 바꿀 수 없음
CREATE OR REPLACE FUNCTION fn_chk_mdl_ddl_req_fix()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.ddl_txt, NEW.ddl_hash, NEW.stmt_cnt, NEW.tbl_ids, NEW.conn_id, NEW.conn_fp, NEW.dbms_cd, NEW.exec_mthd_cd, NEW.req_usr_id, NEW.area_id, NEW.prj_id, NEW.phy_mdl_id)
     IS DISTINCT FROM (OLD.ddl_txt, OLD.ddl_hash, OLD.stmt_cnt, OLD.tbl_ids, OLD.conn_id, OLD.conn_fp, OLD.dbms_cd, OLD.exec_mthd_cd, OLD.req_usr_id, OLD.area_id, OLD.prj_id, OLD.phy_mdl_id) THEN
    RAISE EXCEPTION 'mdl_ddl_req_fixed: 실행 요청의 DDL·대상·요청자는 바꿀 수 없습니다(새로 요청)' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_ddl_req_fix ON mdl_ddl_req;
CREATE TRIGGER trg_mdl_ddl_req_fix BEFORE UPDATE ON mdl_ddl_req FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_ddl_req_fix();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_ddl_req_fix()');

-- 접속 보호 : 대기·승인·실행중 요청이 걸린 접속은 접속 정보 변경·삭제 거부(시험 일시만 허용)
CREATE OR REPLACE FUNCTION fn_chk_mdl_db_conn_busy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['lst_test_dtm','mod_dtm','modr_id']) <> (to_jsonb(OLD) - ARRAY['lst_test_dtm','mod_dtm','modr_id'])
     AND EXISTS (SELECT 1 FROM mdl_ddl_req r WHERE r.conn_id = OLD.conn_id AND r.del_yn = 'N' AND r.req_sts_cd IN ('REQ','APV','RUN')) THEN
    RAISE EXCEPTION 'mdl_db_conn_busy: 처리 중인 실행 요청이 있는 접속은 바꿀 수 없습니다' USING ERRCODE = 'MDB01';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_db_conn_busy ON mdl_db_conn;
CREATE TRIGGER trg_mdl_db_conn_busy BEFORE UPDATE ON mdl_db_conn FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_db_conn_busy();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_db_conn_busy()');

COMMIT;

NOTIFY pgrst, 'reload schema';
