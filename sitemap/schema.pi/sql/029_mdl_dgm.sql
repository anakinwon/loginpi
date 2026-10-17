-- 029_mdl_dgm.sql : 다이어그램·엔터티 배치(PRD_PiErd S3 E2, 마스터 결정 3 = 소속과 표시 분리) — ERD 는 모델의 뷰, 좌표·고정·순서만 저장
-- DA-APPROVED: 마스터 결정 2026-10-17(PRD_PiErd §4 결정 3·§6, MASTER_ROADMAP ERD-2 mdl_ent_pos 대체) — 신규 2테이블(mdl_ 접두, 시스템 컬럼 4개 맨 끝, del_yn 논리삭제, service_role 전용), 표준단어 XCRD·YCRD·FIX·SORT·SEQ
-- DA 조건부 승인 반영(da-governance-expert) : mdl_lvl_cd 도메인 VARCHAR(4) 통일, 프로젝트 활성·분류체계 일치 트리거 검사, 정렬순번 주석
-- 약어 DGM(다이어그램) = 공통표준 미등재 사용자 정의 약어(메타 테이블 명명용 — 업무 표준사전 std_dic 은 분류체계 데이터라 등재 대상 아님) [확인중 : DA 메타 단어 목록 등재]
-- 다이어그램 = 프로젝트 × 주제영역(NULL = 프로젝트 전체) × 모델단계(CNCP 개념 / LGCL 논리 / PHY 물리) 활성 1건
-- 배치 행은 엔터티를 소유하지 않는다 : 다른 주제영역 엔터티를 놓으면 화면에서 "참조"로 표시(엔터티 주제영역 ≠ 다이어그램 주제영역)
-- 좌표는 마지막 저장 우선(ver_no 없음) — ponytail: 동시 편집 충돌이 문제 되면 다이어그램 ver_no 로 묶어 잠금
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_dgm (
  dgm_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 다이어그램ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  prj_id            UUID         NOT NULL,                                 -- 프로젝트ID
  subj_id           UUID,                                                  -- 주제영역ID(NULL = 프로젝트 전체)
  mdl_lvl_cd        VARCHAR(4)   NOT NULL DEFAULT 'LGCL',                  -- 모델단계코드(공통 값 영역 CNCP 개념 / LGCL 논리 / PHY 물리, mdl_ent 는 CNCP·LGCL 만)
  dgm_nm            VARCHAR(100) NOT NULL,                                 -- 다이어그램명
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_dgm_pkey PRIMARY KEY (dgm_id),
  CONSTRAINT mdl_dgm_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_dgm_mdl_prj_id_fkey FOREIGN KEY (prj_id) REFERENCES mdl_prj (prj_id),
  CONSTRAINT mdl_dgm_mdl_subj_id_fkey FOREIGN KEY (subj_id) REFERENCES mdl_subj (subj_id),
  CONSTRAINT mdl_dgm_mdl_lvl_cd_check CHECK (mdl_lvl_cd IN ('CNCP','LGCL','PHY')),
  CONSTRAINT mdl_dgm_del_yn_check CHECK (del_yn IN ('Y','N'))
);
-- 주제영역 NULL 도 1건만 : 고정 UUID 로 대체해 유일 판정
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_dgm_prj_subj_lvl_actv ON mdl_dgm (prj_id, COALESCE(subj_id, '00000000-0000-0000-0000-000000000000'::uuid), mdl_lvl_cd) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_dgm'), fn_grant_svc_only('TABLE', 'mdl_dgm');
COMMENT ON TABLE mdl_dgm IS '다이어그램 — 프로젝트 × 주제영역(NULL 전체) × 모델단계 활성 1건, ERD 뷰 단위';

CREATE TABLE IF NOT EXISTS mdl_dgm_ent (
  dgm_ent_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 다이어그램엔터티ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  dgm_id            UUID         NOT NULL,                                 -- 다이어그램ID
  ent_id            UUID         NOT NULL,                                 -- 엔터티ID
  xcrd              NUMERIC(10,1) NOT NULL DEFAULT 0,                      -- X좌표(캔버스 픽셀)
  ycrd              NUMERIC(10,1) NOT NULL DEFAULT 0,                      -- Y좌표(캔버스 픽셀)
  fix_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 고정여부(Y = 자동 배치가 옮기지 않음)
  sort_seq          INT          NOT NULL DEFAULT 1,                       -- 정렬순번(겹칠 때 앞뒤)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_dgm_ent_pkey PRIMARY KEY (dgm_ent_id),
  CONSTRAINT mdl_dgm_ent_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_dgm_ent_mdl_dgm_id_fkey FOREIGN KEY (dgm_id) REFERENCES mdl_dgm (dgm_id),
  CONSTRAINT mdl_dgm_ent_mdl_ent_id_fkey FOREIGN KEY (ent_id) REFERENCES mdl_ent (ent_id),
  CONSTRAINT mdl_dgm_ent_yn_check CHECK (fix_yn IN ('Y','N') AND del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_dgm_ent_dgm_ent_actv ON mdl_dgm_ent (dgm_id, ent_id) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_dgm_ent'), fn_grant_svc_only('TABLE', 'mdl_dgm_ent');
COMMENT ON COLUMN mdl_dgm.mdl_lvl_cd IS '모델단계코드 — 공통 값 영역 CNCP/LGCL/PHY(mdl_ent.mdl_lvl_cd 는 CNCP/LGCL 부분집합)';
COMMENT ON TABLE mdl_dgm_ent IS '다이어그램 엔터티 배치 — 좌표·고정·순서(엔터티 소속과 별개, 다른 주제영역 엔터티 = 참조)';

-- 정합(DB 강제, 028 선례) : 주제영역 = 다이어그램 프로젝트 소속, 배치 엔터티 = 같은 프로젝트 활성
CREATE OR REPLACE FUNCTION fn_chk_mdl_dgm_src()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'mdl_dgm' THEN
    SELECT EXISTS (SELECT 1 FROM mdl_prj p WHERE p.prj_id = NEW.prj_id AND p.area_id = NEW.area_id AND p.del_yn = 'N')
       AND (NEW.subj_id IS NULL OR EXISTS (SELECT 1 FROM mdl_subj s WHERE s.subj_id = NEW.subj_id AND s.prj_id = NEW.prj_id AND s.area_id = NEW.area_id AND s.del_yn = 'N')) INTO v_ok;
  ELSE
    SELECT EXISTS (SELECT 1 FROM mdl_dgm d JOIN mdl_ent e ON e.ent_id = NEW.ent_id
                   WHERE d.dgm_id = NEW.dgm_id AND d.area_id = NEW.area_id AND e.prj_id = d.prj_id AND e.del_yn = 'N') INTO v_ok;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION '%: 프로젝트(같은 분류체계·활성)·주제영역·엔터티는 다이어그램과 같은 프로젝트의 활성 행이어야 함', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_dgm_src ON mdl_dgm;
CREATE TRIGGER trg_mdl_dgm_src BEFORE INSERT OR UPDATE OF prj_id, subj_id, area_id ON mdl_dgm FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_dgm_src();
DROP TRIGGER IF EXISTS trg_mdl_dgm_ent_src ON mdl_dgm_ent;
CREATE TRIGGER trg_mdl_dgm_ent_src BEFORE INSERT OR UPDATE OF dgm_id, ent_id, area_id ON mdl_dgm_ent FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_dgm_src();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_dgm_src()');

COMMIT;

NOTIFY pgrst, 'reload schema';
