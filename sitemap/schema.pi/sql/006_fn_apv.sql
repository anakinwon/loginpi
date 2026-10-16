-- 006_fn_apv.sql : 승인 요청 처리 함수 — 승인(대상 테이블 반영 + 요청 상태 + 감사 이력) / 반려를 한 트랜잭션으로 수행
-- 호출 : 서버 API(service_role) RPC 전용. p_row 는 API 가 승인 시점에 다시 검증·생성한 최종 값(도메인명·용어명 재생성 포함)
-- 범위 : 신규 등록(INS) 요청. 수정·삭제(UPD·DEL) 요청은 수정·삭제 기능 단계에서 추가 [확인중 : 수정·삭제 단계]
BEGIN;

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
  IF r.act_cd <> 'INS' THEN
    RAISE EXCEPTION 'fn_apv_std_req: 미지원 요청 동작 %', r.act_cd USING ERRCODE = '0A000';
  END IF;

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

  UPDATE std_apv_req
     SET apv_sts_cd = 'APV', apv_usr_id = p_usr_id, apv_dtm = CURRENT_TIMESTAMP, aftr_val = p_row, modr_id = v_usr
   WHERE apv_req_id = p_req_id;
  INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, apv_req_id, usr_id, regr_id, modr_id)
  VALUES (r.area_id, r.tgt_tp_cd, v_id::TEXT, 'INS', p_row, p_req_id, p_usr_id, v_usr, v_usr);
  RETURN v_id;
END;
$$;

SELECT fn_grant_svc_only('FUNCTION', 'fn_apv_std_req(uuid, jsonb, uuid)');

COMMIT;

NOTIFY pgrst, 'reload schema';
