-- 페이지뷰 추적 (퍼포먼스 분석 — Phase 22 §12 ④, PRD_21 §3-5)
-- DA-APPROVED: 분석 추적 테이블. stat_ 도메인(stat_actvty_dly·stat_revenue_dly 선례).
--   sess(세션)·refr(referrer)·chnl(채널)·pv(pageview)는 웹 분석 표준 약어로 신규 수용.
--   체류시간·반송률·이탈/랜딩·채널은 세션별 PV 시퀀스에서 파생(별도 저장 없음).
-- 비차단 수집: 클라이언트 라우트 전환 시 fire-and-forget. 게스트(usr_id NULL) 포함.

CREATE TABLE IF NOT EXISTS public.stat_pageview (
  pv_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sess_id    TEXT         NOT NULL,                       -- 클라이언트 세션 ID (sessionStorage)
  usr_id     TEXT,                                        -- sys_user.id (게스트는 NULL)
  page_path  TEXT         NOT NULL,                       -- locale 제거 경로 (예: /chat, /store)
  refr_host  TEXT,                                        -- 외부 유입 referrer 호스트 (세션 첫 PV만)
  chnl_cd    VARCHAR(20)  NOT NULL DEFAULT 'DIRECT',      -- 유입 채널
  view_dtm   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 페이지 조회 일시
  del_yn     CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm    TIMESTAMPTZ,
  regr_id    TEXT         NOT NULL DEFAULT 'SYSTEM',
  reg_dtm    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id    TEXT         NOT NULL DEFAULT 'SYSTEM',
  mod_dtm    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_stat_pageview_chnl CHECK (
    chnl_cd IN ('DIRECT','SEARCH','SOCIAL','REFERRAL','PI','INTERNAL')
  )
);

COMMENT ON TABLE  public.stat_pageview IS '페이지뷰 추적 — 체류·반송·이탈·채널 분석 소스 (퍼포먼스 탭)';
COMMENT ON COLUMN public.stat_pageview.sess_id   IS '클라이언트 세션 ID (sessionStorage 생성)';
COMMENT ON COLUMN public.stat_pageview.usr_id    IS 'sys_user.id — 로그인 시, 게스트는 NULL';
COMMENT ON COLUMN public.stat_pageview.page_path IS 'locale 접두 제거 경로';
COMMENT ON COLUMN public.stat_pageview.refr_host IS '외부 유입 referrer 호스트 (세션 첫 PV)';
COMMENT ON COLUMN public.stat_pageview.chnl_cd   IS '유입 채널: DIRECT/SEARCH/SOCIAL/REFERRAL/PI/INTERNAL';
COMMENT ON COLUMN public.stat_pageview.view_dtm  IS '페이지 조회 일시 (체류시간 파생 기준)';

-- 기간 조회 + 세션 시퀀스 조회 인덱스 (활성행만)
CREATE INDEX IF NOT EXISTS idx_stat_pageview_dtm
  ON public.stat_pageview (view_dtm) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_stat_pageview_sess
  ON public.stat_pageview (sess_id, view_dtm) WHERE del_yn = 'N';
