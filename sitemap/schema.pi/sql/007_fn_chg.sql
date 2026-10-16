-- 007_fn_chg.sql : 표준 데이터 수정·논리 삭제 함수(낙관적 잠금 + 감사 이력) 및 승인 함수 확장(UPD·DEL 요청)
-- 호출 : 서버 API(service_role) RPC 전용. 사용 중 검사·이름 재생성·중복 검사는 API 가 수행, p_row 는 바꿀 컬럼만 담은 최종 값
-- 오류 : P0002 대상 없음 / 40001 버전 불일치(다른 사용자가 먼저 변경)
BEGIN;

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
      ver_no = ver_no + 1, modr_id = v_usr
    WHERE dom_id = p_id;
  ELSE
    UPDATE std_term SET
      dom_id    = CASE WHEN r ? 'dom_id'    THEN (r->>'dom_id')::UUID ELSE dom_id END,
      term_desc = CASE WHEN r ? 'term_desc' THEN r->>'term_desc'      ELSE term_desc END,
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
      INSERT INTO std_dic (area_id, dic_log_nm, dic_phy_nm, dic_eng_nm, dic_chn_nm, ent_clss_yn, attr_clss_yn, forbid_yn, dic_desc, std_sts_cd, regr_id, modr_id)
      VALUES (r.area_id, p_row->>'dic_log_nm', p_row->>'dic_phy_nm', p_row->>'dic_eng_nm', p_row->>'dic_chn_nm',
              coalesce(p_row->>'ent_clss_yn', 'N'), coalesce(p_row->>'attr_clss_yn', 'N'), coalesce(p_row->>'forbid_yn', 'N'),
              p_row->>'dic_desc', 'CNFM', v_usr, v_usr)
      RETURNING dic_id INTO v_id;
    ELSIF r.tgt_tp_cd = 'DOM' THEN
      INSERT INTO std_dom (area_id, key_dom_nm, dom_nm, dom_tp_cd, lgc_tp_cd, data_len, data_scale, min_val_txt, max_val_txt, fmt_txt, dom_desc, std_sts_cd, regr_id, modr_id)
      VALUES (r.area_id, p_row->>'key_dom_nm', p_row->>'dom_nm', p_row->>'dom_tp_cd', p_row->>'lgc_tp_cd',
              (p_row->>'data_len')::INT, (p_row->>'data_scale')::INT, p_row->>'min_val_txt', p_row->>'max_val_txt',
              p_row->>'fmt_txt', p_row->>'dom_desc', 'CNFM', v_usr, v_usr)
      RETURNING dom_id INTO v_id;
    ELSE
      v_id := fn_ins_std_term(r.area_id, p_row->>'term_log_nm', p_row->>'term_phy_nm', (p_row->>'dom_id')::UUID,
                              p_row->>'term_desc', ARRAY(SELECT jsonb_array_elements_text(p_row->'dic_ids')::UUID), v_usr);
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
