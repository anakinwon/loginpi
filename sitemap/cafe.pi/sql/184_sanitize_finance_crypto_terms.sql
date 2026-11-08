-- 184: 메인넷 절제 — 투자·시세 어휘 잔존 2건 순화 (2026-07-17 가상심사 잔존분)
--
-- ① 폐기 테마 FINANCE
--    - i18n 죽은 키 themes.FINANCE 물리 DELETE (i18n_message는 del_yn 없음·sync 무필터라
--      물리 DELETE가 정본 — CLAUDE.md 명시 예외, sql/182 베팅 키 선례)
--    - msg_theme 원본명·해시태그 순화: 폐기 테마는 useThemeName이 DB명 폴백하므로
--      키 삭제만 하면 '재테크/투자'가 방 목록에 재노출됨(staging 활성 방 2개) → 원본 자체 순화
-- ② 활성 테마 CRYPTO_TRADING
--    - 표시는 절제 오버레이('크립토 라운지')로 이미 순화됨. 다만 공개 API(/api/chat/themes)
--      응답 JSON에 원문 theme_nm('Pi투자')·theme_desc('#투자 #시세분석')가 그대로 실리므로
--      DB 원본을 오버레이 표시값과 통일
--
-- DA-APPROVED: i18n_message 물리 DELETE 예외 + msg_theme DML(시스템 컬럼 갱신 포함)

DELETE FROM i18n_message WHERE msg_key = 'themes.FINANCE';

UPDATE msg_theme SET
  theme_nm   = '경제 라운지',
  theme_desc = '#경제 #커뮤니티',
  modr_id    = 'ADMIN',
  mod_dtm    = CURRENT_TIMESTAMP
WHERE theme_cd = 'FINANCE';

UPDATE msg_theme SET
  theme_nm    = '크립토 라운지',
  theme_nm_en = 'Crypto Lounge',
  theme_desc  = '#Pi #크립토 #커뮤니티',
  modr_id     = 'ADMIN',
  mod_dtm     = CURRENT_TIMESTAMP
WHERE theme_cd = 'CRYPTO_TRADING';
