-- 025_mdl_attr.sql : 엔터티 속성(논리 모델 MD3) — 속성 = 승인완료 표준용어, 주식별자(PK)·필수(NOT NULL) 지정, 관계 상속 속성 (2026-10-17 마스터 지시)
-- DA-APPROVED: 마스터 지시 2026-10-17 — 핵심 엔터티 등록 시 주식별자·필수속성 추천(반자동). 신규 1테이블(mdl_ 접두, 시스템 컬럼 4개 맨 끝, del_yn 논리삭제, ver_no 잠금, service_role 전용)
-- 규칙(DB 강제) : 엔터티 안 같은 용어 활성 1건, PK 는 필수(esntl_yn = Y), PK 일 때만 pk_seq, 엔터티 = 같은 분류체계 활성(트리거가 prj_id 채움)
-- 용어 승인완료 여부는 앱 검증(용어 상태가 바뀔 수 있어 등록 시점에만 검사). 시스템 컬럼(등록자ID 등)은 물리 단계에서 자동 추가하므로 속성으로 두지 않는다
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_attr (
  attr_id           UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 속성ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  prj_id            UUID         NOT NULL,                                 -- 프로젝트ID(엔터티에서 자동)
  ent_id            UUID         NOT NULL,                                 -- 엔터티ID
  term_id           UUID         NOT NULL,                                 -- 용어ID(승인완료 표준용어)
  attr_seq          INT          NOT NULL DEFAULT 1,                       -- 속성순서(표시, PK 먼저)
  pk_yn             CHAR(1)      NOT NULL DEFAULT 'N',                     -- 주식별자여부
  pk_seq            INT,                                                   -- 주식별자순서(PK 일 때만)
  esntl_yn          CHAR(1)      NOT NULL DEFAULT 'N',                     -- 필수여부(NOT NULL)
  fk_rel_id         UUID,                                                  -- 상속관계ID(부모 식별자를 받은 관계, 일반 속성은 NULL)
  attr_desc         TEXT,                                                  -- 속성설명
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_attr_pkey PRIMARY KEY (attr_id),
  CONSTRAINT mdl_attr_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_attr_mdl_prj_id_fkey FOREIGN KEY (prj_id) REFERENCES mdl_prj (prj_id),
  CONSTRAINT mdl_attr_mdl_ent_id_fkey FOREIGN KEY (ent_id) REFERENCES mdl_ent (ent_id),
  CONSTRAINT mdl_attr_std_term_id_fkey FOREIGN KEY (term_id) REFERENCES std_term (term_id),
  CONSTRAINT mdl_attr_mdl_rel_id_fkey FOREIGN KEY (fk_rel_id) REFERENCES mdl_rel (rel_id),
  CONSTRAINT mdl_attr_pk_yn_check CHECK (pk_yn IN ('Y','N')),
  CONSTRAINT mdl_attr_esntl_yn_check CHECK (esntl_yn IN ('Y','N')),
  CONSTRAINT mdl_attr_del_yn_check CHECK (del_yn IN ('Y','N')),
  CONSTRAINT mdl_attr_pk_esntl_check CHECK (pk_yn = 'N' OR esntl_yn = 'Y'),                 -- PK 는 필수
  CONSTRAINT mdl_attr_pk_seq_check CHECK ((pk_yn = 'Y') = (pk_seq IS NOT NULL))             -- PK 순서는 PK 일 때만
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_attr_ent_term_actv ON mdl_attr (ent_id, term_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS ix_mdl_attr_ent ON mdl_attr (ent_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS ix_mdl_attr_term ON mdl_attr (term_id) WHERE del_yn = 'N'; -- 용어 사용처(영향 분석 P23)
SELECT fn_add_mod_dtm_trg('mdl_attr'), fn_grant_svc_only('TABLE', 'mdl_attr');
COMMENT ON TABLE mdl_attr IS '엔터티 속성(논리 모델) — 속성 = 승인완료 표준용어, 주식별자·필수 지정, 관계 상속';

-- 엔터티 = 같은 분류체계·활성, 프로젝트는 엔터티에서 자동
CREATE OR REPLACE FUNCTION fn_set_mdl_attr_prj()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT prj_id INTO NEW.prj_id FROM mdl_ent WHERE ent_id = NEW.ent_id AND area_id = NEW.area_id AND del_yn = 'N';
  IF NEW.prj_id IS NULL THEN
    RAISE EXCEPTION 'mdl_attr_ent: 엔터티는 같은 분류체계의 활성 엔터티여야 함' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_attr_prj ON mdl_attr;
CREATE TRIGGER trg_mdl_attr_prj BEFORE INSERT OR UPDATE OF ent_id ON mdl_attr FOR EACH ROW EXECUTE FUNCTION fn_set_mdl_attr_prj();
SELECT fn_grant_svc_only('FUNCTION', 'fn_set_mdl_attr_prj()');

COMMIT;

NOTIFY pgrst, 'reload schema';
