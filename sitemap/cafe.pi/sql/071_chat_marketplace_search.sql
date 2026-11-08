-- 071_chat_marketplace_search.sql
-- 카페 마켓플레이스 통합 검색 — 카페이름·카페소개 prefix(LIKE 'q%') 검색.
-- 성능 설계: 이름·소개를 각각 anchored prefix로 분리 스캔(각자 인덱스) 후 UNION ALL로 합치고
--            room_id 기준 1건만 집계한다. (OR 한 줄이면 두 인덱스 동시 사용 불가 → seq scan 회피)
-- 결과 컬럼은 fn_chat_marketplace와 동일 — API/클라이언트가 그대로 재사용.
-- DDL only (테이블·컬럼 신규 없음): CREATE INDEX / CREATE FUNCTION.

-- 1) prefix LIKE용 인덱스 — lower() + text_pattern_ops 라야 'q%' 검색이 B-tree를 탄다.
--    부분 인덱스(del_yn='N')로 활성 카페만 색인해 크기 절감.
CREATE INDEX IF NOT EXISTS idx_msg_room_nm_prefix
  ON public.msg_room (lower(room_nm) text_pattern_ops)
  WHERE del_yn = 'N';

CREATE INDEX IF NOT EXISTS idx_msg_room_desc_prefix
  ON public.msg_room (lower(room_desc) text_pattern_ops)
  WHERE del_yn = 'N';

-- 2) 검색 함수 — plpgsql + EXECUTE로 패턴을 리터럴 인라인(인덱스 사용 보장).
--    p_q: 검색어 / p_theme_cd: 선택 테마 필터(옵션) / p_limit: 최대 건수.
CREATE OR REPLACE FUNCTION public.fn_chat_marketplace_search(
  p_q        text,
  p_theme_cd varchar DEFAULT NULL,
  p_limit    int DEFAULT 30
)
RETURNS TABLE(
  room_id          uuid,
  room_nm          varchar,
  room_desc        text,
  theme_cd         varchar,
  theme_nm         varchar,
  theme_emoji      varchar,
  theme_tp_cd      varchar,
  room_tp_cd       char,
  max_mbr_cnt      integer,
  entry_fee_pi     numeric,
  entry_expire_dtm timestamptz,
  mbr_cnt          bigint,
  msg_cnt_7d       bigint,
  tip_amt_7d       numeric,
  score            numeric
)
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_q   text := btrim(coalesce(p_q, ''));
  v_pat text;
BEGIN
  -- 빈 검색어는 빈 결과 (호출측에서 일반 마켓플레이스 RPC로 분기)
  IF length(v_q) = 0 THEN
    RETURN;
  END IF;

  -- LIKE 메타문자(\ % _) 이스케이프 후 소문자 prefix 패턴 — 대소문자 무시 + 와일드카드 주입 차단
  v_pat := lower(
    replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_')
  ) || '%';

  RETURN QUERY EXECUTE format($q$
    WITH hits AS (
      -- 이름 prefix (우선순위 0) UNION ALL 소개 prefix (우선순위 1)
      SELECT mr.room_id, 0 AS match_pri
        FROM public.msg_room mr
       WHERE mr.del_yn = 'N' AND lower(mr.room_nm)  LIKE %1$L ESCAPE '\'
      UNION ALL
      SELECT mr.room_id, 1 AS match_pri
        FROM public.msg_room mr
       WHERE mr.del_yn = 'N' AND lower(mr.room_desc) LIKE %1$L ESCAPE '\'
    ),
    best AS (
      -- 이름·소개 양쪽 매치 시 room_id당 1건(이름 매치 우선)으로 중복 제거
      SELECT room_id, min(match_pri) AS match_pri FROM hits GROUP BY room_id
    )
    SELECT r.room_id, r.room_nm, r.room_desc, r.theme_cd,
           t.theme_nm, t.theme_emoji, t.theme_tp_cd,
           r.room_tp_cd, r.max_mbr_cnt, r.entry_fee_pi, r.entry_expire_dtm,
           COALESCE(m.mbr_cnt, 0)  AS mbr_cnt,
           COALESCE(g.msg_cnt, 0)  AS msg_cnt_7d,
           COALESCE(tp.tip_amt, 0) AS tip_amt_7d,
           (COALESCE(m.mbr_cnt, 0) * 2 + COALESCE(g.msg_cnt, 0) * 0.5
              + COALESCE(tp.tip_amt, 0) * 10)::DECIMAL AS score
      FROM best b
      JOIN public.msg_room  r ON r.room_id = b.room_id
      JOIN public.msg_theme t ON t.theme_cd = r.theme_cd AND t.del_yn = 'N'
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS mbr_cnt FROM public.msg_room_mbr mm
         WHERE mm.room_id = r.room_id AND mm.del_yn = 'N'
      ) m ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS msg_cnt FROM public.msg_msg mg
         WHERE mg.room_id = r.room_id AND mg.del_yn = 'N'
           AND mg.reg_dtm >= NOW() - INTERVAL '7 days'
      ) g ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(ti.tip_amt_pi), 0) AS tip_amt FROM public.msg_tip ti
         WHERE ti.room_id = r.room_id AND ti.del_yn = 'N'
           AND ti.reg_dtm >= NOW() - INTERVAL '7 days'
      ) tp ON true
     WHERE r.del_yn = 'N' AND r.is_public_yn = 'Y' AND r.room_tp_cd IN ('G','E')
       AND (r.expr_dtm IS NULL OR r.expr_dtm > NOW())
       AND (r.room_tp_cd <> 'E' OR r.entry_expire_dtm IS NULL OR r.entry_expire_dtm > NOW())
       AND (%2$L::varchar IS NULL OR r.theme_cd = %2$L)
     ORDER BY b.match_pri, score DESC, r.reg_dtm DESC
     LIMIT %3$s
  $q$, v_pat, p_theme_cd, p_limit);
END;
$fn$;
