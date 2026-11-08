-- DA-APPROVED: 후기 보상 보증금 매장(shop) 단위 전환 (2026-07-15 마스터 지시)
--   기존: owner_id(usr_id)+bond_kind당 1행(주체 단위) → 변경: SHOP kind는 mps_shop 매장별 1행.
--   CAFE kind는 기존 주체 단위 유지(shop_id NULL). 매장별 Telegram 알림(sql/148)과 동일한 관리 단위.
--   잔액 이관: 대표매장(sys_user.rep_shop_id) 우선 → 없으면 최초 등록 활성 매장 → 매장 없으면 NULL(레거시).
--   ⚠️ 적용 순서: 이 SQL을 운영 DB에 먼저 적용한 뒤 코드를 배포한다(신규 RPC 시그니처 의존).

-- ── 1. 매장 컬럼 추가 ─────────────────────────────────────────────────────────
ALTER TABLE public.fbck_reward_bond
  ADD COLUMN IF NOT EXISTS shop_id UUID;

COMMENT ON COLUMN public.fbck_reward_bond.shop_id
  IS '매장 단위 키(mps_shop.shop_id) — SHOP kind 필수, CAFE kind는 NULL(주체 단위 유지)';

-- ── 2. 기존 SHOP 잔액 이관 — 대표매장 우선, 없으면 최초 등록 활성 매장 ─────────
--   (매장 없는 주체는 NULL 유지 = 레거시 행. 매장 상품 후기는 매장 필수라 게이트에 영향 없음)
UPDATE public.fbck_reward_bond b
   SET shop_id = COALESCE(
         (SELECT u.rep_shop_id
            FROM public.sys_user u
            JOIN public.mps_shop rs
              ON rs.shop_id = u.rep_shop_id AND rs.del_yn = 'N' AND rs.seller_id = b.owner_id
           WHERE u.id::text = b.owner_id),
         (SELECT s.shop_id
            FROM public.mps_shop s
           WHERE s.seller_id = b.owner_id AND s.del_yn = 'N'
           ORDER BY s.reg_dtm ASC
           LIMIT 1)
       ),
       modr_id = 'ADMIN',
       mod_dtm = CURRENT_TIMESTAMP
 WHERE b.bond_kind = 'SHOP' AND b.shop_id IS NULL AND b.del_yn = 'N';

-- ── 3. 유니크 재구성 — 같은 주인의 매장별 다중 행 허용 ─────────────────────────
ALTER TABLE public.fbck_reward_bond DROP CONSTRAINT IF EXISTS uq_fbck_bond_owner;

-- 매장 단위 행: 매장당 1행 (SHOP kind)
CREATE UNIQUE INDEX IF NOT EXISTS uq_fbck_bond_shop
  ON public.fbck_reward_bond(shop_id) WHERE shop_id IS NOT NULL;

-- 주체 단위 행: 기존 규칙 유지 (CAFE kind + 매장 미보유 레거시)
CREATE UNIQUE INDEX IF NOT EXISTS uq_fbck_bond_owner_kind
  ON public.fbck_reward_bond(owner_id, bond_kind) WHERE shop_id IS NULL;

-- 매장 상품 후기 게이트 조회용
CREATE INDEX IF NOT EXISTS idx_fbck_bond_shop
  ON public.fbck_reward_bond(shop_id) WHERE del_yn = 'N' AND shop_id IS NOT NULL;

-- ── 4. fn_fbck_bond_deposit — 매장 단위 예치 (p_shop_id 추가) ──────────────────
--   SHOP kind는 p_shop_id 필수 + 매장 소유(seller_id=p_owner_id) 검증(2차 방어).
--   구 시그니처는 RPC 오버로드 모호성(PGRST203) 방지를 위해 DROP.
DROP FUNCTION IF EXISTS public.fn_fbck_bond_deposit(TEXT, VARCHAR, BIGINT, VARCHAR, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.fn_fbck_bond_deposit(
  p_owner_id   TEXT,
  p_bond_kind  VARCHAR(10),
  p_bean_amt   BIGINT,
  p_pay_src    VARCHAR(10) DEFAULT 'BEAN',
  p_pymnt_id   TEXT        DEFAULT NULL,
  p_regr_id    TEXT        DEFAULT 'SYSTEM',
  p_shop_id    UUID        DEFAULT NULL
)
RETURNS BIGINT          -- 예치 후 보증금 잔액
LANGUAGE plpgsql AS $$
DECLARE
  v_bal     BIGINT;
  v_wlt_bal BIGINT;
BEGIN
  IF p_bean_amt <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF p_bond_kind NOT IN ('CAFE','SHOP') THEN RAISE EXCEPTION 'INVALID_KIND'; END IF;
  IF p_pay_src NOT IN ('BEAN','PI') THEN RAISE EXCEPTION 'INVALID_SRC'; END IF;
  -- SHOP kind = 매장 단위 필수 + 소유 검증
  IF p_bond_kind = 'SHOP' THEN
    IF p_shop_id IS NULL THEN RAISE EXCEPTION 'SHOP_ID_REQUIRED'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.mps_shop
       WHERE shop_id = p_shop_id AND seller_id = p_owner_id AND del_yn = 'N'
    ) THEN RAISE EXCEPTION 'SHOP_NOT_OWNED'; END IF;
  END IF;

  -- BEAN 예치: 매장 주체 Bean 지갑에서 보증금으로 이동(원자). PI 예치는 pi_pymnt 선완료.
  IF p_pay_src = 'BEAN' THEN
    UPDATE public.bean_wlt
       SET bean_amt = bean_amt - p_bean_amt, modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE usr_id = p_owner_id AND del_yn = 'N' AND bean_amt >= p_bean_amt
     RETURNING bean_amt INTO v_wlt_bal;
    IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_BEAN'; END IF;

    INSERT INTO public.bean_txn (usr_id, txn_tp_cd, bean_amt, bal_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
    VALUES (p_owner_id, 'SPEND', -p_bean_amt, v_wlt_bal, 'FBCK_BOND',
            COALESCE(p_shop_id::text, p_bond_kind), '후기 보상 보증금 예치', p_regr_id, p_regr_id);
  END IF;

  IF p_shop_id IS NOT NULL THEN
    -- 매장 단위 upsert (부분 유니크 uq_fbck_bond_shop)
    INSERT INTO public.fbck_reward_bond (owner_id, bond_kind, shop_id, bond_bal_bean, regr_id, modr_id)
    VALUES (p_owner_id, p_bond_kind, p_shop_id, p_bean_amt, p_regr_id, p_regr_id)
    ON CONFLICT (shop_id) WHERE shop_id IS NOT NULL DO UPDATE SET
      bond_bal_bean = public.fbck_reward_bond.bond_bal_bean + p_bean_amt,
      modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
    RETURNING bond_bal_bean INTO v_bal;
  ELSE
    -- 주체 단위 upsert (CAFE kind, 부분 유니크 uq_fbck_bond_owner_kind)
    INSERT INTO public.fbck_reward_bond (owner_id, bond_kind, bond_bal_bean, regr_id, modr_id)
    VALUES (p_owner_id, p_bond_kind, p_bean_amt, p_regr_id, p_regr_id)
    ON CONFLICT (owner_id, bond_kind) WHERE shop_id IS NULL DO UPDATE SET
      bond_bal_bean = public.fbck_reward_bond.bond_bal_bean + p_bean_amt,
      modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
    RETURNING bond_bal_bean INTO v_bal;
  END IF;

  RETURN v_bal;
END $$;

COMMENT ON FUNCTION public.fn_fbck_bond_deposit(TEXT, VARCHAR, BIGINT, VARCHAR, TEXT, TEXT, UUID)
  IS '후기 보상 보증금 예치(+) — SHOP=매장 단위(p_shop_id 필수·소유 검증) / CAFE=주체 단위. BEAN=지갑 차감 원자';

-- ── 5. fn_fbck_reward_apply — 매장 단위 차감 (p_shop_id 추가) ──────────────────
DROP FUNCTION IF EXISTS public.fn_fbck_reward_apply(TEXT, TEXT, VARCHAR, TEXT, BIGINT, VARCHAR);

CREATE OR REPLACE FUNCTION public.fn_fbck_reward_apply(
  p_usr_id      TEXT,         -- 후기 작성자(보상 수령)
  p_owner_id    TEXT,         -- 매장 주체(보증금 차감)
  p_bond_kind   VARCHAR(10),
  p_fbck_id     TEXT,
  p_reward_bean BIGINT,       -- 보상액(점수별 bean_fee_plan FBCK_REWARD)
  p_mode        VARCHAR(10),  -- 'BEAN' | 'PI'
  p_shop_id     UUID DEFAULT NULL  -- SHOP kind = 차감 대상 매장 (NULL이면 주체 단위 행)
)
RETURNS TABLE (ok BOOLEAN, message TEXT, bond_bal BIGINT, reward_bean BIGINT, reward_pi NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE
  v_bond     BIGINT;
  v_pi       NUMERIC(18,7);
  v_wlt_bal  BIGINT;
BEGIN
  IF p_reward_bean <= 0 THEN
    RETURN QUERY SELECT false, 'INVALID_REWARD', NULL::BIGINT, p_reward_bean, NULL::NUMERIC; RETURN;
  END IF;

  -- 보증금 차감(원자) — 매장 단위(p_shop_id) 또는 주체 단위(NULL). 잔액 부족 시 차단
  UPDATE public.fbck_reward_bond
     SET bond_bal_bean = bond_bal_bean - p_reward_bean, modr_id = 'SYSTEM', mod_dtm = CURRENT_TIMESTAMP
   WHERE del_yn = 'N' AND bond_bal_bean >= p_reward_bean
     AND ( (p_shop_id IS NOT NULL AND shop_id = p_shop_id)
        OR (p_shop_id IS NULL AND owner_id = p_owner_id AND bond_kind = p_bond_kind AND shop_id IS NULL) )
   RETURNING bond_bal_bean INTO v_bond;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INSUFFICIENT_BOND', NULL::BIGINT, p_reward_bean, NULL::NUMERIC; RETURN;
  END IF;

  v_pi := ROUND(p_reward_bean / 100.0, 7);   -- 1:100

  IF p_mode = 'BEAN' THEN
    -- 작성자 Bean 지갑 지급(없으면 생성)
    UPDATE public.bean_wlt
       SET bean_amt = bean_amt + p_reward_bean, modr_id = 'SYSTEM', mod_dtm = CURRENT_TIMESTAMP
     WHERE usr_id = p_usr_id AND del_yn = 'N'
     RETURNING bean_amt INTO v_wlt_bal;
    IF NOT FOUND THEN
      INSERT INTO public.bean_wlt (usr_id, bean_amt) VALUES (p_usr_id, p_reward_bean)
      RETURNING bean_amt INTO v_wlt_bal;
    END IF;

    INSERT INTO public.bean_txn (usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
    VALUES (p_usr_id, 'REWARD', p_reward_bean, v_wlt_bal, NULL, 'FBCK', p_fbck_id, '이용후기 보상(Bean)', 'SYSTEM', 'SYSTEM');
  ELSE
    -- PI 모드: Bean 지갑 미증가. A2U 대기 기록(앱이 triggerPiReward로 실송금·멱등)
    v_wlt_bal := COALESCE((SELECT bean_amt FROM public.bean_wlt WHERE usr_id = p_usr_id AND del_yn = 'N'), 0);
    INSERT INTO public.bean_txn (usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
    VALUES (p_usr_id, 'REWARD', 0, v_wlt_bal, v_pi, 'FBCK_PI', p_fbck_id, '이용후기 보상(Pi A2U 대기)', 'SYSTEM', 'SYSTEM');
  END IF;

  RETURN QUERY SELECT true, 'OK', v_bond, p_reward_bean, v_pi;
END $$;

COMMENT ON FUNCTION public.fn_fbck_reward_apply(TEXT, TEXT, VARCHAR, TEXT, BIGINT, VARCHAR, UUID)
  IS '후기 보상 지급 + 보증금 차감(원자, 매장 단위). 잔액 부족 시 차단. PI 모드는 A2U 대기 기록(앱이 송금)';

-- 검증:
--   SELECT public.fn_fbck_bond_deposit('owner-uuid','SHOP',1000,'BEAN',NULL,'owner-uuid','shop-uuid');  -- 매장 예치 → 1000
--   SELECT * FROM public.fn_fbck_reward_apply('writer','owner-uuid','SHOP','fbck-1',100,'BEAN','shop-uuid');  -- 매장 차감 → 900
--   SELECT owner_id, bond_kind, shop_id, bond_bal_bean FROM public.fbck_reward_bond WHERE del_yn='N';   -- 이관 확인
