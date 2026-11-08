-- 126_chat_marketplace_pagination.sql
-- 마켓플레이스 RPC에 페이지네이션(OFFSET) 파라미터 추가
-- 표준 1 위반(전량 로드) 해결: limit 고정값→서버 상한선(max 100) + OFFSET 지원

-- 1. fn_chat_marketplace — 인기 랭킹 RPC에 p_offset 추가
CREATE OR REPLACE FUNCTION public.fn_chat_marketplace(
  p_theme_cd VARCHAR DEFAULT NULL,
  p_limit INT DEFAULT 30,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  room_id UUID, room_nm VARCHAR, room_desc TEXT, theme_cd VARCHAR,
  theme_nm VARCHAR, theme_emoji VARCHAR, theme_tp_cd VARCHAR,
  room_tp_cd CHAR, max_mbr_cnt INT, entry_fee_pi DECIMAL, entry_expire_dtm TIMESTAMPTZ,
  mbr_cnt BIGINT, msg_cnt_7d BIGINT, tip_amt_7d DECIMAL, score DECIMAL
) LANGUAGE sql STABLE AS $$
  SELECT r.room_id, r.room_nm, r.room_desc, r.theme_cd,
         t.theme_nm, t.theme_emoji, t.theme_tp_cd,
         r.room_tp_cd, r.max_mbr_cnt, r.entry_fee_pi, r.entry_expire_dtm,
         COALESCE(m.mbr_cnt, 0)  AS mbr_cnt,
         COALESCE(g.msg_cnt, 0)  AS msg_cnt_7d,
         COALESCE(tp.tip_amt, 0) AS tip_amt_7d,
         (COALESCE(m.mbr_cnt, 0) * 2 + COALESCE(g.msg_cnt, 0) * 0.5 + COALESCE(tp.tip_amt, 0) * 10)::DECIMAL AS score
  FROM public.msg_room r
  JOIN public.msg_theme t ON t.theme_cd = r.theme_cd
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
    AND (p_theme_cd IS NULL OR r.theme_cd = p_theme_cd)
  ORDER BY score DESC, r.reg_dtm DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- 2. fn_chat_marketplace_search — 통합 검색 RPC에 p_offset 추가
CREATE OR REPLACE FUNCTION public.fn_chat_marketplace_search(
  p_q        text,
  p_theme_cd varchar DEFAULT NULL,
  p_limit    int DEFAULT 30,
  p_offset   int DEFAULT 0
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

  -- 메타문자(\ % _) 이스케이프 → 소문자 → 앞뒤 '%' (substring)
  v_pat := '%' || lower(
    replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_')
  ) || '%';

  RETURN QUERY EXECUTE format($q$
    SELECT r.room_id, r.room_nm, r.room_desc, r.theme_cd,
           t.theme_nm, t.theme_emoji, t.theme_tp_cd,
           r.room_tp_cd, r.max_mbr_cnt, r.entry_fee_pi, r.entry_expire_dtm,
           COALESCE(m.mbr_cnt, 0)  AS mbr_cnt,
           COALESCE(g.msg_cnt, 0)  AS msg_cnt_7d,
           COALESCE(tp.tip_amt, 0) AS tip_amt_7d,
           (COALESCE(m.mbr_cnt, 0) * 2 + COALESCE(g.msg_cnt, 0) * 0.5 + COALESCE(tp.tip_amt, 0) * 10)::DECIMAL AS score
      FROM public.msg_room r
      JOIN public.msg_theme t ON t.theme_cd = r.theme_cd
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
       AND (lower(r.room_nm) LIKE %1$s ESCAPE '\' OR lower(r.room_desc) LIKE %1$s ESCAPE '\')
       AND (%2$L::varchar IS NULL OR r.theme_cd = %2$L)
     ORDER BY score DESC, r.reg_dtm DESC
     LIMIT %3$s OFFSET %4$s
  $q$, v_pat, p_theme_cd, p_limit, p_offset);
END;
$fn$;
