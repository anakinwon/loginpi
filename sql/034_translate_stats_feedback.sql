-- DA-APPROVED: msg_trans 번역 품질 피드백 + 캐시 히트 카운터 + 통계 RPC — Phase 12 후속 (TASK-098·099)
-- ① feedback_yn: 메시지별 번역 👍/👎 피드백 (향후 fine-tune 데이터)
-- ② hit_cnt: DB 캐시 히트 누적 횟수 — 캐시 히트율 = Σhit_cnt / (Σhit_cnt + 행 수)
-- ③ fn_msg_trans_hit: 캐시 히트 원자적 증가 (dedup 라이브러리에서 fire-and-forget 호출)
-- ④ fn_translate_stats: 어드민 번역 통계 (일별 건수·히트·문자수 + 모델별 + 피드백 집계)

ALTER TABLE public.msg_trans
  ADD COLUMN IF NOT EXISTS feedback_yn CHAR(1) CHECK (feedback_yn IN ('Y', 'N'));

ALTER TABLE public.msg_trans
  ADD COLUMN IF NOT EXISTS hit_cnt INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.msg_trans.feedback_yn IS '번역 품질 피드백: Y(👍 좋음) | N(👎 나쁨) | NULL(없음) — TASK-099';
COMMENT ON COLUMN public.msg_trans.hit_cnt     IS 'DB 캐시 히트 누적 횟수 — 캐시 히트율 산출용 (TASK-098)';

-- 캐시 히트 원자적 증가 — supabase-js는 표현식 UPDATE 미지원이므로 RPC로 처리
CREATE OR REPLACE FUNCTION public.fn_msg_trans_hit(
  p_msg_id    UUID,
  p_locale_cd VARCHAR
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.msg_trans
     SET hit_cnt = hit_cnt + 1,
         mod_dtm = CURRENT_TIMESTAMP
   WHERE msg_id = p_msg_id
     AND locale_cd = p_locale_cd
     AND del_yn = 'N';
$$;

-- 어드민 번역 통계 — 기간 내 일별 시리즈 + 모델별 분포 + 피드백 합계 (단일 JSONB 응답)
CREATE OR REPLACE FUNCTION public.fn_translate_stats(
  p_from DATE,
  p_to   DATE
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
WITH scoped AS (
  SELECT (reg_dtm AT TIME ZONE 'UTC')::date AS dt,
         hit_cnt,
         LENGTH(trans_cont) AS char_cnt,
         COALESCE(model_ver, 'unknown') AS model_ver,
         feedback_yn
    FROM public.msg_trans
   WHERE del_yn = 'N'
     AND (reg_dtm AT TIME ZONE 'UTC')::date BETWEEN p_from AND p_to
),
daily AS (
  SELECT dt,
         COUNT(*)      AS trans_cnt,
         SUM(hit_cnt)  AS hit_cnt,
         SUM(char_cnt) AS char_cnt
    FROM scoped
   GROUP BY dt
),
models AS (
  SELECT model_ver, COUNT(*) AS cnt
    FROM scoped
   GROUP BY model_ver
),
fb AS (
  SELECT COUNT(*) FILTER (WHERE feedback_yn = 'Y') AS up_cnt,
         COUNT(*) FILTER (WHERE feedback_yn = 'N') AS down_cnt
    FROM scoped
)
SELECT jsonb_build_object(
  'series', COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
        'dt', to_char(dt, 'YYYY-MM-DD'),
        'trans_cnt', trans_cnt,
        'hit_cnt', hit_cnt,
        'char_cnt', char_cnt
      ) ORDER BY dt) FROM daily),
    '[]'::jsonb),
  'models', COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('model_ver', model_ver, 'cnt', cnt) ORDER BY cnt DESC)
       FROM models),
    '[]'::jsonb),
  'feedback', (SELECT jsonb_build_object('up_cnt', up_cnt, 'down_cnt', down_cnt) FROM fb)
);
$$;
