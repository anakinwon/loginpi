-- 032_mdl_ent_tbl_sts.sql : 상태 단위 = 엔터티·테이블(마스터 지시 2026-10-17 "주제영역별 논리모델 작성완료가 아니라 엔터티별 작성완료로 물리모델 전환,
--   물리모델도 테이블별 작성완료 상태일 때 ERD 확인") — 031 의 주제영역 단위 상태를 대체
-- DA-APPROVED: 마스터 지시 2026-10-17 — mdl_ent·mdl_phy_tbl 칼럼 2개씩(fn_add_cols_keep_sys), 031 주제영역 잠금 트리거·함수 제거(mdl_subj.lgc_*·mdl_phy_subj 는 미사용 표기, 행 삭제 없음)
-- 표준단어 : 논리 LGC·상태 STS(선례)·완료 CMPTN·일시 DTM / 상태값 : WRT 작성중 / CMPTN 작성완료
-- 잠금(DB 트리거, 잠금 전용 SQLSTATE MLK01 → API 409 SUBJ_LOCKED) :
--   엔터티 작성완료 → 엔터티 행 편집·속성·자식 관계(자식 = 이 엔터티) 등록·수정·삭제 거부. 부모가 완료여도 새 자식 관계는 허용(부모 변경 아님)
--   테이블 작성완료 → 칼럼·이 테이블이 자식인 FK 거부. 상태 전이(작성중 ↔ 완료) 자체는 허용 : 전·후 모두 완료인 UPDATE 만 편집으로 봄
--   DA 권고 반영 : 상태 전이 UPDATE 에 다른 칼럼 변경을 함께 실으면 거부(완료 취소와 편집 동시 우회 차단), FK 잠금은 OLD·NEW 양쪽, 일시 칼럼명 phy_cmptn_dtm
BEGIN;

-- 031 주제영역 단위 잠금 제거(상태 단위 변경)
DROP TRIGGER IF EXISTS trg_mdl_ent_lgc_lock ON mdl_ent;
DROP TRIGGER IF EXISTS trg_mdl_attr_lgc_lock ON mdl_attr;
DROP TRIGGER IF EXISTS trg_mdl_rel_lgc_lock ON mdl_rel;
DROP TRIGGER IF EXISTS trg_mdl_phy_tbl_lock ON mdl_phy_tbl;
DROP TRIGGER IF EXISTS trg_mdl_phy_col_lock ON mdl_phy_col;
DROP TRIGGER IF EXISTS trg_mdl_phy_fk_lock ON mdl_phy_fk;
DROP FUNCTION IF EXISTS fn_chk_mdl_lgc_lock();
DROP FUNCTION IF EXISTS fn_chk_mdl_phy_lock();
COMMENT ON COLUMN mdl_subj.lgc_sts_cd IS '미사용(032 에서 엔터티 단위 mdl_ent.lgc_sts_cd 로 대체) — 정리 대상';
COMMENT ON COLUMN mdl_subj.lgc_cmptn_dtm IS '미사용(032 대체) — 정리 대상';
COMMENT ON TABLE mdl_phy_subj IS '미사용(032 에서 테이블 단위 mdl_phy_tbl.phy_sts_cd 로 대체) — 정리 대상';

SELECT fn_add_cols_keep_sys('mdl_ent', $c$
  ADD COLUMN lgc_sts_cd VARCHAR(10) NOT NULL DEFAULT 'WRT',
  ADD COLUMN lgc_cmptn_dtm TIMESTAMPTZ$c$);
ALTER TABLE mdl_ent ADD CONSTRAINT mdl_ent_lgc_sts_cd_check CHECK (lgc_sts_cd IN ('WRT','CMPTN'));
ALTER TABLE mdl_ent ADD CONSTRAINT mdl_ent_lgc_cmptn_check CHECK ((lgc_sts_cd = 'CMPTN') = (lgc_cmptn_dtm IS NOT NULL));
COMMENT ON COLUMN mdl_ent.lgc_sts_cd IS '논리상태코드 — WRT 작성중 / CMPTN 작성완료(편집 잠금, 물리 전환 가능)';
COMMENT ON COLUMN mdl_ent.lgc_cmptn_dtm IS '논리완료일시';

SELECT fn_add_cols_keep_sys('mdl_phy_tbl', $c$
  ADD COLUMN phy_sts_cd VARCHAR(10) NOT NULL DEFAULT 'WRT',
  ADD COLUMN phy_cmptn_dtm TIMESTAMPTZ$c$);
ALTER TABLE mdl_phy_tbl ADD CONSTRAINT mdl_phy_tbl_phy_sts_cd_check CHECK (phy_sts_cd IN ('WRT','CMPTN'));
ALTER TABLE mdl_phy_tbl ADD CONSTRAINT mdl_phy_tbl_cmptn_check CHECK ((phy_sts_cd = 'CMPTN') = (phy_cmptn_dtm IS NOT NULL));
COMMENT ON COLUMN mdl_phy_tbl.phy_sts_cd IS '물리상태코드 — WRT 작성중 / CMPTN 작성완료(편집 잠금, ERD 표시)';
COMMENT ON COLUMN mdl_phy_tbl.phy_cmptn_dtm IS '완료일시';

-- 논리 잠금
CREATE OR REPLACE FUNCTION fn_chk_mdl_ent_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_hit BOOLEAN := FALSE;
BEGIN
  IF TG_TABLE_NAME = 'mdl_ent' THEN
    -- 전·후 모두 완료인 수정 = 편집(상태 전이는 허용), 삭제는 완료면 거부
    v_hit := (TG_OP = 'UPDATE' AND OLD.lgc_sts_cd = 'CMPTN' AND NEW.lgc_sts_cd = 'CMPTN') OR (TG_OP = 'DELETE' AND OLD.lgc_sts_cd = 'CMPTN')
      -- 상태 전이 UPDATE 는 상태·일시·변경자·변경일시 외 칼럼을 바꿀 수 없음
      OR (TG_OP = 'UPDATE' AND OLD.lgc_sts_cd <> NEW.lgc_sts_cd
          AND (to_jsonb(NEW) - ARRAY['lgc_sts_cd','lgc_cmptn_dtm','mod_dtm','modr_id']) <> (to_jsonb(OLD) - ARRAY['lgc_sts_cd','lgc_cmptn_dtm','mod_dtm','modr_id']));
  ELSIF TG_TABLE_NAME = 'mdl_attr' THEN
    SELECT EXISTS (SELECT 1 FROM mdl_ent e WHERE e.lgc_sts_cd = 'CMPTN' AND e.ent_id IN (
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.ent_id END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.ent_id END)) INTO v_hit;
  ELSE -- mdl_rel : 자식 엔터티 기준
    SELECT EXISTS (SELECT 1 FROM mdl_ent e WHERE e.lgc_sts_cd = 'CMPTN' AND e.ent_id IN (
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.chld_ent_id END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.chld_ent_id END)) INTO v_hit;
  END IF;
  IF v_hit THEN
    RAISE EXCEPTION 'mdl_subj_locked: 작성완료 엔터티는 편집할 수 없습니다(완료 취소 후 편집)' USING ERRCODE = 'MLK01';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_ent_sts_lock ON mdl_ent;
CREATE TRIGGER trg_mdl_ent_sts_lock BEFORE UPDATE OR DELETE ON mdl_ent FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_ent_lock();
DROP TRIGGER IF EXISTS trg_mdl_attr_sts_lock ON mdl_attr;
CREATE TRIGGER trg_mdl_attr_sts_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_attr FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_ent_lock();
DROP TRIGGER IF EXISTS trg_mdl_rel_sts_lock ON mdl_rel;
CREATE TRIGGER trg_mdl_rel_sts_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_rel FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_ent_lock();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_ent_lock()');

-- 물리 잠금
CREATE OR REPLACE FUNCTION fn_chk_mdl_tbl_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_hit BOOLEAN := FALSE;
BEGIN
  IF TG_TABLE_NAME = 'mdl_phy_tbl' THEN
    v_hit := (TG_OP = 'UPDATE' AND OLD.phy_sts_cd = 'CMPTN' AND NEW.phy_sts_cd = 'CMPTN') OR (TG_OP = 'DELETE' AND OLD.phy_sts_cd = 'CMPTN')
      OR (TG_OP = 'UPDATE' AND OLD.phy_sts_cd <> NEW.phy_sts_cd
          AND (to_jsonb(NEW) - ARRAY['phy_sts_cd','phy_cmptn_dtm','mod_dtm','modr_id']) <> (to_jsonb(OLD) - ARRAY['phy_sts_cd','phy_cmptn_dtm','mod_dtm','modr_id']));
  ELSIF TG_TABLE_NAME = 'mdl_phy_col' THEN
    SELECT EXISTS (SELECT 1 FROM mdl_phy_tbl t WHERE t.phy_sts_cd = 'CMPTN' AND t.phy_tbl_id IN (
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.phy_tbl_id END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.phy_tbl_id END)) INTO v_hit;
  ELSE -- mdl_phy_fk : 이 물리 모델에서 관계 자식 엔터티의 테이블 기준(수정은 OLD·NEW 양쪽)
    SELECT EXISTS (SELECT 1 FROM mdl_rel r JOIN mdl_phy_tbl t ON t.ent_id = r.chld_ent_id AND t.del_yn = 'N' AND t.phy_sts_cd = 'CMPTN'
                   WHERE (TG_OP <> 'INSERT' AND r.rel_id = OLD.rel_id AND t.phy_mdl_id = OLD.phy_mdl_id)
                      OR (TG_OP <> 'DELETE' AND r.rel_id = NEW.rel_id AND t.phy_mdl_id = NEW.phy_mdl_id)) INTO v_hit;
  END IF;
  IF v_hit THEN
    RAISE EXCEPTION 'mdl_subj_locked: 작성완료 테이블은 편집할 수 없습니다(완료 취소 후 편집)' USING ERRCODE = 'MLK01';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_phy_tbl_sts_lock ON mdl_phy_tbl;
CREATE TRIGGER trg_mdl_phy_tbl_sts_lock BEFORE UPDATE OR DELETE ON mdl_phy_tbl FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_tbl_lock();
DROP TRIGGER IF EXISTS trg_mdl_phy_col_sts_lock ON mdl_phy_col;
CREATE TRIGGER trg_mdl_phy_col_sts_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_phy_col FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_tbl_lock();
DROP TRIGGER IF EXISTS trg_mdl_phy_fk_sts_lock ON mdl_phy_fk;
CREATE TRIGGER trg_mdl_phy_fk_sts_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_phy_fk FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_tbl_lock();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_tbl_lock()');

COMMIT;

NOTIFY pgrst, 'reload schema';
