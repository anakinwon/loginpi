-- 072_chat_search_trigram.sql
-- 카페 마켓플레이스 통합 검색: prefix('q%') → substring('%q%') 전환.
-- 071의 prefix btree(text_pattern_ops)는 앞 와일드카드 '%q%'를 못 타므로 제거하고,
-- pg_trgm GIN 인덱스로 교체한다(부분 일치 = trigram 색인).
-- 함수 시그니처는 071과 동일 — API/클라이언트 무변경.

-- 1) trigram 확장 + GIN 인덱스 (lower() 식 인덱스: 대소문자 무시 substring 매치)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) 죽은 prefix 인덱스 제거 (substring 검색에선 미사용)
DROP INDEX IF EXISTS public.idx_msg_room_nm_prefix;
DROP INDEX IF EXISTS public.idx_msg_room_desc_prefix;

-- 3) GIN trigram 인덱스 — '%q%' / ILIKE 가속. 부분 인덱스(del_yn='N')로 활성 카페만.
CREATE INDEX IF NOT EXISTS idx_msg_room_nm_trgm
  ON public.msg_room USING gin (lower(room_nm) gin_trgm_ops)
  WHERE del_yn = 'N';

CREATE INDEX IF NOT EXISTS idx_msg_room_desc_trgm
  ON public.msg_room USING gin (lower(room_desc) gin_trgm_ops)
  WHERE del_yn = 'N';

-- 4) 검색 함수 — 패턴을 '%q%' substring으로. 이름·소개 각각 GIN 인덱스 스캔 후
--    UNION ALL → room_id당 1건(이름 매치 우선). 와일드카드(% _ \)는 이스케이프해 주입 차단.
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
  IF length(v_q) = 0 THEN
    RETURN;
  END IF;

  -- 메타문자(\ % _) 이스케이프 → 소문자 → 앞뒤 '%' (substring). 사용자가 친 '%'는 리터럴 처리.
  v_pat := '%' || lower(
    replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_')
  ) || '%';

  RETURN QUERY EXECUTE format($q$
    WITH hits AS (
      SELECT mr.room_id, 0 AS match_pri
        FROM public.msg_room mr
       WHERE mr.del_yn = 'N' AND lower(mr.room_nm)  LIKE %1$L ESCAPE '\'
      UNION ALL
      SELECT mr.room_id, 1 AS match_pri
        FROM public.msg_room mr
       WHERE mr.del_yn = 'N' AND lower(mr.room_desc) LIKE %1$L ESCAPE '\'
    ),
    best AS (
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
