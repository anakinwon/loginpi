-- DA-APPROVED: Bean 회계 RPC 결함 P0~P1 일괄 수정 + 항등식 검증 함수 (2026-06-22, 회계 리뷰 후속)
-- 보존 항등식(정본): 발행(ΣCHARGE + Σmint) = 유통(ΣUSER) + 회수(PLATFORM+REWARD_POOL+FOUNDATION)
--
-- 수정 내역
--   [P0-1] fn_bean_apply: REWARD가 항상 REWARD_POOL을 차감하던 하드코딩을 p_src_wallet 파라미터로 교체.
--          캠페인의 src_wallet 검사 지갑 = 실제 차감 지갑 일치. GREATEST(0) 침묵 클램프 제거
--          → 재원 부족 시 CHECK(bean_amt>=0) 위반으로 전체 롤백(과발행 차단, REFUND 분기와 일관).
--   [P0-1] fn_bean_campaign_approve: fn_bean_apply에 v_camp.src_wallet 전달(검사 지갑=차감 지갑 일치).
--          과발행 차단의 보증은 REWARD의 CHECK(bean_amt>=0) 롤백 — 사전검사는 advisory(데드락 회피).
--   [P1-3] 70/20/10 하드코딩 → bean_supply_config 값을 읽어 분배(설정이 실제로 반영되도록).
--   [P1-4] 분배 로직 중복 제거 → 헬퍼 fn_bean_governance_apply 단일 경로(fn_bean_apply·구독 공유).
--   [P1-5] fn_bean_balance_check 신설 — mint 포함 정본 항등식 검사(077 DO블록의 CHARGE-only 정의 대체).
--
-- 무영향 보장: named-arg 호출(supabase rpc / piFetch)은 p_src_wallet 기본 NULL로 하위호환.
--   내부 positional SQL 호출(캠페인 승인)만 갱신. 기본 config(70/20/10)에서 기존 잔액과 수치 동일.
-- 재실행 안전: 전 객체 CREATE OR REPLACE / DROP IF EXISTS(멱등).

-- ════════════════════════════════════════════════════════════════════
-- 1. fn_bean_governance_apply — 회수액 거버넌스 분배 헬퍼 (P1-3·P1-4)
--    p_sign = +1: 소비 회수(거버넌스 증가) / -1: 환불 역회수(거버넌스 감소)
--    분배율은 bean_supply_config 최신 활성행에서 로드(없으면 70/20/10 폴백).
--    잔차는 FOUNDATION에 귀속 → 3개 지갑 합 = p_collect 정수 정확(반올림 오차 0).
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_bean_governance_apply(
  p_collect  BIGINT,            -- 회수 절대값(양수)
  p_sign     INT,               -- +1 회수 / -1 역회수(환불)
  p_regr_id  TEXT DEFAULT 'SYSTEM'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_p    SMALLINT;
  v_rp   SMALLINT;
  v_fnd  SMALLINT;
  v_plat  BIGINT;
  v_rpool BIGINT;
  v_found BIGINT;
BEGIN
  IF p_collect IS NULL OR p_collect <= 0 THEN
    RETURN;  -- 분배할 회수액 없음
  END IF;
  IF p_sign NOT IN (1, -1) THEN
    RAISE EXCEPTION 'INVALID_SIGN';
  END IF;

  -- 분배 정책 로드 (최신 활성행, 없으면 Pi Network 기준 70/20/10 폴백)
  SELECT platform_pct, reward_pool_pct, foundation_pct
    INTO v_p, v_rp, v_fnd
    FROM public.bean_supply_config
   WHERE del_yn = 'N'
   ORDER BY reg_dtm DESC
   LIMIT 1;
  IF NOT FOUND THEN
    v_p := 70; v_rp := 20; v_fnd := 10;
  END IF;

  -- 잔차는 FOUNDATION으로 → 합 = p_collect 보존
  v_plat  := FLOOR(p_collect * v_p  / 100.0);
  v_rpool := FLOOR(p_collect * v_rp / 100.0);
  v_found := p_collect - v_plat - v_rpool;

  -- 운영 수익 → PLATFORM
  UPDATE public.bean_token_wallet
     SET bean_amt = bean_amt + p_sign * v_plat,
         modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wallet_type = 'PLATFORM';
  -- 생태계 기금 → REWARD_POOL
  UPDATE public.bean_token_wallet
     SET bean_amt = bean_amt + p_sign * v_rpool,
         modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wallet_type = 'REWARD_POOL';
  -- 재단 적립금 → FOUNDATION (잔차 귀속)
  UPDATE public.bean_token_wallet
     SET bean_amt = bean_amt + p_sign * v_found,
         modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wallet_type = 'FOUNDATION';
  -- 역회수(-1)로 특정 지갑이 음수가 되면 CHECK(bean_amt>=0) 위반 → 호출 트랜잭션 롤백(정상 방어)
END;
$$;

COMMENT ON FUNCTION public.fn_bean_governance_apply IS
  '회수액 거버넌스 분배 헬퍼 — bean_supply_config 비율 적용(잔차 FOUNDATION). +1 회수/-1 환불역회수. fn_bean_apply·구독 공유';

-- ════════════════════════════════════════════════════════════════════
-- 2. fn_bean_apply 재정의 (P0-1 + P1-3·P1-4)
--    변경점: p_src_wallet 추가 / REWARD가 src_wallet 차감(클램프 제거) / 분배는 헬퍼 위임.
--    구버전(9-arg) DROP 후 신버전(10-arg) 생성 — overload 모호성 방지.
-- ════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.fn_bean_apply(TEXT, VARCHAR, BIGINT, NUMERIC, TEXT, VARCHAR, TEXT, TEXT, TEXT);

CREATE FUNCTION public.fn_bean_apply(
  p_usr_id      TEXT,
  p_txn_tp      VARCHAR,
  p_bean_amt    BIGINT,            -- 충전·보상·환불 양수 / 사용 음수
  p_pi_amt      NUMERIC  DEFAULT NULL,
  p_pymnt_id    TEXT     DEFAULT NULL,
  p_ref_tp      VARCHAR  DEFAULT NULL,
  p_ref_id      TEXT     DEFAULT NULL,
  p_memo        TEXT     DEFAULT NULL,
  p_regr_id     TEXT     DEFAULT 'SYSTEM',
  p_src_wallet  VARCHAR  DEFAULT NULL   -- REWARD 차감 출처(NULL→REWARD_POOL). 캠페인 src_wallet 전달
)
RETURNS public.bean_token_wallet
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wlt     public.bean_token_wallet;
  v_new_bal BIGINT;
  v_src     VARCHAR;
BEGIN
  -- ① USER 지갑 행 잠금 (없으면 0 잔액 자동 생성)
  SELECT * INTO v_wlt
    FROM public.bean_token_wallet
   WHERE usr_id = p_usr_id AND wallet_type = 'USER'
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.bean_token_wallet (wallet_type, usr_id, bean_amt, regr_id, modr_id)
    VALUES ('USER', p_usr_id, 0, p_regr_id, p_regr_id)
    RETURNING * INTO v_wlt;
  END IF;

  -- ② 신규 잔액 계산 (USER 음수 방지)
  v_new_bal := v_wlt.bean_amt + p_bean_amt;
  IF v_new_bal < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_BEAN'; END IF;

  -- ③ USER 지갑 업데이트
  UPDATE public.bean_token_wallet
     SET bean_amt = v_new_bal,
         del_yn   = 'N', del_dtm = NULL,
         modr_id  = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wlt_id = v_wlt.wlt_id
  RETURNING * INTO v_wlt;

  -- ④ 거버넌스 지갑 처리 (거래 유형별)
  IF p_txn_tp IN ('SPEND','SUBSCRIBE','TIP','FEE') THEN
    -- 소비 회수: USER 감소 → 거버넌스 증가
    PERFORM public.fn_bean_governance_apply(ABS(p_bean_amt), 1, p_regr_id);

  ELSIF p_txn_tp = 'REFUND' THEN
    -- 환불 = 소비 취소 → 거버넌스 회수분 동일 비율 역차감 (대칭)
    PERFORM public.fn_bean_governance_apply(ABS(p_bean_amt), -1, p_regr_id);

  ELSIF p_txn_tp = 'REWARD' THEN
    -- 보상 지급: USER 증가 → 지정 출처 지갑 차감 (P0-1: 클램프 제거, 출처 파라미터화)
    v_src := COALESCE(p_src_wallet, 'REWARD_POOL');
    IF v_src NOT IN ('PLATFORM','FOUNDATION','REWARD_POOL') THEN
      RAISE EXCEPTION 'INVALID_REWARD_SRC: %', v_src;
    END IF;
    UPDATE public.bean_token_wallet
       SET bean_amt = bean_amt - p_bean_amt,   -- 부족 시 CHECK(bean_amt>=0) 위반 → 롤백
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = v_src;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'REWARD_SRC_WALLET_NOT_FOUND: %', v_src;
    END IF;
  END IF;
  -- CHARGE는 거버넌스 변동 없음 (발행은 bean_txn CHARGE SUM으로 추적)

  -- ⑤ 거래 원장 기록 (append-only)
  INSERT INTO public.bean_txn
    (usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, pymnt_id, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
  VALUES
    (p_usr_id, p_txn_tp, p_bean_amt, v_new_bal, p_pi_amt, p_pymnt_id, p_ref_tp, p_ref_id, p_memo, p_regr_id, p_regr_id);

  RETURN v_wlt;
END;
$$;

COMMENT ON FUNCTION public.fn_bean_apply(TEXT, VARCHAR, BIGINT, NUMERIC, TEXT, VARCHAR, TEXT, TEXT, TEXT, VARCHAR) IS
  'Bean 증감 원자 적용 — USER 지갑/원장 동기화 + 거버넌스 분배(헬퍼). REWARD는 p_src_wallet 차감(클램프 없음·부족 시 롤백)';

-- ════════════════════════════════════════════════════════════════════
-- 3. fn_bean_subscribe_product 재정의 (P1-3·P1-4)
--    분배 중복 제거 → fn_bean_governance_apply 위임. 시그니처/동작 동일.
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_bean_subscribe_product(
  p_usr_id       TEXT,
  p_prod         VARCHAR,
  p_grade        VARCHAR,
  p_cycle        VARCHAR,
  p_fee_plan_cd  TEXT,
  p_bean_amt     BIGINT,
  p_months       INT,
  p_regr_id      TEXT DEFAULT 'SYSTEM',
  OUT out_bal    BIGINT,
  OUT out_expire TIMESTAMPTZ
)
RETURNS SETOF RECORD
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wlt     public.bean_token_wallet;
  v_new_bal BIGINT;
  v_sid     UUID;
  v_cur_exp TIMESTAMPTZ;
  v_base    TIMESTAMPTZ;
  v_exp     TIMESTAMPTZ;
BEGIN
  IF p_bean_amt <= 0 OR p_months <= 0 THEN
    RAISE EXCEPTION 'INVALID_PLAN';
  END IF;

  -- USER 지갑 잠금 (없으면 0 생성)
  SELECT * INTO v_wlt
    FROM public.bean_token_wallet
   WHERE usr_id = p_usr_id AND wallet_type = 'USER'
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.bean_token_wallet (wallet_type, usr_id, bean_amt, regr_id, modr_id)
    VALUES ('USER', p_usr_id, 0, p_regr_id, p_regr_id)
    RETURNING * INTO v_wlt;
  END IF;

  IF v_wlt.bean_amt < p_bean_amt THEN
    RAISE EXCEPTION 'INSUFFICIENT_BEAN';
  END IF;
  v_new_bal := v_wlt.bean_amt - p_bean_amt;

  -- USER 지갑 차감
  UPDATE public.bean_token_wallet
     SET bean_amt = v_new_bal, modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wlt_id = v_wlt.wlt_id;

  -- 회수 배분 (헬퍼 위임 — config 기반)
  PERFORM public.fn_bean_governance_apply(p_bean_amt, 1, p_regr_id);

  -- bean_txn 원장 기록
  INSERT INTO public.bean_txn
    (usr_id, txn_tp_cd, bean_amt, bal_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
  VALUES
    (p_usr_id, 'SUBSCRIBE', -p_bean_amt, v_new_bal, 'SUBSCR', p_fee_plan_cd,
     '구독 ' || p_prod || ' ' || p_grade || '/' || p_cycle, p_regr_id, p_regr_id);

  -- bean_subscr UPSERT (만료 전 갱신 시 잔여기간 이어붙임)
  SELECT subscr_id, expire_dtm INTO v_sid, v_cur_exp
    FROM public.bean_subscr
   WHERE usr_id = p_usr_id AND prod_ctgr_cd = p_prod AND del_yn = 'N'
   FOR UPDATE;

  v_base := CURRENT_TIMESTAMP;
  IF v_sid IS NOT NULL AND v_cur_exp > v_base THEN v_base := v_cur_exp; END IF;
  v_exp := v_base + (p_months || ' months')::interval;

  IF v_sid IS NOT NULL THEN
    UPDATE public.bean_subscr
       SET grade_cd = p_grade, bill_cycle_cd = p_cycle, fee_plan_cd = p_fee_plan_cd,
           bean_amt = p_bean_amt, expire_dtm = v_exp, auto_renew_yn = 'Y',
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE subscr_id = v_sid;
  ELSE
    INSERT INTO public.bean_subscr
      (usr_id, prod_ctgr_cd, grade_cd, bill_cycle_cd, fee_plan_cd, bean_amt,
       start_dtm, expire_dtm, regr_id, modr_id)
    VALUES
      (p_usr_id, p_prod, p_grade, p_cycle, p_fee_plan_cd, p_bean_amt,
       CURRENT_TIMESTAMP, v_exp, p_regr_id, p_regr_id);
  END IF;

  out_bal    := v_new_bal;
  out_expire := v_exp;
  RETURN NEXT;
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 4. fn_bean_campaign_approve 재정의 (P0-1)
--    변경점: fn_bean_apply에 v_camp.src_wallet 전달(검사 지갑 = 차감 지갑 일치).
--            과발행 보증은 REWARD의 CHECK 롤백 — 사전검사는 advisory(데드락 회피).
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_bean_campaign_approve(
  p_usr_id      TEXT,
  p_campaign_cd TEXT,
  p_admin_id    TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_camp        public.bean_campaign;
  v_grant_id    UUID;
  v_approved_cnt INT;
  v_pool        BIGINT;
  v_new_bal     BIGINT;
BEGIN
  SELECT * INTO v_camp FROM public.bean_campaign
   WHERE campaign_cd = p_campaign_cd AND del_yn = 'N' FOR UPDATE;  -- 선착순 직렬화
  IF NOT FOUND THEN RETURN jsonb_build_object('status','NO_CAMPAIGN'); END IF;

  -- 대상 PENDING 신청 확인
  SELECT grant_id INTO v_grant_id FROM public.bean_campaign_grant
   WHERE campaign_cd = p_campaign_cd AND usr_id = p_usr_id
     AND grant_st_cd = 'PENDING' AND del_yn = 'N';
  IF NOT FOUND THEN RETURN jsonb_build_object('status','NOT_PENDING'); END IF;

  -- 선착순: 이미 승인된 수 < 한도
  SELECT COUNT(*) INTO v_approved_cnt FROM public.bean_campaign_grant
   WHERE campaign_cd = p_campaign_cd AND grant_st_cd = 'APPROVED' AND del_yn = 'N';
  IF v_approved_cnt >= v_camp.max_grant_cnt THEN
    RETURN jsonb_build_object('status','SOLD_OUT','approved_cnt',v_approved_cnt,'max_cnt',v_camp.max_grant_cnt);
  END IF;

  -- 재원 사전 확인 (빠른 실패용 advisory read — FOR UPDATE 미사용)
  --   ※ 과발행 차단의 진짜 보증은 fn_bean_apply REWARD의 CHECK(bean_amt>=0) 롤백(클램프 제거).
  --     여기서 출처 지갑을 FOR UPDATE 잠그면 fn_bean_apply의 USER→거버넌스 잠금 순서와 역전돼
  --     동시 SPEND와 데드락 위험 → 잠그지 않는다. 드문 동시 초과인출은 CHECK 위반으로 안전 롤백.
  SELECT bean_amt INTO v_pool FROM public.bean_token_wallet
   WHERE wallet_type = v_camp.src_wallet;
  IF COALESCE(v_pool, 0) < v_camp.reward_bean THEN
    RETURN jsonb_build_object('status','INSUFFICIENT_POOL');
  END IF;

  -- 지급(REWARD: src_wallet- / USER+ / bean_txn) — 검사 지갑 = 차감 지갑 (P0-1)
  PERFORM public.fn_bean_apply(
    p_usr_id, 'REWARD', v_camp.reward_bean, NULL, NULL,
    'CAMPAIGN', p_campaign_cd, v_camp.campaign_nm || ' 승인 지급', p_admin_id,
    v_camp.src_wallet
  );
  UPDATE public.bean_campaign_grant
     SET grant_st_cd = 'APPROVED', apprv_admin_id = p_admin_id,
         apprv_dtm = CURRENT_TIMESTAMP, modr_id = p_admin_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE grant_id = v_grant_id;

  SELECT bean_amt INTO v_new_bal FROM public.bean_token_wallet
   WHERE usr_id = p_usr_id AND wallet_type = 'USER';

  RETURN jsonb_build_object('status','APPROVED','reward',v_camp.reward_bean,
    'balance',v_new_bal,'approved_cnt',v_approved_cnt + 1,'max_cnt',v_camp.max_grant_cnt);
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 5. fn_bean_balance_check — 정본 항등식 검사 (P1-5)
--    발행 = ΣCHARGE(현금발행) + Σbean_mint_log(보조금발행). 077 DO블록의 CHARGE-only 정의 대체.
--    어드민 대시보드/배치에서 호출해 상시 무결성 감시. diff=0 이면 정상.
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_bean_balance_check()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH
    issued AS (
      SELECT
        COALESCE((SELECT SUM(bean_amt) FROM public.bean_txn
                   WHERE txn_tp_cd = 'CHARGE' AND del_yn = 'N'), 0)
      + COALESCE((SELECT SUM(bean_amt) FROM public.bean_mint_log
                   WHERE del_yn = 'N'), 0) AS v
    ),
    circ AS (
      SELECT COALESCE(SUM(bean_amt), 0) AS v FROM public.bean_token_wallet
       WHERE wallet_type = 'USER' AND del_yn = 'N'
    ),
    coll AS (
      SELECT COALESCE(SUM(bean_amt), 0) AS v FROM public.bean_token_wallet
       WHERE wallet_type IN ('PLATFORM','REWARD_POOL','FOUNDATION') AND del_yn = 'N'
    )
  SELECT jsonb_build_object(
    'issued',      issued.v,
    'circulating', circ.v,
    'collected',   coll.v,
    'diff',        issued.v - circ.v - coll.v,
    'balanced',   (issued.v - circ.v - coll.v) = 0
  )
  FROM issued, circ, coll;
$$;

COMMENT ON FUNCTION public.fn_bean_balance_check IS
  'Bean 보존 항등식 검사 — 발행(ΣCHARGE+Σmint)=유통(ΣUSER)+회수(거버넌스). diff=0/balanced=true 이면 정상';

-- ════════════════════════════════════════════════════════════════════
-- 6. 마이그레이션 직후 검증 (비파괴 — diff 출력만)
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.fn_bean_balance_check();
  IF (v_res->>'balanced')::boolean THEN
    RAISE NOTICE 'Bean 항등식 정상 ✓ — %', v_res;
  ELSE
    RAISE WARNING 'Bean 항등식 불일치 ⚠ (diff=%) — 원인 조사 필요: %', v_res->>'diff', v_res;
  END IF;
END $$;

-- ── 수동 검증 쿼리 (운영 콘솔에서 실행) ───────────────────────────────
-- SELECT public.fn_bean_balance_check();          -- diff=0 / balanced=true 확인
--
-- 항목별 매출 재확인:
-- SELECT public.fn_bean_revenue_summary();
--
-- REWARD 출처 일치 회귀 테스트(샌드박스):
--   1) SELECT public.fn_bean_mint(1000,'REWARD_POOL','test');   -- 재원 주입
--   2) src_wallet=REWARD_POOL 캠페인 승인 → REWARD_POOL 1000 차감 확인
--   3) src_wallet=PLATFORM 캠페인 승인 시 PLATFORM 차감 확인(과거: REWARD_POOL 오차감)
--   4) 재원 부족 캠페인 승인 → INSUFFICIENT_POOL 반환(과발행 없음)
