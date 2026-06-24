-- sql/110_mps_dist_cfg.sql
-- DA-APPROVED: mps_dist_cfg — PiShop™ 상품 거리 노출 제한 설정
--   표준약어: 'mps'(마켓플레이스, sql/029 선례) + 'dist'(거리) + 'cfg'(설정, bean_supply_config 선례)
--   목적: 사용자 위치 기준 일정 거리 이상 상품을 목록에서 제외(전역 컷오프).
--         0 = 무제한(전국 노출). 기본값 50km — Pi Network 초기 서비스, 사용자 밀도 고려.
--   패턴: bean_tip_cfg(sql/109)와 동일 — 수정 시 새 행 INSERT, 최신행(reg_dtm DESC) 적용. 이력 보존.
--   적용 조건:
--     ① max_dist_km = 0 → 필터 없음(전국)
--     ② 사용자 좌표 없음 → 필터 불가(전국)
--     ③ 상품 좌표 없음(LBS 미동의 판매자) → 해당 상품은 항상 포함
-- DA-APPROVED: 'dist'(거리, 영어 distance 약어) 신규 사용 — 공간/위치 도메인 표준어.

CREATE TABLE IF NOT EXISTS public.mps_dist_cfg (
  cfg_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  max_dist_km INT         NOT NULL DEFAULT 50 CHECK (max_dist_km >= 0),  -- 0 = 무제한
  note_txt    TEXT,                                                        -- 변경 사유
  del_yn      CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.mps_dist_cfg              IS 'PiShop™ 상품 최대 노출 거리 — 최신행(reg_dtm DESC) 적용. 수정=새 행 INSERT(이력 보존). 0=무제한';
COMMENT ON COLUMN public.mps_dist_cfg.max_dist_km  IS '최대 노출 거리(km). 0=무제한. 사용자 좌표 없거나 상품 좌표 없으면 컷오프 미적용';
COMMENT ON COLUMN public.mps_dist_cfg.note_txt     IS '변경 사유(선택). 관리자 감사 추적용';

CREATE INDEX IF NOT EXISTS idx_mps_dist_cfg_latest
  ON public.mps_dist_cfg(reg_dtm DESC) WHERE del_yn = 'N';

-- 기본값 시드 (이미 행이 있으면 스킵)
INSERT INTO public.mps_dist_cfg (max_dist_km, note_txt)
SELECT 50, '기본값 50km — Pi Network 초기 서비스, 사용자 밀도 고려. 수도권 기준 경기도 전체 커버'
 WHERE NOT EXISTS (SELECT 1 FROM public.mps_dist_cfg WHERE del_yn = 'N');

-- 검증:
--   SELECT max_dist_km, note_txt, reg_dtm FROM public.mps_dist_cfg
--    WHERE del_yn = 'N' ORDER BY reg_dtm DESC LIMIT 1;
