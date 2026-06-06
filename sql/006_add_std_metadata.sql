-- P1 #5-6, P2 #9: std_* 테이블 메타데이터 컬럼 추가
-- reg_dtm, mod_dtm, reg_usr_id, mod_usr_id, del_yn
-- 대상: std_dic, std_dom, std_term

BEGIN;

-- ===== 1. std_dic =====
ALTER TABLE public.std_dic
  ADD COLUMN IF NOT EXISTS reg_dtm    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS mod_dtm    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS reg_usr_id TEXT,
  ADD COLUMN IF NOT EXISTS mod_usr_id TEXT,
  ADD COLUMN IF NOT EXISTS del_yn     CHAR(1) NOT NULL DEFAULT 'N'
    CHECK (del_yn IN ('Y', 'N'));

CREATE OR REPLACE FUNCTION fn_upd_std_dic_mod_dtm()
RETURNS TRIGGER AS $$
BEGIN NEW.mod_dtm = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_std_dic_mod_dtm
  BEFORE UPDATE ON public.std_dic
  FOR EACH ROW EXECUTE FUNCTION fn_upd_std_dic_mod_dtm();

-- ===== 2. std_dom =====
ALTER TABLE public.std_dom
  ADD COLUMN IF NOT EXISTS reg_dtm    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS mod_dtm    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS reg_usr_id TEXT,
  ADD COLUMN IF NOT EXISTS mod_usr_id TEXT,
  ADD COLUMN IF NOT EXISTS del_yn     CHAR(1) NOT NULL DEFAULT 'N'
    CHECK (del_yn IN ('Y', 'N'));

CREATE OR REPLACE FUNCTION fn_upd_std_dom_mod_dtm()
RETURNS TRIGGER AS $$
BEGIN NEW.mod_dtm = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_std_dom_mod_dtm
  BEFORE UPDATE ON public.std_dom
  FOR EACH ROW EXECUTE FUNCTION fn_upd_std_dom_mod_dtm();

-- ===== 3. std_term =====
ALTER TABLE public.std_term
  ADD COLUMN IF NOT EXISTS reg_dtm    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS mod_dtm    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS reg_usr_id TEXT,
  ADD COLUMN IF NOT EXISTS mod_usr_id TEXT,
  ADD COLUMN IF NOT EXISTS del_yn     CHAR(1) NOT NULL DEFAULT 'N'
    CHECK (del_yn IN ('Y', 'N'));

CREATE OR REPLACE FUNCTION fn_upd_std_term_mod_dtm()
RETURNS TRIGGER AS $$
BEGIN NEW.mod_dtm = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_std_term_mod_dtm
  BEFORE UPDATE ON public.std_term
  FOR EACH ROW EXECUTE FUNCTION fn_upd_std_term_mod_dtm();

COMMIT;
