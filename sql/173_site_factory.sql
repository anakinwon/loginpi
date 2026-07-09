-- ============================================================
-- 173_site_factory.sql — Pi 앱 팩토리 P1: 사이트(테넌트) 기반 테이블
-- 정본: docs/PRD_27_PI_FACTORY.md v1.1 (2026-07-09 마스터 승인)
-- 모델: cafe.pi 모선 → .pi 도메인 입주(sys_site_mst) → 검증 → 졸업
-- 명명: 사이트 설정은 sys_ 주제영역 (선례: sys_quick_menu)
-- ⚠️ 적용: 마스터가 Supabase 적용 (다중 세션 정책 — git만 커밋)
-- ============================================================

-- 1) 사이트 마스터 (테넌트 정의) — Host 헤더 → site_domain_nm 매칭이 진입점
CREATE TABLE IF NOT EXISTS public.sys_site_mst (
  site_cd         TEXT PRIMARY KEY,                    -- 사이트 코드 (영대문자, 예: CAFE·YEA)
  site_domain_nm  TEXT NOT NULL UNIQUE,                -- 오리진 도메인명 (예: yea.pi 운영 도메인)
  site_nm         TEXT NOT NULL,                       -- 표시 브랜드명
  brand_logo_url  TEXT,                                -- 브랜드 로고 (NULL=기본)
  ui_theme_cd     TEXT,                                -- ui_theme 연계 (NULL=기본 테마)
  preset_cd       TEXT NOT NULL DEFAULT 'CONTENT'
                  CHECK (preset_cd IN ('COMMERCE','COMMUNITY','CONTENT')),
  module_cfg_json JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 프리셋 대비 모듈 ON/OFF 오버라이드
  pi_app_nm       TEXT,                                -- Pi Developer Portal 앱 식별 참조 (메모)
  use_yn          CHAR(1) NOT NULL DEFAULT 'N' CHECK (use_yn IN ('Y','N')),  -- 사이트 kill switch (기본 비활성 — 검증 후 Y)
  regr_id         TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn          CHAR(1) DEFAULT 'N',
  del_dtm         TIMESTAMPTZ
);

COMMENT ON TABLE  public.sys_site_mst IS 'Pi 앱 팩토리 사이트(테넌트) 마스터 — PRD_27. Host 도메인→사이트 판정 단일 소스';
COMMENT ON COLUMN public.sys_site_mst.site_cd         IS '사이트 코드 (영대문자). 전 콘텐츠 테이블 site_cd 축의 참조값';
COMMENT ON COLUMN public.sys_site_mst.site_domain_nm  IS '오리진 도메인명 (Host 매칭 키·유일)';
COMMENT ON COLUMN public.sys_site_mst.preset_cd       IS '모듈 프리셋: COMMERCE(상점+LBS+후기)/COMMUNITY(카페+음성+이벤트)/CONTENT(게시판+구독)';
COMMENT ON COLUMN public.sys_site_mst.module_cfg_json IS '프리셋 기본값 대비 모듈 ON/OFF 오버라이드(JSONB)';
COMMENT ON COLUMN public.sys_site_mst.use_yn          IS '사이트 kill switch — N이면 해당 도메인 전체 점검 페이지';

-- 2) 사이트×사용자 Pi uid 매핑 — pi_uid는 (Pi 앱×네트워크) scoped (2026-07-02 교훈)
--    사람의 전역 불변 키 = sys_user.pi_username. sys_user는 전역 1행 유지.
CREATE TABLE IF NOT EXISTS public.sys_site_usr_map (
  site_cd        TEXT NOT NULL,
  pi_uid         TEXT NOT NULL,                       -- 해당 사이트 Pi 앱의 scoped uid
  usr_id         TEXT NOT NULL,                       -- sys_user.id (전역 계정)
  frst_login_dtm TIMESTAMPTZ,                         -- 해당 사이트 최초 로그인 일시
  regr_id        TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn         CHAR(1) DEFAULT 'N',
  del_dtm        TIMESTAMPTZ,
  PRIMARY KEY (site_cd, pi_uid)
);

COMMENT ON TABLE  public.sys_site_usr_map IS '사이트×사용자 Pi uid 매핑 — 어느 .pi에서도 같은 계정·같은 Bean (PRD_27 §2.1)';
COMMENT ON COLUMN public.sys_site_usr_map.pi_uid IS 'Pi uid는 앱×네트워크 scoped — 사이트마다 다름. 영구 식별자 아님';
COMMENT ON COLUMN public.sys_site_usr_map.usr_id IS 'sys_user.id — 전역 1행 원칙 (불변 키는 pi_username)';

-- 활성 매핑 사용자 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_sys_site_usr_map_usr
  ON public.sys_site_usr_map (usr_id)
  WHERE del_yn = 'N';

-- 2-1) 기적용 환경 대비 멱등 보강 (FR-P1 페르소나 컬럼 — 2026-07-09 마스터 확정 요구)
ALTER TABLE public.sys_site_usr_map ADD COLUMN IF NOT EXISTS site_nick_nm    TEXT;
ALTER TABLE public.sys_site_usr_map ADD COLUMN IF NOT EXISTS site_avatar_url TEXT;
COMMENT ON COLUMN public.sys_site_usr_map.site_nick_nm IS '사이트별 페르소나 표시명 (FR-P1). NULL=미설정 — 전역 닉네임 자동 노출 금지, 첫 진입 시 설정 유도';

-- 3) 시드 — 모선(CAFE=활성) + 파일럿 1호(YEA=대기, Pi 포털 등록·실기기 검증 후 Y 전환)
INSERT INTO public.sys_site_mst (site_cd, site_domain_nm, site_nm, preset_cd, use_yn, regr_id)
VALUES
  ('CAFE', 'cafepi.vercel.app', 'PyCafé™',  'COMMUNITY', 'Y', 'ADMIN'),
  ('YEA',  'yea.pi',            'Yea',       'COMMUNITY', 'N', 'ADMIN')
ON CONFLICT (site_cd) DO NOTHING;
