-- 044_mdl_ddl_req_sole_da.sql : DDL 본인 승인 보강(자동 보안 검토 2026-10-18 — DA 수 조작으로 2인 통제 우회)
-- DA-APPROVED: 마스터 결정 2026-10-18 'DA 1명 영역만 본인 승인' 의 보안 보강 — mdl_ddl_req 칼럼 1개(fn_add_cols_keep_sys), 약어 SOLE(단독) 표준단어 [확인중 : da-standards]
-- ① 요청 시점 단독 DA 여부(sole_da_yn)를 DB 가 계산해 저장(앱 값 무시)·이후 수정 불가
-- ② 본인 승인 = 요청 시점 단독 DA + 지금도 활성 DA 정확히 1명 + 그 DA 가 승인자(멤버 행 FOR SHARE 잠금)
-- ③ 대기·승인·실행중 DDL 요청이 있는 분류체계는 DA 강등·제외 거부 — 요청 뒤 다른 DA 를 빼고 본인 승인하는 경로 차단(요청 전 변경은 멤버 변경 이력에 남음)
BEGIN;

ALTER TABLE mdl_ddl_req DISABLE TRIGGER USER;
SELECT fn_add_cols_keep_sys('mdl_ddl_req', $c$
  ADD COLUMN sole_da_yn CHAR(1) NOT NULL DEFAULT 'N'$c$);
-- 기존 대기 요청 : 지금 요청자가 그 분류체계의 단독 DA 이면 Y(043 배포 직후 대기 1건 대상)
UPDATE mdl_ddl_req r SET sole_da_yn = 'Y'
 WHERE r.req_sts_cd = 'REQ' AND r.del_yn = 'N'
   AND (SELECT count(*) FROM std_area_mbr m WHERE m.area_id = r.area_id AND m.mbr_role_cd = 'DA' AND m.del_yn = 'N') = 1
   AND EXISTS (SELECT 1 FROM std_area_mbr m WHERE m.area_id = r.area_id AND m.usr_id::text = r.req_usr_id AND m.mbr_role_cd = 'DA' AND m.del_yn = 'N');
ALTER TABLE mdl_ddl_req ENABLE TRIGGER USER;
ALTER TABLE mdl_ddl_req ADD CONSTRAINT mdl_ddl_req_sole_da_yn_check CHECK (sole_da_yn IN ('Y','N'));
COMMENT ON COLUMN mdl_ddl_req.sole_da_yn IS '단독DA여부 — 요청 시점에 요청자가 분류체계의 유일한 DA 였는지(DB 계산, 수정 불가)';

-- ① 요청 시점 계산(INSERT)
CREATE OR REPLACE FUNCTION fn_set_mdl_ddl_req_sole_da()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.sole_da_yn := CASE WHEN (SELECT count(*) FROM std_area_mbr m WHERE m.area_id = NEW.area_id AND m.mbr_role_cd = 'DA' AND m.del_yn = 'N') = 1
                          AND EXISTS (SELECT 1 FROM std_area_mbr m WHERE m.area_id = NEW.area_id AND m.usr_id::text = NEW.req_usr_id AND m.mbr_role_cd = 'DA' AND m.del_yn = 'N')
                         THEN 'Y' ELSE 'N' END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mdl_ddl_req_sole_da ON mdl_ddl_req;
CREATE TRIGGER trg_mdl_ddl_req_sole_da BEFORE INSERT ON mdl_ddl_req FOR EACH ROW EXECUTE FUNCTION fn_set_mdl_ddl_req_sole_da();
SELECT fn_grant_svc_only('FUNCTION', 'fn_set_mdl_ddl_req_sole_da()');

-- 스냅샷 보호에 sole_da_yn 추가(038 함수 교체)
CREATE OR REPLACE FUNCTION fn_chk_mdl_ddl_req_fix()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.ddl_txt, NEW.ddl_hash, NEW.stmt_cnt, NEW.tbl_ids, NEW.conn_id, NEW.conn_fp, NEW.dbms_cd, NEW.exec_mthd_cd, NEW.req_usr_id, NEW.area_id, NEW.prj_id, NEW.phy_mdl_id, NEW.sole_da_yn)
     IS DISTINCT FROM (OLD.ddl_txt, OLD.ddl_hash, OLD.stmt_cnt, OLD.tbl_ids, OLD.conn_id, OLD.conn_fp, OLD.dbms_cd, OLD.exec_mthd_cd, OLD.req_usr_id, OLD.area_id, OLD.prj_id, OLD.phy_mdl_id, OLD.sole_da_yn) THEN
    RAISE EXCEPTION 'mdl_ddl_req_fixed: 실행 요청의 DDL·대상·요청자는 바꿀 수 없습니다(새로 요청)' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- ② 본인 승인 조건(043 함수 교체)
CREATE OR REPLACE FUNCTION fn_chk_mdl_ddl_req_self_apv()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_da INT;
BEGIN
  IF NEW.apv_usr_id IS NOT NULL AND NEW.apv_usr_id = NEW.req_usr_id AND NEW.apv_usr_id IS DISTINCT FROM OLD.apv_usr_id THEN
    PERFORM 1 FROM std_area_mbr m WHERE m.area_id = NEW.area_id AND m.del_yn = 'N' FOR SHARE; -- 판정 동안 멤버 변경 대기
    SELECT count(*) INTO v_da FROM std_area_mbr m WHERE m.area_id = NEW.area_id AND m.mbr_role_cd = 'DA' AND m.del_yn = 'N';
    IF NEW.sole_da_yn <> 'Y' OR v_da <> 1
       OR NOT EXISTS (SELECT 1 FROM std_area_mbr m WHERE m.area_id = NEW.area_id AND m.usr_id::text = NEW.apv_usr_id AND m.mbr_role_cd = 'DA' AND m.del_yn = 'N') THEN
      RAISE EXCEPTION 'mdl_ddl_self_apv: 본인 승인은 요청 때부터 유일한 데이터아키텍트인 경우만(현재 DA % 명)', v_da USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ③ 처리 중 DDL 요청이 있으면 DA 강등·제외 거부
CREATE OR REPLACE FUNCTION fn_chk_std_area_mbr_da_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.mbr_role_cd = 'DA' AND OLD.del_yn = 'N'
     AND (TG_OP = 'DELETE' OR NEW.mbr_role_cd <> 'DA' OR NEW.del_yn <> 'N')
     AND EXISTS (SELECT 1 FROM mdl_ddl_req r WHERE r.area_id = OLD.area_id AND r.del_yn = 'N' AND r.req_sts_cd IN ('REQ','APV','RUN')) THEN
    RAISE EXCEPTION 'std_area_mbr_da_locked: 처리 중인 DDL 실행 요청이 있어 데이터아키텍트를 바꿀 수 없습니다(요청 처리·취소 후)' USING ERRCODE = 'MDB02';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_std_area_mbr_da_lock ON std_area_mbr;
CREATE TRIGGER trg_std_area_mbr_da_lock BEFORE UPDATE OR DELETE ON std_area_mbr FOR EACH ROW EXECUTE FUNCTION fn_chk_std_area_mbr_da_lock();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_std_area_mbr_da_lock()');

COMMIT;

NOTIFY pgrst, 'reload schema';
