-- DA-APPROVED: LBS 주제영역 신규 등록 (TASK-130) — 위치기반서비스 3종 스키마
-- Phase 15: PRD_10_GPS.md v1.2 §DB 스키마 — Rule LBS-01~04 준수
-- 법적 근거: docs/law/agreement/위치기반서비스이용약관및위치정보수집이용동의서_kor.md

-- ──────────────────────────────────────────────────────────────
-- 1. sys_user_consent — 동의 유형별 이력 (6개월 보관 의무)
--    위치정보법 제16조: 정보주체 열람권 + 철회 즉시 del_yn='Y'
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sys_user_consent (
  consent_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_str_id    TEXT        NOT NULL,
  consent_tp_cd  VARCHAR(10) NOT NULL,
  consent_yn     CHAR(1)     NOT NULL CHECK (consent_yn IN ('Y', 'N')),
  consent_ver    TEXT,
  client_ip      TEXT,
  user_agent     TEXT,
  del_yn         CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.sys_user_consent IS '사용자 동의 유형별 이력 — LBS·MKT·PUSH 6개월 보관';
COMMENT ON COLUMN public.sys_user_consent.user_str_id   IS 'sys_user.id (TEXT 타입 그대로 참조)';
COMMENT ON COLUMN public.sys_user_consent.consent_tp_cd IS '동의 유형: LBS(위치기반), MKT(마케팅), PUSH(푸시알림)';
COMMENT ON COLUMN public.sys_user_consent.consent_ver   IS '동의 약관 버전 (약관 개정 시 재동의 판단 기준)';
COMMENT ON COLUMN public.sys_user_consent.client_ip     IS '동의 시점 클라이언트 IP (감사 로그)';

CREATE INDEX IF NOT EXISTS idx_sys_user_consent_user
  ON public.sys_user_consent(user_str_id, consent_tp_cd);
CREATE INDEX IF NOT EXISTS idx_sys_user_consent_reg_dtm
  ON public.sys_user_consent(reg_dtm DESC);

-- ──────────────────────────────────────────────────────────────
-- 2. usr_loc_hist — 사용자 위치 이력
--    loc_tp_cd: '01'가입 | '02'로그인 | '03'매장 | '04'상품거래
--    매장(03)은 mps_shop.lat/lng 재활용 → ref_id에 shop_id 기록
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usr_loc_hist (
  loc_hist_id    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_str_id    TEXT            NOT NULL,
  loc_tp_cd      CHAR(2)         NOT NULL CHECK (loc_tp_cd IN ('01','02','03','04')),
  lat            DECIMAL(10,8)   NOT NULL,
  lng            DECIMAL(11,8)   NOT NULL,
  accuracy_m     DECIMAL(8,2),
  full_addr      TEXT,
  sido_nm        TEXT,
  sigungu_nm     TEXT,
  dong_nm        TEXT,
  place_id       TEXT,
  ref_id         TEXT,
  consent_yn     CHAR(1)         NOT NULL DEFAULT 'Y' CHECK (consent_yn IN ('Y','N')),
  consent_dtm    TIMESTAMPTZ,
  del_yn         CHAR(1)         NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT            NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT            NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.usr_loc_hist IS '사용자 위치 이력 — 4가지 트리거(가입·로그인·매장·상품)';
COMMENT ON COLUMN public.usr_loc_hist.user_str_id IS 'sys_user.id (TEXT 타입 그대로 참조)';
COMMENT ON COLUMN public.usr_loc_hist.loc_tp_cd   IS '위치 수집 유형: 01=가입, 02=로그인, 03=매장등록, 04=상품거래';
COMMENT ON COLUMN public.usr_loc_hist.lat          IS 'WGS84 위도 (소수점 8자리 = 약 1mm 정밀도)';
COMMENT ON COLUMN public.usr_loc_hist.lng          IS 'WGS84 경도 (소수점 8자리 = 약 1mm 정밀도)';
COMMENT ON COLUMN public.usr_loc_hist.ref_id       IS '연결 엔티티 ID: loc_tp_cd=03→shop_id, 04→item_id';

CREATE INDEX IF NOT EXISTS idx_usr_loc_hist_user
  ON public.usr_loc_hist(user_str_id, loc_tp_cd);
CREATE INDEX IF NOT EXISTS idx_usr_loc_hist_latng
  ON public.usr_loc_hist(lat, lng)
  WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_usr_loc_hist_reg_dtm
  ON public.usr_loc_hist(reg_dtm DESC);

-- ──────────────────────────────────────────────────────────────
-- 3. sys_user 컬럼 추가 — 동의 상태 빠른 조회 캐시
--    (실제 이력은 sys_user_consent 참조)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.sys_user
  ADD COLUMN IF NOT EXISTS lbs_consent_yn   CHAR(1)     DEFAULT 'N',
  ADD COLUMN IF NOT EXISTS lbs_consent_dtm  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lbs_consent_ver  TEXT;

COMMENT ON COLUMN public.sys_user.lbs_consent_yn  IS 'LBS 동의 여부 캐시 (N=미동의·철회, Y=동의 — sys_user_consent 이력과 sync)';
COMMENT ON COLUMN public.sys_user.lbs_consent_dtm IS '최근 LBS 동의/철회 일시';
COMMENT ON COLUMN public.sys_user.lbs_consent_ver IS '동의한 약관 버전';

-- ──────────────────────────────────────────────────────────────
-- 4. 거리 계산 헬퍼 함수 — Haversine formula (PostGIS 미사용)
--    반환값: km (소수점 3자리)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_haversine_km(
  lat1 DECIMAL, lng1 DECIMAL,
  lat2 DECIMAL, lng2 DECIMAL
) RETURNS DECIMAL(8,3)
LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT ROUND(
    6371.0 * acos(
      LEAST(1.0,
        cos(radians(lat1)) * cos(radians(lat2)) *
        cos(radians(lng2) - radians(lng1)) +
        sin(radians(lat1)) * sin(radians(lat2))
      )
    )::NUMERIC, 3
  )
$$;

COMMENT ON FUNCTION public.fn_haversine_km IS 'Haversine 공식 두 WGS84 좌표 간 거리(km) — PostGIS 불필요';

-- ──────────────────────────────────────────────────────────────
-- 5. RLS 활성화 — 프로젝트 표준: anon 차단, 서버 service role만 접근 (정책 없음)
--    위치 이력·동의 이력은 위치정보법 대상 민감 정보 — anon 노출 차단 필수
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.sys_user_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usr_loc_hist ENABLE ROW LEVEL SECURITY;
