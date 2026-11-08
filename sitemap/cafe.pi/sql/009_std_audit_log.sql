-- TASK-034: Audit Trail — std_audit_log 테이블 + 트리거
-- append-only 이력 테이블 (mod_* 시스템 컬럼 제외)

CREATE TABLE IF NOT EXISTS public.std_audit_log (
  log_id     UUID        NOT NULL DEFAULT gen_random_uuid(),
  tgt_tbl    TEXT        NOT NULL,                               -- 'std_dic'|'std_dom'|'std_term'
  tgt_id     TEXT        NOT NULL,                               -- 대상 테이블 PK 값
  action_cd  TEXT        NOT NULL CHECK (action_cd IN ('INSERT', 'UPDATE', 'DELETE')),
  old_val    JSONB,                                              -- 변경 전 row (UPDATE/DELETE 시)
  new_val    JSONB,                                              -- 변경 후 row (INSERT/UPDATE 시)
  chgr_id    TEXT        NOT NULL DEFAULT 'ADMIN',               -- 변경자 ID
  chg_dtm    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT std_audit_log_pkey PRIMARY KEY (log_id)
);

CREATE INDEX IF NOT EXISTS idx_std_audit_log_tgt ON public.std_audit_log (tgt_tbl, chg_dtm DESC);
CREATE INDEX IF NOT EXISTS idx_std_audit_log_id  ON public.std_audit_log (tgt_id);

-- 공통 트리거 함수: JSONB key 추출 방식으로 다중 테이블 지원
CREATE OR REPLACE FUNCTION fn_std_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_new  JSONB;
  v_old  JSONB;
  v_id   TEXT;
  v_who  TEXT;
BEGIN
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;

  -- PK 추출: 테이블마다 다른 PK 컬럼명을 COALESCE로 처리
  v_id := COALESCE(
    (v_new->>'dic_id'),  (v_new->>'dom_id'),  (v_new->>'term_id'),
    (v_old->>'dic_id'),  (v_old->>'dom_id'),  (v_old->>'term_id')
  );

  -- 변경자 ID: DELETE면 old에서, 그 외엔 new에서 추출
  v_who := COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN v_old->>'modr_id' ELSE v_new->>'modr_id' END,
    'ADMIN'
  );

  INSERT INTO public.std_audit_log (tgt_tbl, tgt_id, action_cd, old_val, new_val, chgr_id)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, v_old, v_new, v_who);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_std_dic_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.std_dic
  FOR EACH ROW EXECUTE FUNCTION fn_std_audit_log();

CREATE TRIGGER trg_std_dom_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.std_dom
  FOR EACH ROW EXECUTE FUNCTION fn_std_audit_log();

CREATE TRIGGER trg_std_term_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.std_term
  FOR EACH ROW EXECUTE FUNCTION fn_std_audit_log();
