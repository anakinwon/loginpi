-- DA-APPROVED: brd_ctgr gallery_yn 컬럼 추가 (갤러리 게시판 지원)
ALTER TABLE brd_ctgr
  ADD COLUMN IF NOT EXISTS gallery_yn CHAR(1) NOT NULL DEFAULT 'N';

COMMENT ON COLUMN brd_ctgr.gallery_yn IS '갤러리보기여부';

-- DA-APPROVED: BUG_RPT (버그리포팅) 게시판 카테고리 등록
-- sort_ord=0 → 기존 게시판보다 앞에 표시됨
-- attch_yn='Y' → 스크린샷 첨부 허용
-- gallery_yn='Y' → 이미지 첨부파일을 그리드 갤러리로 표시
INSERT INTO brd_ctgr (ctgr_cd, ctgr_nm, attch_yn, cmnt_yn, gallery_yn, wr_min_role_cd, sort_ord, use_yn, regr_id, modr_id)
SELECT 'BUG_RPT', '버그리포팅', 'Y', 'Y', 'Y', 'USER', 0, 'Y', 'ADMIN', 'ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM brd_ctgr WHERE ctgr_cd = 'BUG_RPT');
