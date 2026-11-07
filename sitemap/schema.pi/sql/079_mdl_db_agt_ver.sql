-- 079_mdl_db_agt_ver.sql : 로컬 에이전트 버전 기록(2026-11-07, SQL 편집기 에이전트 중계 2단계) — 에이전트가 요청마다 보내는 User-Agent 의 버전(schemapi-agent/x.y.z)을 최종 확인 일시와 함께 저장
-- DA-APPROVED: 2026-11-07 da-governance-expert — mdl_db_agt 칼럼 1개 agt_ver_txt(에이전트버전텍스트, AGT·VER·TXT 공통표준·039 선례, ver_no 낙관적 잠금과 별개), fn_add_cols_keep_sys 시스템 컬럼 맨 끝 유지, 기존 행 NULL(미기록), 형식 CHECK(x.y.z) — 조건부 지적 P2·P3 2건 반영
-- 용도 : SQL 편집기 큐 등록 전 게이트(1.4.0 미만 = SQL_AGT_OUTDATED 426, 에이전트가 SQL 지시서를 모르는 버전이면 대기하지 않고 즉시 안내)
BEGIN;

SELECT fn_add_cols_keep_sys('mdl_db_agt', $c$
  ADD COLUMN agt_ver_txt VARCHAR(20) CONSTRAINT mdl_db_agt_ver_check CHECK (agt_ver_txt IS NULL OR agt_ver_txt ~ '^[0-9]+\.[0-9]+\.[0-9]+$')$c$);

COMMENT ON COLUMN mdl_db_agt.agt_ver_txt IS '에이전트버전텍스트(User-Agent schemapi-agent/x.y.z 의 x.y.z, 최종 확인 때 갱신 — ver_no 낙관적 잠금과 무관)';

COMMIT;

NOTIFY pgrst, 'reload schema';
