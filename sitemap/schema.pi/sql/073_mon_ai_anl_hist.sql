-- 073_mon_ai_anl_hist.sql : 모니터링 AI 원인 분석 이력 — 분석 1회 = 1행(근거 구간·표본·소스 커밋·결과), 같은 입력 재사용·직전 분석 비교(마스터 지시 2026-10-22 "분석마다 결과가 달라지는 혼동 방지 4가지 모두 반영")
-- DA-APPROVED: 마스터 지시 2026-10-22 — 신규 1테이블(mon_ 접두 = 모니터링 주제영역), _hist(추가 전용 로그 — del_yn 면제·보관 기간 지난 행 물리 삭제 허용, 정본 §4 예외, sql/068·069 와 동일), 시스템 컬럼 4개 맨 끝, service_role 전용
--   약어 ANL(분석)·INP(입력)·FROM/TO(구간)·CAUS(원인)·CFDC(신뢰도)·SRC(소스)·CMT(커밋)·RSLT(결과)·TOK(토큰)·ELPS(소요). FK 없음(RI 물리 미구현 결정 — usr_id 는 sys_user.usr_id 값만 보관)
--   입력해시 = 모델 + 경로 + 분 단위 합계·개별 이력 + 소스 + 지시문의 SHA-256(분석 시각 제외) — 같으면 AI 를 다시 부르지 않고 이 행의 결과를 보여 줌(24시간 안). 보관 30일(분석 때 지난 행 삭제)
BEGIN;

CREATE TABLE IF NOT EXISTS mon_ai_anl_hist (
  anl_id            UUID          NOT NULL DEFAULT gen_random_uuid(),      -- 분석ID
  route_txt         VARCHAR(200)  NOT NULL,                                -- API 경로(:id 정규화)
  mdl_nm            VARCHAR(100)  NOT NULL,                                -- 모델명(제공사 API 이름)
  mdl_dsp_nm        VARCHAR(100)  NOT NULL,                                -- 모델표시명
  inp_hash_txt      CHAR(64)      NOT NULL,                                -- 입력해시(SHA-256 16진수)
  from_dtm          TIMESTAMPTZ   NOT NULL,                                -- 구간시작일시
  to_dtm            TIMESTAMPTZ   NOT NULL,                                -- 구간종료일시(분석 시각)
  req_cnt           INT           NOT NULL DEFAULT 0,                      -- 요청건수(구간 합계)
  err_cnt           INT           NOT NULL DEFAULT 0,                      -- 오류건수(구간 합계)
  evt_cnt           INT           NOT NULL DEFAULT 0,                      -- 이력건수(느림·오류 개별 이력)
  cut_yn            CHAR(1)       NOT NULL DEFAULT 'N',                    -- 상한도달여부(행 상한 120·100 에 걸려 최근 일부만 봄)
  src_cmt_txt       VARCHAR(40),                                           -- 소스커밋(분석한 배포본 커밋)
  main_caus_txt     VARCHAR(200),                                          -- 주원인(1순위 원인 제목, 직전 분석 비교용)
  cfdc_cd           VARCHAR(10),                                           -- 신뢰도코드(HIGH·MID·LOW)
  rslt_json         JSONB         NOT NULL,                                -- 결과(AI 구조화 출력 전체)
  tok_in_cnt        INT           NOT NULL DEFAULT 0,                      -- 입력토큰수
  tok_out_cnt       INT           NOT NULL DEFAULT 0,                      -- 출력토큰수
  elps_val          INT           NOT NULL DEFAULT 0,                      -- 소요값(밀리초)
  anl_usr_id        UUID,                                                  -- 분석사용자ID(분석을 누른 사람)
  regr_id           TEXT          NOT NULL DEFAULT 'ADMIN',                -- 등록자ID
  reg_dtm           TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,      -- 등록일시
  modr_id           TEXT          NOT NULL DEFAULT 'ADMIN',                -- 변경자ID
  mod_dtm           TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,      -- 변경일시
  CONSTRAINT pk_mon_ai_anl_hist PRIMARY KEY (anl_id),
  CONSTRAINT mon_ai_anl_hist_cut_yn_check CHECK (cut_yn IN ('Y', 'N')),
  CONSTRAINT mon_ai_anl_hist_cfdc_cd_check CHECK (cfdc_cd IS NULL OR cfdc_cd IN ('HIGH', 'MID', 'LOW')),
  CONSTRAINT mon_ai_anl_hist_hash_check CHECK (inp_hash_txt ~ '^[0-9a-f]{64}$'),
  CONSTRAINT mon_ai_anl_hist_dtm_check CHECK (to_dtm >= from_dtm)
);
CREATE INDEX IF NOT EXISTS x_mon_ai_anl_hist_01 ON mon_ai_anl_hist (route_txt, reg_dtm DESC);
CREATE INDEX IF NOT EXISTS x_mon_ai_anl_hist_02 ON mon_ai_anl_hist (inp_hash_txt, reg_dtm DESC);
CREATE INDEX IF NOT EXISTS x_mon_ai_anl_hist_03 ON mon_ai_anl_hist (reg_dtm);

SELECT fn_add_mod_dtm_trg('mon_ai_anl_hist');
SELECT fn_grant_svc_only('TABLE', 'mon_ai_anl_hist');

COMMENT ON TABLE mon_ai_anl_hist IS '모니터링 AI 원인 분석 이력 — 분석 1회 = 1행(근거 구간·표본·소스 커밋·결과), 같은 입력 재사용(24시간)·직전 분석 비교, 보관 30일';
COMMENT ON COLUMN mon_ai_anl_hist.anl_id IS '분석ID';
COMMENT ON COLUMN mon_ai_anl_hist.route_txt IS 'API 경로(:id 정규화)';
COMMENT ON COLUMN mon_ai_anl_hist.mdl_nm IS '모델명';
COMMENT ON COLUMN mon_ai_anl_hist.mdl_dsp_nm IS '모델표시명';
COMMENT ON COLUMN mon_ai_anl_hist.inp_hash_txt IS '입력해시(모델·경로·합계·이력·소스·지시문 SHA-256, 분석 시각 제외)';
COMMENT ON COLUMN mon_ai_anl_hist.from_dtm IS '구간시작일시';
COMMENT ON COLUMN mon_ai_anl_hist.to_dtm IS '구간종료일시(분석 시각)';
COMMENT ON COLUMN mon_ai_anl_hist.req_cnt IS '요청건수(구간 합계)';
COMMENT ON COLUMN mon_ai_anl_hist.err_cnt IS '오류건수(구간 합계)';
COMMENT ON COLUMN mon_ai_anl_hist.evt_cnt IS '이력건수(느림·오류 개별 이력)';
COMMENT ON COLUMN mon_ai_anl_hist.cut_yn IS '상한도달여부(최근 일부만 분석)';
COMMENT ON COLUMN mon_ai_anl_hist.src_cmt_txt IS '소스커밋(분석한 배포본)';
COMMENT ON COLUMN mon_ai_anl_hist.main_caus_txt IS '주원인(1순위 원인 제목)';
COMMENT ON COLUMN mon_ai_anl_hist.cfdc_cd IS '신뢰도코드';
COMMENT ON COLUMN mon_ai_anl_hist.rslt_json IS '결과(AI 구조화 출력)';
COMMENT ON COLUMN mon_ai_anl_hist.tok_in_cnt IS '입력토큰수';
COMMENT ON COLUMN mon_ai_anl_hist.tok_out_cnt IS '출력토큰수';
COMMENT ON COLUMN mon_ai_anl_hist.elps_val IS '소요값(밀리초)';
COMMENT ON COLUMN mon_ai_anl_hist.anl_usr_id IS '분석사용자ID';
COMMENT ON COLUMN mon_ai_anl_hist.regr_id IS '등록자ID';
COMMENT ON COLUMN mon_ai_anl_hist.reg_dtm IS '등록일시';
COMMENT ON COLUMN mon_ai_anl_hist.modr_id IS '변경자ID';
COMMENT ON COLUMN mon_ai_anl_hist.mod_dtm IS '변경일시';
COMMENT ON INDEX x_mon_ai_anl_hist_01 IS '경로별 최신 분석(직전 분석 비교)';
COMMENT ON INDEX x_mon_ai_anl_hist_02 IS '같은 입력 재사용 조회';
COMMENT ON INDEX x_mon_ai_anl_hist_03 IS '보관 기간 정리';

COMMIT;

NOTIFY pgrst, 'reload schema';
