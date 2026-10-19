-- 048_role_matrix.sql : 역할 권한표 개편(마스터 표 2026-10-18) — 승인권자 = 시스템담당자(SYS)·데이터아키텍트(DA), 역할 설명 갱신
-- DA-APPROVED: 마스터 결정 2026-10-18 '권한·요금제 표(● 정본)' — 칼럼·테이블 변경 없음(공통코드 설명·함수 본문만). sole_da_yn 칼럼명은 유지하고 뜻을 '단독 승인권자'로 넓힘
-- ① std_cmn_cd MBR_ROLE 설명 = src/lib/roles.ts ROLE_DESC 와 같게
-- ② DDL 본인 승인(043·044) : '단독 DA' → '단독 승인권자(SYS·DA)' — 요청 시점 계산·승인 시점 재확인·처리 중 승인권자 변경 거부 모두
BEGIN;

UPDATE std_cmn_cd SET cd_desc = v.d, modr_id = 'MIGR'
  FROM (VALUES
    ('SYS',    '분류체계 설정·도메인그룹·약어·멤버 관리, 신청·승인(즉시 승인 포함), 일괄등록, SQL 쓰기, 모든 메뉴'),
    ('DA',     '표준 정책 총괄 : 단어·도메인·용어 신청·승인(신청 시 즉시 승인 선택 가능), 일괄등록, 설정·멤버 관리, SQL 쓰기, 모든 메뉴'),
    ('STD',    '단어·도메인·용어 신청, 일괄등록, 설정, SQL 쓰기, 모든 메뉴(승인권 없음)'),
    ('MDL',    '단어·도메인·용어·모델 등록·수정·삭제 신청, 일괄등록, 설정, SQL 쓰기, 모든 메뉴(승인권 없음)'),
    ('QLT',    '신청·SQL 쓰기, SQL 편집기·모델링·설정 메뉴(품질 진단 기능은 향후 단계)'),
    ('MIG',    '신청·SQL 쓰기, SQL 편집기 메뉴(이행 매핑용)'),
    ('VIEWER', '표준사전 조회만')
  ) AS v(c, d)
 WHERE grp_cd = 'MBR_ROLE' AND cd = v.c;

COMMENT ON COLUMN mdl_ddl_req.sole_da_yn IS '단독승인권자여부 — 요청 시점에 요청자가 분류체계의 유일한 승인권자(SYS·DA)였는지(DB 계산, 수정 불가)';

CREATE OR REPLACE FUNCTION fn_set_mdl_ddl_req_sole_da()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.sole_da_yn := CASE WHEN (SELECT count(*) FROM std_area_mbr m WHERE m.area_id = NEW.area_id AND m.mbr_role_cd IN ('SYS','DA') AND m.del_yn = 'N') = 1
                          AND EXISTS (SELECT 1 FROM std_area_mbr m WHERE m.area_id = NEW.area_id AND m.usr_id::text = NEW.req_usr_id AND m.mbr_role_cd IN ('SYS','DA') AND m.del_yn = 'N')
                         THEN 'Y' ELSE 'N' END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_chk_mdl_ddl_req_self_apv()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_da INT;
BEGIN
  IF NEW.apv_usr_id IS NOT NULL AND NEW.apv_usr_id = NEW.req_usr_id AND NEW.apv_usr_id IS DISTINCT FROM OLD.apv_usr_id THEN
    PERFORM 1 FROM std_area_mbr m WHERE m.area_id = NEW.area_id AND m.del_yn = 'N' FOR SHARE; -- 판정 동안 멤버 변경 대기
    SELECT count(*) INTO v_da FROM std_area_mbr m WHERE m.area_id = NEW.area_id AND m.mbr_role_cd IN ('SYS','DA') AND m.del_yn = 'N';
    IF NEW.sole_da_yn <> 'Y' OR v_da <> 1
       OR NOT EXISTS (SELECT 1 FROM std_area_mbr m WHERE m.area_id = NEW.area_id AND m.usr_id::text = NEW.apv_usr_id AND m.mbr_role_cd IN ('SYS','DA') AND m.del_yn = 'N') THEN
      RAISE EXCEPTION 'mdl_ddl_self_apv: 본인 승인은 요청 때부터 유일한 승인권자(시스템담당자·데이터아키텍트)인 경우만(현재 % 명)', v_da USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_chk_std_area_mbr_da_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.mbr_role_cd IN ('SYS','DA') AND OLD.del_yn = 'N'
     AND (TG_OP = 'DELETE' OR NEW.mbr_role_cd NOT IN ('SYS','DA') OR NEW.del_yn <> 'N')
     AND EXISTS (SELECT 1 FROM mdl_ddl_req r WHERE r.area_id = OLD.area_id AND r.del_yn = 'N' AND r.req_sts_cd IN ('REQ','APV','RUN')) THEN
    RAISE EXCEPTION 'std_area_mbr_da_locked: 처리 중인 DDL 실행 요청이 있어 승인권자(시스템담당자·데이터아키텍트)를 바꿀 수 없습니다(요청 처리·취소 후)' USING ERRCODE = 'MDB02';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
