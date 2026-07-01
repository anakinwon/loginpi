-- 158_direct_theme.sql
-- 직거래 문의 전용 시스템 테마 'DIRECT' — P2P 상품 문의 Direct룸(room_tp_cd='D') 전용.
-- PRD_13 §18 P2P 채팅. Direct룸은 room_nm='직거래 문의'·theme_cd='DIRECT'·expr_dtm=생성+12h.

-- DA-APPROVED: msg_theme에 시스템 전용 테마 'DIRECT' 추가 (2026-07-01)
--   use_yn='N' → 카페 생성 테마 목록(use_yn='Y'만 조회)에 노출 안 됨(내부 전용, 일반 카페에서 선택 불가).
--   theme_tp_cd는 CHECK(BASIC/PREMIUM)상 BASIC. msg_room.theme_cd FK 충족 목적(직거래방 생성 가능).
--   멱등: ON CONFLICT로 재적용 안전.

INSERT INTO public.msg_theme (
  theme_cd, theme_nm, theme_emoji, theme_desc, theme_tp_cd, sort_ord, use_yn, regr_id, modr_id
) VALUES (
  'DIRECT', '직거래', '🤝', '직거래 문의 전용 대화방 (당사자 2명·12시간 자동 만료)', 'BASIC', 999, 'N', 'SYSTEM', 'SYSTEM'
)
ON CONFLICT (theme_cd) DO UPDATE SET
  theme_nm    = EXCLUDED.theme_nm,
  theme_emoji = EXCLUDED.theme_emoji,
  theme_desc  = EXCLUDED.theme_desc,
  use_yn      = EXCLUDED.use_yn,
  mod_dtm     = CURRENT_TIMESTAMP;
