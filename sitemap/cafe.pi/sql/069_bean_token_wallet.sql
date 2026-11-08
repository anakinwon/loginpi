-- DA-APPROVED: bean_token_wallet — bean_wlt 정식 명칭 확정·PLATFORM 지갑 신설 (2026-06-19, PRD_16_TOKEN_MNG v1.2)
-- 핵심 개념: 빈토큰지갑(bean_token_wallet)은 Bean Token 경제의 유일한 잔액 저장소.
--   wallet_type='PLATFORM' : 발행 총량 관리 마스터 지갑 (1개, usr_id=NULL)
--   wallet_type='USER'     : 사용자 개별 보유 지갑 (1인 1행)
-- 소각 없음 — Bean은 USER↔PLATFORM 순환만 존재. 1 Pi = 100 Bean 고정 불변.
-- TASK-180 (Phase 19, 2026-06-19)

-- ──────────────────────────────────────────────────────────────
-- 1. bean_token_wallet 신규 생성
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bean_token_wallet (
  wlt_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_type  VARCHAR(16) NOT NULL DEFAULT 'USER'
                 CHECK (wallet_type IN ('PLATFORM','USER')),
  usr_id       TEXT,                                            -- USER만 필수, PLATFORM은 NULL
  bean_amt     BIGINT      NOT NULL DEFAULT 0 CHECK (bean_amt >= 0),
  status       VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE','FROZEN','CLOSED')),
  del_yn       CHAR(1)     NOT NULL DEFAULT 'N',
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_btw_user_has_id
    CHECK (wallet_type != 'USER'     OR usr_id IS NOT NULL),   -- USER 행은 usr_id 필수
  CONSTRAINT chk_btw_platform_no_user
    CHECK (wallet_type != 'PLATFORM' OR usr_id IS NULL)         -- PLATFORM 행은 usr_id 없음
);

COMMENT ON TABLE  public.bean_token_wallet             IS 'Bean Token 경제 유일한 잔액 저장소 — PLATFORM(발행 관리 1개)·USER(사용자 보유). 소각 없음, 순환만 존재';
COMMENT ON COLUMN public.bean_token_wallet.wallet_type IS 'PLATFORM: 발행 총량 추적 마스터 지갑(1개) / USER: 개별 사용자 보유 지갑';
COMMENT ON COLUMN public.bean_token_wallet.bean_amt    IS '현재 Bean 잔액(정수, 음수 불가). 1 Pi = 100 Bean 고정';

-- USER 지갑 : usr_id 유니크 (PLATFORM은 usr_id=NULL이므로 WHERE 필터)
CREATE UNIQUE INDEX IF NOT EXISTS uq_btw_user_usr
  ON public.bean_token_wallet(usr_id)
  WHERE wallet_type = 'USER';

-- PLATFORM 지갑 : 단 1행 강제
CREATE UNIQUE INDEX IF NOT EXISTS uq_btw_platform_single
  ON public.bean_token_wallet(wallet_type)
  WHERE wallet_type = 'PLATFORM';

CREATE INDEX IF NOT EXISTS idx_btw_usr    ON public.bean_token_wallet(usr_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_btw_status ON public.bean_token_wallet(status) WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────
-- 2. 기존 bean_wlt 데이터 이전 (USER 지갑)
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.bean_token_wallet
  (wlt_id, wallet_type, usr_id, bean_amt, status, del_yn, del_dtm, regr_id, reg_dtm, modr_id, mod_dtm)
SELECT
  wlt_id,
  'USER',
  usr_id,
  bean_amt,
  'ACTIVE',
  del_yn,
  del_dtm,
  regr_id,
  reg_dtm,
  modr_id,
  mod_dtm
FROM public.bean_wlt
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 3. PLATFORM 지갑 초기 삽입 (총 충전 발행량 추적용)
--    bean_amt = 총 CHARGE 합계 - 현재 USER 지갑 합계 (= 플랫폼 회수분)
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.bean_token_wallet (wallet_type, usr_id, bean_amt, regr_id, modr_id)
VALUES (
  'PLATFORM',
  NULL,
  GREATEST(0,
    COALESCE((SELECT SUM(bean_amt) FROM public.bean_txn WHERE txn_tp_cd = 'CHARGE' AND del_yn = 'N'), 0)
    - COALESCE((SELECT SUM(bean_amt) FROM public.bean_wlt WHERE del_yn = 'N'), 0)
  ),
  'SYSTEM',
  'SYSTEM'
)
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 4. fn_bean_apply 재작성 — bean_token_wallet 사용
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_bean_apply(
  p_usr_id    TEXT,
  p_txn_tp    VARCHAR,
  p_bean_amt  BIGINT,
  p_pi_amt    NUMERIC DEFAULT NULL,
  p_pymnt_id  TEXT    DEFAULT NULL,
  p_ref_tp    VARCHAR DEFAULT NULL,
  p_ref_id    TEXT    DEFAULT NULL,
  p_memo      TEXT    DEFAULT NULL,
  p_regr_id   TEXT    DEFAULT 'SYSTEM'
)
RETURNS public.bean_token_wallet
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wlt     public.bean_token_wallet;
  v_new_bal BIGINT;
BEGIN
  -- USER 지갑 행 잠금 (없으면 0 잔액으로 생성) — 동시 증감 직렬화
  SELECT * INTO v_wlt
    FROM public.bean_token_wallet
   WHERE usr_id = p_usr_id
     AND wallet_type = 'USER'
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.bean_token_wallet (wallet_type, usr_id, bean_amt, regr_id, modr_id)
    VALUES ('USER', p_usr_id, 0, p_regr_id, p_regr_id)
    RETURNING * INTO v_wlt;
  END IF;

  v_new_bal := v_wlt.bean_amt + p_bean_amt;

  IF v_new_bal < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BEAN';
  END IF;

  -- USER 지갑 잔액 업데이트
  UPDATE public.bean_token_wallet
     SET bean_amt = v_new_bal,
         del_yn   = 'N',
         del_dtm  = NULL,
         modr_id  = p_regr_id,
         mod_dtm  = CURRENT_TIMESTAMP
   WHERE wlt_id = v_wlt.wlt_id
  RETURNING * INTO v_wlt;

  -- PLATFORM 지갑 반영: CHARGE(USER 증가) → PLATFORM 감소, SPEND(USER 감소) → PLATFORM 증가
  IF p_txn_tp = 'CHARGE' THEN
    UPDATE public.bean_token_wallet
       SET bean_amt = GREATEST(0, bean_amt + p_bean_amt),
           modr_id  = p_regr_id,
           mod_dtm  = CURRENT_TIMESTAMP
     WHERE wallet_type = 'PLATFORM';
  ELSIF p_txn_tp IN ('SPEND','SUBSCRIBE','TIP','FEE') THEN
    UPDATE public.bean_token_wallet
       SET bean_amt = GREATEST(0, bean_amt - p_bean_amt),
           modr_id  = p_regr_id,
           mod_dtm  = CURRENT_TIMESTAMP
     WHERE wallet_type = 'PLATFORM';
  END IF;

  -- 거래 원장 기록
  INSERT INTO public.bean_txn
    (usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, pymnt_id, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
  VALUES
    (p_usr_id, p_txn_tp, p_bean_amt, v_new_bal, p_pi_amt, p_pymnt_id, p_ref_tp, p_ref_id, p_memo, p_regr_id, p_regr_id);

  RETURN v_wlt;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 5. bean_audit_log — 어드민 수동 조정 감사 로그 (Phase 19 P0)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bean_audit_log (
  audit_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id          TEXT        NOT NULL,                      -- 조정 대상 사용자
  adj_before      BIGINT      NOT NULL,                      -- 조정 전 잔액
  adj_bean        BIGINT      NOT NULL,                      -- 조정액 (양수=충전, 음수=회수)
  adj_after       BIGINT      NOT NULL,                      -- 조정 후 잔액
  reason_txt      VARCHAR(200) NOT NULL,                     -- 조정 사유 (화이트리스트)
  adj_admin_id    TEXT        NOT NULL,                      -- 조정 관리자 usr_id
  evidence_url    TEXT,                                      -- 증빙 문서 URL (선택)
  del_yn          CHAR(1)     NOT NULL DEFAULT 'N',
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.bean_audit_log          IS 'Bean 어드민 수동 조정 감사 로그 — 모든 수동 조정은 반드시 여기에 기록';
COMMENT ON COLUMN public.bean_audit_log.adj_bean IS '조정액 양수=충전(지급), 음수=회수(차감)';

CREATE INDEX IF NOT EXISTS idx_bau_usr   ON public.bean_audit_log(usr_id);
CREATE INDEX IF NOT EXISTS idx_bau_admin ON public.bean_audit_log(adj_admin_id);
CREATE INDEX IF NOT EXISTS idx_bau_dtm   ON public.bean_audit_log(reg_dtm DESC);

-- ──────────────────────────────────────────────────────────────
-- 6. bean_wlt 제거 (데이터 이전 완료 후)
-- ──────────────────────────────────────────────────────────────
-- 주의: 아래는 데이터 이전 확인 후 수동 실행. 자동 DROP 하지 않음.
-- 확인 쿼리: SELECT COUNT(*) FROM bean_token_wallet WHERE wallet_type='USER';
--            SELECT COUNT(*) FROM bean_wlt;
--            (두 값이 같으면 DROP 가능)
--
-- DROP TABLE IF EXISTS public.bean_wlt;
-- (fn_bean_apply 업데이트 완료로 참조 없음 — 안전하게 DROP 가능)
