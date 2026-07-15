-- DA-APPROVED: 매장 관리직원 등록 — 명시 등록 직원에게 판매 관리 열람+주문 상태 변경 권한 (2026-07-15)
--   권한 2단계 체계:
--     ① 등록 직원(본 테이블)      = 판매 관리 열람 + 주문 상태 변경(접수·준비완료·거래완료)
--     ② 매장 Telegram 그룹방 멤버 = 판매 관리 열람만
--   쓰기 권한을 Telegram 멤버십에 걸지 않는 이유: 외부 API 장애가 매장 주문 처리를 막으면 안 되고,
--   그룹의 임의 멤버가 주문 상태를 조작할 수 없어야 한다. 소유자가 앱(매장 보기)에서 Pi username으로 등록/해제.
-- DA 표준: 시스템 컬럼 4종 + 논리삭제(del_yn/del_dtm), 물리 DELETE 금지. FK 무설계(usr_id TEXT — sys_user.id, 별도 조회+Map 병합).

CREATE TABLE IF NOT EXISTS public.mps_shop_staff (
  staff_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id  UUID        NOT NULL,
  usr_id   TEXT        NOT NULL,
  del_yn   CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm  TIMESTAMPTZ,
  regr_id  TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id  TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.mps_shop_staff          IS '매장 관리직원 — 판매 관리 열람+주문 상태 변경 권한 (소유자가 앱에서 등록/해제)';
COMMENT ON COLUMN public.mps_shop_staff.staff_id IS '직원 등록 식별자';
COMMENT ON COLUMN public.mps_shop_staff.shop_id  IS '매장 식별자 (mps_shop.shop_id — 앱 레벨 참조)';
COMMENT ON COLUMN public.mps_shop_staff.usr_id   IS '직원 사용자 식별자 (sys_user.id — 앱 레벨 참조)';
COMMENT ON COLUMN public.mps_shop_staff.del_yn   IS '논리삭제 여부 Y/N — 해제 시 Y (재등록은 N 복구)';
COMMENT ON COLUMN public.mps_shop_staff.del_dtm  IS '해제 일시';

-- 활성 직원은 매장×사용자당 1행 — 재등록은 기존 행 del_yn 복구로 처리
CREATE UNIQUE INDEX IF NOT EXISTS ux_mps_shop_staff_active
  ON public.mps_shop_staff (shop_id, usr_id) WHERE del_yn = 'N';
-- 직원 → 소속 매장 역조회 (판매 관리 열람·상태 변경 권한 판정)
CREATE INDEX IF NOT EXISTS idx_mps_shop_staff_usr
  ON public.mps_shop_staff (usr_id) WHERE del_yn = 'N';
