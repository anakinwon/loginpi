-- 039_mdl_db_agt.sql : DDL 로컬 에이전트(마스터 지시 2026-10-18 "JDBC·JNDI 등 직접 연결") — 사내망·Tibero DB 는 고객 PC 의 에이전트(Java jar)가 서버에서 승인된 작업을 가져가 실행
-- DA-APPROVED: 마스터 지시 2026-10-18 — 신규 1테이블 + mdl_db_conn.agt_id FK, 약어 AGT(에이전트)·TKN(토큰)·PFX(접두)·SEEN(확인) 표준단어 등재 [확인중 : da-standards]
-- 토큰 = spa_<base64url 32바이트>(유출 스캔 탐지용 접두), 발급 때 한 번만 보여 주고 SHA-256 만 저장. 만료 필수, 폐기 = 논리 삭제
-- 에이전트는 바깥으로만 접속(HTTPS 폴링) — 인바운드 포트 없음
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_db_agt (
  agt_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 에이전트ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  agt_nm            VARCHAR(100) NOT NULL,                                 -- 에이전트명
  tkn_hash          CHAR(64)     NOT NULL,                                 -- 토큰해시(SHA-256)
  tkn_pfx           VARCHAR(12)  NOT NULL,                                 -- 토큰접두(화면 식별용 앞 8자)
  exp_dtm           TIMESTAMPTZ  NOT NULL,                                 -- 만료일시
  lst_seen_dtm      TIMESTAMPTZ,                                           -- 최종확인일시(마지막 작업 조회)
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부(폐기)
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_db_agt_pkey PRIMARY KEY (agt_id),
  CONSTRAINT mdl_db_agt_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_db_agt_tkn_hash_check CHECK (tkn_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT mdl_db_agt_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_db_agt_tkn_hash ON mdl_db_agt (tkn_hash);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_db_agt_area_nm_actv ON mdl_db_agt (area_id, agt_nm) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_db_agt'), fn_grant_svc_only('TABLE', 'mdl_db_agt');
COMMENT ON TABLE mdl_db_agt IS 'DDL 로컬 에이전트 — 토큰 해시만 저장, 만료 필수, 폐기 = 논리 삭제';

-- 에이전트 접속 정보(마스터 질의 "접속 URL 입력 없이 어떻게 접속하지?") : JDBC URL 또는 JNDI 이름·사용자는 서버에 저장(비밀번호는 저장 안 함 — 에이전트 PC 환경변수)
-- 칼럼 이동 동안 사용자 트리거(처리 중 요청 접속 변경 거부·mod_dtm) 정지 — 035·036 교훈
ALTER TABLE mdl_db_conn DISABLE TRIGGER USER;
SELECT fn_add_cols_keep_sys('mdl_db_conn', $c$
  ADD COLUMN conn_url_txt VARCHAR(1000),
  ADD COLUMN jndi_nm VARCHAR(255)$c$);
ALTER TABLE mdl_db_conn ENABLE TRIGGER USER;
COMMENT ON COLUMN mdl_db_conn.conn_url_txt IS '접속URL내용 — 에이전트 JDBC URL(비밀번호 포함 금지)';
COMMENT ON COLUMN mdl_db_conn.jndi_nm IS 'JNDI명 — 에이전트가 WAS 에서 조회할 DataSource 이름';

-- 에이전트 접속 = 에이전트 + (JDBC URL 또는 JNDI 이름) 필수, 서버 직접은 비움. 이전 행은 검사 안 함(NOT VALID)
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_mdl_db_agt_id_fkey FOREIGN KEY (agt_id) REFERENCES mdl_db_agt (agt_id);
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_agt_check CHECK (CASE WHEN exec_mthd_cd = 'AGT' THEN agt_id IS NOT NULL AND (conn_url_txt IS NOT NULL OR jndi_nm IS NOT NULL) ELSE agt_id IS NULL AND conn_url_txt IS NULL AND jndi_nm IS NULL END) NOT VALID;
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_url_check CHECK (conn_url_txt IS NULL OR (conn_url_txt ~ '^jdbc:[a-z0-9]+:' AND conn_url_txt !~* '(password|pwd)=')) NOT VALID;
CREATE INDEX IF NOT EXISTS idx_mdl_db_conn_agt ON mdl_db_conn (agt_id) WHERE del_yn = 'N';

COMMIT;

NOTIFY pgrst, 'reload schema';
