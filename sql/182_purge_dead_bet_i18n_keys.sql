-- DA-APPROVED: 죽은 베팅 i18n 키 물리 삭제 (DML only — 메인넷 등재 레드라인 대응, 2026-07-16)
--
-- 배경: 베팅 기능은 코드에서 완전 제거됐으나(PRD_23 §2-④, Pi 등재 레드라인 ①도박·베팅)
--       i18n_message에 번역 키가 잔존 → DB→JSON 동기화(/api/admin/i18n/sync) 시
--       messages/*.json으로 부활 → next-intl이 번들 전체를 페이지 HTML에 직렬화
--       → 모든 공개 페이지 소스에 "베팅"·"Pi Bet" 노출(심사관 도박 오인 소지).
-- 대상 키 3종 (전 locale):
--   chat.bet.*               — 베팅 UI 24키 (사용처 0건 실측)
--   chat.room.piBet          — "Pi Bet 투표" 메뉴명
--   admin.payments.txnDiv.BET — 거래구분 "베팅"
-- 물리 DELETE 사유: i18n_message는 del_yn 미보유(sql/011 초기 테이블) + sync가
--   전 행 무필터 조회 → 논리삭제 불가. 번역키 폐기=삭제 원칙(빈 값 "" 금지) 준수.
-- 코드 동반: messages/*.json 189개 파일에서 동일 키 삭제(같은 커밋).

DELETE FROM public.i18n_message
 WHERE msg_key LIKE 'chat.bet.%'
    OR msg_key IN ('chat.room.piBet', 'admin.payments.txnDiv.BET');

-- 검증: 0행이어야 함
-- SELECT count(*) FROM public.i18n_message
--  WHERE msg_key LIKE 'chat.bet.%' OR msg_key IN ('chat.room.piBet','admin.payments.txnDiv.BET');
