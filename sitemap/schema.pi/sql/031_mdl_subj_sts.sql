-- 031_mdl_subj_sts.sql : 주제영역별 모델 상태(마스터 지시 2026-10-17) — 논리 작성중 → 논리완료 → (주제영역 선택) 물리 전환 → 물리 작성중 → 물리완료 → ERD
-- DA-APPROVED: 마스터 지시 2026-10-17("논리모델 생성은 상태가 존재하며 논리모델완료 상태가 되어야 물리모델로 전환", "물리모델도 상태가 존재하여 물리모델완료 상태가 되어야 ERD로 전환",
--   "물리모델은 주제영역별로 선택해서 물리모델로 전환", 상태 단위 = 주제영역, 완료 후 수정 = 완료 취소 후) — mdl_subj 칼럼 2개 + 신규 1테이블(mdl_ 접두, 시스템 컬럼 맨 끝, 논리삭제, service_role 전용)
-- 표준단어 : 논리 LGC·상태 STS(프로젝트 선례 std_sts_cd)·완료 CMPTN·일시 DTM / 상태값 : WRT 작성중 / CMPTN 완료
-- DA 조건부 승인 반영 : 이행 INSERT 활성 조건·ON CONFLICT, mdl_phy_fk 잠금, 논리완료 일시 CHECK, 잠금 전용 SQLSTATE MLK01(API 409 SUBJ_LOCKED)
-- 완료 = 편집 잠금(DB 트리거가 강제 — 모든 편집 API 공통) : 논리완료 주제영역의 엔터티·속성·관계, 물리완료 주제영역의 물리 테이블·칼럼은 등록·수정·삭제 거부(완료 취소 후 편집)
BEGIN;

SELECT fn_add_cols_keep_sys('mdl_subj', $c$
  ADD COLUMN lgc_sts_cd VARCHAR(10) NOT NULL DEFAULT 'WRT',
  ADD COLUMN lgc_cmptn_dtm TIMESTAMPTZ$c$);
ALTER TABLE mdl_subj ADD CONSTRAINT mdl_subj_lgc_sts_cd_check CHECK (lgc_sts_cd IN ('WRT','CMPTN'));
ALTER TABLE mdl_subj ADD CONSTRAINT mdl_subj_lgc_cmptn_check CHECK ((lgc_sts_cd = 'CMPTN') = (lgc_cmptn_dtm IS NOT NULL));
COMMENT ON COLUMN mdl_subj.lgc_sts_cd IS '논리상태코드 — WRT 작성중 / CMPTN 논리완료(편집 잠금, 물리 전환 가능)';
COMMENT ON COLUMN mdl_subj.lgc_cmptn_dtm IS '논리완료일시';

-- 물리 모델 × 주제영역 = 전환된 주제영역과 물리 상태(전환 범위 겸 상태)
CREATE TABLE IF NOT EXISTS mdl_phy_subj (
  phy_subj_id       UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 물리주제영역ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  phy_mdl_id        UUID         NOT NULL,                                 -- 물리모델ID
  subj_id           UUID         NOT NULL,                                 -- 주제영역ID
  phy_sts_cd        VARCHAR(10)  NOT NULL DEFAULT 'WRT',                   -- 물리상태코드 : WRT 작성중 / CMPTN 물리완료(편집 잠금, ERD 가능)
  cmptn_dtm         TIMESTAMPTZ,                                           -- 완료일시
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_phy_subj_pkey PRIMARY KEY (phy_subj_id),
  CONSTRAINT mdl_phy_subj_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_phy_subj_mdl_phy_mdl_id_fkey FOREIGN KEY (phy_mdl_id) REFERENCES mdl_phy_mdl (phy_mdl_id),
  CONSTRAINT mdl_phy_subj_mdl_subj_id_fkey FOREIGN KEY (subj_id) REFERENCES mdl_subj (subj_id),
  CONSTRAINT mdl_phy_subj_phy_sts_cd_check CHECK (phy_sts_cd IN ('WRT','CMPTN')),
  CONSTRAINT mdl_phy_subj_cmptn_check CHECK ((phy_sts_cd = 'CMPTN') = (cmptn_dtm IS NOT NULL)),
  CONSTRAINT mdl_phy_subj_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_phy_subj_mdl_subj_actv ON mdl_phy_subj (phy_mdl_id, subj_id) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_phy_subj'), fn_grant_svc_only('TABLE', 'mdl_phy_subj');
COMMENT ON TABLE mdl_phy_subj IS '물리 모델 주제영역 — 전환된 주제영역과 물리 상태(WRT 작성중 / CMPTN 물리완료)';

-- 기존 물리 모델 이행 : 이미 물리 테이블이 있는 (물리 모델 × 주제영역) 을 작성중으로 등록(상태 도입 전 전환분)
INSERT INTO mdl_phy_subj (area_id, phy_mdl_id, subj_id)
SELECT DISTINCT m.area_id, m.phy_mdl_id, e.subj_id
  FROM mdl_phy_tbl t
  JOIN mdl_phy_mdl m ON m.phy_mdl_id = t.phy_mdl_id AND m.del_yn = 'N'
  JOIN mdl_ent e ON e.ent_id = t.ent_id AND e.del_yn = 'N'
  JOIN mdl_subj s ON s.subj_id = e.subj_id AND s.prj_id = m.prj_id AND s.del_yn = 'N' -- 정합 트리거보다 먼저 실행되므로 직접 검사
 WHERE t.del_yn = 'N'
ON CONFLICT (phy_mdl_id, subj_id) WHERE del_yn = 'N' DO NOTHING;

-- 정합 : 주제영역 = 물리 모델 프로젝트 소속(활성)
CREATE OR REPLACE FUNCTION fn_chk_mdl_phy_subj()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mdl_phy_mdl m JOIN mdl_subj s ON s.subj_id = NEW.subj_id
                 WHERE m.phy_mdl_id = NEW.phy_mdl_id AND m.area_id = NEW.area_id AND s.prj_id = m.prj_id AND s.del_yn = 'N') THEN
    RAISE EXCEPTION 'mdl_phy_subj: 주제영역은 물리 모델과 같은 프로젝트의 활성 주제영역이어야 함' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_phy_subj_src ON mdl_phy_subj;
CREATE TRIGGER trg_mdl_phy_subj_src BEFORE INSERT OR UPDATE OF phy_mdl_id, subj_id, area_id ON mdl_phy_subj FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_phy_subj();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_phy_subj()');

-- 논리 잠금 : 논리완료 주제영역의 엔터티·속성·관계 편집 거부(관계는 부모·자식 어느 쪽이든). 메시지 접두 mdl_subj_locked → API 409 SUBJ_LOCKED
CREATE OR REPLACE FUNCTION fn_chk_mdl_lgc_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_hit BOOLEAN := FALSE;
BEGIN
  IF TG_TABLE_NAME = 'mdl_ent' THEN
    SELECT EXISTS (SELECT 1 FROM mdl_subj s WHERE s.lgc_sts_cd = 'CMPTN' AND s.subj_id IN (
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.subj_id END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.subj_id END)) INTO v_hit;
  ELSIF TG_TABLE_NAME = 'mdl_attr' THEN
    SELECT EXISTS (SELECT 1 FROM mdl_ent e JOIN mdl_subj s ON s.subj_id = e.subj_id WHERE s.lgc_sts_cd = 'CMPTN' AND e.ent_id IN (
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.ent_id END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.ent_id END)) INTO v_hit;
  ELSE
    SELECT EXISTS (SELECT 1 FROM mdl_ent e JOIN mdl_subj s ON s.subj_id = e.subj_id WHERE s.lgc_sts_cd = 'CMPTN' AND e.ent_id IN (
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.prnt_ent_id END, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.chld_ent_id END,
      CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.prnt_ent_id END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.chld_ent_id END)) INTO v_hit;
  END IF;
  IF v_hit THEN
    RAISE EXCEPTION 'mdl_subj_locked: 논리완료 주제영역은 편집할 수 없습니다(완료 취소 후 편집)' USING ERRCODE = 'MLK01';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_ent_lgc_lock ON mdl_ent;
CREATE TRIGGER trg_mdl_ent_lgc_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_ent FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_lgc_lock();
DROP TRIGGER IF EXISTS trg_mdl_attr_lgc_lock ON mdl_attr;
CREATE TRIGGER trg_mdl_attr_lgc_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_attr FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_lgc_lock();
DROP TRIGGER IF EXISTS trg_mdl_rel_lgc_lock ON mdl_rel;
CREATE TRIGGER trg_mdl_rel_lgc_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_rel FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_lgc_lock();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_lgc_lock()');

-- 물리 잠금 : 물리완료 주제영역(물리 모델 × 주제영역)의 물리 테이블·칼럼 편집 거부
CREATE OR REPLACE FUNCTION fn_chk_mdl_phy_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_hit BOOLEAN := FALSE;
  v_tbl UUID;
BEGIN
  IF TG_TABLE_NAME = 'mdl_phy_fk' THEN
    SELECT EXISTS (SELECT 1 FROM mdl_rel r JOIN mdl_ent e ON e.ent_id = r.chld_ent_id
                   JOIN mdl_phy_subj ps ON ps.subj_id = e.subj_id AND ps.del_yn = 'N' AND ps.phy_sts_cd = 'CMPTN'
                   WHERE r.rel_id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.rel_id ELSE NEW.rel_id END)
                     AND ps.phy_mdl_id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.phy_mdl_id ELSE NEW.phy_mdl_id END)) INTO v_hit;
  ELSIF TG_TABLE_NAME = 'mdl_phy_tbl' THEN
    SELECT EXISTS (SELECT 1 FROM mdl_ent e JOIN mdl_phy_subj ps ON ps.subj_id = e.subj_id AND ps.del_yn = 'N' AND ps.phy_sts_cd = 'CMPTN'
                   WHERE e.ent_id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.ent_id ELSE NEW.ent_id END)
                     AND ps.phy_mdl_id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.phy_mdl_id ELSE NEW.phy_mdl_id END)) INTO v_hit;
  ELSE
    v_tbl := CASE WHEN TG_OP = 'DELETE' THEN OLD.phy_tbl_id ELSE NEW.phy_tbl_id END;
    SELECT EXISTS (SELECT 1 FROM mdl_phy_tbl t JOIN mdl_ent e ON e.ent_id = t.ent_id
                   JOIN mdl_phy_subj ps ON ps.subj_id = e.subj_id AND ps.phy_mdl_id = t.phy_mdl_id AND ps.del_yn = 'N' AND ps.phy_sts_cd = 'CMPTN'
                   WHERE t.phy_tbl_id = v_tbl) INTO v_hit;
  END IF;
  IF v_hit THEN
    RAISE EXCEPTION 'mdl_subj_locked: 물리완료 주제영역은 편집할 수 없습니다(완료 취소 후 편집)' USING ERRCODE = 'MLK01';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_phy_tbl_lock ON mdl_phy_tbl;
CREATE TRIGGER trg_mdl_phy_tbl_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_phy_tbl FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_phy_lock();
DROP TRIGGER IF EXISTS trg_mdl_phy_fk_lock ON mdl_phy_fk;
CREATE TRIGGER trg_mdl_phy_fk_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_phy_fk FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_phy_lock(); -- FK 는 자식 엔터티 주제영역 기준
DROP TRIGGER IF EXISTS trg_mdl_phy_col_lock ON mdl_phy_col;
CREATE TRIGGER trg_mdl_phy_col_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_phy_col FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_phy_lock();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_phy_lock()');

COMMIT;

NOTIFY pgrst, 'reload schema';
