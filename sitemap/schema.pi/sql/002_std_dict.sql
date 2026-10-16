-- 002_std_dict.sql : schema.pi 표준사전 — 분류체계·멤버·데이터타입·도메인그룹·도메인·단어·단어 관계·용어·용어 구성·약어
-- 적용 : 001_sys_base.sql 다음, 재적용 가능(IF NOT EXISTS·CREATE OR REPLACE)
-- 근거 : PRD v0.2 §4(논리 엔터티·설계 결정 M1~M6), requirement/reqst.md §6(DA# STD_* 대응)
-- 표준 데이터 상태 std_sts_cd : REQ(신청중) / CNFM(확정) / DSCD(폐기) — PRD M6
-- 동시 수정 : ver_no 낙관적 잠금(수정 시 ver_no 일치 조건 + 1 증가) — PRD M3
-- 신규 표준단어 등재 후보(loginpi §9 목록 외 약어) : area·rel·grp·lgc·phy·log·eng·chn·clss·forbid·fmt·len·scale·abbr·obj·sep·dbms·map·ver·cnfm·dscd [확인중 : schema.pi 표준단어 등재]
BEGIN;

-- mod_dtm 자동 갱신 함수·트리거 생성기(명명 : fn_upd_<테이블>_mod_dtm / trg_<테이블>_mod_dtm, 정본 §6)
CREATE OR REPLACE FUNCTION fn_add_mod_dtm_trg(p_tbl TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I() RETURNS TRIGGER LANGUAGE plpgsql AS $f$ BEGIN NEW.mod_dtm := CURRENT_TIMESTAMP; RETURN NEW; END; $f$',
    'fn_upd_' || p_tbl || '_mod_dtm');
  EXECUTE format(
    'CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION %I()',
    'trg_' || p_tbl || '_mod_dtm', p_tbl, 'fn_upd_' || p_tbl || '_mod_dtm');
  PERFORM fn_grant_svc_only('FUNCTION', format('%I()', 'fn_upd_' || p_tbl || '_mod_dtm'));
END;
$$;

SELECT fn_grant_svc_only('FUNCTION', 'fn_add_mod_dtm_trg(text)');

-- ── 분류체계 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS std_area (
  area_id           UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 분류체계ID
  area_nm           VARCHAR(200) NOT NULL,                                 -- 분류체계명
  area_desc         TEXT,                                                  -- 분류체계설명
  up_area_id        UUID,                                                  -- 상위분류체계ID
  word_use_yn       CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 표준단어사용여부
  term_use_yn       CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 용어사용여부
  dom_use_yn        CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 도메인사용여부
  combi_use_yn      CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 어휘구성사용여부
  cd_use_yn         CHAR(1)      NOT NULL DEFAULT 'N',                     -- 코드사용여부
  cd_dom_map_yn     CHAR(1)      NOT NULL DEFAULT 'N',                     -- 코드도메인매핑여부
  term_sep_txt      VARCHAR(5)   NOT NULL DEFAULT '_',                     -- 용어물리명구분자(D10)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_area_pkey PRIMARY KEY (area_id),
  CONSTRAINT std_area_std_area_id_fkey FOREIGN KEY (up_area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_area_yn_check CHECK (
    word_use_yn IN ('Y','N') AND term_use_yn IN ('Y','N') AND dom_use_yn IN ('Y','N')
    AND combi_use_yn IN ('Y','N') AND cd_use_yn IN ('Y','N') AND cd_dom_map_yn IN ('Y','N')
    AND del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_area_area_nm_actv ON std_area (area_nm) WHERE del_yn = 'N';

-- 분류체계 멤버 : 분류체계별 역할(ADMIN 분류체계 관리자 / EDITOR 편집자 / VIEWER 조회자, PRD §3)
CREATE TABLE IF NOT EXISTS std_area_mbr (
  mbr_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 멤버ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  usr_id            UUID         NOT NULL,                                 -- 사용자ID
  mbr_role_cd       VARCHAR(20)  NOT NULL DEFAULT 'VIEWER',                -- 멤버역할코드
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_area_mbr_pkey PRIMARY KEY (mbr_id),
  CONSTRAINT std_area_mbr_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_area_mbr_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT std_area_mbr_mbr_role_cd_check CHECK (mbr_role_cd IN ('ADMIN','EDITOR','VIEWER')),
  CONSTRAINT std_area_mbr_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_area_mbr_area_usr_actv ON std_area_mbr (area_id, usr_id) WHERE del_yn = 'N';

-- ── 데이터타입(기준 데이터 : DA# DA_CODE 0001·0101·0134, STD_DATATYPE 적재) ─────
CREATE TABLE IF NOT EXISTS std_dbms (
  dbms_cd           VARCHAR(4)   NOT NULL,                                 -- DBMS코드(DA# 0001 하위)
  dbms_nm           VARCHAR(100) NOT NULL,                                 -- DBMS명
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_dbms_pkey PRIMARY KEY (dbms_cd),
  CONSTRAINT std_dbms_del_yn_check CHECK (del_yn IN ('Y','N'))
);

CREATE TABLE IF NOT EXISTS std_lgc_tp (
  lgc_tp_cd         VARCHAR(4)   NOT NULL,                                 -- 논리데이터타입코드(DA# 0101 하위)
  lgc_tp_nm         VARCHAR(100) NOT NULL,                                 -- 논리데이터타입명(CHAR·VARCHAR 등)
  lgc_tp_abbr_nm    VARCHAR(20)  NOT NULL,                                 -- 논리데이터타입약어명(DA# 0134 : CH·VC 등, 도메인명 자동생성에 사용)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_lgc_tp_pkey PRIMARY KEY (lgc_tp_cd),
  CONSTRAINT std_lgc_tp_del_yn_check CHECK (del_yn IN ('Y','N'))
);

-- DBMS별 물리 데이터타입(DA# STD_DATATYPE : CD_NO·DB_TYPE·DATA_TYPE·LEN_YN, CD_NO 의미 [확인중 : 적재 시 값 대조])
CREATE TABLE IF NOT EXISTS std_tp_map (
  tp_map_id         UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 타입매핑ID
  dbms_cd           VARCHAR(4)   NOT NULL,                                 -- DBMS코드
  lgc_tp_cd         VARCHAR(4),                                            -- 논리데이터타입코드
  phy_tp_nm         VARCHAR(100) NOT NULL,                                 -- 물리데이터타입명
  len_use_yn        CHAR(1)      NOT NULL DEFAULT 'N',                     -- 길이사용여부
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_tp_map_pkey PRIMARY KEY (tp_map_id),
  CONSTRAINT std_tp_map_std_dbms_id_fkey FOREIGN KEY (dbms_cd) REFERENCES std_dbms (dbms_cd),
  CONSTRAINT std_tp_map_std_lgc_tp_id_fkey FOREIGN KEY (lgc_tp_cd) REFERENCES std_lgc_tp (lgc_tp_cd),
  CONSTRAINT std_tp_map_yn_check CHECK (len_use_yn IN ('Y','N') AND del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_tp_map_dbms_phy_actv ON std_tp_map (dbms_cd, phy_tp_nm) WHERE del_yn = 'N';

-- ── 도메인 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS std_dom_grp (
  dom_grp_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 도메인그룹ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  dom_grp_nm        VARCHAR(200) NOT NULL,                                 -- 도메인그룹명
  dom_grp_desc      TEXT,                                                  -- 도메인그룹설명
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호(낙관적 잠금)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_dom_grp_pkey PRIMARY KEY (dom_grp_id),
  CONSTRAINT std_dom_grp_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_dom_grp_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_dom_grp_area_nm_actv ON std_dom_grp (area_id, dom_grp_nm) WHERE del_yn = 'N';

CREATE TABLE IF NOT EXISTS std_dom (
  dom_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 도메인ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  key_dom_nm        VARCHAR(200) NOT NULL,                                 -- 대표도메인명
  dom_nm            VARCHAR(200) NOT NULL,                                 -- 도메인명(대표도메인+타입약어+길이+소수점 자동생성)
  dom_tp_cd         VARCHAR(10)  NOT NULL,                                 -- 도메인유형코드 : CD(코드) / NO(번호) / GNRL(일반)
  dom_grp_id        UUID,                                                  -- 도메인그룹ID
  lgc_tp_cd         VARCHAR(4)   NOT NULL,                                 -- 논리데이터타입코드
  data_len          INT,                                                   -- 데이터길이
  data_scale        INT,                                                   -- 소수점자리수
  min_val_txt       VARCHAR(40),                                           -- 최소값
  max_val_txt       VARCHAR(40),                                           -- 최대값
  fmt_txt           TEXT,                                                  -- 데이터포맷
  dom_desc          TEXT,                                                  -- 도메인설명
  std_sts_cd        VARCHAR(10)  NOT NULL DEFAULT 'CNFM',                  -- 표준상태코드
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호(낙관적 잠금)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_dom_pkey PRIMARY KEY (dom_id),
  CONSTRAINT std_dom_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_dom_std_dom_grp_id_fkey FOREIGN KEY (dom_grp_id) REFERENCES std_dom_grp (dom_grp_id),
  CONSTRAINT std_dom_std_lgc_tp_id_fkey FOREIGN KEY (lgc_tp_cd) REFERENCES std_lgc_tp (lgc_tp_cd),
  CONSTRAINT std_dom_dom_tp_cd_check CHECK (dom_tp_cd IN ('CD','NO','GNRL')),
  CONSTRAINT std_dom_std_sts_cd_check CHECK (std_sts_cd IN ('REQ','CNFM','DSCD')),
  CONSTRAINT std_dom_data_check CHECK ((data_len IS NULL OR data_len > 0) AND (data_scale IS NULL OR data_scale >= 0)),
  CONSTRAINT std_dom_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_dom_area_nm_actv ON std_dom (area_id, dom_nm) WHERE del_yn = 'N';

-- ── 표준단어 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS std_dic (
  dic_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 단어ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  dic_log_nm        VARCHAR(200) NOT NULL,                                 -- 논리명(한글)
  dic_phy_nm        VARCHAR(200) NOT NULL,                                 -- 물리명(영문 약어)
  dic_eng_nm        VARCHAR(500),                                          -- 영문풀네임
  dic_chn_nm        VARCHAR(200),                                          -- 한자명
  ent_clss_yn       CHAR(1)      NOT NULL DEFAULT 'N',                     -- 엔터티분류어여부
  attr_clss_yn      CHAR(1)      NOT NULL DEFAULT 'N',                     -- 속성분류어여부
  forbid_yn         CHAR(1)      NOT NULL DEFAULT 'N',                     -- 금칙어여부
  dic_desc          TEXT,                                                  -- 단어설명
  std_sts_cd        VARCHAR(10)  NOT NULL DEFAULT 'CNFM',                  -- 표준상태코드
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호(낙관적 잠금)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_dic_pkey PRIMARY KEY (dic_id),
  CONSTRAINT std_dic_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_dic_std_sts_cd_check CHECK (std_sts_cd IN ('REQ','CNFM','DSCD')),
  CONSTRAINT std_dic_yn_check CHECK (ent_clss_yn IN ('Y','N') AND attr_clss_yn IN ('Y','N') AND forbid_yn IN ('Y','N') AND del_yn IN ('Y','N'))
);
-- 분류체계 안에서 단어 논리명 유일(PRD M4)
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_dic_area_log_nm_actv ON std_dic (area_id, dic_log_nm) WHERE del_yn = 'N';
-- 물리명은 중복 경고 대상(Wordict 문자열 420) — 검색용 일반 인덱스
CREATE INDEX IF NOT EXISTS idx_std_dic_area_phy_nm ON std_dic (area_id, dic_phy_nm);

-- 단어 관계 : 동의어·반의어·유의어(rel_txt 는 관계 대상 표기, 사전 등록 단어는 동의어 불가 규칙은 API 검사)
CREATE TABLE IF NOT EXISTS std_dic_rel (
  rel_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 관계ID
  dic_id            UUID         NOT NULL,                                 -- 단어ID
  rel_tp_cd         VARCHAR(10)  NOT NULL,                                 -- 관계유형코드 : SYN(동의어) / ANT(반의어) / SIM(유의어)
  rel_txt           VARCHAR(200) NOT NULL,                                 -- 관계대상표기
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_dic_rel_pkey PRIMARY KEY (rel_id),
  CONSTRAINT std_dic_rel_std_dic_id_fkey FOREIGN KEY (dic_id) REFERENCES std_dic (dic_id),
  CONSTRAINT std_dic_rel_rel_tp_cd_check CHECK (rel_tp_cd IN ('SYN','ANT','SIM')),
  CONSTRAINT std_dic_rel_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_dic_rel_dic_tp_txt_actv ON std_dic_rel (dic_id, rel_tp_cd, rel_txt) WHERE del_yn = 'N';

-- ── 표준용어 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS std_term (
  term_id           UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 용어ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  term_log_nm       VARCHAR(400) NOT NULL,                                 -- 논리용어명(단어 결합 생성, 직접 편집 불가 : PRD M5)
  term_phy_nm       VARCHAR(400) NOT NULL,                                 -- 물리용어명(단어 물리명 + 구분자 결합)
  dom_id            UUID         NOT NULL,                                 -- 도메인ID(용어 도메인 필수)
  term_desc         TEXT,                                                  -- 용어설명
  std_sts_cd        VARCHAR(10)  NOT NULL DEFAULT 'CNFM',                  -- 표준상태코드
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호(낙관적 잠금)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_term_pkey PRIMARY KEY (term_id),
  CONSTRAINT std_term_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_term_std_dom_id_fkey FOREIGN KEY (dom_id) REFERENCES std_dom (dom_id),
  CONSTRAINT std_term_std_sts_cd_check CHECK (std_sts_cd IN ('REQ','CNFM','DSCD')),
  CONSTRAINT std_term_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_term_area_log_nm_actv ON std_term (area_id, term_log_nm) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_term_area_phy_nm_actv ON std_term (area_id, term_phy_nm) WHERE del_yn = 'N';

-- 용어 구성 : 용어를 이루는 단어 순서(DA# STD_WORD_COMBI)
CREATE TABLE IF NOT EXISTS std_term_dic (
  term_id           UUID         NOT NULL,                                 -- 용어ID
  dic_seq           INT          NOT NULL,                                 -- 단어순번(1부터)
  dic_id            UUID         NOT NULL,                                 -- 단어ID
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_term_dic_pkey PRIMARY KEY (term_id, dic_seq),
  CONSTRAINT std_term_dic_std_term_id_fkey FOREIGN KEY (term_id) REFERENCES std_term (term_id),
  CONSTRAINT std_term_dic_std_dic_id_fkey FOREIGN KEY (dic_id) REFERENCES std_dic (dic_id),
  CONSTRAINT std_term_dic_dic_seq_check CHECK (dic_seq >= 1)
);
COMMENT ON TABLE std_term_dic IS '용어 구성 — 용어 행의 종속 구성 정보. 용어 재구성 시 해당 용어 행 전체를 교체(삭제 여부 컬럼 없음, 이력은 std_audit_log)';
CREATE INDEX IF NOT EXISTS idx_std_term_dic_dic_id ON std_term_dic (dic_id);

-- ── 약어 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS std_abbr (
  abbr_id           UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 약어ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  abbr_log_nm       VARCHAR(200) NOT NULL,                                 -- 약어논리명
  abbr_phy_nm       VARCHAR(100) NOT NULL,                                 -- 물리약어명
  obj_tp_cd         VARCHAR(20),                                           -- 객체유형코드(Wordict 약어 관리 항목) [확인중 : 코드 값 목록]
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호(낙관적 잠금)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_abbr_pkey PRIMARY KEY (abbr_id),
  CONSTRAINT std_abbr_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_abbr_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_abbr_area_log_nm_actv ON std_abbr (area_id, abbr_log_nm) WHERE del_yn = 'N';

-- 트리거·권한
SELECT fn_add_mod_dtm_trg(t), fn_grant_svc_only('TABLE', t)
FROM unnest(ARRAY['std_area','std_area_mbr','std_dbms','std_lgc_tp','std_tp_map','std_dom_grp','std_dom',
                  'std_dic','std_dic_rel','std_term','std_term_dic','std_abbr']) AS t;

COMMIT;
