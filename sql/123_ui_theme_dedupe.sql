-- DA-APPROVED: 중복 시드 정리 — 물리 DELETE (중복된 ui_theme 시드 행, 사용자 데이터 아님)
--   배경: sql/119 INSERT가 theme_nm 유니크 없이 ON CONFLICT DO NOTHING이라,
--         재적용 시 활성 '기본(그린)'은 uq_ui_theme_active(부분 유니크)에 막혀 스킵되지만
--         비활성 '파스텔 대시보드'(actv_yn='N')는 충돌 대상이 없어 매 적용마다 중복 누적됨.
--   요청: "파스텔 대시보드"가 3개 → 최초 생성(reg_dtm 최소) 1건만 남기고 물리 삭제.
--   조치: 이름별 최초 1건만 보존하도록 일반화(파스텔 외 우발 중복도 함께 정리) +
--         theme_nm 활성행 유니크 인덱스로 재발 차단(시드 ON CONFLICT DO NOTHING 멱등화).
--   ※ 적용 전 확인용:
--     SELECT theme_nm, count(*) FROM public.ui_theme WHERE del_yn='N' GROUP BY theme_nm HAVING count(*)>1;

BEGIN;

-- 1) 동일 theme_nm 중복 행 물리 삭제 — 가장 먼저 생성된 1건만 보존
--    (reg_dtm 오름차순 최소 = 최초, 동시각이면 ctid로 안정 정렬)
DELETE FROM public.ui_theme a
USING public.ui_theme b
WHERE a.theme_nm = b.theme_nm
  AND a.del_yn = 'N'
  AND b.del_yn = 'N'
  AND (a.reg_dtm > b.reg_dtm
       OR (a.reg_dtm = b.reg_dtm AND a.ctid > b.ctid));

-- 2) 재발 방지 — 활성행 theme_nm 유니크 (이후 sql/119 재적용 시 파스텔도 정상 스킵)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ui_theme_nm_active
  ON public.ui_theme(theme_nm) WHERE del_yn = 'N';

COMMIT;

-- 적용 후 검증: 이름별 1건씩만 남아야 정상
--   SELECT theme_nm, count(*) FROM public.ui_theme WHERE del_yn='N' GROUP BY theme_nm ORDER BY 1;
