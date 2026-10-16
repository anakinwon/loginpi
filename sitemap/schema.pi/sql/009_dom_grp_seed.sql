-- 009_dom_grp_seed.sql : 도메인그룹 기본값 — 행안부 공통표준도메인(2025-11-01) 그룹 8종을 분류체계별로 등록하는 함수 + 기존 활성 분류체계 일괄 적용
-- 근거 : loginpi docs/da/references 02.02 공통표준도메인 CSV '공통표준도메인그룹명'(129행 전부 지정, 8종). 도메인그룹 필수화(2026-10-15 마스터 결정 B)
-- 재실행 가능 : 같은 분류체계에 같은 이름의 활성 그룹이 있으면 건너뜀
BEGIN;

CREATE OR REPLACE FUNCTION fn_seed_std_dom_grp(p_area_id UUID, p_usr_id TEXT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_cnt INT;
BEGIN
  INSERT INTO std_dom_grp (area_id, dom_grp_nm, dom_grp_desc, regr_id, modr_id)
  SELECT p_area_id, g.nm, g.dsc, p_usr_id, p_usr_id
  FROM (VALUES
    ('번호',      '행안부 공통표준도메인 그룹 : 번호·일련번호·등록번호류'),
    ('수량',      '행안부 공통표준도메인 그룹 : 수·순서·면적·좌표'),
    ('명칭',      '행안부 공통표준도메인 그룹 : 명·주소'),
    ('금액',      '행안부 공통표준도메인 그룹 : 금액·가격·비용·요금'),
    ('코드',      '행안부 공통표준도메인 그룹 : 코드·여부·유무'),
    ('날짜/시간', '행안부 공통표준도메인 그룹 : 연월일·일시·연도·연월'),
    ('율',        '행안부 공통표준도메인 그룹 : 율'),
    ('내용',      '행안부 공통표준도메인 그룹 : 내용')
  ) AS g(nm, dsc)
  WHERE NOT EXISTS (
    SELECT 1 FROM std_dom_grp x WHERE x.area_id = p_area_id AND x.dom_grp_nm = g.nm AND x.del_yn = 'N'
  );
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RETURN v_cnt;
END;
$$;

SELECT fn_grant_svc_only('FUNCTION', 'fn_seed_std_dom_grp(uuid, text)');

-- 기존 활성 분류체계 일괄 적용
SELECT fn_seed_std_dom_grp(area_id, 'SEED_MOIS') FROM std_area WHERE del_yn = 'N';

COMMIT;

NOTIFY pgrst, 'reload schema';
