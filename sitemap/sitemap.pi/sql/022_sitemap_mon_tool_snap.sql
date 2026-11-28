-- 022_sitemap_mon_tool_snap.sql — PC 도구(Agent·Skill·Plugin·Hook·MCP) 설치·사용 현황 스냅숏(마스터 지시 2026-11-28 "내 PC에 설치되어 있는 도구 … 설치현황, 사용현황 … 실시간 통계 모니터링", 선택 "운영에서도 보기")
-- DA-APPROVED: [확인중 : da-governance-expert 사후 리뷰] 신규 1테이블 mon_tool_snap — mon_ 접두 = 모니터링 주제영역(schema.pi sql 마스터 지시 2026-10-21 선례), SNAP(스냅샷, schema.pi mdl_ 2026-10-20 선례), 시스템 컬럼 4개 맨 끝, del_yn·del_dtm 논리삭제, service_role 전용, mod_dtm 트리거(003 관례), PK pk_<테이블>·인덱스 x_<테이블>_NN(정본 §5 v2.5).
--   약어 : 행안부 공통표준 MSRMT(측정)·INSTL(설치)·USE(사용)·CALL(호출)·DTL(상세)·CNT(건수)·NM(명)·VAL(값, 080 dtl_val 선례), 확인 필요 TOOL(도구 — 신규 등재 후보)·ACTV(활성)·PC — da-governance-expert 검토 전까지 [확인중]
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only). 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 설계 :
--  · 한 행 = (PC명, 측정일시) 1회 수집. 쓰기 = 로컬 업로더 sitemap/sitemap.pi/scripts/tool-snap-push.mjs(기본 300초 주기, service_role REST insert — 측정일시 밀리초, PK 충돌 시 +1ms 재시도) / 읽기 = 관리자 API /api/admin/tools → /admin/tools
--  · 건수 칼럼 = 추이 그래프용 요약, 상세 jsonb 2개 = 같은 PC 의 상세가 있는 최신 행 meta.hash(내용 sha256)와 다를 때만 채우고(meta.hash 함께 저장) 같으면 '{}'(용량 억제, 이전 행은 수정하지 않아 변경 시점 이력 보존) — 화면은 상세가 있는 최신 행을 읽음
--  · 업로드 값 = 이름·종류·출처·버전·개수·날짜·스크립트 파일명만(MCP env·args·헤더, 훅 명령 전문, 대화 내용, 경로 안 사용자명 미포함). FK 없음
BEGIN;

CREATE TABLE IF NOT EXISTS mon_tool_snap (
  pc_nm            VARCHAR(100)  NOT NULL,                              -- PC명(업로더 --pc, 기본 호스트명 — 사용자명이 들어 있으면 해시 표기)
  msrmt_dtm        TIMESTAMPTZ   NOT NULL,                              -- 측정일시
  instl_skill_cnt  INT           NOT NULL DEFAULT 0,                    -- 설치스킬건수
  instl_agent_cnt  INT           NOT NULL DEFAULT 0,                    -- 설치에이전트건수
  instl_plugin_cnt INT           NOT NULL DEFAULT 0,                    -- 설치플러그인건수
  actv_plugin_cnt  INT           NOT NULL DEFAULT 0,                    -- 활성플러그인건수(enabledPlugins = true)
  instl_hook_cnt   INT           NOT NULL DEFAULT 0,                    -- 설치훅건수(이벤트 × 명령 1건)
  instl_mcp_cnt    INT           NOT NULL DEFAULT 0,                    -- 설치MCP건수
  use_skill_cnt    INT           NOT NULL DEFAULT 0,                    -- 사용스킬건수(집계 기간 1회 이상 사용한 서로 다른 스킬)
  use_agent_cnt    INT           NOT NULL DEFAULT 0,                    -- 사용에이전트건수
  use_plugin_cnt   INT           NOT NULL DEFAULT 0,                    -- 사용플러그인건수
  use_hook_cnt     INT           NOT NULL DEFAULT 0,                    -- 사용훅건수(실행된 훅 이벤트 종류)
  use_mcp_cnt      INT           NOT NULL DEFAULT 0,                    -- 사용MCP건수
  use_call_cnt     BIGINT        NOT NULL DEFAULT 0,                    -- 사용호출건수(집계 기간 스킬·에이전트·플러그인·MCP 호출 합, 훅 제외)
  instl_dtl_val    JSONB         NOT NULL DEFAULT '{}'::jsonb,          -- 설치상세값(도구 목록 : 종류·이름·출처·버전·활성·이벤트·스크립트 파일명, 수집 설정)
  use_dtl_val      JSONB         NOT NULL DEFAULT '{}'::jsonb,          -- 사용상세값(집계 기간·도구별 턴·호출·오류·평균 ms·일별 추이·훅 이벤트별 실행)
  del_yn           CHAR(1)       NOT NULL DEFAULT 'N',                  -- 삭제여부
  del_dtm          TIMESTAMPTZ,                                         -- 삭제일시
  regr_id          TEXT          NOT NULL DEFAULT 'ADMIN',              -- 등록자ID
  reg_dtm          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,    -- 등록일시
  modr_id          TEXT          NOT NULL DEFAULT 'ADMIN',              -- 변경자ID
  mod_dtm          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,    -- 변경일시
  CONSTRAINT pk_mon_tool_snap PRIMARY KEY (pc_nm, msrmt_dtm),
  CONSTRAINT mon_tool_snap_del_yn_check CHECK (del_yn IN ('Y', 'N')),
  CONSTRAINT mon_tool_snap_cnt_check CHECK (instl_skill_cnt >= 0 AND instl_agent_cnt >= 0 AND instl_plugin_cnt >= 0 AND actv_plugin_cnt >= 0 AND instl_hook_cnt >= 0 AND instl_mcp_cnt >= 0 AND use_skill_cnt >= 0 AND use_agent_cnt >= 0 AND use_plugin_cnt >= 0 AND use_hook_cnt >= 0 AND use_mcp_cnt >= 0 AND use_call_cnt >= 0)
);

-- 조회 : 최신 1행(PC 무관) — /api/admin/tools 1단계
CREATE INDEX IF NOT EXISTS x_mon_tool_snap_01
  ON mon_tool_snap (msrmt_dtm DESC) WHERE del_yn = 'N';
-- 조회 : PC 별 최근 288행·상세가 있는 최신 행 — PK (pc_nm, msrmt_dtm) 선두 칼럼 범위 스캔(별도 인덱스 없음)

CREATE OR REPLACE FUNCTION fn_upd_mon_tool_snap_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mon_tool_snap_mod_dtm ON mon_tool_snap;
CREATE TRIGGER trg_mon_tool_snap_mod_dtm
  BEFORE UPDATE ON mon_tool_snap
  FOR EACH ROW EXECUTE FUNCTION fn_upd_mon_tool_snap_mod_dtm();

SELECT fn_grant_svc_only('TABLE', 'mon_tool_snap');
SELECT fn_grant_svc_only('FUNCTION', 'fn_upd_mon_tool_snap_mod_dtm()');

COMMENT ON TABLE mon_tool_snap IS 'PC 도구 설치·사용 현황 스냅숏 — (PC명, 측정일시) 1회 수집 1행, 로컬 업로더 insert, 관리자 /admin/tools 조회';
COMMENT ON INDEX x_mon_tool_snap_01 IS '최신·최근 288행 조회(측정일시 내림차순, 활성 행)';
COMMENT ON COLUMN mon_tool_snap.pc_nm IS 'PC명';
COMMENT ON COLUMN mon_tool_snap.msrmt_dtm IS '측정일시';
COMMENT ON COLUMN mon_tool_snap.instl_skill_cnt IS '설치스킬건수';
COMMENT ON COLUMN mon_tool_snap.instl_agent_cnt IS '설치에이전트건수';
COMMENT ON COLUMN mon_tool_snap.instl_plugin_cnt IS '설치플러그인건수';
COMMENT ON COLUMN mon_tool_snap.actv_plugin_cnt IS '활성플러그인건수';
COMMENT ON COLUMN mon_tool_snap.instl_hook_cnt IS '설치훅건수';
COMMENT ON COLUMN mon_tool_snap.instl_mcp_cnt IS '설치MCP건수';
COMMENT ON COLUMN mon_tool_snap.use_skill_cnt IS '사용스킬건수';
COMMENT ON COLUMN mon_tool_snap.use_agent_cnt IS '사용에이전트건수';
COMMENT ON COLUMN mon_tool_snap.use_plugin_cnt IS '사용플러그인건수';
COMMENT ON COLUMN mon_tool_snap.use_hook_cnt IS '사용훅건수';
COMMENT ON COLUMN mon_tool_snap.use_mcp_cnt IS '사용MCP건수';
COMMENT ON COLUMN mon_tool_snap.use_call_cnt IS '사용호출건수';
COMMENT ON COLUMN mon_tool_snap.instl_dtl_val IS '설치상세값';
COMMENT ON COLUMN mon_tool_snap.use_dtl_val IS '사용상세값';
COMMENT ON COLUMN mon_tool_snap.del_yn IS '삭제여부';
COMMENT ON COLUMN mon_tool_snap.del_dtm IS '삭제일시';
COMMENT ON COLUMN mon_tool_snap.regr_id IS '등록자ID';
COMMENT ON COLUMN mon_tool_snap.reg_dtm IS '등록일시';
COMMENT ON COLUMN mon_tool_snap.modr_id IS '변경자ID';
COMMENT ON COLUMN mon_tool_snap.mod_dtm IS '변경일시';

COMMIT;

NOTIFY pgrst, 'reload schema';
