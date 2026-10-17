-- 030_mdl_rvs.sql : 리버스 스테이징(PRD_PiErd S4 R1~R4) — DDL·카탈로그 CSV 해석 결과와 표준 용어 역매핑, 모델 반영 출처
-- DA-APPROVED: 마스터 결정 2026-10-17(PRD_PiErd §5 S4·§6, 권장안 자동 선택 2026-10-17 마스터 위임) — 신규 3테이블(mdl_ 접두, 시스템 컬럼 4개 맨 끝, del_yn 논리삭제, service_role 전용)
-- PRD §6 조정 : mdl_ent·mdl_attr.rvs_nm·mdl_rel.rel_src_cd 칼럼 추가 대신 출처를 스테이징에 둔다(반영된 ent_id·attr_id·rel_id 를 스테이징 행이 가리킴) — 정본 테이블 무변경
-- 약어 RVS(리버스) = 사용자 정의 약어 [확인중 : DA 메타 단어 목록 등재], 그 밖 표준단어 : 작업 JOB·상태 STS·건수 CNT·백분율 PCT·매핑 MAP·참조 REF·원천 SRC, 사용자 정의 약어 RVS·CAND(후보) [확인중 : DA 메타 단어 목록 등재]
-- 매핑코드 : EXACT(물리명 = 승인 용어 물리명) / CMNT(코멘트 = 승인 용어 논리명) / SPLIT(단어 분해만 됨 — 용어 신청 후보) / NONE(미매핑)
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_rvs_job (
  rvs_job_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 리버스작업ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  prj_id            UUID         NOT NULL,                                 -- 프로젝트ID
  src_cd            VARCHAR(4)   NOT NULL,                                 -- 원천코드 : DDL / CSV(카탈로그 조회 결과)
  dbms_cd           VARCHAR(4)   NOT NULL,                                 -- DBMS코드
  file_nm           VARCHAR(200),                                          -- 파일명
  job_sts_cd        VARCHAR(10)  NOT NULL DEFAULT 'STAGED',                -- 작업상태코드 : STAGED 스테이징 / APPLIED 반영
  tbl_cnt           INT          NOT NULL DEFAULT 0,                       -- 테이블건수
  col_cnt           INT          NOT NULL DEFAULT 0,                       -- 칼럼건수
  map_pct           NUMERIC(5,1) NOT NULL DEFAULT 0,                       -- 매핑백분율(%)
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_rvs_job_pkey PRIMARY KEY (rvs_job_id),
  CONSTRAINT mdl_rvs_job_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_rvs_job_mdl_prj_id_fkey FOREIGN KEY (prj_id) REFERENCES mdl_prj (prj_id),
  CONSTRAINT mdl_rvs_job_std_dbms_cd_fkey FOREIGN KEY (dbms_cd) REFERENCES std_dbms (dbms_cd),
  CONSTRAINT mdl_rvs_job_src_cd_check CHECK (src_cd IN ('DDL','CSV')),
  CONSTRAINT mdl_rvs_job_job_sts_cd_check CHECK (job_sts_cd IN ('STAGED','APPLIED')),
  CONSTRAINT mdl_rvs_job_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE INDEX IF NOT EXISTS ix_mdl_rvs_job_prj ON mdl_rvs_job (prj_id) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_rvs_job'), fn_grant_svc_only('TABLE', 'mdl_rvs_job');
COMMENT ON TABLE mdl_rvs_job IS '리버스 작업 — DDL·카탈로그 CSV 1건 해석 단위(스테이징 → 반영)';

CREATE TABLE IF NOT EXISTS mdl_rvs_tbl (
  rvs_tbl_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 리버스테이블ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  rvs_job_id        UUID         NOT NULL,                                 -- 리버스작업ID
  tbl_nm            VARCHAR(128) NOT NULL,                                 -- 테이블명(원 이름)
  tbl_desc          TEXT,                                                  -- 테이블설명(코멘트)
  dic_ids           UUID[],                                                -- 구성단어ID(표준단어로 분해된 경우, 엔터티명 후보)
  ent_id            UUID,                                                  -- 엔터티ID(반영 결과 — 출처)
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_rvs_tbl_pkey PRIMARY KEY (rvs_tbl_id),
  CONSTRAINT mdl_rvs_tbl_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_rvs_tbl_mdl_rvs_job_id_fkey FOREIGN KEY (rvs_job_id) REFERENCES mdl_rvs_job (rvs_job_id),
  CONSTRAINT mdl_rvs_tbl_mdl_ent_id_fkey FOREIGN KEY (ent_id) REFERENCES mdl_ent (ent_id),
  CONSTRAINT mdl_rvs_tbl_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_rvs_tbl_job_nm_actv ON mdl_rvs_tbl (rvs_job_id, tbl_nm) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_rvs_tbl'), fn_grant_svc_only('TABLE', 'mdl_rvs_tbl');
COMMENT ON TABLE mdl_rvs_tbl IS '리버스 테이블 — 원 이름·코멘트·엔터티명 후보 단어, 반영된 엔터티(출처)';

CREATE TABLE IF NOT EXISTS mdl_rvs_col (
  rvs_col_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 리버스칼럼ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  rvs_tbl_id        UUID         NOT NULL,                                 -- 리버스테이블ID
  col_nm            VARCHAR(128) NOT NULL,                                 -- 칼럼명(원 이름)
  col_seq           INT          NOT NULL DEFAULT 1,                       -- 칼럼순서
  data_tp_nm        VARCHAR(100) NOT NULL,                                 -- 데이터타입명
  data_len          INT,                                                   -- 데이터길이
  data_scale        INT,                                                   -- 소수점자리수
  null_yn           CHAR(1)      NOT NULL DEFAULT 'Y',                     -- NULL허용여부
  bsc_val_txt       VARCHAR(200),                                          -- 기본값텍스트
  pk_seq            INT,                                                   -- 주키순서(NULL = 주키 아님)
  col_desc          TEXT,                                                  -- 칼럼설명(코멘트)
  ref_tbl_nm        VARCHAR(128),                                          -- 참조테이블명(선언 FK)
  ref_col_nm        VARCHAR(128),                                          -- 참조칼럼명(선언 FK)
  fk_nm             VARCHAR(128),                                          -- FK명(선언 FK)
  map_cd            VARCHAR(5)   NOT NULL DEFAULT 'NONE',                  -- 매핑코드 : EXACT / CMNT / SPLIT / NONE
  term_id           UUID,                                                  -- 용어ID(매핑된 승인 용어)
  cand_nm           VARCHAR(400),                                          -- 후보명(단어 분해 논리명 — 용어 신청 후보)
  attr_id           UUID,                                                  -- 속성ID(반영 결과 — 출처)
  rel_id            UUID,                                                  -- 관계ID(반영 결과 — 선언 FK 출처)
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_rvs_col_pkey PRIMARY KEY (rvs_col_id),
  CONSTRAINT mdl_rvs_col_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_rvs_col_mdl_rvs_tbl_id_fkey FOREIGN KEY (rvs_tbl_id) REFERENCES mdl_rvs_tbl (rvs_tbl_id),
  CONSTRAINT mdl_rvs_col_std_term_id_fkey FOREIGN KEY (term_id) REFERENCES std_term (term_id),
  CONSTRAINT mdl_rvs_col_mdl_attr_id_fkey FOREIGN KEY (attr_id) REFERENCES mdl_attr (attr_id),
  CONSTRAINT mdl_rvs_col_mdl_rel_id_fkey FOREIGN KEY (rel_id) REFERENCES mdl_rel (rel_id),
  CONSTRAINT mdl_rvs_col_map_cd_check CHECK (map_cd IN ('EXACT','CMNT','SPLIT','NONE')),
  CONSTRAINT mdl_rvs_col_map_term_check CHECK ((map_cd IN ('EXACT','CMNT')) = (term_id IS NOT NULL)), -- 매핑 = 용어 있음
  CONSTRAINT mdl_rvs_col_yn_check CHECK (null_yn IN ('Y','N') AND del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_rvs_col_tbl_nm_actv ON mdl_rvs_col (rvs_tbl_id, col_nm) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_rvs_col'), fn_grant_svc_only('TABLE', 'mdl_rvs_col');
COMMENT ON TABLE mdl_rvs_col IS '리버스 칼럼 — 원 이름·타입·NULL·기본값·주키·선언 FK, 표준 용어 역매핑, 반영된 속성·관계(출처)';

COMMIT;

NOTIFY pgrst, 'reload schema';
