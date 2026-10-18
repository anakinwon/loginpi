-- 037_mdl_dgm_sts.sql : ERD 작성완료(마스터 지시 2026-10-18 "ERD완성 기능") — 엔터티 작성완료 → 테이블 작성완료 → ERD 작성완료 → DDL
-- DA-APPROVED: 마스터 지시 2026-10-18 — mdl_dgm 칼럼 2개(fn_add_cols_keep_sys), 032 선례 표준단어 다이어그램 DGM·상태 STS·완료 CMPTN·일시 DTM, 값 WRT 작성중 / CMPTN 작성완료
-- 완료 = 다이어그램 배치(mdl_dgm_ent 좌표·고정)·관계선(mdl_dgm_rel) 편집 잠금, 수정은 완료 취소 후(032 와 같은 MLK01 → API 409 SUBJ_LOCKED)
-- DDL 대상 = 주제영역의 완료 다이어그램 mdl_dgm_ent 엔터티(완료 시점 배치 = 스냅샷) ∩ 물리 모델별 테이블 작성완료. 관문(배치 저장·테이블 1개 이상 등)은 앱(model-stage setDgm)
-- 주의 : 이후 mdl_dgm·mdl_dgm_ent·mdl_dgm_rel 에 칼럼을 추가할 때는 잠금 트리거를 칼럼 이동 동안만 정지(DISABLE TRIGGER USER, 035·036 교훈)
BEGIN;

-- 칼럼 추가를 잠금 트리거 생성보다 먼저(행 재작성), 기존 사용자 트리거도 이동 동안만 정지
ALTER TABLE mdl_dgm DISABLE TRIGGER USER;
SELECT fn_add_cols_keep_sys('mdl_dgm', $c$
  ADD COLUMN dgm_sts_cd VARCHAR(10) NOT NULL DEFAULT 'WRT',
  ADD COLUMN dgm_cmptn_dtm TIMESTAMPTZ$c$);
ALTER TABLE mdl_dgm ENABLE TRIGGER USER;
ALTER TABLE mdl_dgm ADD CONSTRAINT mdl_dgm_sts_cd_check CHECK (dgm_sts_cd IN ('WRT','CMPTN'));
ALTER TABLE mdl_dgm ADD CONSTRAINT mdl_dgm_cmptn_check CHECK ((dgm_sts_cd = 'CMPTN') = (dgm_cmptn_dtm IS NOT NULL));
COMMENT ON COLUMN mdl_dgm.dgm_sts_cd IS '다이어그램상태코드 — WRT 작성중 / CMPTN ERD 작성완료(배치·관계선 잠금, DDL 대상)';
COMMENT ON COLUMN mdl_dgm.dgm_cmptn_dtm IS '다이어그램완료일시';

-- 잠금 : 완료 다이어그램 자체(상태 전이만 허용)·배치·관계선
CREATE OR REPLACE FUNCTION fn_chk_mdl_dgm_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_hit BOOLEAN := FALSE;
BEGIN
  IF TG_TABLE_NAME = 'mdl_dgm' THEN
    -- 완료 상태 유지 중 변경·삭제 거부, 상태 전이(완료·취소) 때는 상태 칼럼 외 변경 거부
    v_hit := (TG_OP = 'DELETE' AND OLD.dgm_sts_cd = 'CMPTN')
      OR (TG_OP = 'UPDATE' AND OLD.dgm_sts_cd = 'CMPTN' AND NEW.dgm_sts_cd = 'CMPTN')
      OR (TG_OP = 'UPDATE' AND OLD.dgm_sts_cd <> NEW.dgm_sts_cd
          AND (to_jsonb(NEW) - ARRAY['dgm_sts_cd','dgm_cmptn_dtm','ver_no','mod_dtm','modr_id']) <> (to_jsonb(OLD) - ARRAY['dgm_sts_cd','dgm_cmptn_dtm','ver_no','mod_dtm','modr_id']));
  ELSE -- mdl_dgm_ent · mdl_dgm_rel : 소속 다이어그램(이전·이후)이 완료면 거부
    SELECT EXISTS (SELECT 1 FROM mdl_dgm d WHERE d.dgm_sts_cd = 'CMPTN' AND d.dgm_id IN (
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.dgm_id END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.dgm_id END)) INTO v_hit;
  END IF;
  IF v_hit THEN
    RAISE EXCEPTION 'mdl_subj_locked: 작성완료 ERD 는 편집할 수 없습니다(ERD 완료 취소 후 편집)' USING ERRCODE = 'MLK01';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_dgm_sts_lock ON mdl_dgm;
CREATE TRIGGER trg_mdl_dgm_sts_lock BEFORE UPDATE OR DELETE ON mdl_dgm FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_dgm_lock();
DROP TRIGGER IF EXISTS trg_mdl_dgm_ent_sts_lock ON mdl_dgm_ent;
CREATE TRIGGER trg_mdl_dgm_ent_sts_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_dgm_ent FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_dgm_lock();
DROP TRIGGER IF EXISTS trg_mdl_dgm_rel_sts_lock ON mdl_dgm_rel;
CREATE TRIGGER trg_mdl_dgm_rel_sts_lock BEFORE INSERT OR UPDATE OR DELETE ON mdl_dgm_rel FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_dgm_lock();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_dgm_lock()');

COMMIT;

NOTIFY pgrst, 'reload schema';
