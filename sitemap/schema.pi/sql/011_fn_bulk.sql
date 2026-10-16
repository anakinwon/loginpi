-- 011_fn_bulk.sql : 일괄등록 — 용어 이음동의어목록 칸(2026-10-15 마스터 결정) + 묶음 반영 함수 3종(단어·도메인·용어)
-- 설계 : docs/design/bulk-import.md. 검증은 API(src/lib/bulk-check.ts)가 수행하고, 함수는 넘겨받은 행을 한 트랜잭션으로 저장
-- 이미 있는 이름은 ON CONFLICT DO NOTHING 으로 건너뜀(부분 유일 인덱스 전부 대상), 들어간 행만 감사 이력 INS 기록
-- 반환 : 반영된 행 번호(row_no) 배열
BEGIN;

SELECT fn_add_cols_keep_sys('std_term', $c$
  ADD COLUMN syn_txt TEXT$c$);
COMMENT ON COLUMN std_term.syn_txt IS '이음동의어목록(쉼표 구분, 행안부 공통표준 용어 이음동의어 목록)';

-- 용어 등록 함수 : syn_txt 처리 추가(인자 목록 동일)
CREATE OR REPLACE FUNCTION fn_ins_std_term(
  p_area_id  UUID,
  p_log_nm   TEXT,
  p_phy_nm   TEXT,
  p_dom_id   UUID,
  p_desc     TEXT,
  p_dic_ids  UUID[],
  p_usr_id   TEXT,
  p_ext      JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_term_id UUID;
  e         JSONB := coalesce(p_ext, '{}'::JSONB);
BEGIN
  IF p_dic_ids IS NULL OR cardinality(p_dic_ids) = 0 THEN
    RAISE EXCEPTION 'fn_ins_std_term: 구성 단어 없음' USING ERRCODE = '22023';
  END IF;
  INSERT INTO std_term (area_id, term_log_nm, term_phy_nm, dom_id, term_desc, nstd_yn, alw_val_txt, disp_fmt_txt, adm_cd_nm, own_org_nm, syn_txt, std_sts_cd, regr_id, modr_id)
  VALUES (p_area_id, p_log_nm, p_phy_nm, p_dom_id, p_desc, coalesce(e->>'nstd_yn', 'N'), e->>'alw_val_txt', e->>'disp_fmt_txt', e->>'adm_cd_nm', e->>'own_org_nm', e->>'syn_txt',
          'CNFM', p_usr_id, p_usr_id)
  RETURNING term_id INTO v_term_id;
  INSERT INTO std_term_dic (term_id, dic_seq, dic_id, regr_id, modr_id)
  SELECT v_term_id, o.n::INT, o.dic_id, p_usr_id, p_usr_id
  FROM unnest(p_dic_ids) WITH ORDINALITY AS o(dic_id, n);
  RETURN v_term_id;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_ins_std_term(uuid, text, text, uuid, text, uuid[], text, jsonb)');

-- 단어 묶음 반영 : 행 { row_no, dic_log_nm, dic_phy_nm, dic_eng_nm, dic_chn_nm, attr_clss_yn, dic_desc, forbid_word_txt, syns[] }
CREATE OR REPLACE FUNCTION fn_bulk_ins_std_dic(p_area_id UUID, p_rows JSONB, p_usr_id UUID)
RETURNS INT[]
LANGUAGE plpgsql
AS $$
DECLARE
  r     JSONB;
  v_id  UUID;
  v_usr TEXT := p_usr_id::TEXT;
  v_out INT[] := '{}';
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_id := NULL;
    INSERT INTO std_dic (area_id, dic_log_nm, dic_phy_nm, dic_eng_nm, dic_chn_nm, attr_clss_yn, dic_desc, forbid_word_txt, std_sts_cd, regr_id, modr_id)
    VALUES (p_area_id, r->>'dic_log_nm', r->>'dic_phy_nm', r->>'dic_eng_nm', r->>'dic_chn_nm', coalesce(r->>'attr_clss_yn', 'N'),
            r->>'dic_desc', r->>'forbid_word_txt', 'CNFM', v_usr, v_usr)
    ON CONFLICT DO NOTHING
    RETURNING dic_id INTO v_id;
    CONTINUE WHEN v_id IS NULL;
    INSERT INTO std_dic_rel (dic_id, rel_tp_cd, rel_txt, regr_id, modr_id)
    SELECT v_id, 'SYN', s, v_usr, v_usr FROM jsonb_array_elements_text(coalesce(r->'syns', '[]'::JSONB)) AS s
    ON CONFLICT DO NOTHING;
    INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, usr_id, regr_id, modr_id)
    SELECT p_area_id, 'DIC', v_id::TEXT, 'INS', to_jsonb(t) || jsonb_build_object('syns', coalesce(r->'syns', '[]'::JSONB), 'bulk', true), p_usr_id, v_usr, v_usr
    FROM std_dic t WHERE t.dic_id = v_id;
    v_out := v_out || (r->>'row_no')::INT;
  END LOOP;
  RETURN v_out;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_bulk_ins_std_dic(uuid, jsonb, uuid)');

-- 도메인 묶음 반영 : 행 = std_dom 컬럼(key_dom_nm·dom_nm·dom_tp_cd·dom_grp_id·lgc_tp_cd·data_len·data_scale·fmt_txt·disp_fmt_txt·unit_nm·alw_val_txt·dom_desc) + row_no
CREATE OR REPLACE FUNCTION fn_bulk_ins_std_dom(p_area_id UUID, p_rows JSONB, p_usr_id UUID)
RETURNS INT[]
LANGUAGE plpgsql
AS $$
DECLARE
  r     JSONB;
  v_id  UUID;
  v_usr TEXT := p_usr_id::TEXT;
  v_out INT[] := '{}';
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_id := NULL;
    INSERT INTO std_dom (area_id, key_dom_nm, dom_nm, dom_tp_cd, dom_grp_id, lgc_tp_cd, data_len, data_scale, fmt_txt, disp_fmt_txt, unit_nm, alw_val_txt, dom_desc, std_sts_cd, regr_id, modr_id)
    VALUES (p_area_id, r->>'key_dom_nm', r->>'dom_nm', r->>'dom_tp_cd', (r->>'dom_grp_id')::UUID, r->>'lgc_tp_cd',
            (r->>'data_len')::INT, (r->>'data_scale')::INT, r->>'fmt_txt', r->>'disp_fmt_txt', r->>'unit_nm', r->>'alw_val_txt', r->>'dom_desc',
            'CNFM', v_usr, v_usr)
    ON CONFLICT DO NOTHING
    RETURNING dom_id INTO v_id;
    CONTINUE WHEN v_id IS NULL;
    INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, usr_id, regr_id, modr_id)
    SELECT p_area_id, 'DOM', v_id::TEXT, 'INS', to_jsonb(t) || jsonb_build_object('bulk', true), p_usr_id, v_usr, v_usr FROM std_dom t WHERE t.dom_id = v_id;
    v_out := v_out || (r->>'row_no')::INT;
  END LOOP;
  RETURN v_out;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_bulk_ins_std_dom(uuid, jsonb, uuid)');

-- 용어 묶음 반영 : 행 { row_no, term_log_nm, term_phy_nm, dom_id, term_desc, dic_ids[], nstd_yn, alw_val_txt, disp_fmt_txt, adm_cd_nm, own_org_nm, syn_txt }
CREATE OR REPLACE FUNCTION fn_bulk_ins_std_term(p_area_id UUID, p_rows JSONB, p_usr_id UUID)
RETURNS INT[]
LANGUAGE plpgsql
AS $$
DECLARE
  r     JSONB;
  v_id  UUID;
  v_usr TEXT := p_usr_id::TEXT;
  v_out INT[] := '{}';
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_id := NULL;
    INSERT INTO std_term (area_id, term_log_nm, term_phy_nm, dom_id, term_desc, nstd_yn, alw_val_txt, disp_fmt_txt, adm_cd_nm, own_org_nm, syn_txt, std_sts_cd, regr_id, modr_id)
    VALUES (p_area_id, r->>'term_log_nm', r->>'term_phy_nm', (r->>'dom_id')::UUID, r->>'term_desc', coalesce(r->>'nstd_yn', 'N'),
            r->>'alw_val_txt', r->>'disp_fmt_txt', r->>'adm_cd_nm', r->>'own_org_nm', r->>'syn_txt', 'CNFM', v_usr, v_usr)
    ON CONFLICT DO NOTHING
    RETURNING term_id INTO v_id;
    CONTINUE WHEN v_id IS NULL;
    INSERT INTO std_term_dic (term_id, dic_seq, dic_id, regr_id, modr_id)
    SELECT v_id, o.n::INT, o.dic_id::UUID, v_usr, v_usr FROM jsonb_array_elements_text(r->'dic_ids') WITH ORDINALITY AS o(dic_id, n);
    INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, usr_id, regr_id, modr_id)
    SELECT p_area_id, 'TERM', v_id::TEXT, 'INS', to_jsonb(t) || jsonb_build_object('dic_ids', r->'dic_ids', 'bulk', true), p_usr_id, v_usr, v_usr FROM std_term t WHERE t.term_id = v_id;
    v_out := v_out || (r->>'row_no')::INT;
  END LOOP;
  RETURN v_out;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_bulk_ins_std_term(uuid, jsonb, uuid)');

-- 수정·승인 함수 : 010 본문 + 용어 syn_txt 처리

-- p_row 에 키가 있으면 그 값(NULL 포함), 없으면 현재 값 유지
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

-- 승인 함수 확장 : UPD·DEL 요청은 기준 버전(base_ver_no)으로 fn_chg_std_row 호출(그사이 변경되었으면 40001)
CREATE OR REPLACE FUNCTION fn_apv_std_req(p_req_id UUID, p_row JSONB, p_usr_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  r     std_apv_req%ROWTYPE;
  v_id  UUID;
  v_usr TEXT := p_usr_id::TEXT;
BEGIN
  SELECT * INTO r FROM std_apv_req WHERE apv_req_id = p_req_id AND del_yn = 'N' FOR UPDATE;
  IF NOT FOUND OR r.apv_sts_cd <> 'REQ' THEN
    RAISE EXCEPTION 'fn_apv_std_req: 처리 대기 요청 없음' USING ERRCODE = 'P0002';
  END IF;

  IF r.act_cd IN ('UPD', 'DEL') THEN
    PERFORM fn_chg_std_row(r.tgt_tp_cd, r.tgt_id, r.act_cd, r.base_ver_no, p_row, p_usr_id, p_req_id);
    v_id := r.tgt_id;
  ELSE
    IF r.tgt_tp_cd = 'DIC' THEN
      INSERT INTO std_dic (area_id, dic_log_nm, dic_phy_nm, dic_eng_nm, dic_chn_nm, ent_clss_yn, attr_clss_yn, forbid_yn, dic_desc, forbid_word_txt, std_sts_cd, regr_id, modr_id)
      VALUES (r.area_id, p_row->>'dic_log_nm', p_row->>'dic_phy_nm', p_row->>'dic_eng_nm', p_row->>'dic_chn_nm',
              coalesce(p_row->>'ent_clss_yn', 'N'), coalesce(p_row->>'attr_clss_yn', 'N'), coalesce(p_row->>'forbid_yn', 'N'),
              p_row->>'dic_desc', p_row->>'forbid_word_txt', 'CNFM', v_usr, v_usr)
      RETURNING dic_id INTO v_id;
    ELSIF r.tgt_tp_cd = 'DOM' THEN
      INSERT INTO std_dom (area_id, key_dom_nm, dom_nm, dom_tp_cd, lgc_tp_cd, data_len, data_scale, min_val_txt, max_val_txt, fmt_txt, dom_desc, dom_grp_id, unit_nm, alw_val_txt, disp_fmt_txt, std_sts_cd, regr_id, modr_id)
      VALUES (r.area_id, p_row->>'key_dom_nm', p_row->>'dom_nm', p_row->>'dom_tp_cd', p_row->>'lgc_tp_cd',
              (p_row->>'data_len')::INT, (p_row->>'data_scale')::INT, p_row->>'min_val_txt', p_row->>'max_val_txt',
              p_row->>'fmt_txt', p_row->>'dom_desc', (p_row->>'dom_grp_id')::UUID,
              p_row->>'unit_nm', p_row->>'alw_val_txt', p_row->>'disp_fmt_txt', 'CNFM', v_usr, v_usr)
      RETURNING dom_id INTO v_id;
    ELSE
      v_id := fn_ins_std_term(r.area_id, p_row->>'term_log_nm', p_row->>'term_phy_nm', (p_row->>'dom_id')::UUID,
                              p_row->>'term_desc', ARRAY(SELECT jsonb_array_elements_text(p_row->'dic_ids')::UUID), v_usr, p_row);
    END IF;
    INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, apv_req_id, usr_id, regr_id, modr_id)
    VALUES (r.area_id, r.tgt_tp_cd, v_id::TEXT, 'INS', p_row, p_req_id, p_usr_id, v_usr, v_usr);
  END IF;

  UPDATE std_apv_req
     SET apv_sts_cd = 'APV', apv_usr_id = p_usr_id, apv_dtm = CURRENT_TIMESTAMP, aftr_val = p_row, modr_id = v_usr
   WHERE apv_req_id = p_req_id;
  RETURN v_id;
END;
$$;

SELECT fn_grant_svc_only('FUNCTION', 'fn_apv_std_req(uuid, jsonb, uuid)');

COMMIT;

NOTIFY pgrst, 'reload schema';
