-- 043_mdl_ddl_req_self_apv.sql : DDL 실행 본인 승인 — 데이터아키텍트가 1명뿐인 분류체계만(마스터 결정 2026-10-18 "DA 1명 영역만 본인 승인 허용")
-- DA-APPROVED: 마스터 결정 2026-10-18 — mdl_ddl_req 칼럼 1개(fn_add_cols_keep_sys), 038 '자기 승인 금지' CHECK 를 조건부로 교체. 약어 SELF(본인)·APV·RSN 표준단어 [확인중 : da-standards]
-- 규칙 : 승인자 = 요청자이면 ① 본인 승인 사유 필수(CHECK) ② 그 분류체계의 활성 DA 가 정확히 1명(트리거 — 앱을 거치지 않아도 막음). DA 가 2명 이상이면 다른 DA 승인(기존)
BEGIN;

ALTER TABLE mdl_ddl_req DISABLE TRIGGER USER; -- 칼럼 이동(행 재작성) 동안 스냅샷 보호·mod_dtm 트리거 정지
SELECT fn_add_cols_keep_sys('mdl_ddl_req', $c$
  ADD COLUMN self_apv_rsn TEXT$c$);
ALTER TABLE mdl_ddl_req ENABLE TRIGGER USER;
COMMENT ON COLUMN mdl_ddl_req.self_apv_rsn IS '본인승인사유 — DA 1명 분류체계에서 요청자가 직접 승인할 때 필수';

ALTER TABLE mdl_ddl_req DROP CONSTRAINT IF EXISTS mdl_ddl_req_self_apv_check;
ALTER TABLE mdl_ddl_req ADD CONSTRAINT mdl_ddl_req_self_apv_check CHECK (
  apv_usr_id IS NULL OR apv_usr_id <> req_usr_id OR length(btrim(coalesce(self_apv_rsn, ''))) >= 5
);

CREATE OR REPLACE FUNCTION fn_chk_mdl_ddl_req_self_apv()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_da INT;
BEGIN
  IF NEW.apv_usr_id IS NOT NULL AND NEW.apv_usr_id = NEW.req_usr_id AND NEW.apv_usr_id IS DISTINCT FROM OLD.apv_usr_id THEN
    SELECT count(*) INTO v_da FROM std_area_mbr m WHERE m.area_id = NEW.area_id AND m.mbr_role_cd = 'DA' AND m.del_yn = 'N';
    IF v_da <> 1 THEN
      RAISE EXCEPTION 'mdl_ddl_self_apv: 데이터아키텍트가 % 명인 분류체계는 다른 데이터아키텍트가 승인해야 합니다', v_da USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_ddl_req_self_apv ON mdl_ddl_req;
CREATE TRIGGER trg_mdl_ddl_req_self_apv BEFORE UPDATE ON mdl_ddl_req FOR EACH ROW EXECUTE FUNCTION fn_chk_mdl_ddl_req_self_apv();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_mdl_ddl_req_self_apv()');

COMMIT;

NOTIFY pgrst, 'reload schema';
