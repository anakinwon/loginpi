-- 063_mdl_phy_idx.sql : 물리 모델 인덱스(PRD_PiErd S5 잔여, 마스터 선택 2026-10-20) — 물리 테이블별 일반·유일 인덱스(PK 인덱스는 칼럼 pk_yn 에서 생성, 여기 없음)
-- DA-APPROVED: 마스터 선택 2026-10-20 — 신규 1테이블(mdl_ 접두, 시스템 컬럼 4개 맨 끝, del_yn 논리삭제, ver_no 잠금, service_role 전용), 약어 IDX(인덱스, 공통표준단어 INDEX·색인 INDX — 기존 ix_ 관례 따름 [확인중 : da-standards])·UNQ(고유, 공통표준단어)·COL(컬럼)·DESC(설명)
-- 칼럼 구성 = col_ids(mdl_phy_col.phy_col_id 배열, 순서 = 인덱스 칼럼 순서) — 배열 원소 FK 는 DB 가 강제하지 못해 앱이 검사(같은 테이블 활성 칼럼·중복 금지), 삭제된 칼럼을 가리키면 화면·DDL 이 invalid 처리
-- 이름 = 서버 생성 IX_<테이블명>_NN(대문자 저장, DDL 시점 대소문자). 테이블 작성완료(phy_sts_cd = 'CMPTN')면 추가·삭제 거부(앱 + 트리거, 032 물리 잠금과 같은 MLK01)
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_phy_idx (
  phy_idx_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 물리인덱스ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  phy_tbl_id        UUID         NOT NULL,                                 -- 물리테이블ID
  idx_nm            VARCHAR(128) NOT NULL,                                 -- 인덱스명(대문자 저장)
  unq_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 고유여부(Y = UNIQUE INDEX)
  col_ids           UUID[]       NOT NULL,                                 -- 칼럼ID목록(순서 = 인덱스 칼럼 순서)
  idx_desc          TEXT,                                                  -- 인덱스설명
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_phy_idx_pkey PRIMARY KEY (phy_idx_id),
  CONSTRAINT mdl_phy_idx_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_phy_idx_mdl_phy_tbl_id_fkey FOREIGN KEY (phy_tbl_id) REFERENCES mdl_phy_tbl (phy_tbl_id),
  CONSTRAINT mdl_phy_idx_yn_check CHECK (unq_yn IN ('Y','N') AND del_yn IN ('Y','N')),
  CONSTRAINT mdl_phy_idx_nm_upper_check CHECK (idx_nm = UPPER(idx_nm)),
  CONSTRAINT mdl_phy_idx_col_ids_check CHECK (cardinality(col_ids) BETWEEN 1 AND 16 AND array_position(col_ids, NULL) IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_phy_idx_tbl_nm_actv ON mdl_phy_idx (phy_tbl_id, idx_nm) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_phy_idx'), fn_grant_svc_only('TABLE', 'mdl_phy_idx');
COMMENT ON TABLE mdl_phy_idx IS '물리 인덱스 — 물리 테이블별 일반·유일 인덱스(칼럼 구성 = 물리칼럼ID 배열, 이름 IX_<테이블>_NN)';
COMMENT ON COLUMN mdl_phy_idx.phy_idx_id IS '물리인덱스ID';
COMMENT ON COLUMN mdl_phy_idx.area_id IS '분류체계ID';
COMMENT ON COLUMN mdl_phy_idx.phy_tbl_id IS '물리테이블ID';
COMMENT ON COLUMN mdl_phy_idx.idx_nm IS '인덱스명(서버 생성 IX_<테이블명>_NN, 대문자 저장)';
COMMENT ON COLUMN mdl_phy_idx.unq_yn IS '고유여부(Y = CREATE UNIQUE INDEX)';
COMMENT ON COLUMN mdl_phy_idx.col_ids IS '칼럼ID목록(mdl_phy_col.phy_col_id, 순서 = 인덱스 칼럼 순서, 1~16개)';
COMMENT ON COLUMN mdl_phy_idx.idx_desc IS '인덱스설명';
COMMENT ON COLUMN mdl_phy_idx.ver_no IS '버전번호';
COMMENT ON COLUMN mdl_phy_idx.del_yn IS '삭제여부';
COMMENT ON COLUMN mdl_phy_idx.del_dtm IS '삭제일시';
COMMENT ON COLUMN mdl_phy_idx.regr_id IS '등록자ID';
COMMENT ON COLUMN mdl_phy_idx.reg_dtm IS '등록일시';
COMMENT ON COLUMN mdl_phy_idx.modr_id IS '변경자ID';
COMMENT ON COLUMN mdl_phy_idx.mod_dtm IS '변경일시';

-- 잠금 : 작성완료 테이블의 인덱스는 추가·수정·삭제 불가(032 fn_chk_mdl_tbl_lock 과 같은 MLK01 — 그 함수는 고치지 않고 별도 함수)
CREATE OR REPLACE FUNCTION fn_chk_mdl_phy_idx_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_hit BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (SELECT 1 FROM mdl_phy_tbl t WHERE t.phy_sts_cd = 'CMPTN' AND t.phy_tbl_id IN (
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.phy_tbl_id END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.phy_tbl_id END)) INTO v_hit;
  IF v_hit THEN
    RAISE EXCEPTION 'mdl_subj_locked: 작성완료 테이블의 인덱스는 편집할 수 없습니다(완료 취소 후 편집)' USING ERRCODE = 'MLK01';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_phy_idx_sts_lock ON mdl_phy_idx;
CREATE TRIGGER trg_mdl_phy_idx_sts_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_phy_idx FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_phy_idx_lock();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_phy_idx_lock()');

COMMIT;

NOTIFY pgrst, 'reload schema';
