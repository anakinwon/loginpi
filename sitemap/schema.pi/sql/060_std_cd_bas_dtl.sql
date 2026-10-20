-- 060_std_cd_bas_dtl.sql : 공통코드 코드기본·코드상세 — 주식별자 = 코드 영문 표준용어(마스터 지시 2026-10-20, 모델링 노트 4장 p147 코드 모델 #2)
-- DA-APPROVED: 마스터 지시 2026-10-20 '코드기본의 주식별자는 코드 영문표준용어' — 신규 테이블 2종(코드기본·코드상세), 구 std_cd·std_cd_val(sql/057·059, 대리키 UUID) 사용 중단
-- 설계 :
--  · std_cd_bas 코드기본 PK = (분류체계ID, 코드ID). 코드ID = 코드명 표준용어의 영문 물리명(예 SEX_DIV_CD) — 코드 모델 #2 의 '코드유형코드 = 코드 속성 물리명'
--    표준용어 연결(term_id)은 유지(코드명·도메인 출처), 활성 행 기준 분류체계 안 용어당 1개
--  · std_cd_dtl 코드상세 PK = (분류체계ID, 코드ID, 코드값), 코드기본 : 코드상세 = 1 : N(FK). 코드값명 = 코드 안 활성 행 유일(상호 배타)
--  · 주식별자가 자연키라 논리 삭제 뒤 같은 코드·코드값을 다시 등록하면 새 행이 아니라 그 행을 되살린다(앱 src/lib/std-code.ts)
--  · 구 std_cd·std_cd_val : 활성 행 0건(시험 행만 논리 삭제 상태) — 물리 삭제 금지 원칙에 따라 그대로 두고 사용 중단(앱 참조 없음)
BEGIN;

CREATE TABLE IF NOT EXISTS std_cd_bas (
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  cd_id             VARCHAR(400) NOT NULL,                                 -- 코드ID(코드 영문 표준용어 = 용어 물리명)
  term_id           UUID         NOT NULL,                                 -- 용어ID(코드명·도메인 출처)
  cd_cls_nm         VARCHAR(200),                                          -- 코드분류명
  cd_desc           TEXT,                                                  -- 코드설명
  use_yn            CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 사용여부
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호(낙관적 잠금)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_cd_bas_pkey PRIMARY KEY (area_id, cd_id),
  CONSTRAINT std_cd_bas_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_cd_bas_std_term_id_fkey FOREIGN KEY (term_id) REFERENCES std_term (term_id),
  CONSTRAINT std_cd_bas_use_yn_check CHECK (use_yn IN ('Y','N')),
  CONSTRAINT std_cd_bas_del_yn_check CHECK (del_yn IN ('Y','N'))
);
COMMENT ON TABLE std_cd_bas IS '공통코드 코드기본 — PK = 분류체계 + 코드ID(코드 영문 표준용어), 이름 ~구분코드·~종류코드·~유형코드만';
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_cd_bas_area_term_actv ON std_cd_bas (area_id, term_id) WHERE del_yn = 'N';

CREATE TABLE IF NOT EXISTS std_cd_dtl (
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  cd_id             VARCHAR(400) NOT NULL,                                 -- 코드ID
  cd_val            VARCHAR(100) NOT NULL,                                 -- 코드값
  cd_val_nm         VARCHAR(400) NOT NULL,                                 -- 코드값명
  cd_val_desc       TEXT,                                                  -- 코드값설명
  sort_seq          INT          NOT NULL DEFAULT 0,                       -- 정렬순서
  use_yn            CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 사용여부
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호(낙관적 잠금)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_cd_dtl_pkey PRIMARY KEY (area_id, cd_id, cd_val),
  CONSTRAINT std_cd_dtl_std_cd_bas_fkey FOREIGN KEY (area_id, cd_id) REFERENCES std_cd_bas (area_id, cd_id),
  CONSTRAINT std_cd_dtl_use_yn_check CHECK (use_yn IN ('Y','N')),
  CONSTRAINT std_cd_dtl_del_yn_check CHECK (del_yn IN ('Y','N'))
);
COMMENT ON TABLE std_cd_dtl IS '공통코드 코드상세 — PK = 분류체계 + 코드ID + 코드값, 코드기본 : 코드상세 = 1 : N';
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_cd_dtl_nm_actv ON std_cd_dtl (area_id, cd_id, cd_val_nm) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_std_cd_dtl_sort ON std_cd_dtl (area_id, cd_id, sort_seq) WHERE del_yn = 'N';

SELECT fn_add_mod_dtm_trg(t), fn_grant_svc_only('TABLE', t) FROM unnest(ARRAY['std_cd_bas', 'std_cd_dtl']) AS t;

COMMENT ON TABLE std_cd IS '사용 중단(2026-10-20) — 공통코드는 std_cd_bas(코드기본, 주식별자 = 코드 영문 표준용어)로 이전';
COMMENT ON TABLE std_cd_val IS '사용 중단(2026-10-20) — 공통코드 코드상세는 std_cd_dtl 로 이전';

COMMIT;
