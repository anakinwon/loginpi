-- 034_mdl_dgm_rel.sql : 다이어그램 관계선 배치(마스터 지시 2026-10-18 "ERD에서 관계선 위치를 조정할 수 있도록") — 029 mdl_dgm_ent 와 같은 원칙 : ERD 는 모델의 뷰, 선 모양만 저장
-- DA-APPROVED: 마스터 지시 2026-10-18 — 신규 1테이블(mdl_ 접두, 시스템 컬럼 4개 맨 끝, del_yn 논리삭제, service_role 전용), 029 선례(XCRD·YCRD) + 변(SIDE)·위치비율(PSTN_RT)
-- 약어 SIDE(변 : 박스의 위·오른쪽·아래·왼쪽) = 공통표준 미등재 사용자 정의 약어(메타 테이블 명명용, 029 DGM 과 같은 처리) [확인중 : DA 메타 단어 목록 등재]
-- 행 없음 = 자동(가까운 변, 같은 변의 선은 고르게 나눔, 꺾임은 가운데) — 사용자가 끝점·꺾임점을 옮긴 관계만 저장
-- 좌표는 마지막 저장 우선(029 와 같음)
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_dgm_rel (
  dgm_rel_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 다이어그램관계ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  dgm_id            UUID         NOT NULL,                                 -- 다이어그램ID
  rel_id            UUID         NOT NULL,                                 -- 관계ID
  prnt_side_cd      CHAR(1)      NOT NULL,                                 -- 부모변코드(T 위 / R 오른쪽 / B 아래 / L 왼쪽)
  prnt_pstn_rt      NUMERIC(4,3) NOT NULL DEFAULT 0.5,                     -- 부모위치비율(변 위 위치 0 ~ 1, 위·아래 변은 왼쪽부터·좌우 변은 위부터)
  chld_side_cd      CHAR(1)      NOT NULL,                                 -- 자식변코드
  chld_pstn_rt      NUMERIC(4,3) NOT NULL DEFAULT 0.5,                     -- 자식위치비율
  mid_xcrd          NUMERIC(10,1),                                         -- 꺾임X좌표(NULL = 가운데 자동)
  mid_ycrd          NUMERIC(10,1),                                         -- 꺾임Y좌표(NULL = 가운데 자동)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_dgm_rel_pkey PRIMARY KEY (dgm_rel_id),
  CONSTRAINT mdl_dgm_rel_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_dgm_rel_mdl_dgm_id_fkey FOREIGN KEY (dgm_id) REFERENCES mdl_dgm (dgm_id),
  CONSTRAINT mdl_dgm_rel_mdl_rel_id_fkey FOREIGN KEY (rel_id) REFERENCES mdl_rel (rel_id),
  CONSTRAINT mdl_dgm_rel_side_check CHECK (prnt_side_cd IN ('T','R','B','L') AND chld_side_cd IN ('T','R','B','L')),
  CONSTRAINT mdl_dgm_rel_rt_check CHECK (prnt_pstn_rt BETWEEN 0 AND 1 AND chld_pstn_rt BETWEEN 0 AND 1),
  CONSTRAINT mdl_dgm_rel_mid_check CHECK ((mid_xcrd IS NULL) = (mid_ycrd IS NULL)),
  CONSTRAINT mdl_dgm_rel_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_dgm_rel_dgm_rel_actv ON mdl_dgm_rel (dgm_id, rel_id) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_dgm_rel'), fn_grant_svc_only('TABLE', 'mdl_dgm_rel');
COMMENT ON TABLE mdl_dgm_rel IS '다이어그램 관계선 배치 — 끝점(변·위치비율)·꺾임점, 행 없음 = 자동';

-- 정합(DB 강제, 029 선례) : 관계 = 다이어그램과 같은 프로젝트의 활성 관계
CREATE OR REPLACE FUNCTION fn_chk_mdl_dgm_rel_src()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mdl_dgm d JOIN mdl_rel r ON r.rel_id = NEW.rel_id
                 WHERE d.dgm_id = NEW.dgm_id AND d.area_id = NEW.area_id AND r.prj_id = d.prj_id AND r.del_yn = 'N') THEN
    RAISE EXCEPTION 'mdl_dgm_rel: 관계는 다이어그램과 같은 프로젝트의 활성 관계여야 함' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_dgm_rel_src ON mdl_dgm_rel;
CREATE TRIGGER trg_mdl_dgm_rel_src BEFORE INSERT OR UPDATE OF dgm_id, rel_id, area_id ON mdl_dgm_rel FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_dgm_rel_src();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_dgm_rel_src()');

COMMIT;

NOTIFY pgrst, 'reload schema';
