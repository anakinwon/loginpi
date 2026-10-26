-- 005_seminar_smn_cap_hold.sql — 유료 정원 점유 악용 차단(보안 검토 2026-10-27) + 칼럼 COMMENT 보강
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-26) — 함수 1개(fn_chk_smn_cap) 교체·칼럼 COMMENT 추가만, 테이블 구조 무변경. DA 사후 리뷰 대상
-- 선행 : 004_seminar_smnr.sql. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod
--
-- 문제(자동 보안 검토 MEDIUM) : 004 의 fn_chk_smn_cap 은 10분 안 APPROVED 결제를 "건수" 로 세어, 한 사용자가 승인 대기 결제를
--   여러 건 만들면 좌석 여러 개를 10분간 묶어 둘 수 있었다(정원 묶어두기). 본인 재시도의 이전 APPROVED 건도 본인 판정에 들어갔다.
-- 수정 :
--   · 같은 사용자가 이 세미나에 다른 APPROVED SMN_ENT 결제(10분 안)를 이미 갖고 있으면 ALREADY — 사용자당 점유 1개
--   · 점유는 "사람 수" count(DISTINCT usr_id) 로, 호출한 사용자 본인은 제외
--   · 10분 기준을 등록일시(reg_dtm)가 아니라 승인일시(apv_dtm)로
-- 표준단어 메모 : ENT(입장)는 schema.pi 의 ENT(엔터티, sitemap/schema.pi/sql/018)·행안부 '기업' 과 동음이의 — DA 사후 리뷰 때 대안(ETR) 함께 검토
BEGIN;

CREATE OR REPLACE FUNCTION fn_chk_smn_cap(p_smn_id UUID, p_usr_id UUID, p_pymnt_id TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_smn smn_mst%ROWTYPE;
  v_cnt INT;
  v_hld INT;
BEGIN
  SELECT * INTO v_smn FROM smn_mst s
   WHERE s.smn_id = p_smn_id AND s.del_yn = 'N'
   FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF v_smn.smn_sts_cd IN ('ENDED', 'CANCELED') THEN RETURN 'CLOSED'; END IF;
  IF EXISTS (SELECT 1 FROM smn_ptc p
              WHERE p.smn_id = p_smn_id AND p.usr_id = p_usr_id AND p.del_yn = 'N') THEN
    RETURN 'ALREADY';
  END IF;
  -- 사용자당 점유 1개 : 이번 결제 말고 이 세미나 진행 중 결제가 이미 있으면 새 점유를 만들지 않는다
  IF EXISTS (SELECT 1 FROM pi_pymnt y
              WHERE y.usr_id = p_usr_id AND y.pymnt_tp_cd = 'SMN_ENT' AND y.pymnt_sts_cd = 'APPROVED' AND y.del_yn = 'N'
                AND y.meta_val ->> 'smn_id' = p_smn_id::TEXT
                AND y.apv_dtm > CURRENT_TIMESTAMP - INTERVAL '10 minutes'
                AND y.pymnt_id IS DISTINCT FROM p_pymnt_id) THEN
    RETURN 'ALREADY';
  END IF;

  SELECT count(*) INTO v_cnt FROM smn_ptc p WHERE p.smn_id = p_smn_id AND p.del_yn = 'N';
  -- 진행 중 점유 = 다른 사람 수(사람당 1석)
  SELECT count(DISTINCT y.usr_id) INTO v_hld FROM pi_pymnt y
   WHERE y.pymnt_tp_cd = 'SMN_ENT' AND y.pymnt_sts_cd = 'APPROVED' AND y.del_yn = 'N'
     AND y.meta_val ->> 'smn_id' = p_smn_id::TEXT
     AND y.apv_dtm > CURRENT_TIMESTAMP - INTERVAL '10 minutes'
     AND y.usr_id <> p_usr_id;
  IF v_cnt + v_hld >= v_smn.max_cnt THEN RETURN 'FULL'; END IF;
  RETURN 'OK';
END;
$$;
COMMENT ON FUNCTION fn_chk_smn_cap(UUID, UUID, TEXT) IS '유료 입장 approve 단계 정원 확인 — 세미나 행 잠금, 사용자당 점유 1개(다른 진행 중 결제 있으면 ALREADY), 활성 참가 + 다른 사용자 수(10분 apv_dtm) vs 정원. OK·FULL·CLOSED·NOT_FOUND·ALREADY';

-- CREATE OR REPLACE 는 SET 설정을 지우므로 search_path 고정을 다시 건다(004 와 같은 방식)
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_chk_smn_cap(UUID, UUID, TEXT) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_smn_cap(UUID, UUID, TEXT)');

-- 칼럼 COMMENT(품질점검 P3 메타데이터)
COMMENT ON COLUMN smn_mst.smn_id IS '세미나ID(= 화상 룸 ID)';
COMMENT ON COLUMN smn_mst.hst_usr_id IS '개최자 사용자ID(sys_user.usr_id)';
COMMENT ON COLUMN smn_mst.smn_nm IS '세미나명';
COMMENT ON COLUMN smn_mst.start_dtm IS '시작일시(예정)';
COMMENT ON COLUMN smn_mst.end_dtm IS '종료일시(실제)';
COMMENT ON COLUMN smn_mst.cncl_dtm IS '취소일시';
COMMENT ON COLUMN smn_mst.max_cnt IS '정원(청중 상한, 1~100)';
COMMENT ON COLUMN smn_mst.ent_pi_amt IS '입장 Pi 금액(0 = 무료)';
COMMENT ON COLUMN smn_mst.smn_sts_cd IS '세미나상태코드 SCHEDULED·LIVE·ENDED·CANCELED';
COMMENT ON COLUMN smn_ptc.ptc_id IS '참가ID';
COMMENT ON COLUMN smn_ptc.smn_id IS '세미나ID(smn_mst)';
COMMENT ON COLUMN smn_ptc.usr_id IS '참가 사용자ID(sys_user)';
COMMENT ON COLUMN smn_ptc.pymnt_id IS '입장 결제ID(pi_pymnt, 무료 = NULL)';

COMMIT;
