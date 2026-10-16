-- 019_mdl_prj.sql : 모델 프로젝트 — 프로젝트(여러 개) → 주제영역(여러 개) → 핵심 엔터티 (2026-10-16 마스터 지시)
-- 주제영역 이름·약어, 엔터티 이름 유일 범위를 분류체계 → 프로젝트로 변경(프로젝트마다 고객·CST 사용 가능)
-- 엔터티 prj_id 는 주제영역에서 트리거로 채움(서버가 보내지 않음). 기존 주제영역(시험 데이터, 전부 논리 삭제)은 분류체계별 '기본 프로젝트'에 소속
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_prj (
  prj_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 프로젝트ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID(사용 표준사전)
  prj_nm            VARCHAR(100) NOT NULL,                                 -- 프로젝트명
  prj_desc          TEXT,                                                  -- 프로젝트설명
  sort_seq          INT          NOT NULL DEFAULT 1,                       -- 정렬순서
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_prj_pkey PRIMARY KEY (prj_id),
  CONSTRAINT mdl_prj_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_prj_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_prj_area_nm_actv ON mdl_prj (area_id, prj_nm) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_prj'), fn_grant_svc_only('TABLE', 'mdl_prj');
COMMENT ON TABLE mdl_prj IS '모델 프로젝트(주제영역 묶음)';

-- 주제영역·엔터티에 프로젝트 칸(시스템 컬럼 맨 뒤 유지)
SELECT fn_add_cols_keep_sys('mdl_subj', $c$ADD COLUMN prj_id UUID$c$);
SELECT fn_add_cols_keep_sys('mdl_ent',  $c$ADD COLUMN prj_id UUID$c$);
COMMENT ON COLUMN mdl_subj.prj_id IS '프로젝트ID';
COMMENT ON COLUMN mdl_ent.prj_id IS '프로젝트ID(주제영역에서 자동, 이름 유일 범위)';

-- 기존 주제영역 이관 : 분류체계별 기본 프로젝트
INSERT INTO mdl_prj (area_id, prj_nm, prj_desc, regr_id, modr_id)
SELECT DISTINCT s.area_id, '기본 프로젝트', '019 이관(프로젝트 도입 전 주제영역)', 'MIG_019', 'MIG_019' FROM mdl_subj s
ON CONFLICT DO NOTHING;
ALTER TABLE mdl_subj DISABLE TRIGGER trg_mdl_subj_mod_dtm;
ALTER TABLE mdl_ent  DISABLE TRIGGER trg_mdl_ent_mod_dtm;
UPDATE mdl_subj s SET prj_id = p.prj_id FROM mdl_prj p WHERE p.area_id = s.area_id AND p.regr_id = 'MIG_019' AND s.prj_id IS NULL;
UPDATE mdl_ent e SET prj_id = s.prj_id FROM mdl_subj s WHERE s.subj_id = e.subj_id AND e.prj_id IS NULL;
ALTER TABLE mdl_subj ENABLE TRIGGER trg_mdl_subj_mod_dtm;
ALTER TABLE mdl_ent  ENABLE TRIGGER trg_mdl_ent_mod_dtm;

ALTER TABLE mdl_subj ALTER COLUMN prj_id SET NOT NULL;
ALTER TABLE mdl_ent  ALTER COLUMN prj_id SET NOT NULL;
ALTER TABLE mdl_subj ADD CONSTRAINT mdl_subj_mdl_prj_id_fkey FOREIGN KEY (prj_id) REFERENCES mdl_prj (prj_id);
ALTER TABLE mdl_ent  ADD CONSTRAINT mdl_ent_mdl_prj_id_fkey  FOREIGN KEY (prj_id) REFERENCES mdl_prj (prj_id);

-- 유일 범위 : 분류체계 → 프로젝트
DROP INDEX IF EXISTS ux_mdl_subj_area_nm_actv;
DROP INDEX IF EXISTS ux_mdl_subj_area_abbr_actv;
DROP INDEX IF EXISTS ux_mdl_ent_area_nm_actv;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_subj_prj_nm_actv ON mdl_subj (prj_id, coalesce(up_subj_id, '00000000-0000-0000-0000-000000000000'::UUID), subj_nm) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_subj_prj_abbr_actv ON mdl_subj (prj_id, subj_abbr_nm) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_ent_prj_nm_actv ON mdl_ent (prj_id, ent_log_nm) WHERE del_yn = 'N';

-- 주제영역 검사 재정의 : 프로젝트는 같은 분류체계·활성, 상위 주제영역은 같은 프로젝트의 1레벨(2레벨까지)
CREATE OR REPLACE FUNCTION fn_chk_mdl_subj_lvl()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mdl_prj p WHERE p.prj_id = NEW.prj_id AND p.area_id = NEW.area_id AND p.del_yn = 'N') THEN
    RAISE EXCEPTION 'mdl_subj_prj: 프로젝트는 같은 분류체계의 활성 프로젝트여야 함' USING ERRCODE = '23514';
  END IF;
  IF NEW.up_subj_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM mdl_subj p WHERE p.subj_id = NEW.up_subj_id AND p.prj_id = NEW.prj_id AND p.up_subj_id IS NULL AND p.del_yn = 'N'
  ) THEN
    RAISE EXCEPTION 'mdl_subj_lvl: 상위 주제영역은 같은 프로젝트의 1레벨이어야 함(2레벨까지)' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_subj_lvl ON mdl_subj;
CREATE TRIGGER trg_mdl_subj_lvl BEFORE INSERT OR UPDATE OF up_subj_id, prj_id ON mdl_subj FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_subj_lvl();

-- 엔터티 프로젝트 = 주제영역의 프로젝트(자동)
CREATE OR REPLACE FUNCTION fn_set_mdl_ent_prj()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT prj_id INTO NEW.prj_id FROM mdl_subj WHERE subj_id = NEW.subj_id AND area_id = NEW.area_id AND del_yn = 'N';
  IF NEW.prj_id IS NULL THEN
    RAISE EXCEPTION 'mdl_ent_subj: 주제영역은 같은 분류체계의 활성 주제영역이어야 함' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_ent_prj ON mdl_ent;
CREATE TRIGGER trg_mdl_ent_prj BEFORE INSERT OR UPDATE OF subj_id ON mdl_ent FOR EACH ROW EXECUTE FUNCTION fn_set_mdl_ent_prj();
SELECT fn_grant_svc_only('FUNCTION', 'fn_set_mdl_ent_prj()');

COMMIT;

NOTIFY pgrst, 'reload schema';
