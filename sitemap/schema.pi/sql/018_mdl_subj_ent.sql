-- 018_mdl_subj_ent.sql : 개념 모델 — 주제영역(2레벨·약어 3자) + 핵심 엔터티(표준단어 조합 이름) (PRD §2.5 MD1, 2026-10-16 마스터 지시)
-- 근거 : 데이터 모델링 가이드 문단 15~18(개념 = 주제영역 정의·핵심 엔터티), 정의서 §8.4(주제영역 2레벨·약어 3자, 엔터티명 = 주제영역 + 엔터티 정의 + [데이터 성격])
-- 엔터티 이름은 승인완료 표준단어 조합으로만 생성(구성 = dic_ids 순서 배열 : 물리 DELETE 없이 구성 교체), 끝 단어 엔터티 분류어면 테이블 접미어 적용
-- 신규 테이블 공통 : 논리 삭제·ver_no 잠금·시스템 컬럼 4개 맨 끝·mod_dtm 트리거·service_role 전용
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_subj (
  subj_id           UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 주제영역ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  up_subj_id        UUID,                                                  -- 상위주제영역ID(NULL = 1레벨, 2레벨까지)
  subj_nm           VARCHAR(100) NOT NULL,                                 -- 주제영역명(단수형 명사)
  subj_abbr_nm      CHAR(3)      NOT NULL,                                 -- 주제영역약어(영문 대문자 3자, 물리 테이블 접두 TB_ + 약어)
  subj_desc         TEXT,                                                  -- 주제영역설명
  sort_seq          INT          NOT NULL DEFAULT 1,                       -- 정렬순서
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호(낙관적 잠금)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_subj_pkey PRIMARY KEY (subj_id),
  CONSTRAINT mdl_subj_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_subj_up_subj_id_fkey FOREIGN KEY (up_subj_id) REFERENCES mdl_subj (subj_id),
  CONSTRAINT mdl_subj_abbr_check CHECK (subj_abbr_nm ~ '^[A-Z]{3}$'),
  CONSTRAINT mdl_subj_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_subj_area_nm_actv ON mdl_subj (area_id, coalesce(up_subj_id, '00000000-0000-0000-0000-000000000000'::UUID), subj_nm) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_subj_area_abbr_actv ON mdl_subj (area_id, subj_abbr_nm) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_subj'), fn_grant_svc_only('TABLE', 'mdl_subj');
COMMENT ON TABLE mdl_subj IS '주제영역(개념 모델, 2레벨)';

-- 2레벨 제한 : 상위는 1레벨(상위 없음)이어야 하고 같은 분류체계·활성
CREATE OR REPLACE FUNCTION fn_chk_mdl_subj_lvl()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.up_subj_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM mdl_subj p WHERE p.subj_id = NEW.up_subj_id AND p.area_id = NEW.area_id AND p.up_subj_id IS NULL AND p.del_yn = 'N'
  ) THEN
    RAISE EXCEPTION 'mdl_subj_lvl: 상위 주제영역은 같은 분류체계의 1레벨이어야 함(2레벨까지)' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_subj_lvl ON mdl_subj;
CREATE TRIGGER trg_mdl_subj_lvl BEFORE INSERT OR UPDATE OF up_subj_id ON mdl_subj FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_subj_lvl();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_subj_lvl()');

CREATE TABLE IF NOT EXISTS mdl_ent (
  ent_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 엔터티ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  subj_id           UUID         NOT NULL,                                 -- 주제영역ID
  ent_log_nm        VARCHAR(200) NOT NULL,                                 -- 엔터티논리명(표준단어 결합)
  ent_tp_cd         VARCHAR(10)  NOT NULL DEFAULT 'BASE',                  -- 엔터티유형코드 : BASE 실체·기준 / ACT 행위 / AGG 집계(정의서 §8.4)
  ent_desc          TEXT,                                                  -- 엔터티설명(관리 데이터 정의)
  dic_ids           UUID[]       NOT NULL,                                 -- 구성단어ID(순서, 승인완료 표준단어만 : 서버 검증)
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_ent_pkey PRIMARY KEY (ent_id),
  CONSTRAINT mdl_ent_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_ent_mdl_subj_id_fkey FOREIGN KEY (subj_id) REFERENCES mdl_subj (subj_id),
  CONSTRAINT mdl_ent_tp_check CHECK (ent_tp_cd IN ('BASE','ACT','AGG')),
  CONSTRAINT mdl_ent_dic_ids_check CHECK (cardinality(dic_ids) BETWEEN 1 AND 20),
  CONSTRAINT mdl_ent_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_ent_area_nm_actv ON mdl_ent (area_id, ent_log_nm) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS ix_mdl_ent_subj ON mdl_ent (subj_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS ix_mdl_ent_dic_ids ON mdl_ent USING GIN (dic_ids); -- 단어 사용처 조회(이름 변경·삭제 잠금)
SELECT fn_add_mod_dtm_trg('mdl_ent'), fn_grant_svc_only('TABLE', 'mdl_ent');
COMMENT ON TABLE mdl_ent IS '핵심 엔터티(개념 모델, 이름 = 표준단어 조합)';

COMMIT;

NOTIFY pgrst, 'reload schema';
