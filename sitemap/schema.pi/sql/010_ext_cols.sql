-- 010_ext_cols.sql : 행안부 공통표준 CSV 수용 칸 추가(2026-10-15 마스터 결정 ④) + 비표준 용어 표시(결정 ②)
-- 단어 : 금칙어목록 / 도메인 : 단위·허용값·표현형식(저장형식 = 기존 fmt_txt) / 용어 : 비표준여부·허용값·표현형식·행정표준코드명·소관기관명
-- 용어 허용값·표현형식은 도메인 값과 다를 때만 채운다(비우면 도메인 값을 따름). 용어 저장형식은 CSV 전 행이 도메인과 같아 칸을 두지 않음
-- 시스템 컬럼 4개는 맨 끝 유지(STD-05) : 기존 4개를 임시 이름으로 바꾸고 새 칸 → 시스템 컬럼 순으로 다시 추가한 뒤 값 복사(mod_dtm 트리거 정지 상태)
BEGIN;

CREATE OR REPLACE FUNCTION fn_add_cols_keep_sys(p_tbl TEXT, p_cols TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  c TEXT;
BEGIN
  FOREACH c IN ARRAY ARRAY['regr_id', 'reg_dtm', 'modr_id', 'mod_dtm'] LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', p_tbl, c, c || '_old');
  END LOOP;
  EXECUTE format('ALTER TABLE %I %s', p_tbl, p_cols);
  EXECUTE format('ALTER TABLE %I
    ADD COLUMN regr_id TEXT        NOT NULL DEFAULT %L,
    ADD COLUMN reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN modr_id TEXT        NOT NULL DEFAULT %L,
    ADD COLUMN mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP', p_tbl, 'ADMIN', 'ADMIN');
  EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', p_tbl, 'trg_' || p_tbl || '_mod_dtm');
  EXECUTE format('UPDATE %I SET regr_id = regr_id_old, reg_dtm = reg_dtm_old, modr_id = modr_id_old, mod_dtm = mod_dtm_old', p_tbl);
  EXECUTE format('ALTER TABLE %I ENABLE TRIGGER %I', p_tbl, 'trg_' || p_tbl || '_mod_dtm');
  EXECUTE format('ALTER TABLE %I DROP COLUMN regr_id_old, DROP COLUMN reg_dtm_old, DROP COLUMN modr_id_old, DROP COLUMN mod_dtm_old', p_tbl);
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_add_cols_keep_sys(text, text)');

SELECT fn_add_cols_keep_sys('std_dic', $c$
  ADD COLUMN forbid_word_txt TEXT$c$);
SELECT fn_add_cols_keep_sys('std_dom', $c$
  ADD COLUMN unit_nm      VARCHAR(50),
  ADD COLUMN alw_val_txt  TEXT,
  ADD COLUMN disp_fmt_txt VARCHAR(200)$c$);
SELECT fn_add_cols_keep_sys('std_term', $c$
  ADD COLUMN nstd_yn      CHAR(1) NOT NULL DEFAULT 'N' CONSTRAINT std_term_nstd_yn_check CHECK (nstd_yn IN ('Y','N')),
  ADD COLUMN alw_val_txt  TEXT,
  ADD COLUMN disp_fmt_txt VARCHAR(200),
  ADD COLUMN adm_cd_nm    VARCHAR(200),
  ADD COLUMN own_org_nm   VARCHAR(200)$c$);

COMMENT ON COLUMN std_dic.forbid_word_txt IS '금칙어목록 : 이 단어 대신 쓰지 않는 표기(쉼표 구분, 예 경로 ← 패스)';
COMMENT ON COLUMN std_dom.fmt_txt IS '저장형식(행안부 공통표준 저장형식)';
COMMENT ON COLUMN std_dom.unit_nm IS '단위(원·% 등)';
COMMENT ON COLUMN std_dom.alw_val_txt IS '허용값(범위·코드값 설명)';
COMMENT ON COLUMN std_dom.disp_fmt_txt IS '표현형식(화면 표시 형식)';
COMMENT ON COLUMN std_term.nstd_yn IS '비표준여부 : Y = 표준 규칙 예외로 수용(행안부 공통표준의 단일 단어 용어 등, 2026-10-15 결정 ②)';
COMMENT ON COLUMN std_term.alw_val_txt IS '허용값(도메인과 다를 때만, 비우면 도메인 값)';
COMMENT ON COLUMN std_term.disp_fmt_txt IS '표현형식(도메인과 다를 때만, 비우면 도메인 값)';
COMMENT ON COLUMN std_term.adm_cd_nm IS '행정표준코드명(코드성 용어의 행정표준코드 연결 표기)';
COMMENT ON COLUMN std_term.own_org_nm IS '소관기관명';

-- 용어 등록 함수 : 부가 칸(p_ext JSONB) 인자 추가 — 인자 목록이 바뀌어 기존 함수 삭제 후 재생성
DROP FUNCTION IF EXISTS fn_ins_std_term(uuid, text, text, uuid, text, uuid[], text);
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
  INSERT INTO std_term (area_id, term_log_nm, term_phy_nm, dom_id, term_desc, nstd_yn, alw_val_txt, disp_fmt_txt, adm_cd_nm, own_org_nm, std_sts_cd, regr_id, modr_id)
  VALUES (p_area_id, p_log_nm, p_phy_nm, p_dom_id, p_desc, coalesce(e->>'nstd_yn', 'N'), e->>'alw_val_txt', e->>'disp_fmt_txt', e->>'adm_cd_nm', e->>'own_org_nm',
          'CNFM', p_usr_id, p_usr_id)
  RETURNING term_id INTO v_term_id;
  INSERT INTO std_term_dic (term_id, dic_seq, dic_id, regr_id, modr_id)
  SELECT v_term_id, o.n::INT, o.dic_id, p_usr_id, p_usr_id
  FROM unnest(p_dic_ids) WITH ORDINALITY AS o(dic_id, n);
  RETURN v_term_id;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_ins_std_term(uuid, text, text, uuid, text, uuid[], text, jsonb)');

-- 수정·승인 함수 : 008 본문 + 새 칸 처리

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
