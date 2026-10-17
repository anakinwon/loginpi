-- 028_mdl_phy.sql : 물리 모델(PRD_PiErd S2 P1~P3, 마스터 결정 2 = 별도 저장) — 프로젝트 × DBMS 물리 모델, 테이블·칼럼·FK
-- DA-APPROVED: 마스터 결정 2026-10-17(PRD_PiErd §4 결정 2·§6) + da-governance-expert 조건부 승인 필수 3건 반영(표준단어 IDNTFR·LTR·COL·USE·BSC, 대문자 CHECK, 도메인 스냅샷 CHECK) — 신규 4테이블(mdl_ 접두, 시스템 컬럼 4개 맨 끝, del_yn 논리삭제, ver_no 잠금, service_role 전용)
-- 원칙 : 원천(엔터티·속성·관계 ID) + 사용자 결정값(이름·순서·NULL·기본값)만 저장, 논리가 바뀌면 차이(diff)로 보여 준다
-- 도메인 스냅샷 : 칼럼마다 전환 시점 도메인ID·버전·타입·길이 → 도메인이 바뀌면 dom_ver_no 비교로 영향 칼럼 판정(L5 이월)
-- 시스템 칼럼(필수 4·선택 2)은 칼럼 행으로 생성(sys_col_yn = Y, 원천 속성 없음) — 템플릿 테이블(mdl_sys_col)은 두지 않고 코드 상수(PRD §6 조정)
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_phy_mdl (
  phy_mdl_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 물리모델ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  prj_id            UUID         NOT NULL,                                 -- 프로젝트ID
  dbms_cd           VARCHAR(4)   NOT NULL,                                 -- DBMS코드(확정)
  idntfr_ltr_cd     VARCHAR(10)  NOT NULL DEFAULT 'UPPER',                 -- 식별자문자코드 : UPPER 대문자 / LOWER 소문자(DDL 생성 시 적용)
  del_col_use_yn    CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 삭제컬럼사용여부(Y = 삭제여부·삭제일시 시스템 칼럼 추가)
  phy_mdl_desc      TEXT,                                                  -- 물리모델설명
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_phy_mdl_pkey PRIMARY KEY (phy_mdl_id),
  CONSTRAINT mdl_phy_mdl_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_phy_mdl_mdl_prj_id_fkey FOREIGN KEY (prj_id) REFERENCES mdl_prj (prj_id),
  CONSTRAINT mdl_phy_mdl_std_dbms_cd_fkey FOREIGN KEY (dbms_cd) REFERENCES std_dbms (dbms_cd),
  CONSTRAINT mdl_phy_mdl_idntfr_ltr_cd_check CHECK (idntfr_ltr_cd IN ('UPPER','LOWER')),
  CONSTRAINT mdl_phy_mdl_yn_check CHECK (del_col_use_yn IN ('Y','N') AND del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_phy_mdl_prj_dbms_actv ON mdl_phy_mdl (prj_id, dbms_cd) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_phy_mdl'), fn_grant_svc_only('TABLE', 'mdl_phy_mdl');
COMMENT ON TABLE mdl_phy_mdl IS '물리 모델 — 프로젝트 × DBMS(활성 1건), 대소문자·삭제 칼럼 선택';

CREATE TABLE IF NOT EXISTS mdl_phy_tbl (
  phy_tbl_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 물리테이블ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  phy_mdl_id        UUID         NOT NULL,                                 -- 물리모델ID
  ent_id            UUID         NOT NULL,                                 -- 엔터티ID(원천)
  tbl_nm            VARCHAR(128) NOT NULL,                                 -- 테이블명(전환 시점 물리명, 대문자 저장)
  tbl_desc          TEXT,                                                  -- 테이블설명
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_phy_tbl_pkey PRIMARY KEY (phy_tbl_id),
  CONSTRAINT mdl_phy_tbl_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_phy_tbl_mdl_phy_mdl_id_fkey FOREIGN KEY (phy_mdl_id) REFERENCES mdl_phy_mdl (phy_mdl_id),
  CONSTRAINT mdl_phy_tbl_mdl_ent_id_fkey FOREIGN KEY (ent_id) REFERENCES mdl_ent (ent_id),
  CONSTRAINT mdl_phy_tbl_del_yn_check CHECK (del_yn IN ('Y','N')),
  CONSTRAINT mdl_phy_tbl_nm_upper_check CHECK (tbl_nm = UPPER(tbl_nm))                    -- 대문자 저장(대소문자는 DDL 시점)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_phy_tbl_mdl_ent_actv ON mdl_phy_tbl (phy_mdl_id, ent_id) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_phy_tbl_mdl_nm_actv ON mdl_phy_tbl (phy_mdl_id, tbl_nm) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_phy_tbl'), fn_grant_svc_only('TABLE', 'mdl_phy_tbl');
COMMENT ON TABLE mdl_phy_tbl IS '물리 테이블 — 원천 엔터티 + 전환 시점 테이블명';

CREATE TABLE IF NOT EXISTS mdl_phy_col (
  phy_col_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 물리칼럼ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  phy_tbl_id        UUID         NOT NULL,                                 -- 물리테이블ID
  attr_id           UUID,                                                  -- 속성ID(원천, 시스템 칼럼은 NULL)
  sys_col_yn        CHAR(1)      NOT NULL DEFAULT 'N',                     -- 시스템칼럼여부(맨 끝 고정)
  col_nm            VARCHAR(128) NOT NULL,                                 -- 칼럼명(대문자 저장)
  col_seq           INT          NOT NULL DEFAULT 1,                       -- 칼럼순서
  dom_id            UUID,                                                  -- 도메인ID(전환 시점 스냅샷)
  dom_ver_no        INT,                                                   -- 도메인버전번호(스냅샷, 현재 버전과 다르면 영향 칼럼)
  phy_tp_nm         VARCHAR(100) NOT NULL,                                 -- 물리데이터타입명(std_tp_map)
  data_len          INT,                                                   -- 데이터길이
  data_scale        INT,                                                   -- 소수점자리수
  null_yn           CHAR(1)      NOT NULL DEFAULT 'Y',                     -- NULL허용여부
  bsc_val_txt       VARCHAR(200),                                          -- 기본값텍스트(DDL DEFAULT 식, 금칙어 dflt → 공통표준단어 기본 BSC)
  pk_yn             CHAR(1)      NOT NULL DEFAULT 'N',                     -- 주키여부
  pk_seq            INT,                                                   -- 주키순서
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_phy_col_pkey PRIMARY KEY (phy_col_id),
  CONSTRAINT mdl_phy_col_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_phy_col_mdl_phy_tbl_id_fkey FOREIGN KEY (phy_tbl_id) REFERENCES mdl_phy_tbl (phy_tbl_id),
  CONSTRAINT mdl_phy_col_mdl_attr_id_fkey FOREIGN KEY (attr_id) REFERENCES mdl_attr (attr_id),
  CONSTRAINT mdl_phy_col_std_dom_id_fkey FOREIGN KEY (dom_id) REFERENCES std_dom (dom_id),
  CONSTRAINT mdl_phy_col_yn_check CHECK (sys_col_yn IN ('Y','N') AND null_yn IN ('Y','N') AND pk_yn IN ('Y','N') AND del_yn IN ('Y','N')),
  CONSTRAINT mdl_phy_col_src_check CHECK ((sys_col_yn = 'Y') = (attr_id IS NULL)),          -- 일반 칼럼 = 원천 속성 필수, 시스템 칼럼 = 원천 없음
  CONSTRAINT mdl_phy_col_pk_check CHECK (pk_yn = 'N' OR null_yn = 'N'),                     -- 주키는 NOT NULL
  CONSTRAINT mdl_phy_col_pk_seq_check CHECK ((pk_yn = 'Y') = (pk_seq IS NOT NULL)),
  CONSTRAINT mdl_phy_col_data_check CHECK ((data_len IS NULL OR data_len > 0) AND (data_scale IS NULL OR data_scale >= 0) AND (data_scale IS NULL OR data_len IS NULL OR data_scale <= data_len)),
  CONSTRAINT mdl_phy_col_nm_upper_check CHECK (col_nm = UPPER(col_nm)),
  CONSTRAINT mdl_phy_col_dom_check CHECK ((dom_id IS NULL) = (dom_ver_no IS NULL) AND (sys_col_yn = 'Y' OR dom_id IS NOT NULL)) -- 일반 칼럼 = 도메인 스냅샷 필수
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_phy_col_tbl_nm_actv ON mdl_phy_col (phy_tbl_id, col_nm) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_phy_col_tbl_attr_actv ON mdl_phy_col (phy_tbl_id, attr_id) WHERE del_yn = 'N' AND attr_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_phy_col_tbl_pk_seq_actv ON mdl_phy_col (phy_tbl_id, pk_seq) WHERE pk_yn = 'Y' AND del_yn = 'N';
CREATE INDEX IF NOT EXISTS ix_mdl_phy_col_dom ON mdl_phy_col (dom_id) WHERE del_yn = 'N'; -- 도메인 변경 영향
SELECT fn_add_mod_dtm_trg('mdl_phy_col'), fn_grant_svc_only('TABLE', 'mdl_phy_col');
COMMENT ON TABLE mdl_phy_col IS '물리 칼럼 — 원천 속성(시스템 칼럼은 없음) + 결정값(이름·순서·NULL·기본값) + 전환 시점 도메인 스냅샷';

CREATE TABLE IF NOT EXISTS mdl_phy_fk (
  phy_fk_id         UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 물리FKID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  phy_mdl_id        UUID         NOT NULL,                                 -- 물리모델ID
  rel_id            UUID         NOT NULL,                                 -- 관계ID(원천)
  fk_nm             VARCHAR(128) NOT NULL,                                 -- FK명(이름 규칙 P4, 대문자 저장)
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_phy_fk_pkey PRIMARY KEY (phy_fk_id),
  CONSTRAINT mdl_phy_fk_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_phy_fk_mdl_phy_mdl_id_fkey FOREIGN KEY (phy_mdl_id) REFERENCES mdl_phy_mdl (phy_mdl_id),
  CONSTRAINT mdl_phy_fk_mdl_rel_id_fkey FOREIGN KEY (rel_id) REFERENCES mdl_rel (rel_id),
  CONSTRAINT mdl_phy_fk_del_yn_check CHECK (del_yn IN ('Y','N')),
  CONSTRAINT mdl_phy_fk_nm_upper_check CHECK (fk_nm = UPPER(fk_nm))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_phy_fk_mdl_rel_actv ON mdl_phy_fk (phy_mdl_id, rel_id) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_phy_fk_mdl_nm_actv ON mdl_phy_fk (phy_mdl_id, fk_nm) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_phy_fk'), fn_grant_svc_only('TABLE', 'mdl_phy_fk');
COMMENT ON TABLE mdl_phy_fk IS '물리 FK — 원천 관계 + FK명(칼럼 쌍은 속성 fk_rel_id·src_attr_id 에서 도출)';

-- 정합(DB 강제, 025 선례) : 테이블 엔터티·FK 관계 = 물리 모델과 같은 프로젝트(활성), 칼럼 속성 = 그 테이블의 엔터티(활성)
CREATE OR REPLACE FUNCTION fn_chk_mdl_phy_src()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'mdl_phy_tbl' THEN
    SELECT EXISTS (SELECT 1 FROM mdl_phy_mdl m JOIN mdl_ent e ON e.ent_id = NEW.ent_id
                   WHERE m.phy_mdl_id = NEW.phy_mdl_id AND m.area_id = NEW.area_id AND e.prj_id = m.prj_id AND e.del_yn = 'N') INTO v_ok;
  ELSIF TG_TABLE_NAME = 'mdl_phy_fk' THEN
    SELECT EXISTS (SELECT 1 FROM mdl_phy_mdl m JOIN mdl_rel r ON r.rel_id = NEW.rel_id
                   WHERE m.phy_mdl_id = NEW.phy_mdl_id AND m.area_id = NEW.area_id AND r.prj_id = m.prj_id AND r.del_yn = 'N') INTO v_ok;
  ELSE
    SELECT NEW.attr_id IS NULL AND EXISTS (SELECT 1 FROM mdl_phy_tbl t WHERE t.phy_tbl_id = NEW.phy_tbl_id AND t.area_id = NEW.area_id)
        OR EXISTS (SELECT 1 FROM mdl_phy_tbl t JOIN mdl_attr a ON a.attr_id = NEW.attr_id
                   WHERE t.phy_tbl_id = NEW.phy_tbl_id AND t.area_id = NEW.area_id AND a.ent_id = t.ent_id AND a.del_yn = 'N') INTO v_ok;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION '%: 원천(엔터티·관계·속성)은 같은 분류체계·같은 프로젝트(칼럼은 같은 엔터티)의 활성 행이어야 함', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_phy_tbl_src ON mdl_phy_tbl;
CREATE TRIGGER trg_mdl_phy_tbl_src BEFORE INSERT OR UPDATE OF phy_mdl_id, ent_id, area_id ON mdl_phy_tbl FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_phy_src();
DROP TRIGGER IF EXISTS trg_mdl_phy_col_src ON mdl_phy_col;
CREATE TRIGGER trg_mdl_phy_col_src BEFORE INSERT OR UPDATE OF phy_tbl_id, attr_id, area_id ON mdl_phy_col FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_phy_src();
DROP TRIGGER IF EXISTS trg_mdl_phy_fk_src ON mdl_phy_fk;
CREATE TRIGGER trg_mdl_phy_fk_src BEFORE INSERT OR UPDATE OF phy_mdl_id, rel_id, area_id ON mdl_phy_fk FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_phy_src();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_phy_src()');

COMMIT;

NOTIFY pgrst, 'reload schema';
