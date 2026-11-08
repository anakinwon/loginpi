-- 075_chat_marketplace_keep_archived_theme.sql
-- 마켓플레이스 인기·검색 RPC가 '폐기된 테마(del_yn='Y')를 쓰는 기존 카페'를 탈락시키는 회귀 수정.
--
-- 배경: sql/073(PRD_17 v2.0)에서 기존 관심사 테마 19개를 논리삭제(del_yn='Y')하자,
--   fn_chat_marketplace / fn_chat_marketplace_search의 `JOIN msg_theme ... AND t.del_yn='N'`
--   (INNER JOIN)에서 해당 테마를 쓰던 기존 카페가 전부 탈락 → 인기 카페에 2개만 노출.
--   PRD_17은 "기존 카페는 존속"을 명시하므로, 폐기 테마 카페도 마켓에 노출되어야 한다.
--
-- 수정: JOIN의 `AND t.del_yn = 'N'` 조건만 제거. theme_cd는 카페 필수 FK이고 테마는 논리삭제라
--   행이 살아있으므로, INNER JOIN을 유지해도 매칭은 항상 성립하고 theme_nm/이모지도 정상 표시된다.
--   (내 카페·카페 탐색 목록은 chat-room-list.ts의 PostgREST LEFT 임베드라 이미 영향 없음 — 변경 불필요)
--
-- 함수 시그니처는 022/072와 100% 동일 — API/클라이언트 무변경.

-- ──────────────────────────────────────────
-- 1. fn_chat_marketplace — 인기 랭킹 (원본: sql/022 §8)
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chat_marketplace(p_theme_cd VARCHAR DEFAULT NULL, p_limit INT DEFAULT 30)
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
  JOIN public.msg_theme t ON t.theme_cd = r.theme_cd   -- del_yn 조건 제거 (폐기 테마 카페 존속)
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
  LIMIT p_limit;
$$;

-- ──────────────────────────────────────────
-- 2. fn_chat_marketplace_search — 통합 검색 (원본: sql/072)
-- ──────────────────────────────────────────
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
       AND (%2$L::varchar IS NULL OR r.theme_cd = %2$L)
     ORDER BY b.match_pri, score DESC, r.reg_dtm DESC
     LIMIT %3$s
  $q$, v_pat, p_theme_cd, p_limit);
END;
$fn$;
