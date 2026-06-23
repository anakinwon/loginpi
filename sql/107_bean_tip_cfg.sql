-- sql/107_bean_tip_cfg.sql
-- DA-APPROVED: 신규 테이블 bean_tip_cfg — 'bean_' 도메인(승인됨, sql/067) 연장.
--   표준약어 'tip'(선물/팁, P2P 선물 거래) + 'cfg'(설정/config, bean_supply_config.cfg_id 선례) 사용.
--   코드 식별자 TIP_PRESETS_BEAN(src/lib/bean-shared.ts) 이미 운영 중 — 표시명은 PiCafé™ 선물하기.
--
-- 목적: 카페방 P2P 선물(팁) 금액 프리셋 3종을 코드 상수(빌드 고정)에서 DB로 이관 →
--   관리자가 런타임 수정. bean_supply_config 패턴 동일: 수정 시 새 행 INSERT, 최신행(reg_dtm DESC) 사용.
--   변경 이력 보존(누가/언제 바꿨는지 감사). 물리 DELETE 금지·논리삭제만.
--
-- 안전: 앱은 이 테이블이 없거나 비어도 코드 상수 [100,500,1000]으로 폴백(getTipPresets) →
--   적용 전에도 선물 기능 정상. 적용 후부터 DB값 우선.

CREATE TABLE IF NOT EXISTS public.bean_tip_cfg (
  cfg_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tip1_bean  BIGINT      NOT NULL CHECK (tip1_bean > 0),   -- 선물 프리셋 1 (작은 금액)
  tip2_bean  BIGINT      NOT NULL CHECK (tip2_bean > 0),   -- 선물 프리셋 2 (중간)
  tip3_bean  BIGINT      NOT NULL CHECK (tip3_bean > 0),   -- 선물 프리셋 3 (큰 금액)
  note_txt   TEXT,
  del_yn     CHAR(1)     NOT NULL DEFAULT 'N',
  del_dtm    TIMESTAMPTZ,
  regr_id    TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id    TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 프리셋은 오름차순(중복 방지·UI 일관성). 위반 시 INSERT 롤백.
  CONSTRAINT chk_tip_ascending CHECK (tip1_bean < tip2_bean AND tip2_bean < tip3_bean)
);

COMMENT ON TABLE  public.bean_tip_cfg          IS '카페방 P2P 선물(팁) 금액 프리셋 설정 — 최신행(reg_dtm DESC)이 현행. 수정=새 행 INSERT(이력 보존)';
COMMENT ON COLUMN public.bean_tip_cfg.tip1_bean IS '선물 프리셋 1 (Bean, 오름차순 최솟값). 1 Pi = 100 Bean';

CREATE INDEX IF NOT EXISTS idx_bean_tip_cfg_latest ON public.bean_tip_cfg(reg_dtm DESC) WHERE del_yn = 'N';

-- 현재 운영값 시드 (코드 상수와 동일: 100/500/1000 = 1/5/10 Pi)
INSERT INTO public.bean_tip_cfg (tip1_bean, tip2_bean, tip3_bean, note_txt)
SELECT 100, 500, 1000, '초기 시드 — 코드 상수 TIP_PRESETS_BEAN 이관'
 WHERE NOT EXISTS (SELECT 1 FROM public.bean_tip_cfg WHERE del_yn = 'N');

-- 검증:
--   SELECT tip1_bean, tip2_bean, tip3_bean, reg_dtm FROM public.bean_tip_cfg
--    WHERE del_yn='N' ORDER BY reg_dtm DESC LIMIT 1;   -- 현행 프리셋
