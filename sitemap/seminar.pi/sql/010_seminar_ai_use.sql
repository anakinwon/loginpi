-- 010_seminar_ai_use.sql — 번역 자막(SA8)·음성 번역(SA9) 세미나별 DB 계량(보안 검토 D-2 후속 : translate·tts 가 OPEN 만 확인하던 무계량 AI 대행 통로 차단)
--   smn_vc_use 에 글자 칼럼 2개 추가(추가형) + 판정·기록 함수 fn_use_smn_ai(R-P5 — 세미나 행 잠금 아래 권한·LIVE·분당 글자·세미나 누적 글자를 한 번에, 왕복 1회 R-P1·P2)
-- 선행 : 008. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod — 통합 단계에서(작성 시점 미적용)
-- 명명 : 번역 = TRANS(루트 cafe.pi 접두사 trans_ 선례), 글자 = CHR, 음성합성 = TTS — 신규 표준단어 2개(CHR·TTS) DA 사후 리뷰 대상
--   도메인 _cnt(건수) 종결, 기존 칼럼 삭제·변경 없음, 물리 DELETE 없음
BEGIN;

-- ------------------------------------------------------------
-- 1. smn_vc_use 칼럼 추가 — 같은 (세미나 × 사용자 × 분) 행에 번역·합성 글자를 함께 센다(음성 초·요청건수 판정에는 영향 없음 : fn_use_smn_vc 는 vc_sec_cnt·req_cnt 만 본다)
-- ------------------------------------------------------------
ALTER TABLE smn_vc_use ADD COLUMN IF NOT EXISTS trans_chr_cnt INT NOT NULL DEFAULT 0;
ALTER TABLE smn_vc_use ADD COLUMN IF NOT EXISTS tts_chr_cnt INT NOT NULL DEFAULT 0;
COMMENT ON COLUMN smn_vc_use.trans_chr_cnt IS '번역글자건수 — 그 분에 외부 AI 로 번역한 자막 글자 수(캐시 적중 제외, fn_use_smn_ai TRANS)';
COMMENT ON COLUMN smn_vc_use.tts_chr_cnt IS '음성합성글자건수 — 그 분에 외부 AI 로 합성한 글자 수(캐시 적중 제외, fn_use_smn_ai TTS)';

-- ------------------------------------------------------------
-- 2. fn_use_smn_ai — 번역·합성 1건 사용 판정 + 기록(외부 AI 호출 '전', 실패해도 남는다 = 비용 상한을 보수적으로)
--    p_kind = 'TRANS'(번역) · 'TTS'(합성 음성), p_chr = 이번 글자 수, p_max_chr = 세미나 누적 상한, p_max_min_chr = 사용자 분당 상한
--    반환 : OK · INVALID · NOT_FOUND · NOT_LIVE(LIVE 아님) · FORBIDDEN(개최자·ADMIN·활성 참가 등록자 아님 — 무료도 '입장' 등록 필요) · RATE · QUOTA
--    ponytail: 세미나 행 FOR UPDATE — 캐시 미스(문장 × 언어)마다 1회라 경합은 작다. 청중 수천 명 × 언어 수십 개면 사용자별 행 잠금으로
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_use_smn_ai(
  p_smn_id UUID, p_usr_id UUID, p_kind TEXT, p_chr INT, p_max_chr INT, p_max_min_chr INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_smn smn_mst%ROWTYPE;
  v_min TIMESTAMPTZ := date_trunc('minute', CURRENT_TIMESTAMP);
  v_min_chr INT;
  v_sum BIGINT;
  v_trans BOOLEAN := p_kind = 'TRANS';
BEGIN
  IF p_smn_id IS NULL OR p_usr_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('TRANS', 'TTS')
     OR p_chr IS NULL OR p_chr < 1 OR p_max_chr IS NULL OR p_max_min_chr IS NULL THEN
    RETURN 'INVALID';
  END IF;

  SELECT * INTO v_smn FROM smn_mst s WHERE s.smn_id = p_smn_id AND s.del_yn = 'N' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF v_smn.smn_sts_cd <> 'LIVE' THEN RETURN 'NOT_LIVE'; END IF;
  IF v_smn.hst_usr_id <> p_usr_id
     AND NOT EXISTS (SELECT 1 FROM sys_user u WHERE u.usr_id = p_usr_id AND u.role_cd = 'ADMIN' AND u.del_yn = 'N')
     AND NOT EXISTS (SELECT 1 FROM smn_ptc p WHERE p.smn_id = p_smn_id AND p.usr_id = p_usr_id AND p.del_yn = 'N') THEN
    RETURN 'FORBIDDEN';
  END IF;

  SELECT CASE WHEN v_trans THEN u.trans_chr_cnt ELSE u.tts_chr_cnt END INTO v_min_chr FROM smn_vc_use u
   WHERE u.smn_id = p_smn_id AND u.usr_id = p_usr_id AND u.use_dtm = v_min;
  IF COALESCE(v_min_chr, 0) + p_chr > p_max_min_chr THEN RETURN 'RATE'; END IF;
  SELECT COALESCE(sum(CASE WHEN v_trans THEN u.trans_chr_cnt ELSE u.tts_chr_cnt END), 0) INTO v_sum
    FROM smn_vc_use u WHERE u.smn_id = p_smn_id;
  IF v_sum + p_chr > p_max_chr THEN RETURN 'QUOTA'; END IF;

  INSERT INTO smn_vc_use AS u (smn_id, usr_id, use_dtm, trans_chr_cnt, tts_chr_cnt, regr_id, modr_id)
  VALUES (p_smn_id, p_usr_id, v_min,
          CASE WHEN v_trans THEN p_chr ELSE 0 END, CASE WHEN v_trans THEN 0 ELSE p_chr END,
          p_usr_id::TEXT, p_usr_id::TEXT)
  ON CONFLICT (smn_id, usr_id, use_dtm) WHERE smn_id IS NOT NULL
  DO UPDATE SET trans_chr_cnt = u.trans_chr_cnt + EXCLUDED.trans_chr_cnt,
                tts_chr_cnt = u.tts_chr_cnt + EXCLUDED.tts_chr_cnt,
                modr_id = EXCLUDED.modr_id;
  RETURN 'OK';
END;
$$;
COMMENT ON FUNCTION fn_use_smn_ai(UUID, UUID, TEXT, INT, INT, INT) IS '번역·합성 사용 판정+기록 — 세미나 행 잠금 후 권한(개최자·ADMIN·활성 참가)·LIVE·사용자 분당 글자·세미나 누적 글자. OK·INVALID·NOT_FOUND·NOT_LIVE·FORBIDDEN·RATE·QUOTA';

DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_use_smn_ai(UUID, UUID, TEXT, INT, INT, INT) SET search_path = %I, pg_temp', current_schema());
END;
$$;

SELECT fn_grant_svc_only('FUNCTION', 'fn_use_smn_ai(UUID, UUID, TEXT, INT, INT, INT)');

COMMIT;

-- ------------------------------------------------------------
-- 검증 (적용 후 수동 실행)
-- ------------------------------------------------------------
-- SELECT fn_use_smn_ai(gen_random_uuid(), '<usr_id>', 'TRANS', 10, 1000000, 6000); → NOT_FOUND
-- SELECT fn_use_smn_ai('<smn_id>', '<usr_id>', 'XX', 10, 1000000, 6000);         → INVALID
-- SCHEDULED 세미나                                                               → NOT_LIVE
-- LIVE 세미나 + 참가 등록 없는 일반 사용자                                         → FORBIDDEN
-- 같은 분 누적 6000자 초과 → RATE, 세미나 누적 p_max_chr 초과 → QUOTA
-- SELECT trans_chr_cnt, tts_chr_cnt, req_cnt, vc_sec_cnt FROM smn_vc_use WHERE smn_id = '<smn_id>'; → 번역만 늘고 req_cnt·vc_sec_cnt 그대로
