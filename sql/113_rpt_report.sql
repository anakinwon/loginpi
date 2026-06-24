-- sql/113_rpt_report.sql
-- DA-APPROVED: 신규 도메인 'rpt'(신고/report) 등재. 커뮤니티 신고(게시물·댓글·상점·사용자 등)
--   접수·처리 추적용 내부 테이블. 기존 도메인과 무관한 신고 메타 영역이라 'rpt_' 접두사 신설.
--
-- 목적: 사용자 신고 접수(/api/report) + 관리자 처리 추적(/admin/reports). 커뮤니티운영정책 집행 근거.
--   ⚠️ 환경 정책: staging Supabase 먼저 적용·검증 후 운영. git-only.
-- 논리삭제·시스템 컬럼 4개 표준 준수.

CREATE TABLE IF NOT EXISTS public.rpt_report (
  rpt_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  TEXT        NOT NULL,                        -- 신고자 sys_user.id
  target_tp_cd VARCHAR(10) NOT NULL,                        -- POST/COMMENT/SHOP/USER/CHAT
  target_id    TEXT        NOT NULL,                        -- 신고 대상 식별자
  reason_cd    VARCHAR(12) NOT NULL,                        -- 신고 사유 코드
  reason_txt   TEXT,                                        -- 상세 설명
  status_cd    VARCHAR(10) NOT NULL DEFAULT 'PENDING',      -- PENDING/REVIEWING/RESOLVED/REJECTED
  admin_memo   TEXT,                                        -- 처리 메모
  handler_id   TEXT,                                        -- 처리 관리자 id
  resolved_dtm TIMESTAMPTZ,                                 -- 처리 완료 일시
  del_yn       CHAR(1)     NOT NULL DEFAULT 'N',
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_rpt_target CHECK (target_tp_cd IN ('POST','COMMENT','SHOP','USER','CHAT')),
  CONSTRAINT chk_rpt_reason CHECK (reason_cd IN ('SPAM','ABUSE','SEXUAL','PRIVACY','COPYRIGHT','FRAUD','ETC')),
  CONSTRAINT chk_rpt_status CHECK (status_cd IN ('PENDING','REVIEWING','RESOLVED','REJECTED'))
);

COMMENT ON TABLE  public.rpt_report           IS '커뮤니티 신고 접수·처리 추적 — /api/report 접수, /admin/reports 처리';
COMMENT ON COLUMN public.rpt_report.status_cd IS 'PENDING 접수 · REVIEWING 검토중 · RESOLVED 조치완료 · REJECTED 반려';

-- 미처리 목록(상태별 최신순) + 대상 중복 조회 인덱스 (활성행만)
CREATE INDEX IF NOT EXISTS idx_rpt_report_status ON public.rpt_report(status_cd, reg_dtm DESC) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_rpt_report_target ON public.rpt_report(target_tp_cd, target_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_rpt_report_reporter ON public.rpt_report(reporter_id) WHERE del_yn = 'N';

-- 검증:
--   SELECT status_cd, count(*) FROM public.rpt_report WHERE del_yn='N' GROUP BY status_cd;
