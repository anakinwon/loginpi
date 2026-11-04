-- 022_sitemap_site_ship_hauler.sql — 워프 우주선 부가서비스 기체 1종 추가 : HAULER(원반 화물선, 자체 디자인 — 마스터 지시 2026-11-04). 020 의 코드 검증 3곳(ship_cd CHECK · fn_cmpl_site_reg_pymnt · fn_cmpl_site_ship_pymnt)에 값만 추가
-- DA-APPROVED: 마스터 지시 2026-11-04 우주선 기체 추가 — 020 구조 그대로(새 컬럼·테이블·인덱스 0), CHECK 코드값 1개 추가 + 020 RPC 2종 본문 동일 재정의(목록에 'HAULER' 만 추가). 단가는 020 SHIP_<plan> 공통 단가(1종 선택) 그대로라 fee_plan 변경 없음. 물리 DELETE 없음
--   앱 단일 소스 SHIP_CD(src/lib/ship.ts)와 4곳 동시 갱신(020 머리 주석 ⚠ 규칙)
-- 선행 : 020·021. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg(운영 = stg 스키마) — ⚠ 앱 배포 전에 적용(앱이 HAULER 를 고를 수 있게 되면 CHECK 가 막는다)
-- 롤백(참고) : 사전 확인 SELECT count(*) FROM site_mst WHERE ship_cd = 'HAULER';  → 0 이 아니면 마스터 확인(결제된 기체)
--   020 판 CHECK·RPC 2종 재생성(목록에서 'HAULER' 제거)
BEGIN;

ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_ship_cd_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_ship_cd_check CHECK (ship_cd IS NULL OR ship_cd IN ('BRIDGE', 'TWIN', 'DAGGER', 'CROSS', 'HAULER'));
COMMENT ON COLUMN site_mst.ship_cd IS '워프 우주선 부가서비스 기체코드(BRIDGE 함교·TWIN 양날개·DAGGER 단검·CROSS 십자익·HAULER 원반 화물선, NULL = 기본 SAUCER 무료) — 노출은 ship_cd 있음 AND (ship_pay_dtm NOT NULL OR own_site_yn=Y) AND IN_USE';

-- 020 판 본문 그대로 + 기체 목록에 HAULER (재정의라 기존 권한 유지)
CREATE OR REPLACE FUNCTION fn_cmpl_site_reg_pymnt(p_pymnt_id TEXT, p_tx_id TEXT, p_usr_id UUID)
RETURNS site_mst
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_p    pi_pymnt;
  v_s    site_mst;
  v_site UUID;
  v_spk  BOOLEAN;
  v_efct TEXT;
  v_ship TEXT;
BEGIN
  UPDATE pi_pymnt
     SET pymnt_sts_cd = 'COMPLETED',
         tx_id        = COALESCE(tx_id, p_tx_id),
         cmpl_dtm     = COALESCE(cmpl_dtm, CURRENT_TIMESTAMP),
         modr_id      = p_usr_id::TEXT
   WHERE pymnt_id = p_pymnt_id
     AND usr_id = p_usr_id
     AND del_yn = 'N'
     AND pymnt_tp_cd = 'SITE_REG'
     AND pymnt_sts_cd IN ('APPROVED', 'COMPLETED')
  RETURNING * INTO v_p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 결제 없음·결제자 불일치·상태 불가 (%)', p_pymnt_id USING ERRCODE = 'P0002';
  END IF;

  v_site := (v_p.meta_val ->> 'site_id')::UUID;
  v_spk  := COALESCE(v_p.meta_val ->> 'spk', 'N') = 'Y';
  v_efct := NULLIF(v_p.meta_val ->> 'efct', '');
  IF v_efct IS NOT NULL AND v_efct NOT IN ('ORBIT', 'PULSE', 'COMET') THEN
    v_efct := NULL;
  END IF;
  v_ship := NULLIF(v_p.meta_val ->> 'ship', '');
  IF v_ship IS NOT NULL AND v_ship NOT IN ('BRIDGE', 'TWIN', 'DAGGER', 'CROSS', 'HAULER') THEN
    v_ship := NULL;
  END IF;

  -- 멱등 : 같은 결제로 이미 사용 단계에 들어간 사이트는 상태를 되돌리지 않고 현재 행 반환
  SELECT * INTO v_s FROM site_mst
   WHERE site_id = v_site AND del_yn = 'N' AND ownr_usr_id = p_usr_id AND pymnt_id = p_pymnt_id
     AND site_sts_cd IN ('IN_USE', 'USED', 'SUSPENDED', 'EXPIRED');
  IF FOUND THEN
    RETURN v_s;
  END IF;

  BEGIN
    UPDATE site_mst
       SET site_sts_cd   = 'PAID',
           pymnt_id      = p_pymnt_id,
           pay_dtm       = COALESCE(pay_dtm, CURRENT_TIMESTAMP),
           aply_dtm      = COALESCE(aply_dtm, CURRENT_TIMESTAMP),
           plan_cd       = COALESCE(NULLIF(v_p.meta_val ->> 'plan_cd', ''), plan_cd),
           spk_yn        = CASE WHEN v_spk THEN 'Y' ELSE spk_yn END,
           spk_pymnt_id  = CASE WHEN v_spk THEN p_pymnt_id ELSE spk_pymnt_id END,
           spk_pay_dtm   = CASE WHEN v_spk AND spk_pymnt_id IS DISTINCT FROM p_pymnt_id THEN CURRENT_TIMESTAMP ELSE spk_pay_dtm END,
           -- 합산 이펙트 : 이 결제에 효과 단가가 포함됐으므로 같은 결제ID 로 기록(재시도 멱등)
           efct_cd       = CASE WHEN v_efct IS NOT NULL THEN v_efct ELSE efct_cd END,
           efct_pymnt_id = CASE WHEN v_efct IS NOT NULL THEN p_pymnt_id ELSE efct_pymnt_id END,
           efct_pay_dtm  = CASE WHEN v_efct IS NOT NULL AND efct_pymnt_id IS DISTINCT FROM p_pymnt_id THEN CURRENT_TIMESTAMP ELSE efct_pay_dtm END,
           -- 합산 우주선 : 이펙트와 같은 규칙
           ship_cd       = CASE WHEN v_ship IS NOT NULL THEN v_ship ELSE ship_cd END,
           ship_pymnt_id = CASE WHEN v_ship IS NOT NULL THEN p_pymnt_id ELSE ship_pymnt_id END,
           ship_pay_dtm  = CASE WHEN v_ship IS NOT NULL AND ship_pymnt_id IS DISTINCT FROM p_pymnt_id THEN CURRENT_TIMESTAMP ELSE ship_pay_dtm END,
           rjct_rsn_cd   = NULL,
           rjct_rsn_cont = NULL,
           modr_id       = p_usr_id::TEXT
     WHERE site_id = v_site
       AND del_yn = 'N'
       AND ownr_usr_id = p_usr_id
       AND (site_sts_cd IN ('APPLYING', 'PAID') OR (site_sts_cd = 'REJECTED' AND rjct_rsn_cd = 'PAY_TIMEOUT'))
       AND (pymnt_id IS NULL OR pymnt_id = p_pymnt_id)
    RETURNING * INTO v_s;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 도메인이 이미 다른 신청에 점유됨 — 운영자 환불 확인 (%)', v_site USING ERRCODE = 'P0003';
  END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 사이트 없음·소유자 불일치·결제 불가 상태·이미 다른 결제 (%)', v_site USING ERRCODE = 'P0003';
  END IF;
  RETURN v_s;
END; $$;

CREATE OR REPLACE FUNCTION fn_cmpl_site_ship_pymnt(p_pymnt_id TEXT, p_tx_id TEXT, p_usr_id UUID)
RETURNS site_mst
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_p    pi_pymnt;
  v_s    site_mst;
  v_site UUID;
  v_ship TEXT;
BEGIN
  UPDATE pi_pymnt
     SET pymnt_sts_cd = 'COMPLETED',
         tx_id        = COALESCE(tx_id, p_tx_id),
         cmpl_dtm     = COALESCE(cmpl_dtm, CURRENT_TIMESTAMP),
         modr_id      = p_usr_id::TEXT
   WHERE pymnt_id = p_pymnt_id
     AND usr_id = p_usr_id
     AND del_yn = 'N'
     AND pymnt_tp_cd = 'SITE_SHIP'
     AND pymnt_sts_cd IN ('APPROVED', 'COMPLETED')
  RETURNING * INTO v_p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_ship_pymnt: 결제 없음·결제자 불일치·상태 불가 (%)', p_pymnt_id USING ERRCODE = 'P0002';
  END IF;

  v_site := (v_p.meta_val ->> 'site_id')::UUID;
  v_ship := NULLIF(v_p.meta_val ->> 'ship', '');
  IF v_ship IS NULL OR v_ship NOT IN ('BRIDGE', 'TWIN', 'DAGGER', 'CROSS', 'HAULER') THEN
    RAISE EXCEPTION 'fn_cmpl_site_ship_pymnt: 기체코드 없음 (%)', p_pymnt_id USING ERRCODE = 'P0002';
  END IF;

  -- 멱등 : 같은 결제로 이미 기록된 사이트는 현재 행 반환
  SELECT * INTO v_s FROM site_mst
   WHERE site_id = v_site AND del_yn = 'N' AND ownr_usr_id = p_usr_id AND ship_pymnt_id = p_pymnt_id;
  IF FOUND THEN
    RETURN v_s;
  END IF;

  UPDATE site_mst
     SET ship_cd       = v_ship,
         ship_pymnt_id = p_pymnt_id,
         ship_pay_dtm  = COALESCE(ship_pay_dtm, CURRENT_TIMESTAMP),
         modr_id       = p_usr_id::TEXT
   WHERE site_id = v_site
     AND del_yn = 'N'
     AND ownr_usr_id = p_usr_id
     AND ship_pymnt_id IS NULL
  RETURNING * INTO v_s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_ship_pymnt: 사이트 없음·소유자 불일치·이미 다른 우주선 결제 (%)', v_site USING ERRCODE = 'P0003';
  END IF;
  RETURN v_s;
END; $$;

COMMIT;
