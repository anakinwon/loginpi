-- 020_sitemap_site_ship.sql — 워프 우주선 부가서비스(BRIDGE 함교·TWIN 양날개·DAGGER 단검·CROSS 십자익) : 버블 이펙트(017)와 같은 패턴(요금제별 단가 · 신청·수정 선택 · 합산/단독 결제 · 결제된 사이트만 노출), 요금제별 1종 선택. 기본 기체 SAUCER(원반)는 무료 = ship_cd NULL (마스터 지시 2026-11-03)
-- DA-APPROVED: 마스터 지시 2026-11-03 워프 우주선 부가서비스 — 017 EFFECT 구조 그대로 승계(새 구조 없음, 컬럼 3·RPC 1·인덱스 1). DA 리뷰 결과 = 조건부 승인 — 조건(인덱스 이름 x_pi_pymnt_06 : sitemap DB pi_pymnt 기존 인덱스 5개(010 usr_id·tp_cd_sts, 012 site_id, 013 spk, 017 efct)와 번호 겹침 회피 + COMMENT ON INDEX, 롤백 사전 확인 주석, 사전 W26 확정) 반영 완료. 표준단어 SHIP(우주선, ship) 자체 등재 — 공통표준단어(행안부 2025-11)에 '우주선' 없음, 유사어 선박 VSL 은 '물 위' 뜻이라 부적합, 영문 원어 4자 그대로(축약 시 SHP·SP 는 배송·서비스제공자와 혼동). fee_tp_cd SHIP(요금제별 5행 SHIP_<plan>, 단가 = EFFECT 와 같은 금액 [확인중 : 마스터])·pymnt_tp_cd SITE_SHIP 등재. ship_cd 는 001 판정 3(코드 도메인=CHECK) 에 따라 NULL 허용 + CHECK 4종, 단독 RPC 는 014 원칙(상태 게이트 없음)·서비스 전용 권한. 인덱스 이름은 정본 §5 v2.5(x_<테이블>_NN)
--   site_mst 컬럼 3(ship_cd 우주선코드 CHECK 4종 · ship_pymnt_id 결제ID FK pi_pymnt · ship_pay_dtm 결제완료일시, 동시 NULL CHECK), RPC fn_cmpl_site_reg_pymnt 재정의(017 판 + 합산 meta ship 반영)·fn_cmpl_site_ship_pymnt 신규(단독 결제, 서비스 전용 권한), pi_pymnt 부분 인덱스 1. ⚠ 기체 추가 시 ship_cd CHECK · fn_cmpl_site_reg_pymnt · fn_cmpl_site_ship_pymnt 의 코드 검증 3곳을 새 파일로 동시에 갱신(앱 SHIP_CD(src/lib/ship.ts 단일 소스) 포함 4곳)
-- 선행 : 017(fn_cmpl_site_reg_pymnt 017 판을 그대로 품는다). 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod — ⚠ 앱 배포 전에 적용(앱이 ship_* 컬럼을 조회)
-- 규칙(017 이펙트와 동일 구조) :
--  · 노출 = site_sts_cd='IN_USE' AND ship_cd IS NOT NULL AND (ship_pay_dtm IS NOT NULL OR own_site_yn='Y')  — 자사 사이트는 관리자 선택만으로 노출, 그 밖은 기본 기체(SAUCER)
--  · 합산 결제 : 신청(APPLYING, 사용료 미결제) 시 ship_cd 가 있으면 prepare 가 사용료+우주선 단가를 합산, metadata.ship=<코드>. fn_cmpl_site_reg_pymnt 가 ship_pymnt_id=같은 결제ID
--  · 단독 결제 : 사용료 결제 뒤 ship_cd 선택·미결제면 pymnt_tp_cd='SITE_SHIP' 결제 → fn_cmpl_site_ship_pymnt(상태 불변)
--  · 재등록 시 앱이 ship_pymnt_id·ship_pay_dtm 초기화(새 주기 = 새 결제). 결제된 기체는 소유자가 바꿀 수 없다(앱 강제), 관리자 토글 가능
-- 롤백(참고) : DROP FUNCTION fn_cmpl_site_ship_pymnt(text,text,uuid); 017 판 fn_cmpl_site_reg_pymnt 재생성(ship 반영 제거); DROP INDEX x_pi_pymnt_06;
--   롤백 사전 확인 : SELECT count(*) FROM site_mst WHERE ship_cd IS NOT NULL OR ship_pymnt_id IS NOT NULL;  → 0 이 아니면 결제된 기체가 있으므로 컬럼 DROP 전에 마스터 확인(결제 근거 소실)
--                    SELECT count(*) FROM pi_pymnt WHERE pymnt_tp_cd = 'SITE_SHIP' AND del_yn = 'N';  → 단독 결제 원장 존재 여부(원장 행은 지우지 않는다)
--   ALTER TABLE site_mst DROP CONSTRAINT site_mst_ship_pymnt_id_fkey, DROP CONSTRAINT site_mst_ship_pay_dtm_check, DROP CONSTRAINT site_mst_ship_cd_check, DROP COLUMN ship_pay_dtm, DROP COLUMN ship_pymnt_id, DROP COLUMN ship_cd;
--   UPDATE fee_plan SET del_yn='Y', del_dtm=now(), use_yn='N' WHERE fee_tp_cd='SHIP'; CHECK 의 SHIP 은 남긴다(논리삭제 행이 CHECK 대상)
BEGIN;

-- ------------------------------------------------------------
-- 1. fee_plan — 요금유형 SHIP × 요금제 5행 (단가 = EFFECT 와 같은 금액)
-- ------------------------------------------------------------
ALTER TABLE fee_plan DROP CONSTRAINT IF EXISTS fee_plan_fee_tp_cd_check;
ALTER TABLE fee_plan ADD  CONSTRAINT fee_plan_fee_tp_cd_check CHECK (fee_tp_cd IN ('REGISTER', 'SPARKLE', 'EFFECT', 'SHIP'));
COMMENT ON COLUMN fee_plan.fee_tp_cd IS '요금유형코드 : REGISTER(사용료 × 요금제) · SPARKLE(반짝임 × 요금제) · EFFECT(버블 이펙트 궤도/펄스/혜성 × 요금제, 1종 선택 공통 단가) · SHIP(워프 우주선 함교/양날개/단검/십자익 × 요금제, 1종 선택 공통 단가)';

INSERT INTO fee_plan (fee_plan_cd, fee_tp_cd, plan_cd, fee_plan_nm, pi_amt, sort_no, use_mon_cnt, mon_pi_amt) VALUES
  ('SHIP_VIP',  'SHIP', 'VIP',  '워프 우주선 부가서비스 — VIP요금',    19.5, 31, NULL, 0),
  ('SHIP_PRM2', 'SHIP', 'PRM2', '워프 우주선 부가서비스 — 플래티넘요금', 12,  32, NULL, 0),
  ('SHIP_PRM1', 'SHIP', 'PRM1', '워프 우주선 부가서비스 — 프리미엄요금',  6.75, 33, NULL, 0),
  ('SHIP_BSC2', 'SHIP', 'BSC2', '워프 우주선 부가서비스 — 골드요금',      3.75, 34, NULL, 0),
  ('SHIP_BSC1', 'SHIP', 'BSC1', '워프 우주선 부가서비스 — 기본요금',      1.5,  35, NULL, 0)
ON CONFLICT (fee_plan_cd) DO UPDATE SET pi_amt = EXCLUDED.pi_amt, use_yn = 'Y', del_yn = 'N', del_dtm = NULL, modr_id = 'ADMIN';

-- ------------------------------------------------------------
-- 2. site_mst — 우주선 선택·결제 참조
-- ------------------------------------------------------------
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS ship_cd       VARCHAR(10);   -- 우주선코드 (BRIDGE·TWIN·DAGGER·CROSS, NULL = 기본 SAUCER)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS ship_pymnt_id TEXT;          -- 우주선결제ID → pi_pymnt.pymnt_id (합산 결제면 pymnt_id 와 같은 값)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS ship_pay_dtm  TIMESTAMPTZ;   -- 우주선결제완료일시
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_ship_cd_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_ship_cd_check CHECK (ship_cd IS NULL OR ship_cd IN ('BRIDGE', 'TWIN', 'DAGGER', 'CROSS'));
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_ship_pay_dtm_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_ship_pay_dtm_check CHECK ((ship_pymnt_id IS NULL) = (ship_pay_dtm IS NULL));
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_ship_pymnt_id_fkey;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_ship_pymnt_id_fkey FOREIGN KEY (ship_pymnt_id) REFERENCES pi_pymnt (pymnt_id);
COMMENT ON COLUMN site_mst.ship_cd       IS '워프 우주선 부가서비스 기체코드(BRIDGE 함교·TWIN 양날개·DAGGER 단검·CROSS 십자익, NULL = 기본 SAUCER 무료) — 노출은 ship_cd 있음 AND (ship_pay_dtm NOT NULL OR own_site_yn=Y) AND IN_USE';
COMMENT ON COLUMN site_mst.ship_pymnt_id IS '워프 우주선 결제ID — fn_cmpl_site_reg_pymnt(합산, meta ship)·fn_cmpl_site_ship_pymnt(단독) 만 기록';
COMMENT ON COLUMN site_mst.ship_pay_dtm  IS '워프 우주선 결제완료일시';

CREATE INDEX IF NOT EXISTS x_pi_pymnt_06 ON pi_pymnt ((meta_val ->> 'site_id')) WHERE del_yn = 'N' AND pymnt_tp_cd = 'SITE_SHIP' AND pymnt_sts_cd = 'APPROVED';
COMMENT ON INDEX x_pi_pymnt_06 IS '워프 우주선 단독 결제(SITE_SHIP) 진행 중(APPROVED) 결제의 사이트ID 조회 — 사이트당 미완료 결제 확인(부분 인덱스)';

-- ------------------------------------------------------------
-- 3. RPC — 사용료 결제 완료(017 판 + 합산 우주선 반영). meta_val.spk='Y' / meta_val.efct=<코드> / meta_val.ship=<코드> 면 같은 결제ID 로 기록
-- ------------------------------------------------------------
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
  IF v_ship IS NOT NULL AND v_ship NOT IN ('BRIDGE', 'TWIN', 'DAGGER', 'CROSS') THEN
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

-- ------------------------------------------------------------
-- 4. RPC — 우주선 단독 결제 완료(pymnt_tp_cd='SITE_SHIP'). 사이트 상태는 바꾸지 않고 상태 게이트도 두지 않는다(014·017 과 동일 — 돈이 들어온 결제는 반드시 기록). meta_val.ship 이 기체코드
-- ------------------------------------------------------------
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
  IF v_ship IS NULL OR v_ship NOT IN ('BRIDGE', 'TWIN', 'DAGGER', 'CROSS') THEN
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

-- 신규 RPC 는 서비스 전용(anon 직접 호출 차단 — 002 원칙). fn_cmpl_site_reg_pymnt 은 재정의라 기존 권한 유지
SELECT fn_grant_svc_only('FUNCTION', 'fn_cmpl_site_ship_pymnt(text, text, uuid)');

COMMIT;
