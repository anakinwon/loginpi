-- 076_search_trgm_expand.sql
-- pg_trgm GIN 확대: 상품(mps_item)·게시판(brd_post) substring 검색 가속.
--
-- 배경: 카페 검색은 sql/072에서 trigram GIN으로 '%q%' 풀스캔을 해소했으나,
--   상품(mps-item.ts:193 item_nm.ilike/item_desc.ilike)·게시판(board/[category]:47
--   post_ttl.ilike/post_cont.ilike)은 같은 substring 검색인데 텍스트 인덱스가 없어 풀스캔 중.
--
-- 기법: PostgREST .ilike(=ILIKE)는 gin_trgm_ops가 대소문자 무시로 직접 가속한다.
--   → 카페 RPC처럼 lower() 식 인덱스가 필요 없고, 컬럼 단일 GIN 인덱스면 충분.
--   → 애플리케이션 코드는 한 줄도 바꾸지 않는다(기존 ILIKE 쿼리가 자동으로 색인 사용).
--   OR 검색(이름 OR 소개)은 양쪽 컬럼 모두 인덱스가 있어야 BitmapOr로 결합되므로 각 2개씩 생성.
--
-- 비고: 활성 행만 부분 인덱스(WHERE del_yn='N')로 색인 경량화.
--   대용량 운영 테이블이면 락 회피를 위해 CREATE INDEX CONCURRENTLY 사용을 고려
--   (단 CONCURRENTLY는 트랜잭션 밖에서만 가능 — 본 파일은 트랜잭션 미사용).

CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- sql/072에서 활성화됨(멱등)

-- ──────────────────────────────────────────
-- 1) 상품 검색 — mps_item.item_nm / item_desc (ILIKE '%q%')
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mps_item_nm_trgm
  ON public.mps_item USING gin (item_nm gin_trgm_ops)
  WHERE del_yn = 'N';

CREATE INDEX IF NOT EXISTS idx_mps_item_desc_trgm
  ON public.mps_item USING gin (item_desc gin_trgm_ops)
  WHERE del_yn = 'N';

-- ──────────────────────────────────────────
-- 2) 게시판 검색 — brd_post.post_ttl / post_cont (ILIKE '%q%')
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_brd_post_ttl_trgm
  ON public.brd_post USING gin (post_ttl gin_trgm_ops)
  WHERE del_yn = 'N';

CREATE INDEX IF NOT EXISTS idx_brd_post_cont_trgm
  ON public.brd_post USING gin (post_cont gin_trgm_ops)
  WHERE del_yn = 'N';

-- 적용 확인:
--   SELECT indexname FROM pg_indexes
--   WHERE indexname LIKE '%_trgm' ORDER BY indexname;
-- 효과 확인(인덱스 사용 여부):
--   EXPLAIN ANALYZE SELECT item_id FROM public.mps_item
--   WHERE del_yn='N' AND item_nm ILIKE '%검색어%';  -- Bitmap Index Scan on idx_mps_item_nm_trgm 기대
