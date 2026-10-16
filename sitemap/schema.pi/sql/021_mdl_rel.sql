-- 021_mdl_rel.sql : 개념 모델 — 엔터티 간 관계(부모·자식, 식별 여부, 카디널리티, 선택성) (PRD §2.5 MD1 잔여, MASTER_ROADMAP §6-1, 2026-10-17 마스터 지시)
-- DA-APPROVED: 마스터 지시 2026-10-17 — 2단계 ModelPi 착수. 신규 1테이블(mdl_ 접두, 시스템 컬럼 4개 맨 끝, del_yn 논리삭제, ver_no 잠금, service_role 전용)
-- 근거 : 데이터 모델링 가이드 문단 15~18(개념 모델 = 핵심 엔터티 + 관계), IE 표기(식별 = 실선·부모 PK가 자식 PK 일부, 비식별 = 점선, 선택성 = 부모·자식 각각)
-- 규칙(DB 강제) :
--  · 부모·자식 엔터티는 같은 분류체계·같은 프로젝트·활성(트리거가 prj_id 를 부모 엔터티에서 채움)
--  · N:M 은 식별 관계가 될 수 없음(FK 없음, 물리 단계에서 교차 엔터티로 해소)
--  · 자기참조(부모 = 자식, 상위 조직 등)는 비식별만
--  · 식별 관계는 부모 필수(prnt_opt_yn = 'N' : 자식 PK 일부가 NULL 일 수 없음)
--  · 같은 부모·자식 쌍은 관계명으로 구분(관계명 없는 쌍은 1건)
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_rel (
  rel_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 관계ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  prj_id            UUID         NOT NULL,                                 -- 프로젝트ID(부모 엔터티에서 자동)
  prnt_ent_id       UUID         NOT NULL,                                 -- 부모엔터티ID(1쪽)
  chld_ent_id       UUID         NOT NULL,                                 -- 자식엔터티ID(N쪽)
  rel_nm            VARCHAR(100),                                          -- 관계명(동사구, 선택)
  crdn_cd           VARCHAR(2)   NOT NULL DEFAULT '1N',                    -- 카디널리티코드 : 11 1:1 / 1N 1:N / NM N:M
  idnt_yn           CHAR(1)      NOT NULL DEFAULT 'N',                     -- 식별관계여부(Y = 부모 식별자가 자식 식별자 일부)
  prnt_opt_yn       CHAR(1)      NOT NULL DEFAULT 'N',                     -- 부모선택여부(Y = 자식 행에 부모 없을 수 있음)
  chld_opt_yn       CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 자식선택여부(Y = 부모 행에 자식 0건 가능)
  rel_desc          TEXT,                                                  -- 관계설명
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_rel_pkey PRIMARY KEY (rel_id),
  CONSTRAINT mdl_rel_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_rel_mdl_prj_id_fkey FOREIGN KEY (prj_id) REFERENCES mdl_prj (prj_id),
  CONSTRAINT mdl_rel_prnt_ent_id_fkey FOREIGN KEY (prnt_ent_id) REFERENCES mdl_ent (ent_id),
  CONSTRAINT mdl_rel_chld_ent_id_fkey FOREIGN KEY (chld_ent_id) REFERENCES mdl_ent (ent_id),
  CONSTRAINT mdl_rel_crdn_check CHECK (crdn_cd IN ('11','1N','NM')),
  CONSTRAINT mdl_rel_idnt_yn_check CHECK (idnt_yn IN ('Y','N')),
  CONSTRAINT mdl_rel_prnt_opt_yn_check CHECK (prnt_opt_yn IN ('Y','N')),
  CONSTRAINT mdl_rel_chld_opt_yn_check CHECK (chld_opt_yn IN ('Y','N')),
  CONSTRAINT mdl_rel_del_yn_check CHECK (del_yn IN ('Y','N')),
  CONSTRAINT mdl_rel_idnt_nm_check CHECK (idnt_yn = 'N' OR crdn_cd <> 'NM'),                -- N:M 식별 불가
  CONSTRAINT mdl_rel_idnt_self_check CHECK (idnt_yn = 'N' OR prnt_ent_id <> chld_ent_id),   -- 자기참조 식별 불가
  CONSTRAINT mdl_rel_idnt_opt_check CHECK (idnt_yn = 'N' OR prnt_opt_yn = 'N')              -- 식별이면 부모 필수
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_rel_pair_nm_actv ON mdl_rel (prnt_ent_id, chld_ent_id, coalesce(rel_nm, '')) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS ix_mdl_rel_prnt ON mdl_rel (prnt_ent_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS ix_mdl_rel_chld ON mdl_rel (chld_ent_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS ix_mdl_rel_prj ON mdl_rel (prj_id) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_rel'), fn_grant_svc_only('TABLE', 'mdl_rel');
COMMENT ON TABLE mdl_rel IS '엔터티 관계(개념·논리 모델) — 부모·자식, 식별 여부, 카디널리티, 선택성';

-- 부모·자식 = 같은 분류체계·같은 프로젝트·활성 엔터티, 프로젝트는 부모에서 자동
CREATE OR REPLACE FUNCTION fn_set_mdl_rel_prj()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prnt_prj UUID;
  v_chld_prj UUID;
BEGIN
  SELECT prj_id INTO v_prnt_prj FROM mdl_ent WHERE ent_id = NEW.prnt_ent_id AND area_id = NEW.area_id AND del_yn = 'N';
  SELECT prj_id INTO v_chld_prj FROM mdl_ent WHERE ent_id = NEW.chld_ent_id AND area_id = NEW.area_id AND del_yn = 'N';
  IF v_prnt_prj IS NULL OR v_chld_prj IS NULL OR v_prnt_prj <> v_chld_prj THEN
    RAISE EXCEPTION 'mdl_rel_ent: 부모·자식 엔터티는 같은 분류체계·같은 프로젝트의 활성 엔터티여야 함' USING ERRCODE = '23514';
  END IF;
  NEW.prj_id := v_prnt_prj;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_rel_prj ON mdl_rel;
CREATE TRIGGER trg_mdl_rel_prj BEFORE INSERT OR UPDATE OF prnt_ent_id, chld_ent_id ON mdl_rel FOR EACH ROW EXECUTE FUNCTION fn_set_mdl_rel_prj();
SELECT fn_grant_svc_only('FUNCTION', 'fn_set_mdl_rel_prj()');

COMMIT;

NOTIFY pgrst, 'reload schema';

-- 검증(적용 후 수동) :
-- INSERT INTO mdl_rel (area_id, prnt_ent_id, chld_ent_id, crdn_cd, idnt_yn) VALUES (<area>, <ent>, <ent>, '1N', 'Y'); → 23514(자기참조 식별)
-- INSERT ... crdn_cd 'NM', idnt_yn 'Y' → 23514 / 다른 프로젝트 엔터티 쌍 → 23514(mdl_rel_ent)
