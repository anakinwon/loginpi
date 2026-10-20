-- 065_mdl_ver.sql : 모델 버전 스냅샷(PRD_PiErd S5 ERD-4, 마스터 지시 2026-10-20) — 프로젝트 논리 모델(엔터티·속성·관계)을 그 시점 그대로 JSONB 로 저장, 두 버전(또는 버전 ↔ 현재) diff 의 기준
-- DA-APPROVED: 마스터 지시 2026-10-20 — 신규 1테이블(mdl_ 접두, 시스템 컬럼 4개 맨 끝, del_yn 논리삭제, service_role 전용), 약어 VER(버전)·SEQ(순번)·SNAP(스냅샷)·VAL(값, 감사 bfr_val/aftr_val 관례)·CNT(건수)
-- 스냅샷은 저장 후 바꾸지 않는다(ver_no 잠금 없음 — 이름·설명 수정 없음, 잘못 저장하면 삭제 후 다시 저장). 순번 = 프로젝트 안 1부터(삭제해도 재사용 안 함 : 최대값 + 1, 동시 저장은 유일 인덱스가 막음)
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_ver (
  ver_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 버전ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  prj_id            UUID         NOT NULL,                                 -- 프로젝트ID
  ver_seq           INT          NOT NULL,                                 -- 버전순번(프로젝트 안 1부터)
  ver_nm            VARCHAR(100) NOT NULL,                                 -- 버전명
  ver_desc          TEXT,                                                  -- 버전설명
  snap_val          JSONB        NOT NULL,                                 -- 스냅샷값({ ents, rels } — 엔터티·속성·관계)
  ent_cnt           INT          NOT NULL DEFAULT 0,                       -- 엔터티건수
  attr_cnt          INT          NOT NULL DEFAULT 0,                       -- 속성건수
  rel_cnt           INT          NOT NULL DEFAULT 0,                       -- 관계건수
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_ver_pkey PRIMARY KEY (ver_id),
  CONSTRAINT mdl_ver_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_ver_mdl_prj_id_fkey FOREIGN KEY (prj_id) REFERENCES mdl_prj (prj_id),
  CONSTRAINT mdl_ver_seq_check CHECK (ver_seq >= 1),
  CONSTRAINT mdl_ver_del_yn_check CHECK (del_yn IN ('Y','N'))
);
-- 순번은 삭제 행 포함 유일(삭제 후에도 같은 번호 재사용 금지 — "v3" 가 두 개 생기지 않게)
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_ver_prj_seq ON mdl_ver (prj_id, ver_seq);
SELECT fn_add_mod_dtm_trg('mdl_ver'), fn_grant_svc_only('TABLE', 'mdl_ver');
COMMENT ON TABLE mdl_ver IS '모델 버전 — 프로젝트 논리 모델(엔터티·속성·관계) 스냅샷, 두 버전 비교(diff) 기준';
COMMENT ON COLUMN mdl_ver.ver_id IS '버전ID';
COMMENT ON COLUMN mdl_ver.area_id IS '분류체계ID';
COMMENT ON COLUMN mdl_ver.prj_id IS '프로젝트ID';
COMMENT ON COLUMN mdl_ver.ver_seq IS '버전순번(프로젝트 안 1부터, 삭제 후에도 재사용 안 함)';
COMMENT ON COLUMN mdl_ver.ver_nm IS '버전명';
COMMENT ON COLUMN mdl_ver.ver_desc IS '버전설명';
COMMENT ON COLUMN mdl_ver.snap_val IS '스냅샷값({ ents, rels } — 저장 시점 엔터티·속성·관계, 저장 후 불변)';
COMMENT ON COLUMN mdl_ver.ent_cnt IS '엔터티건수';
COMMENT ON COLUMN mdl_ver.attr_cnt IS '속성건수';
COMMENT ON COLUMN mdl_ver.rel_cnt IS '관계건수';
COMMENT ON COLUMN mdl_ver.del_yn IS '삭제여부';
COMMENT ON COLUMN mdl_ver.del_dtm IS '삭제일시';
COMMENT ON COLUMN mdl_ver.regr_id IS '등록자ID';
COMMENT ON COLUMN mdl_ver.reg_dtm IS '등록일시';
COMMENT ON COLUMN mdl_ver.modr_id IS '변경자ID';
COMMENT ON COLUMN mdl_ver.mod_dtm IS '변경일시';

COMMIT;

NOTIFY pgrst, 'reload schema';
