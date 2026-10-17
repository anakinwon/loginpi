-- 033_std_se_cd.sql : 표준구분코드(마스터 지시 2026-10-17 "단어/도메인/용어 등을 표준/비표준 등의 구분코드를 만들어 줘. 조회조건과 결과에도 표시")
-- DA-APPROVED: 마스터 지시 2026-10-17 — std_dic·std_dom·std_term 칼럼 1개씩(fn_add_cols_keep_sys), 값 STD 표준 / NSTD 비표준(마스터 확정 2종)
-- 표준단어 : 표준 STD·구분 SE(행안부 공통표준 '구분' SE)·코드 CD → std_se_cd(표준구분코드)
-- 지정 : 단어·도메인 = 사용자 지정(등록·수정 신청, 승인 절차 그대로), 용어 = 기존 nstd_yn(일괄등록 비표준 수용)과 동기화 트리거로 한 값 유지
-- 함수 : fn_new_std_row(016 최신 정의)·fn_chg_std_row(017 최신 정의)를 그대로 옮기고 std_se_cd 만 추가
BEGIN;

SELECT fn_add_cols_keep_sys('std_dic', $c$ADD COLUMN std_se_cd VARCHAR(4) NOT NULL DEFAULT 'STD'$c$);
SELECT fn_add_cols_keep_sys('std_dom', $c$ADD COLUMN std_se_cd VARCHAR(4) NOT NULL DEFAULT 'STD'$c$);
SELECT fn_add_cols_keep_sys('std_term', $c$ADD COLUMN std_se_cd VARCHAR(4) NOT NULL DEFAULT 'STD'$c$);
ALTER TABLE std_dic ADD CONSTRAINT std_dic_std_se_cd_check CHECK (std_se_cd IN ('STD','NSTD'));
ALTER TABLE std_dom ADD CONSTRAINT std_dom_std_se_cd_check CHECK (std_se_cd IN ('STD','NSTD'));
ALTER TABLE std_term ADD CONSTRAINT std_term_std_se_cd_check CHECK (std_se_cd IN ('STD','NSTD'));
COMMENT ON COLUMN std_dic.std_se_cd IS '표준구분코드 — STD 표준 / NSTD 비표준(사용자 지정)';
COMMENT ON COLUMN std_dom.std_se_cd IS '표준구분코드 — STD 표준 / NSTD 비표준(사용자 지정)';
COMMENT ON COLUMN std_term.std_se_cd IS '표준구분코드 — STD 표준 / NSTD 비표준(일괄등록 비표준 수용 nstd_yn 과 동기화)';

-- 용어 : 기존 비표준 수용 행 이관(mod_dtm 트리거 정지 — 값 변경이 아니라 칼럼 이관)
ALTER TABLE std_term DISABLE TRIGGER USER;
UPDATE std_term SET std_se_cd = 'NSTD' WHERE nstd_yn = 'Y';
ALTER TABLE std_term ENABLE TRIGGER USER;

-- 용어 nstd_yn ↔ std_se_cd 동기화 : 새로 바뀐 쪽을 따름(등록은 둘 중 하나라도 비표준이면 비표준)
CREATE OR REPLACE FUNCTION fn_sync_term_se()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.nstd_yn = 'Y' OR NEW.std_se_cd = 'NSTD' THEN
      NEW.nstd_yn := 'Y';
      NEW.std_se_cd := 'NSTD';
    END IF;
  ELSIF NEW.std_se_cd IS DISTINCT FROM OLD.std_se_cd THEN
    NEW.nstd_yn := CASE WHEN NEW.std_se_cd = 'NSTD' THEN 'Y' ELSE 'N' END;
  ELSIF NEW.nstd_yn IS DISTINCT FROM OLD.nstd_yn THEN
    NEW.std_se_cd := CASE WHEN NEW.nstd_yn = 'Y' THEN 'NSTD' ELSE 'STD' END;
  END IF;
  RETURN NEW;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_sync_term_se()');
DROP TRIGGER IF EXISTS trg_std_term_se_sync ON std_term;
CREATE TRIGGER trg_std_term_se_sync BEFORE INSERT OR UPDATE OF nstd_yn, std_se_cd ON std_term FOR EACH ROW EXECUTE FUNCTION fn_sync_term_se();
COMMENT ON COLUMN std_term.nstd_yn IS '비표준여부(구) — std_se_cd 와 트리거 동기화, 새 코드는 std_se_cd 사용';

-- 등록 : 016 정의 + std_se_cd
CREATE OR REPLACE FUNCTION fn_new_std_row(p_tp TEXT, p_area_id UUID, r JSONB, p_sts TEXT, p_usr TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_tp = 'DIC' THEN
    INSERT INTO std_dic (area_id, dic_log_nm, dic_phy_nm, dic_eng_nm, dic_chn_nm, ent_clss_yn, attr_clss_yn, forbid_yn, dic_desc, forbid_word_txt, key_dom_yn, std_se_cd, std_sts_cd, regr_id, modr_id)
    VALUES (p_area_id, r->>'dic_log_nm', r->>'dic_phy_nm', r->>'dic_eng_nm', r->>'dic_chn_nm', coalesce(r->>'ent_clss_yn', 'N'), coalesce(r->>'attr_clss_yn', 'N'),
            coalesce(r->>'forbid_yn', 'N'), r->>'dic_desc', r->>'forbid_word_txt', coalesce(r->>'key_dom_yn', 'N'), coalesce(r->>'std_se_cd', 'STD'), p_sts, p_usr, p_usr)
    ON CONFLICT DO NOTHING
    RETURNING dic_id INTO v_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO std_dic_rel (dic_id, rel_tp_cd, rel_txt, regr_id, modr_id)
      SELECT v_id, 'SYN', s, p_usr, p_usr FROM jsonb_array_elements_text(coalesce(r->'syns', '[]'::JSONB)) AS s
      UNION
      SELECT v_id, 'BAN', s, p_usr, p_usr FROM jsonb_array_elements_text(coalesce(r->'bans', '[]'::JSONB)) AS s
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF p_tp = 'DOM' THEN
    INSERT INTO std_dom (area_id, key_dom_nm, dom_nm, dom_tp_cd, dom_grp_id, lgc_tp_cd, data_len, data_scale, min_val_txt, max_val_txt, fmt_txt, disp_fmt_txt, unit_nm, alw_val_txt, dom_desc, std_se_cd, std_sts_cd, regr_id, modr_id)
    VALUES (p_area_id, r->>'key_dom_nm', r->>'dom_nm', r->>'dom_tp_cd', (r->>'dom_grp_id')::UUID, r->>'lgc_tp_cd', (r->>'data_len')::INT, (r->>'data_scale')::INT,
            r->>'min_val_txt', r->>'max_val_txt', r->>'fmt_txt', r->>'disp_fmt_txt', r->>'unit_nm', r->>'alw_val_txt', r->>'dom_desc', coalesce(r->>'std_se_cd', 'STD'), p_sts, p_usr, p_usr)
    ON CONFLICT DO NOTHING
    RETURNING dom_id INTO v_id;
  ELSIF p_tp = 'TERM' THEN
    -- 용어 이름 유일 위반은 건너뜀(구성 저장까지 하나의 블록)
    BEGIN
      v_id := fn_ins_std_term(p_area_id, r->>'term_log_nm', r->>'term_phy_nm', (r->>'dom_id')::UUID, r->>'term_desc',
                              ARRAY(SELECT jsonb_array_elements_text(r->'dic_ids')::UUID), p_usr, r || jsonb_build_object('std_sts_cd', p_sts));
    EXCEPTION WHEN unique_violation THEN
      v_id := NULL;
    END;
  ELSE
    RAISE EXCEPTION 'fn_new_std_row: 미지원 대상 %', p_tp USING ERRCODE = '22023';
  END IF;
  RETURN v_id;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_new_std_row(text, uuid, jsonb, text, text)');

-- 수정 : 017 정의 + std_se_cd(단어·도메인·용어 수정 신청)
CREATE OR REPLACE FUNCTION fn_chg_std_row(
  p_tp TEXT, p_id UUID, p_act TEXT, p_ver INT, p_row JSONB, p_usr_id UUID, p_req_id UUID
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_bfr  JSONB;
  v_aftr JSONB;
  v_area UUID;
  v_usr  TEXT := p_usr_id::TEXT;
  r      JSONB := coalesce(p_row, '{}'::JSONB);
BEGIN
  IF p_act NOT IN ('UPD', 'DEL') THEN
    RAISE EXCEPTION 'fn_chg_std_row: 미지원 동작 %', p_act USING ERRCODE = '22023';
  END IF;

  IF p_tp = 'DIC' THEN
    SELECT to_jsonb(t) INTO v_bfr FROM std_dic t WHERE dic_id = p_id AND del_yn = 'N' FOR UPDATE;
  ELSIF p_tp = 'DOM' THEN
    SELECT to_jsonb(t) INTO v_bfr FROM std_dom t WHERE dom_id = p_id AND del_yn = 'N' FOR UPDATE;
  ELSIF p_tp = 'TERM' THEN
    SELECT to_jsonb(t) INTO v_bfr FROM std_term t WHERE term_id = p_id AND del_yn = 'N' FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'fn_chg_std_row: 미지원 대상 %', p_tp USING ERRCODE = '22023';
  END IF;
  IF v_bfr IS NULL THEN
    RAISE EXCEPTION 'fn_chg_std_row: 대상 없음' USING ERRCODE = 'P0002';
  END IF;
  IF (v_bfr->>'ver_no')::INT <> p_ver THEN
    RAISE EXCEPTION 'fn_chg_std_row: 버전 불일치' USING ERRCODE = '40001';
  END IF;
  v_area := (v_bfr->>'area_id')::UUID;

  IF p_act = 'DEL' THEN
    IF p_tp = 'DIC' THEN
      UPDATE std_dic SET del_yn = 'Y', del_dtm = CURRENT_TIMESTAMP, ver_no = ver_no + 1, modr_id = v_usr WHERE dic_id = p_id;
    ELSIF p_tp = 'DOM' THEN
      UPDATE std_dom SET del_yn = 'Y', del_dtm = CURRENT_TIMESTAMP, ver_no = ver_no + 1, modr_id = v_usr WHERE dom_id = p_id;
    ELSE
      UPDATE std_term SET del_yn = 'Y', del_dtm = CURRENT_TIMESTAMP, ver_no = ver_no + 1, modr_id = v_usr WHERE term_id = p_id;
    END IF;
  ELSIF p_tp = 'DIC' THEN
    UPDATE std_dic SET
      dic_log_nm   = CASE WHEN r ? 'dic_log_nm'   THEN r->>'dic_log_nm'   ELSE dic_log_nm END,
      dic_phy_nm   = CASE WHEN r ? 'dic_phy_nm'   THEN r->>'dic_phy_nm'   ELSE dic_phy_nm END,
      dic_eng_nm   = CASE WHEN r ? 'dic_eng_nm'   THEN r->>'dic_eng_nm'   ELSE dic_eng_nm END,
      dic_chn_nm   = CASE WHEN r ? 'dic_chn_nm'   THEN r->>'dic_chn_nm'   ELSE dic_chn_nm END,
      ent_clss_yn  = CASE WHEN r ? 'ent_clss_yn'  THEN r->>'ent_clss_yn'  ELSE ent_clss_yn END,
      attr_clss_yn = CASE WHEN r ? 'attr_clss_yn' THEN r->>'attr_clss_yn' ELSE attr_clss_yn END,
      forbid_yn    = CASE WHEN r ? 'forbid_yn'    THEN r->>'forbid_yn'    ELSE forbid_yn END,
      dic_desc     = CASE WHEN r ? 'dic_desc'     THEN r->>'dic_desc'     ELSE dic_desc END,
      forbid_word_txt = CASE WHEN r ? 'forbid_word_txt' THEN r->>'forbid_word_txt' ELSE forbid_word_txt END,
      key_dom_yn   = CASE WHEN r ? 'key_dom_yn'   THEN r->>'key_dom_yn'   ELSE key_dom_yn END,
      tbl_sfx_txt  = CASE WHEN r ? 'tbl_sfx_txt'  THEN r->>'tbl_sfx_txt'  ELSE tbl_sfx_txt END,
      std_se_cd = CASE WHEN r ? 'std_se_cd' THEN r->>'std_se_cd' ELSE std_se_cd END,
      ver_no = ver_no + 1, modr_id = v_usr
    WHERE dic_id = p_id;
  ELSIF p_tp = 'DOM' THEN
    UPDATE std_dom SET
      key_dom_nm  = CASE WHEN r ? 'key_dom_nm'  THEN r->>'key_dom_nm'          ELSE key_dom_nm END,
      dom_nm      = CASE WHEN r ? 'dom_nm'      THEN r->>'dom_nm'              ELSE dom_nm END,
      dom_tp_cd   = CASE WHEN r ? 'dom_tp_cd'   THEN r->>'dom_tp_cd'           ELSE dom_tp_cd END,
      lgc_tp_cd   = CASE WHEN r ? 'lgc_tp_cd'   THEN r->>'lgc_tp_cd'           ELSE lgc_tp_cd END,
      data_len    = CASE WHEN r ? 'data_len'    THEN (r->>'data_len')::INT     ELSE data_len END,
      data_scale  = CASE WHEN r ? 'data_scale'  THEN (r->>'data_scale')::INT   ELSE data_scale END,
      min_val_txt = CASE WHEN r ? 'min_val_txt' THEN r->>'min_val_txt'         ELSE min_val_txt END,
      max_val_txt = CASE WHEN r ? 'max_val_txt' THEN r->>'max_val_txt'         ELSE max_val_txt END,
      fmt_txt     = CASE WHEN r ? 'fmt_txt'     THEN r->>'fmt_txt'             ELSE fmt_txt END,
      dom_desc    = CASE WHEN r ? 'dom_desc'    THEN r->>'dom_desc'            ELSE dom_desc END,
      dom_grp_id  = CASE WHEN r ? 'dom_grp_id'  THEN (r->>'dom_grp_id')::UUID  ELSE dom_grp_id END,
      unit_nm = CASE WHEN r ? 'unit_nm' THEN r->>'unit_nm' ELSE unit_nm END,
      alw_val_txt = CASE WHEN r ? 'alw_val_txt' THEN r->>'alw_val_txt' ELSE alw_val_txt END,
      disp_fmt_txt = CASE WHEN r ? 'disp_fmt_txt' THEN r->>'disp_fmt_txt' ELSE disp_fmt_txt END,
      std_se_cd = CASE WHEN r ? 'std_se_cd' THEN r->>'std_se_cd' ELSE std_se_cd END,
      ver_no = ver_no + 1, modr_id = v_usr
    WHERE dom_id = p_id;
  ELSE
    UPDATE std_term SET
      dom_id    = CASE WHEN r ? 'dom_id'    THEN (r->>'dom_id')::UUID ELSE dom_id END,
      term_desc = CASE WHEN r ? 'term_desc' THEN r->>'term_desc'      ELSE term_desc END,
      alw_val_txt = CASE WHEN r ? 'alw_val_txt' THEN r->>'alw_val_txt' ELSE alw_val_txt END,
      disp_fmt_txt = CASE WHEN r ? 'disp_fmt_txt' THEN r->>'disp_fmt_txt' ELSE disp_fmt_txt END,
      adm_cd_nm = CASE WHEN r ? 'adm_cd_nm' THEN r->>'adm_cd_nm' ELSE adm_cd_nm END,
      own_org_nm = CASE WHEN r ? 'own_org_nm' THEN r->>'own_org_nm' ELSE own_org_nm END,
      syn_txt = CASE WHEN r ? 'syn_txt' THEN r->>'syn_txt' ELSE syn_txt END,
      std_se_cd = CASE WHEN r ? 'std_se_cd' THEN r->>'std_se_cd' ELSE std_se_cd END,
      ver_no = ver_no + 1, modr_id = v_usr
    WHERE term_id = p_id;
  END IF;

  IF p_tp = 'DIC' THEN SELECT to_jsonb(t) INTO v_aftr FROM std_dic t WHERE dic_id = p_id;
  ELSIF p_tp = 'DOM' THEN SELECT to_jsonb(t) INTO v_aftr FROM std_dom t WHERE dom_id = p_id;
  ELSE SELECT to_jsonb(t) INTO v_aftr FROM std_term t WHERE term_id = p_id;
  END IF;

  INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, bfr_val, aftr_val, apv_req_id, usr_id, regr_id, modr_id)
  VALUES (v_area, p_tp, p_id::TEXT, p_act, v_bfr, v_aftr, p_req_id, p_usr_id, v_usr, v_usr);
  RETURN (v_aftr->>'ver_no')::INT;
END;
$$;

SELECT fn_grant_svc_only('FUNCTION', 'fn_chg_std_row(text, uuid, text, integer, jsonb, uuid, uuid)');

COMMIT;
