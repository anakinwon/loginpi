-- DA-APPROVED: 카페 부스팅(노출 우선) 컬럼 신설 (2026-06-21, 신규 매출원)
-- 방장이 Bean으로 카페 노출 우선권을 시간제 구매 → boost_expire_dtm까지 공개 목록 상단 노출.
--   매출: bean_txn SPEND, ref_tp_cd='ROOM_BOOST' (매출 대시보드 자동 집계).
--   _dtm 도메인 준수(기존 entry_expire_dtm·expr_dtm 패턴). NULL = 부스트 없음.

ALTER TABLE public.msg_room
  ADD COLUMN IF NOT EXISTS boost_expire_dtm TIMESTAMPTZ;

COMMENT ON COLUMN public.msg_room.boost_expire_dtm IS
  '카페 부스트(노출 우선) 만료 일시. NULL=부스트 없음. now()보다 미래면 공개 목록 상단 노출';

-- 활성 부스트 조회·정렬용 부분 인덱스 (부스트된 방만 — 대부분 NULL이므로 작게 유지)
CREATE INDEX IF NOT EXISTS idx_msg_room_boost
  ON public.msg_room(boost_expire_dtm DESC)
  WHERE boost_expire_dtm IS NOT NULL AND del_yn = 'N';
