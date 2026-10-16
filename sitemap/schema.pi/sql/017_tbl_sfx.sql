-- 017_tbl_sfx.sql : 엔터티 분류어·테이블 접미어 — 2026-10-16 마스터 확정(메모리 entity-classifier-table-suffix)
-- 단어 물리명(컬럼용)은 유지하고 테이블명 접미어는 별도 칸 tbl_sfx_txt. 지정·해제·변경 = 단어 수정 신청(승인 절차 공용)
-- 정의서 §8.4 대비 기관 확장 : 이력 _HST → _H, 1자 접미어, 정보·기본·상세·내역·통계·로그 추가. 복제·채번 접미어 [TBD]
BEGIN;

SELECT fn_add_cols_keep_sys('std_dic', $c$ADD COLUMN tbl_sfx_txt VARCHAR(5)
  CONSTRAINT std_dic_tbl_sfx_fmt_check CHECK (tbl_sfx_txt IS NULL OR tbl_sfx_txt ~ '^_[A-Z0-9]{1,4}$')$c$);
ALTER TABLE std_dic ADD CONSTRAINT std_dic_tbl_sfx_ent_check CHECK (tbl_sfx_txt IS NULL OR ent_clss_yn = 'Y');
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_dic_area_tbl_sfx_actv ON std_dic (area_id, tbl_sfx_txt) WHERE del_yn = 'N' AND tbl_sfx_txt IS NOT NULL;
COMMENT ON COLUMN std_dic.tbl_sfx_txt IS '테이블접미어(엔터티 분류어 전용, 예 이력 _H)';

-- 단어 수정 반영(sql/013 정의 + tbl_sfx_txt)
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

-- 이관 : 확정 12종(승인완료 단어만) 엔터티 분류어 지정 + 접미어, 분류체계마다 MIG_017 요약 1건
CREATE TEMP TABLE tmp_sfx (nm TEXT, sfx TEXT) ON COMMIT DROP;
INSERT INTO tmp_sfx VALUES ('정보','_I'),('기본','_M'),('상세','_D'),('이력','_H'),('내역','_L'),('로그','_G'),
                           ('인터페이스','_F'),('코드','_C'),('집계','_T'),('통계','_S'),('백업','_B'),('관계','_R');
CREATE TEMP TABLE tmp_mig_017 ON COMMIT DROP AS
SELECT d.area_id, d.dic_id, s.sfx
FROM std_dic d JOIN tmp_sfx s ON s.nm = d.dic_log_nm
WHERE d.del_yn = 'N' AND d.std_sts_cd = 'CNFM' AND d.forbid_yn = 'N' AND d.tbl_sfx_txt IS NULL
  AND NOT EXISTS (SELECT 1 FROM std_dic x WHERE x.area_id = d.area_id AND x.del_yn = 'N' AND x.tbl_sfx_txt = s.sfx);
UPDATE std_dic d SET ent_clss_yn = 'Y', tbl_sfx_txt = t.sfx, modr_id = 'MIG_017'
FROM tmp_mig_017 t WHERE d.dic_id = t.dic_id;
INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, regr_id, modr_id)
SELECT t.area_id, 'AREA', t.area_id::TEXT, 'UPD',
       jsonb_build_object('migration', '017 엔터티 분류어·테이블 접미어 지정(확정 12종)', 'dic', count(*)),
       'MIG_017', 'MIG_017'
FROM tmp_mig_017 t GROUP BY t.area_id;

COMMIT;

NOTIFY pgrst, 'reload schema';
