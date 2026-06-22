-- DA-APPROVED: bean_fee_plan 테이블 생성 + 시드 (PRD_15_FEE §3·§4 기준, 2026-06-22)
-- 역할: Bean 경제 표준 요금 마스터 — 구독·건당·노출·연장 등 플랫폼 과금 전수 단일 출처.
-- 코드 미러: 현재 src/lib/bean-fee.ts·bean-subscr-plan.ts 가 라이브 권위 소스.
--           본 테이블은 어드민 가시성 + bean_ledger 직접 참조 마이그레이션 준비용.
-- ⚠️ §7 데이터 품질 이슈 포함: SSPDM(5)<SSGDM(10) 역전·SY300 설명 오타 — 엑셀 교정 후 UPDATE.

-- ── 1. 테이블 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bean_fee_plan (
  fee_plan_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_plan_cd   VARCHAR(20) NOT NULL UNIQUE,
  subscr_div_cd VARCHAR(10) NOT NULL
                  CHECK (subscr_div_cd IN ('SUBSCR','GENERAL')),
  prod_ctgr_cd  VARCHAR(24) NOT NULL,
  fee_knd_cd    VARCHAR(20) NOT NULL,
  grade_cd      VARCHAR(10) NOT NULL DEFAULT 'GENERAL'
                  CHECK (grade_cd IN ('GENERAL','PREMIUM','EVENT','S','M','L')),
  bill_cycle_cd VARCHAR(8)  NOT NULL
                  CHECK (bill_cycle_cd IN ('M','Y','W','ONCE')),
  amt_bean      INT         NOT NULL DEFAULT 0 CHECK (amt_bean >= 0),
  qty_limit     INT         NOT NULL DEFAULT 0 CHECK (qty_limit >= 0),
  fee_plan_desc TEXT,
  use_yn        CHAR(1)     NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y','N')),
  sort_ord      INT         NOT NULL DEFAULT 0,
  del_yn        CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.bean_fee_plan IS 'Bean 경제 표준 요금 마스터 — PRD_15_FEE §3·§4 기준';
COMMENT ON COLUMN public.bean_fee_plan.fee_plan_cd   IS '요금제코드 (SM100/CGGC1 등)';
COMMENT ON COLUMN public.bean_fee_plan.subscr_div_cd IS 'SUBSCR=구독요금제 / GENERAL=일반요금제';
COMMENT ON COLUMN public.bean_fee_plan.prod_ctgr_cd  IS 'PICAFE_SUBSCR / PISTORE_GENERAL / PLATFORM 등';
COMMENT ON COLUMN public.bean_fee_plan.fee_knd_cd    IS 'SUBSCR/CREATE/ENTER/EXPOSE/EXTEND/BOOST/BADGE_UPGRADE/TRANSLATE/AI_EXTRA';
COMMENT ON COLUMN public.bean_fee_plan.grade_cd      IS 'GENERAL/PREMIUM/EVENT — 카페등급 / S/M/L — 스토어구독등급';
COMMENT ON COLUMN public.bean_fee_plan.bill_cycle_cd IS 'M=월 / Y=년 / W=주 / ONCE=건당';
COMMENT ON COLUMN public.bean_fee_plan.amt_bean      IS '금액(Bean 정수). Pi 환산 = amt_bean / 100';
COMMENT ON COLUMN public.bean_fee_plan.qty_limit     IS '수량제한(0=무제한). 스토어구독 상품 수 한도 등';

CREATE INDEX IF NOT EXISTS idx_bean_fee_plan_cd
  ON public.bean_fee_plan(fee_plan_cd);
CREATE INDEX IF NOT EXISTS idx_bean_fee_plan_ctgr
  ON public.bean_fee_plan(prod_ctgr_cd, fee_knd_cd, grade_cd);
CREATE INDEX IF NOT EXISTS idx_bean_fee_plan_use
  ON public.bean_fee_plan(use_yn, del_yn);

-- ── 2. 시드 ─────────────────────────────────────────────────────────────────
-- (fee_plan_cd, subscr_div_cd, prod_ctgr_cd, fee_knd_cd, grade_cd, bill_cycle_cd,
--  amt_bean, qty_limit, fee_plan_desc, sort_ord)

INSERT INTO public.bean_fee_plan
  (fee_plan_cd, subscr_div_cd, prod_ctgr_cd, fee_knd_cd, grade_cd, bill_cycle_cd,
   amt_bean, qty_limit, fee_plan_desc, sort_ord)
VALUES

-- §4-1. 구독요금제 (SUBSCR) — 10행
('SM100','SUBSCR','PICAFE_SUBSCR', 'SUBSCR','GENERAL','M',  3000, 0,'카페 구독 월', 10),
('SY100','SUBSCR','PICAFE_SUBSCR', 'SUBSCR','GENERAL','Y', 30000, 0,'카페 구독 년', 11),
('SM200','SUBSCR','PISTORE_SUBSCR','SUBSCR','S',      'M',  3000,30,'스토어 구독 S 월 (상품 30개 이하)', 20),
('SM300','SUBSCR','PISTORE_SUBSCR','SUBSCR','M',      'M',  4000,50,'스토어 구독 M 월 (상품 50개 이하)', 21),
('SM400','SUBSCR','PISTORE_SUBSCR','SUBSCR','L',      'M',  5000, 0,'스토어 구독 L 월 (상품 50개 초과)', 22),
('SY200','SUBSCR','PISTORE_SUBSCR','SUBSCR','S',      'Y', 30000,30,'스토어 구독 S 년 (상품 30개 이하)', 23),
('SY300','SUBSCR','PISTORE_SUBSCR','SUBSCR','M',      'Y', 40000,50,'스토어 구독 M 년 (상품 50개 이하)', 24),
('SY400','SUBSCR','PISTORE_SUBSCR','SUBSCR','L',      'Y', 50000, 0,'스토어 구독 L 년 (상품 50개 초과)', 25),
('SM500','SUBSCR','TRANSLATE_SUBSCR','SUBSCR','GENERAL','M', 1000, 0,'자동번역 구독 월', 30),
('SY500','SUBSCR','TRANSLATE_SUBSCR','SUBSCR','GENERAL','Y',10000, 0,'자동번역 구독 년', 31),

-- §4-2. 일반요금제 — 카페 비구독자 (GENERAL) 6행
('CGGC1','GENERAL','PICAFE_GENERAL','CREATE','GENERAL','ONCE',  0,1,'카페 생성 일반', 40),
('CGPC2','GENERAL','PICAFE_GENERAL','CREATE','PREMIUM','ONCE', 10,1,'카페 생성 프리미엄', 41),
('CGEC3','GENERAL','PICAFE_GENERAL','CREATE','EVENT',  'ONCE', 20,1,'카페 생성 이벤트', 42),
('CGGE1','GENERAL','PICAFE_GENERAL','ENTER', 'GENERAL','ONCE',  0,1,'카페 입장 일반', 43),
('CGPE2','GENERAL','PICAFE_GENERAL','ENTER', 'PREMIUM','ONCE', 10,1,'카페 입장 프리미엄', 44),
('CGEE3','GENERAL','PICAFE_GENERAL','ENTER', 'EVENT',  'ONCE', 20,1,'카페 입장 이벤트', 45),

-- §4-2. 카페 구독자 할인 (SUBSCR) 6행
('CSGC1','SUBSCR','PICAFE_SUBSCR','CREATE','GENERAL','ONCE',  0,1,'(구독자) 카페 생성 일반', 50),
('CSPC2','SUBSCR','PICAFE_SUBSCR','CREATE','PREMIUM','ONCE',  0,1,'(구독자) 카페 생성 프리미엄', 51),
('CSEC3','SUBSCR','PICAFE_SUBSCR','CREATE','EVENT',  'ONCE', 10,1,'(구독자) 카페 생성 이벤트', 52),
('CSGE1','SUBSCR','PICAFE_SUBSCR','ENTER', 'GENERAL','ONCE',  0,1,'(구독자) 카페 입장 일반', 53),
('CSPE2','SUBSCR','PICAFE_SUBSCR','ENTER', 'PREMIUM','ONCE',  0,1,'(구독자) 카페 입장 프리미엄', 54),
('CSEE3','SUBSCR','PICAFE_SUBSCR','ENTER', 'EVENT',  'ONCE',  5,1,'(구독자) 카페 입장 이벤트', 55),

-- §4-3. 일반요금제 — 스토어 비구독자 (GENERAL) 10행
('SGGC1','GENERAL','PISTORE_GENERAL','CREATE', 'GENERAL','ONCE',  0,0,'스토어 상품 생성 일반', 60),
('SGPC2','GENERAL','PISTORE_GENERAL','CREATE', 'PREMIUM','ONCE', 10,0,'스토어 상품 생성 프리미엄', 61),
('SGGDW','GENERAL','PISTORE_GENERAL','EXPOSE', 'GENERAL','W',     5,1,'노출 1주 일반', 62),
('SGPDW','GENERAL','PISTORE_GENERAL','EXPOSE', 'PREMIUM','W',    10,1,'노출 1주 프리미엄', 63),
('SGGDM','GENERAL','PISTORE_GENERAL','EXPOSE', 'GENERAL','M',    10,1,'노출 1개월 일반', 64),
('SGPDM','GENERAL','PISTORE_GENERAL','EXPOSE', 'PREMIUM','M',    20,1,'노출 1개월 프리미엄', 65),
('SGGEW','GENERAL','PISTORE_GENERAL','EXTEND', 'GENERAL','W',     5,1,'연장 1주 일반', 66),
('SGPEW','GENERAL','PISTORE_GENERAL','EXTEND', 'PREMIUM','W',    10,1,'연장 1주 프리미엄', 67),
('SGGEM','GENERAL','PISTORE_GENERAL','EXTEND', 'GENERAL','M',    10,1,'연장 1개월 일반', 68),
('SGPEM','GENERAL','PISTORE_GENERAL','EXTEND', 'PREMIUM','M',    20,1,'연장 1개월 프리미엄', 69),

-- §4-3. 스토어 구독자 할인 (SUBSCR) 10행 — ⚠️ SSPDM(5)<SSGDM(10) 역전은 엑셀 원본 그대로
('SSGC1','SUBSCR','PISTORE_SUBSCR','CREATE', 'GENERAL','ONCE',  0,0,'(구독자) 상품 생성 일반', 70),
('SSPC2','SUBSCR','PISTORE_SUBSCR','CREATE', 'PREMIUM','ONCE',  0,0,'(구독자) 상품 생성 프리미엄', 71),
('SSGDW','SUBSCR','PISTORE_SUBSCR','EXPOSE', 'GENERAL','W',     0,1,'(구독자) 노출 1주 일반', 72),
('SSPDW','SUBSCR','PISTORE_SUBSCR','EXPOSE', 'PREMIUM','W',     0,1,'(구독자) 노출 1주 프리미엄', 73),
('SSGDM','SUBSCR','PISTORE_SUBSCR','EXPOSE', 'GENERAL','M',    10,1,'(구독자) 노출 1개월 일반', 74),
('SSPDM','SUBSCR','PISTORE_SUBSCR','EXPOSE', 'PREMIUM','M',     5,1,'(구독자) 노출 1개월 프리미엄 ⚠️역전검토', 75),
('SSGEW','SUBSCR','PISTORE_SUBSCR','EXTEND', 'GENERAL','W',     5,1,'(구독자) 연장 1주 일반', 76),
('SSPEW','SUBSCR','PISTORE_SUBSCR','EXTEND', 'PREMIUM','W',     5,1,'(구독자) 연장 1주 프리미엄', 77),
('SSGEM','SUBSCR','PISTORE_SUBSCR','EXTEND', 'GENERAL','M',    10,1,'(구독자) 연장 1개월 일반', 78),
('SSPEM','SUBSCR','PISTORE_SUBSCR','EXTEND', 'PREMIUM','M',    10,1,'(구독자) 연장 1개월 프리미엄', 79),

-- 플랫폼 기타 요금 — bean-fee.ts 상수 코드 미러 4행
('BADGE_UPG', 'GENERAL','PLATFORM','BADGE_UPGRADE','GENERAL','ONCE', 10,1,'배지 강화 1회 (=0.1 Pi)', 90),
('TRANS_ONCE','GENERAL','TRANSLATE_GENERAL','TRANSLATE','GENERAL','ONCE',1,1,'자동번역 건당 (=0.01 Pi)', 91),
('AI_EXTRA',  'GENERAL','PLATFORM','AI_EXTRA',    'GENERAL','ONCE',  5,1,'AI(@ai) 초과 호출 건당 (=0.05 Pi)', 92),
('ROOM_BST7', 'GENERAL','PLATFORM','BOOST',        'GENERAL','W',    50,1,'카페 부스팅 7일 노출 우선 (=0.5 Pi)', 93)

ON CONFLICT (fee_plan_cd) DO NOTHING;
