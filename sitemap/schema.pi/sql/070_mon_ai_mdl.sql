-- 070_mon_ai_mdl.sql : AI 분석 모델 등록(마스터 지시 2026-10-21 "AI 분석 모델 정보를 사전에 환경설정에 등록해 두고, 분석 시 사용함으로써 자료의 신뢰성을 사용자에 제공" — 제미나이·ChatGPT·Claude, 결제 모델 또는 사용 모델)
-- DA-APPROVED: 마스터 지시 2026-10-21 — 신규 1테이블(mon_ 접두 = 모니터링 주제영역, schema.pi 전역 — 분류체계 무관·전역 관리자만), 논리 삭제·버전번호, 시스템 컬럼 4개 맨 끝, service_role 전용
--   약어 AI·MDL(모델)·PRVD(제공사)·DSP(표시)·PLAN(요금제)·ACCT(계정)·DFLT(기본). FK 없음(RI 물리 미구현 결정)
--   API 키는 저장하지 않음(마스터 선택 — 키는 서버 환경변수 ANTHROPIC_API_KEY·GEMINI_API_KEY·OPENAI_API_KEY, 화면은 설정 여부만 표시)
BEGIN;

CREATE TABLE IF NOT EXISTS mon_ai_mdl (
  mdl_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 모델ID
  prvd_cd           VARCHAR(10)  NOT NULL,                                 -- 제공사코드(CLAUDE·GEMINI·OPENAI)
  mdl_nm            VARCHAR(100) NOT NULL,                                 -- 모델명(API 호출 이름, 예 claude-opus-5-5)
  dsp_nm            VARCHAR(100) NOT NULL,                                 -- 표시명(예 Claude Opus 5.5)
  plan_nm           VARCHAR(100) NOT NULL DEFAULT '',                      -- 요금제명(결제 모델 — 예 API 종량제·무료 등급)
  acct_nm           VARCHAR(100) NOT NULL DEFAULT '',                      -- 계정명(키를 발급한 조직·계정 표시용, 키 아님)
  dflt_yn           CHAR(1)      NOT NULL DEFAULT 'N',                     -- 기본여부(분석 때 먼저 쓰는 모델, 1개)
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT pk_mon_ai_mdl PRIMARY KEY (mdl_id),
  CONSTRAINT mon_ai_mdl_prvd_cd_check CHECK (prvd_cd IN ('CLAUDE', 'GEMINI', 'OPENAI')),
  CONSTRAINT mon_ai_mdl_yn_check CHECK (dflt_yn IN ('Y','N') AND del_yn IN ('Y','N')),
  CONSTRAINT mon_ai_mdl_mdl_nm_check CHECK (mdl_nm ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$')
);
-- 기본 모델은 1개만(활성 행), 같은 제공사·모델명은 1번만 등록
CREATE UNIQUE INDEX IF NOT EXISTS x_mon_ai_mdl_01 ON mon_ai_mdl (dflt_yn) WHERE dflt_yn = 'Y' AND del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS x_mon_ai_mdl_02 ON mon_ai_mdl (prvd_cd, mdl_nm) WHERE del_yn = 'N';

SELECT fn_add_mod_dtm_trg('mon_ai_mdl');
SELECT fn_grant_svc_only('TABLE', 'mon_ai_mdl');

-- 지금 쓰는 모델(src/lib/mon-ai.ts 4ef01829 부터)을 기본으로 등록 — 요금제·계정은 관리자가 화면에서 채움
INSERT INTO mon_ai_mdl (prvd_cd, mdl_nm, dsp_nm, plan_nm, dflt_yn)
SELECT 'CLAUDE', 'claude-opus-5-5', 'Claude Opus 5.5', 'API 종량제', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM mon_ai_mdl WHERE del_yn = 'N');

COMMENT ON TABLE mon_ai_mdl IS 'AI 분석 모델 — 모니터링 AI 원인 분석에 쓰는 제공사·모델·요금제·계정 표시 정보(키는 환경변수, 저장 안 함), 기본 모델 1개';
COMMENT ON COLUMN mon_ai_mdl.mdl_id IS '모델ID';
COMMENT ON COLUMN mon_ai_mdl.prvd_cd IS '제공사코드(CLAUDE·GEMINI·OPENAI)';
COMMENT ON COLUMN mon_ai_mdl.mdl_nm IS '모델명(API 호출 이름)';
COMMENT ON COLUMN mon_ai_mdl.dsp_nm IS '표시명';
COMMENT ON COLUMN mon_ai_mdl.plan_nm IS '요금제명(결제 모델)';
COMMENT ON COLUMN mon_ai_mdl.acct_nm IS '계정명(표시용, 키 아님)';
COMMENT ON COLUMN mon_ai_mdl.dflt_yn IS '기본여부';
COMMENT ON COLUMN mon_ai_mdl.ver_no IS '버전번호';
COMMENT ON COLUMN mon_ai_mdl.del_yn IS '삭제여부';
COMMENT ON COLUMN mon_ai_mdl.del_dtm IS '삭제일시';
COMMENT ON COLUMN mon_ai_mdl.regr_id IS '등록자ID';
COMMENT ON COLUMN mon_ai_mdl.reg_dtm IS '등록일시';
COMMENT ON COLUMN mon_ai_mdl.modr_id IS '변경자ID';
COMMENT ON COLUMN mon_ai_mdl.mod_dtm IS '변경일시';
COMMENT ON INDEX x_mon_ai_mdl_01 IS '기본 모델 1개(활성 행)';
COMMENT ON INDEX x_mon_ai_mdl_02 IS '제공사·모델명 중복 방지(활성 행)';

COMMIT;

NOTIFY pgrst, 'reload schema';
