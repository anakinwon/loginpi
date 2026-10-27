-- 010_seminar_tts_use.sql — 음성 번역 듣기(더빙, SA9) 합성 글자 계량 : smn_vc_use 에 합성글자건수 칼럼 추가 + 판정·기록 함수 fn_use_smn_tts
-- DA-APPROVED: 야간 시험 T09 (보안 검토 D-2 후속, 2026-10-27) — 칼럼 1개 ALTER ADD·함수 1개 신규만, 기존 칼럼·데이터 무변경. 신규 표준단어 2개(아래), DA 사후 리뷰 대상
-- 선행 : 008. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod — 통합 단계에서(작성 시점 미적용)
-- 신규 표준단어(정본 §1-1 '자음 위주 2~3자') : 합성 SYN (synthesis, 행안부 SYNTH 계열) · 글자 CHR (character)
--
-- 왜 : /api/speech/tts 가 무계량이었다(D-2 — 청중 누구나 외부 AI 합성을 무제한 대행). 이제
--  · 권한(세미나 있음·LIVE·개최자/ADMIN/무료 세미나/유료면 참가 등록) 판정을 캐시 조회 '앞'에서 DB 1왕복으로(캐시 적중이어도 무권한 통과 없음)
--  · 캐시 미스(외부 AI 호출)만 글자 수를 세미나 누적·사용자 1인 누적 상한에 차감(같은 문장은 1회만 과금 — 계획 A-3)
--  · 적중(p_chr = 0)은 판정만 — 세미나 행 잠금 없이 읽는다(청중 전원이 문장마다 부르므로 잠금 경합 회피). 미스만 FOR UPDATE 로 누적 상한 직렬화(R-P5)
-- 사용량 행은 fn_use_smn_vc 와 같은 (세미나 × 사용자 × 분) 행 — req_cnt·vc_sec_cnt(음성 조각 상한)는 건드리지 않는다
BEGIN;

ALTER TABLE smn_vc_use ADD COLUMN IF NOT EXISTS syn_chr_cnt INT NOT NULL DEFAULT 0;  -- 합성글자건수
COMMENT ON COLUMN smn_vc_use.syn_chr_cnt IS '합성글자건수 — 그 분에 외부 AI 로 합성한 번역 음성 글자 수(캐시 미스만, fn_use_smn_tts)';
COMMENT ON TABLE  smn_vc_use IS '음성 처리 사용량 — (세미나 또는 대면 노트) × 사용자 × 분 1행. 누적 상한 = 대상 SUM(vc_sec_cnt) vs SPEECH_MAX_MIN, 분당 요청 = 현재 분 req_cnt, 합성 글자 = SUM(syn_chr_cnt). fn_use_smn_vc·fn_add_smn_vc_sec·fn_use_smn_tts 만 쓴다';

-- fn_use_smn_tts — 합성 음성 1문장 판정 + 글자 기록
--   반환 : OK · INVALID · NOT_FOUND · NOT_LIVE · PAY(유료 세미나 미등록) · QUOTA(세미나 누적 p_max_chr 또는 개최자·ADMIN 아닌 사용자 1인 누적 p_max_usr_chr 초과)
--   권한 = 입장권·gate(src/lib/engage.ts)와 같은 규칙 : 개최자 · ADMIN · 무료 세미나는 로그인 사용자 누구나 · 유료면 활성 참가 등록자
CREATE OR REPLACE FUNCTION fn_use_smn_tts(p_smn_id UUID, p_usr_id UUID, p_chr INT, p_max_chr INT, p_max_usr_chr INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_smn smn_mst%ROWTYPE;
  v_staff BOOLEAN;
  v_sum BIGINT;
  v_usr_sum BIGINT;
BEGIN
  IF p_smn_id IS NULL OR p_usr_id IS NULL OR p_chr IS NULL OR p_chr < 0
     OR p_max_chr IS NULL OR p_max_usr_chr IS NULL THEN
    RETURN 'INVALID';
  END IF;

  IF p_chr > 0 THEN
    SELECT * INTO v_smn FROM smn_mst s WHERE s.smn_id = p_smn_id AND s.del_yn = 'N' FOR UPDATE;
  ELSE
    SELECT * INTO v_smn FROM smn_mst s WHERE s.smn_id = p_smn_id AND s.del_yn = 'N';
  END IF;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF v_smn.smn_sts_cd <> 'LIVE' THEN RETURN 'NOT_LIVE'; END IF;
  v_staff := v_smn.hst_usr_id = p_usr_id
    OR EXISTS (SELECT 1 FROM sys_user u WHERE u.usr_id = p_usr_id AND u.role_cd = 'ADMIN' AND u.del_yn = 'N');
  IF NOT v_staff AND COALESCE(v_smn.ent_pi_amt, 0) > 0
     AND NOT EXISTS (SELECT 1 FROM smn_ptc p WHERE p.smn_id = p_smn_id AND p.usr_id = p_usr_id AND p.del_yn = 'N') THEN
    RETURN 'PAY';
  END IF;
  IF p_chr = 0 THEN RETURN 'OK'; END IF;

  SELECT COALESCE(sum(u.syn_chr_cnt), 0), COALESCE(sum(u.syn_chr_cnt) FILTER (WHERE u.usr_id = p_usr_id), 0)
    INTO v_sum, v_usr_sum FROM smn_vc_use u WHERE u.smn_id = p_smn_id;
  IF v_sum + p_chr > p_max_chr OR (NOT v_staff AND v_usr_sum + p_chr > p_max_usr_chr) THEN RETURN 'QUOTA'; END IF;
  INSERT INTO smn_vc_use AS u (smn_id, usr_id, use_dtm, syn_chr_cnt, regr_id, modr_id)
  VALUES (p_smn_id, p_usr_id, date_trunc('minute', CURRENT_TIMESTAMP), p_chr, p_usr_id::TEXT, p_usr_id::TEXT)
  ON CONFLICT (smn_id, usr_id, use_dtm) WHERE smn_id IS NOT NULL
  DO UPDATE SET syn_chr_cnt = u.syn_chr_cnt + EXCLUDED.syn_chr_cnt, modr_id = EXCLUDED.modr_id;
  RETURN 'OK';
END;
$$;
COMMENT ON FUNCTION fn_use_smn_tts(UUID, UUID, INT, INT, INT) IS '합성 음성 판정+글자 기록 — LIVE·권한(gate 규칙) 확인, p_chr>0(캐시 미스)만 세미나·사용자 누적 상한 차감. OK·INVALID·NOT_FOUND·NOT_LIVE·PAY·QUOTA';

DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_use_smn_tts(UUID, UUID, INT, INT, INT) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_use_smn_tts(UUID, UUID, INT, INT, INT)');

COMMIT;

-- 검증 (적용 후 수동 실행)
-- SELECT fn_use_smn_tts(NULL, '<usr_id>', 10, 300000, 150000);            → INVALID
-- SELECT fn_use_smn_tts('<SCHEDULED smn_id>', '<usr_id>', 0, 300000, 150000); → NOT_LIVE
-- SELECT fn_use_smn_tts('<유료 LIVE smn_id>', '<미등록 usr_id>', 0, 300000, 150000); → PAY
-- SELECT fn_use_smn_tts('<LIVE smn_id>', '<usr_id>', 120, 300000, 150000);   → OK, smn_vc_use.syn_chr_cnt +120
