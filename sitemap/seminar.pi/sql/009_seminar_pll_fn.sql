-- 009_seminar_pll_fn.sql — 설문 투표(1인 1표, 다시 투표 = 같은 행 갱신)·설문 집계 함수 2개(SubAgent4 설문·Q&A·출석)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-27) — 함수 2개(fn_vote_smn_pll·fn_cnt_smn_pll) 신규만, 테이블·인덱스 무변경(008 그대로). DA 사후 리뷰 대상
-- 선행 : 008. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod — 2026-10-27 dev·stg·prod 적용 완료(야간 시험 r1 통합, PRD 9절 #17)
--
-- 왜 함수인가 :
--  · 투표 — x_smn_pll_vt_01 이 부분 유일 인덱스(WHERE del_yn='N')라 PostgREST upsert(onConflict)를 못 쓴다(008 주석 42P10).
--    설문 상태(OPEN)·선택지 소속 확인 + INSERT … ON CONFLICT DO UPDATE 를 한 왕복·한 트랜잭션으로(R-P1·R-P5 — 마감 직후 표가 끼어드는 경합 없음)
--  · 집계 — PostgREST 는 GROUP BY 가 없고(집계 함수는 기본 꺼짐), 투표 행을 다 읽으면 max-rows(1000)에서 잘려 수가 틀린다 → DB 에서 센다(R-P3)
-- REA 근거 : Jitsi 설문은 서버 polls 컴포넌트가 권위(answer-poll 을 서버가 다시 뿌림), 늦게 들어온 사람은 이력(old-polls)을 받는다
--   → 우리도 서버(DB)가 정본, 화면은 refresh 신호를 받아 다시 읽는다. 선택지별 boolean 배열(복수 선택)은 미채택 — 1인 1표(계획서 SA4)
BEGIN;

-- 투표 — 반환 OK · NOT_FOUND(설문·선택지 없음/다른 설문의 선택지) · CLOSED(마감)
--  권한(세미나 참가 자격)은 API 가 먼저 확인한다(입장권 발급과 같은 규칙)
CREATE OR REPLACE FUNCTION fn_vote_smn_pll(p_smn_id UUID, p_pll_id UUID, p_opt_id UUID, p_usr_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_sts TEXT;
BEGIN
  -- 설문 행 공유 잠금 — 마감(UPDATE)과 직렬화. 마감 뒤 들어온 표는 CLOSED
  SELECT l.pll_sts_cd INTO v_sts FROM smn_pll l
   WHERE l.pll_id = p_pll_id AND l.smn_id = p_smn_id AND l.del_yn = 'N' FOR SHARE;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF v_sts <> 'OPEN' THEN RETURN 'CLOSED'; END IF;
  PERFORM 1 FROM smn_pll_opt o WHERE o.opt_id = p_opt_id AND o.pll_id = p_pll_id AND o.del_yn = 'N';
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;

  INSERT INTO smn_pll_vt AS v (pll_id, opt_id, usr_id, regr_id, modr_id)
  VALUES (p_pll_id, p_opt_id, p_usr_id, p_usr_id::TEXT, p_usr_id::TEXT)
  ON CONFLICT (pll_id, usr_id) WHERE del_yn = 'N'
  DO UPDATE SET opt_id = EXCLUDED.opt_id, modr_id = EXCLUDED.modr_id
   WHERE v.opt_id IS DISTINCT FROM EXCLUDED.opt_id;
  RETURN 'OK';
END;
$$;
COMMENT ON FUNCTION fn_vote_smn_pll(UUID, UUID, UUID, UUID) IS '설문 투표 — 설문 OPEN·선택지 소속 확인 후 1인 1표 INSERT, 이미 있으면 opt_id 갱신(다시 투표). OK·NOT_FOUND·CLOSED';

-- 집계 — 설문 여러 개(한 쪽 분량)의 선택지별 표 수 + 내 선택. 표가 0인 선택지는 행이 없다(화면이 0으로 채움)
CREATE OR REPLACE FUNCTION fn_cnt_smn_pll(p_pll_ids UUID[], p_usr_id UUID)
RETURNS TABLE (pll_id UUID, opt_id UUID, vt_cnt INT, my_yn CHAR(1))
LANGUAGE sql
STABLE
AS $$
  SELECT v.pll_id, v.opt_id, COUNT(*)::INT,
         CASE WHEN bool_or(v.usr_id = p_usr_id) THEN 'Y' ELSE 'N' END::CHAR(1)
    FROM smn_pll_vt v
   WHERE v.pll_id = ANY (p_pll_ids) AND v.del_yn = 'N'
   GROUP BY v.pll_id, v.opt_id;
$$;
COMMENT ON FUNCTION fn_cnt_smn_pll(UUID[], UUID) IS '설문 집계 — 설문·선택지별 활성 표 수(vt_cnt)와 내 선택 여부(my_yn). x_smn_pll_vt_01 범위 조회';

-- 함수 search_path = 생성 스키마 고정(004·008 과 같은 방식)
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_vote_smn_pll(UUID, UUID, UUID, UUID) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_cnt_smn_pll(UUID[], UUID) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_vote_smn_pll(UUID, UUID, UUID, UUID)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_cnt_smn_pll(UUID[], UUID)');

COMMIT;

-- 검증 (적용 후 수동 실행)
-- SELECT fn_vote_smn_pll('<smn_id>', gen_random_uuid(), gen_random_uuid(), '<usr_id>');  → NOT_FOUND
-- OPEN 설문에 같은 사용자 2번(다른 선택지) → OK·OK, smn_pll_vt 활성 1행·opt_id = 두 번째
-- pll_sts_cd = 'CLOSED' 뒤 → CLOSED
-- SELECT * FROM fn_cnt_smn_pll(ARRAY['<pll_id>']::UUID[], '<usr_id>');                  → 선택지별 vt_cnt·my_yn
