-- 010_seminar_vc_reserve.sql — 음성 조각 사용량 선예약·환급(사후 정산 경합 차단) + 청중 몫 상한(개최자 몫 보호). 야간 시험 T07(AI 회의록) D-1 후속 + chunk 정산 경합(신규 — 팀장 판정 D-2 translate·tts 와 별개)
-- DA-APPROVED: 야간 시험 T07 — 함수 1개 교체(fn_use_smn_vc, 같은 서명) + 함수 1개 신규(fn_ref_smn_vc_sec), 테이블·인덱스·칼럼 무변경(008 그대로). DA 사후 리뷰 대상
-- 선행 : 008. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod — 통합 단계에서(작성 시점 미적용). GEMINI_API_KEY 설정 전 필수
--   (앱은 fn_ref_smn_vc_sec 유무로 010 적용을 감지해 미적용이면 008 방식 예약으로 후퇴 — 청중 몫 상한은 010 에만). 회귀 시험 src/lib/vc-reserve.db.test.mjs(트랜잭션 ROLLBACK)
--
-- 왜 :
--  · 사후 정산 경합 — 이전엔 128kbps 하한으로만 선과금하고 호출 뒤 실제 길이 차이를 더했다(fn_add_smn_vc_sec).
--    동시 요청 20건이 모두 판정을 통과한 뒤 각자 저비트레이트 긴 오디오(160KB ≈ 213초)를 보내면 상한을 몇 배 넘겨 외부 AI 비용이 나간다.
--    → 앱이 opus 최저 6kbps(750 B/s) 기준 최악 길이를 p_sec 로 선예약하고, 호출 뒤 실제 길이로 fn_ref_smn_vc_sec 환급
--  · 분당 판정(RATE) 의미 변경 — '이미 쓴 초 + 이번 예약 > 상한' 이면 예약(정상 5초 opus ≈ 43초)이 커서 정상 발화도 분당 6번째 조각에서 막힌다.
--    → '이번 분에 이미 쓴(예약 포함) 초 >= 상한' 이면 RATE. 예약은 대개 1~3초 안에 환급되므로 정상 12회/분은 통과,
--      진행 중인 큰 예약이 있으면 같은 분의 다음 요청은 막혀 동시 다발 요청은 1건씩만 지나간다(행 잠금 아래 판정이라 경합 없음)
--  · 청중 몫 상한 — 서버가 무대 역할을 모르므로 참가 등록자 누구나 조각을 보낼 수 있다. 1인 상한(1/4)만으론 4명이 세미나 상한을 다 쓴다.
--    → 개최자가 아닌 참가자 사용량 합계(ADMIN 포함) <= 전체 상한의 1/2. 개최자 몫(1/2 이상)은 늘 남는다.
--      무대 승격 DB 기록이 생기면 무대 화자만 허용으로 좁힌다(ideasForMaster)
BEGIN;

CREATE OR REPLACE FUNCTION fn_use_smn_vc(
  p_smn_id UUID, p_nt_id UUID, p_usr_id UUID, p_sec INT, p_max_sec INT, p_max_req INT,
  p_max_min_sec INT, p_max_usr_sec INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_smn smn_mst%ROWTYPE;
  v_nt smn_nt%ROWTYPE;
  v_min TIMESTAMPTZ := date_trunc('minute', CURRENT_TIMESTAMP);
  v_req INT;
  v_min_sec INT;
  v_sum BIGINT;
  v_usr_sum BIGINT;
  v_ptc_sum BIGINT;
  v_ptc BOOLEAN := FALSE;
BEGIN
  IF (p_smn_id IS NULL) = (p_nt_id IS NULL) OR p_usr_id IS NULL
     OR p_sec IS NULL OR p_sec < 1 OR p_max_sec IS NULL OR p_max_req IS NULL
     OR p_max_min_sec IS NULL OR p_max_usr_sec IS NULL THEN
    RETURN 'INVALID';
  END IF;

  IF p_smn_id IS NOT NULL THEN
    SELECT * INTO v_smn FROM smn_mst s WHERE s.smn_id = p_smn_id AND s.del_yn = 'N' FOR UPDATE;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    IF v_smn.smn_sts_cd <> 'LIVE' THEN RETURN 'NOT_LIVE'; END IF;
    IF v_smn.hst_usr_id <> p_usr_id
       AND NOT EXISTS (SELECT 1 FROM sys_user u WHERE u.usr_id = p_usr_id AND u.role_cd = 'ADMIN' AND u.del_yn = 'N') THEN
      IF NOT EXISTS (SELECT 1 FROM smn_ptc p WHERE p.smn_id = p_smn_id AND p.usr_id = p_usr_id AND p.del_yn = 'N') THEN
        RETURN 'FORBIDDEN';
      END IF;
      v_ptc := TRUE;  -- 참가자 = 1인 누적 상한 + 청중 몫 상한 대상
    END IF;
    IF NOT EXISTS (SELECT 1 FROM smn_agr a
                    WHERE a.smn_id = p_smn_id AND a.usr_id = p_usr_id AND a.agr_tp_cd = 'SPEECH_XFER' AND a.del_yn = 'N') THEN
      RETURN 'NO_AGR';
    END IF;
    SELECT u.req_cnt, u.vc_sec_cnt INTO v_req, v_min_sec FROM smn_vc_use u
     WHERE u.smn_id = p_smn_id AND u.usr_id = p_usr_id AND u.use_dtm = v_min;
    IF COALESCE(v_req, 0) >= p_max_req OR COALESCE(v_min_sec, 0) >= p_max_min_sec THEN RETURN 'RATE'; END IF;
    SELECT COALESCE(sum(u.vc_sec_cnt), 0),
           COALESCE(sum(u.vc_sec_cnt) FILTER (WHERE u.usr_id = p_usr_id), 0),
           COALESCE(sum(u.vc_sec_cnt) FILTER (WHERE u.usr_id <> v_smn.hst_usr_id), 0)
      INTO v_sum, v_usr_sum, v_ptc_sum FROM smn_vc_use u WHERE u.smn_id = p_smn_id;
    IF v_sum + p_sec > p_max_sec
       OR (v_ptc AND (v_usr_sum + p_sec > p_max_usr_sec OR v_ptc_sum + p_sec > p_max_sec / 2)) THEN
      RETURN 'QUOTA';
    END IF;
    INSERT INTO smn_vc_use AS u (smn_id, usr_id, use_dtm, req_cnt, vc_sec_cnt, regr_id, modr_id)
    VALUES (p_smn_id, p_usr_id, v_min, 1, p_sec, p_usr_id::TEXT, p_usr_id::TEXT)
    ON CONFLICT (smn_id, usr_id, use_dtm) WHERE smn_id IS NOT NULL
    DO UPDATE SET req_cnt = u.req_cnt + 1, vc_sec_cnt = u.vc_sec_cnt + EXCLUDED.vc_sec_cnt,
                  modr_id = EXCLUDED.modr_id, mod_dtm = CURRENT_TIMESTAMP;
    RETURN 'OK';
  END IF;

  SELECT * INTO v_nt FROM smn_nt n WHERE n.nt_id = p_nt_id AND n.del_yn = 'N' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF v_nt.smn_id IS NOT NULL OR v_nt.usr_id <> p_usr_id THEN RETURN 'FORBIDDEN'; END IF;
  IF v_nt.nt_sts_cd <> 'RECORDING' THEN RETURN 'NOT_LIVE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM smn_agr a
                  WHERE a.nt_id = p_nt_id AND a.usr_id = p_usr_id AND a.agr_tp_cd = 'NOTE_NOTICE' AND a.del_yn = 'N') THEN
    RETURN 'NO_AGR';
  END IF;
  SELECT u.req_cnt, u.vc_sec_cnt INTO v_req, v_min_sec FROM smn_vc_use u
   WHERE u.nt_id = p_nt_id AND u.usr_id = p_usr_id AND u.use_dtm = v_min;
  IF COALESCE(v_req, 0) >= p_max_req OR COALESCE(v_min_sec, 0) >= p_max_min_sec THEN RETURN 'RATE'; END IF;
  SELECT COALESCE(sum(u.vc_sec_cnt), 0) INTO v_sum FROM smn_vc_use u WHERE u.nt_id = p_nt_id;
  IF v_sum + p_sec > p_max_sec THEN RETURN 'QUOTA'; END IF;
  INSERT INTO smn_vc_use AS u (nt_id, usr_id, use_dtm, req_cnt, vc_sec_cnt, regr_id, modr_id)
  VALUES (p_nt_id, p_usr_id, v_min, 1, p_sec, p_usr_id::TEXT, p_usr_id::TEXT)
  ON CONFLICT (nt_id, usr_id, use_dtm) WHERE nt_id IS NOT NULL
  DO UPDATE SET req_cnt = u.req_cnt + 1, vc_sec_cnt = u.vc_sec_cnt + EXCLUDED.vc_sec_cnt,
                modr_id = EXCLUDED.modr_id, mod_dtm = CURRENT_TIMESTAMP;
  RETURN 'OK';
END;
$$;
COMMENT ON FUNCTION fn_use_smn_vc(UUID, UUID, UUID, INT, INT, INT, INT, INT) IS '음성 조각 사용 판정+예약 — 대상 행 잠금 후 권한·동의·분당 요청·분당 초(이미 쓴 초 >= 상한)·참가자 1인 누적·청중 몫(1/2)·대상 누적 상한. p_sec = 최악 길이 선예약(호출 뒤 fn_ref_smn_vc_sec 환급). OK·INVALID·NOT_FOUND·NOT_LIVE·FORBIDDEN·NO_AGR·RATE·QUOTA';

-- fn_ref_smn_vc_sec — 선예약 환급 : 호출 뒤 실제 과금 초가 예약보다 작으면 그 차이를 뺀다(0 미만 금지, 요청건수 그대로).
--   예약한 분 행 = 이번 분 또는 바로 앞 분(외부 AI 10초 타임아웃이라 분 경계를 넘어도 1분 이내) — 차이를 다 뺄 수 있는 가장 최근 행 1개.
--   /api/speech/chunk 만 부른다
CREATE OR REPLACE FUNCTION fn_ref_smn_vc_sec(p_smn_id UUID, p_nt_id UUID, p_usr_id UUID, p_sec INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_min TIMESTAMPTZ := date_trunc('minute', CURRENT_TIMESTAMP);
  v_dtm TIMESTAMPTZ;
BEGIN
  IF (p_smn_id IS NULL) = (p_nt_id IS NULL) OR p_usr_id IS NULL OR p_sec IS NULL OR p_sec < 1 THEN
    RETURN;
  END IF;
  SELECT u.use_dtm INTO v_dtm FROM smn_vc_use u
   WHERE u.usr_id = p_usr_id
     AND (CASE WHEN p_smn_id IS NOT NULL THEN u.smn_id = p_smn_id ELSE u.nt_id = p_nt_id END)
     AND u.use_dtm IN (v_min, v_min - INTERVAL '1 minute')
     AND u.vc_sec_cnt >= p_sec
   ORDER BY u.use_dtm DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE smn_vc_use u
     SET vc_sec_cnt = GREATEST(0, u.vc_sec_cnt - p_sec), modr_id = p_usr_id::TEXT, mod_dtm = CURRENT_TIMESTAMP
   WHERE u.usr_id = p_usr_id
     AND (CASE WHEN p_smn_id IS NOT NULL THEN u.smn_id = p_smn_id ELSE u.nt_id = p_nt_id END)
     AND u.use_dtm = v_dtm;
END;
$$;
COMMENT ON FUNCTION fn_ref_smn_vc_sec(UUID, UUID, UUID, INT) IS '음성 사용량 선예약 환급 — 이번 분 또는 앞 분 행에서 차이(초)를 뺀다(0 미만 금지). /api/speech/chunk 만 호출';

-- CREATE OR REPLACE 는 SET 설정(proconfig)을 지우므로 search_path 를 다시 고정(008 과 같은 방식), 권한은 서비스 롤만
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_use_smn_vc(UUID, UUID, UUID, INT, INT, INT, INT, INT) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_ref_smn_vc_sec(UUID, UUID, UUID, INT) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_use_smn_vc(UUID, UUID, UUID, INT, INT, INT, INT, INT)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_ref_smn_vc_sec(UUID, UUID, UUID, INT)');

COMMIT;

-- 검증 (적용 후 수동 실행)
-- LIVE 세미나 개최자 : SELECT fn_use_smn_vc('<smn_id>', NULL, '<hst>', 43, 7200, 20, 70, 1800); → OK, 이번 분 행 vc_sec_cnt 43
--   바로 다시 같은 호출(환급 전)                                                          → OK(43 < 70), 행 86
--   한 번 더                                                                               → RATE(86 >= 70)
-- SELECT fn_ref_smn_vc_sec('<smn_id>', NULL, '<hst>', 38);  → 행 vc_sec_cnt 48(예약 43 - 실제 5)
-- 참가자 2명이 각 1800초씩 쓴 뒤 세 번째 참가자 5초                                     → QUOTA(청중 몫 3600 = 7200/2 초과)
-- 같은 상태에서 개최자 5초                                                                → OK(개최자 몫 보존)
-- SELECT proconfig FROM pg_proc WHERE proname IN ('fn_use_smn_vc', 'fn_ref_smn_vc_sec'); → {search_path=<스키마>, pg_temp}
