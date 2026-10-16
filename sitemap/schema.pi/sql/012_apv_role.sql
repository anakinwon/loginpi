-- 012_apv_role.sql : 승인 프로세스(최초 등록도 승인 후 사용) + 역할 R&R 7종 + 공통코드
-- 결정(2026-10-15 마스터) : 1단계 승인, 승인권자 자기 승인 허용(처리자 = 신청자로 기록), 기존 확정 데이터 = 승인완료 간주, 일괄등록 = 승인대기
-- 흐름 : 등록 신청 시 표준 행을 REQ 로 만들고 승인 요청(INS, tgt_id = 새 행)을 같은 트랜잭션에 생성 → 승인 CNFM / 반려 RJCT / 취소 시 행 논리 삭제
-- 사용 제한은 기존 CNFM 조건(용어 구성 단어·도메인·대표도메인명)이 그대로 담당
BEGIN;

-- ── 공통코드 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS std_cmn_cd (
  grp_cd            VARCHAR(20)  NOT NULL,                                 -- 코드그룹
  cd                VARCHAR(20)  NOT NULL,                                 -- 코드
  cd_nm             VARCHAR(100) NOT NULL,                                 -- 코드명
  cd_desc           TEXT,                                                  -- 코드설명
  sort_seq          INT          NOT NULL DEFAULT 0,                       -- 정렬순서
  use_yn            CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 사용여부
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_cmn_cd_pkey PRIMARY KEY (grp_cd, cd),
  CONSTRAINT std_cmn_cd_use_yn_check CHECK (use_yn IN ('Y','N')),
  CONSTRAINT std_cmn_cd_del_yn_check CHECK (del_yn IN ('Y','N'))
);
SELECT fn_add_mod_dtm_trg('std_cmn_cd'), fn_grant_svc_only('TABLE', 'std_cmn_cd');

INSERT INTO std_cmn_cd (grp_cd, cd, cd_nm, cd_desc, sort_seq) VALUES
  ('STD_STS', 'REQ',  '승인대기', '등록 신청됨. 승인 전에는 용어 구성·도메인 선택 등에 사용 불가', 1),
  ('STD_STS', 'CNFM', '승인완료', '승인권자가 승인함. 사용 가능', 2),
  ('STD_STS', 'RJCT', '반려',     '승인권자가 반려함(사유 필수). 신청자가 고쳐서 재신청', 3),
  ('STD_STS', 'DSCD', '폐기',     '사용 종료', 4),
  ('APV_STS', 'REQ',  '대기', '처리 대기 중인 승인 요청', 1),
  ('APV_STS', 'APV',  '승인', '승인됨(승인의견 선택)', 2),
  ('APV_STS', 'RJCT', '반려', '반려됨(반려사유 필수)', 3),
  ('APV_STS', 'CNCL', '취소', '신청자가 취소함', 4),
  ('APV_ACT', 'INS', '등록', '최초 등록 신청', 1),
  ('APV_ACT', 'UPD', '수정', '승인완료 데이터 수정 신청', 2),
  ('APV_ACT', 'DEL', '삭제', '승인완료 데이터 삭제 신청', 3),
  ('MBR_ROLE', 'SYS',    '시스템담당자',   '분류체계 설정·도메인그룹·약어·멤버 관리, 조회. 표준 데이터 신청·승인 없음', 1),
  ('MBR_ROLE', 'DA',     '데이터아키텍트', '표준 정책 총괄 : 단어·도메인·용어 신청·승인, 일괄등록, 설정·멤버 관리', 2),
  ('MBR_ROLE', 'STD',    '표준담당자',     '단어·도메인·용어 신청·승인(1단계 승인권자), 일괄등록', 3),
  ('MBR_ROLE', 'MDL',    '모델러',         '단어·도메인·용어 등록·수정·삭제 신청(승인권 없음), 본인 신청 취소', 4),
  ('MBR_ROLE', 'QLT',    '품질담당자',     '조회·엑셀 내려받기(품질 진단 기능은 향후 단계)', 5),
  ('MBR_ROLE', 'MIG',    '이행담당자',     '조회·엑셀 내려받기(이행 매핑용)', 6),
  ('MBR_ROLE', 'VIEWER', '조회자',         '조회만', 7)
ON CONFLICT (grp_cd, cd) DO UPDATE SET cd_nm = EXCLUDED.cd_nm, cd_desc = EXCLUDED.cd_desc, sort_seq = EXCLUDED.sort_seq, modr_id = 'SEED_012';

-- ── 역할 7종(기존 ADMIN → DA, EDITOR → MDL) ───────────────
ALTER TABLE std_area_mbr DROP CONSTRAINT std_area_mbr_mbr_role_cd_check;
UPDATE std_area_mbr SET mbr_role_cd = CASE mbr_role_cd WHEN 'ADMIN' THEN 'DA' WHEN 'EDITOR' THEN 'MDL' ELSE mbr_role_cd END
 WHERE mbr_role_cd IN ('ADMIN', 'EDITOR');
ALTER TABLE std_area_mbr ADD CONSTRAINT std_area_mbr_mbr_role_cd_check CHECK (mbr_role_cd IN ('SYS','DA','STD','MDL','QLT','MIG','VIEWER'));

-- ── 표준상태 반려 추가 ─────────────────────────────────────
ALTER TABLE std_dic  DROP CONSTRAINT std_dic_std_sts_cd_check,  ADD CONSTRAINT std_dic_std_sts_cd_check  CHECK (std_sts_cd IN ('REQ','CNFM','RJCT','DSCD'));
ALTER TABLE std_dom  DROP CONSTRAINT std_dom_std_sts_cd_check,  ADD CONSTRAINT std_dom_std_sts_cd_check  CHECK (std_sts_cd IN ('REQ','CNFM','RJCT','DSCD'));
ALTER TABLE std_term DROP CONSTRAINT std_term_std_sts_cd_check, ADD CONSTRAINT std_term_std_sts_cd_check CHECK (std_sts_cd IN ('REQ','CNFM','RJCT','DSCD'));

-- ── 승인 요청 : 등록 신청도 대상 ID 보유, 신청사유·승인의견 ─────
ALTER TABLE std_apv_req DROP CONSTRAINT std_apv_req_tgt_id_check;
ALTER TABLE std_apv_req ADD CONSTRAINT std_apv_req_tgt_id_check CHECK (act_cd = 'INS' OR tgt_id IS NOT NULL);
SELECT fn_add_cols_keep_sys('std_apv_req', $c$
  ADD COLUMN req_rsn_txt TEXT,
  ADD COLUMN apv_opn_txt TEXT$c$);
COMMENT ON COLUMN std_apv_req.req_rsn_txt IS '신청사유(선택)';
COMMENT ON COLUMN std_apv_req.apv_opn_txt IS '승인의견(선택, 반려사유는 rjct_rsn_txt 필수). 처리자 = 신청자이면 자기 승인';
COMMENT ON COLUMN std_apv_req.tgt_id IS '대상ID(012 이후 등록 신청도 신청 시 만든 승인대기 행 ID, 이전 등록 신청은 NULL)';

-- ── 용어 등록 함수 : 상태(p_ext.std_sts_cd, 기본 CNFM) ──────────
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
          coalesce(e->>'std_sts_cd', 'CNFM'), p_usr_id, p_usr_id)
  RETURNING term_id INTO v_term_id;
  INSERT INTO std_term_dic (term_id, dic_seq, dic_id, regr_id, modr_id)
  SELECT v_term_id, o.n::INT, o.dic_id, p_usr_id, p_usr_id
  FROM unnest(p_dic_ids) WITH ORDINALITY AS o(dic_id, n);
  RETURN v_term_id;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_ins_std_term(uuid, text, text, uuid, text, uuid[], text, jsonb)');

-- 표준 행 1건 생성(상태 지정) — 등록 신청·일괄등록 공용. 반환 = 새 행 ID, 이미 있는 이름이면 NULL(ON CONFLICT)
CREATE OR REPLACE FUNCTION fn_new_std_row(p_tp TEXT, p_area_id UUID, r JSONB, p_sts TEXT, p_usr TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_tp = 'DIC' THEN
    INSERT INTO std_dic (area_id, dic_log_nm, dic_phy_nm, dic_eng_nm, dic_chn_nm, ent_clss_yn, attr_clss_yn, forbid_yn, dic_desc, forbid_word_txt, std_sts_cd, regr_id, modr_id)
    VALUES (p_area_id, r->>'dic_log_nm', r->>'dic_phy_nm', r->>'dic_eng_nm', r->>'dic_chn_nm', coalesce(r->>'ent_clss_yn', 'N'), coalesce(r->>'attr_clss_yn', 'N'),
            coalesce(r->>'forbid_yn', 'N'), r->>'dic_desc', r->>'forbid_word_txt', p_sts, p_usr, p_usr)
    ON CONFLICT DO NOTHING
    RETURNING dic_id INTO v_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO std_dic_rel (dic_id, rel_tp_cd, rel_txt, regr_id, modr_id)
      SELECT v_id, 'SYN', s, p_usr, p_usr FROM jsonb_array_elements_text(coalesce(r->'syns', '[]'::JSONB)) AS s
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF p_tp = 'DOM' THEN
    INSERT INTO std_dom (area_id, key_dom_nm, dom_nm, dom_tp_cd, dom_grp_id, lgc_tp_cd, data_len, data_scale, min_val_txt, max_val_txt, fmt_txt, disp_fmt_txt, unit_nm, alw_val_txt, dom_desc, std_sts_cd, regr_id, modr_id)
    VALUES (p_area_id, r->>'key_dom_nm', r->>'dom_nm', r->>'dom_tp_cd', (r->>'dom_grp_id')::UUID, r->>'lgc_tp_cd', (r->>'data_len')::INT, (r->>'data_scale')::INT,
            r->>'min_val_txt', r->>'max_val_txt', r->>'fmt_txt', r->>'disp_fmt_txt', r->>'unit_nm', r->>'alw_val_txt', r->>'dom_desc', p_sts, p_usr, p_usr)
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

-- 등록 신청 : 승인대기 행 + 승인 요청(INS) + 감사 이력. 이미 있는 이름이면 23505
CREATE OR REPLACE FUNCTION fn_req_std_ins(p_tp TEXT, p_area_id UUID, p_row JSONB, p_usr_id UUID, p_rsn TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_usr TEXT := p_usr_id::TEXT;
  v_id  UUID;
  v_req UUID;
BEGIN
  v_id := fn_new_std_row(p_tp, p_area_id, p_row, 'REQ', v_usr);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'fn_req_std_ins: 같은 이름 존재' USING ERRCODE = '23505';
  END IF;
  INSERT INTO std_apv_req (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, req_usr_id, req_rsn_txt, regr_id, modr_id)
  VALUES (p_area_id, p_tp, v_id, 'INS', p_row, p_usr_id, p_rsn, v_usr, v_usr)
  RETURNING apv_req_id INTO v_req;
  INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, apv_req_id, usr_id, regr_id, modr_id)
  VALUES (p_area_id, p_tp, v_id::TEXT, 'INS', p_row || jsonb_build_object('std_sts_cd', 'REQ'), v_req, p_usr_id, v_usr, v_usr);
  RETURN jsonb_build_object('tgt_id', v_id, 'apv_req_id', v_req);
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_req_std_ins(text, uuid, jsonb, uuid, text)');

-- 표준 행 상태 변경 + 감사 이력(UPD)
CREATE OR REPLACE FUNCTION fn_set_std_sts(p_tp TEXT, p_id UUID, p_from TEXT, p_to TEXT, p_usr_id UUID, p_req_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_tbl TEXT := CASE p_tp WHEN 'DIC' THEN 'std_dic' WHEN 'DOM' THEN 'std_dom' WHEN 'TERM' THEN 'std_term' END;
  v_pk  TEXT := CASE p_tp WHEN 'DIC' THEN 'dic_id' WHEN 'DOM' THEN 'dom_id' WHEN 'TERM' THEN 'term_id' END;
  v_bfr JSONB;
  v_aftr JSONB;
  v_area UUID;
BEGIN
  EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE %I = $1 AND del_yn = %L FOR UPDATE', v_tbl, v_pk, 'N') INTO v_bfr USING p_id;
  IF v_bfr IS NULL OR v_bfr->>'std_sts_cd' <> p_from THEN
    RAISE EXCEPTION 'fn_set_std_sts: 대상 상태 불일치(기대 %)', p_from USING ERRCODE = '40001';
  END IF;
  EXECUTE format('UPDATE %I SET std_sts_cd = $1, ver_no = ver_no + 1, modr_id = $2 WHERE %I = $3 RETURNING to_jsonb(%I.*)', v_tbl, v_pk, v_tbl)
    INTO v_aftr USING p_to, p_usr_id::TEXT, p_id;
  v_area := (v_bfr->>'area_id')::UUID;
  INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, bfr_val, aftr_val, apv_req_id, usr_id, regr_id, modr_id)
  VALUES (v_area, p_tp, p_id::TEXT, 'UPD', jsonb_build_object('std_sts_cd', p_from), jsonb_build_object('std_sts_cd', p_to), p_req_id, p_usr_id, p_usr_id::TEXT, p_usr_id::TEXT);
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_set_std_sts(text, uuid, text, text, uuid, uuid)');

-- 승인 : 등록 신청 = 승인대기 → 승인완료, 수정·삭제 = 기준 버전으로 반영(fn_chg_std_row). 승인의견 선택
DROP FUNCTION IF EXISTS fn_apv_std_req(uuid, jsonb, uuid);
CREATE OR REPLACE FUNCTION fn_apv_std_req(p_req_id UUID, p_row JSONB, p_usr_id UUID, p_opn TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  r     std_apv_req%ROWTYPE;
  v_id  UUID;
BEGIN
  SELECT * INTO r FROM std_apv_req WHERE apv_req_id = p_req_id AND del_yn = 'N' FOR UPDATE;
  IF NOT FOUND OR r.apv_sts_cd <> 'REQ' THEN
    RAISE EXCEPTION 'fn_apv_std_req: 처리 대기 요청 없음' USING ERRCODE = 'P0002';
  END IF;
  IF r.act_cd IN ('UPD', 'DEL') THEN
    PERFORM fn_chg_std_row(r.tgt_tp_cd, r.tgt_id, r.act_cd, r.base_ver_no, p_row, p_usr_id, p_req_id);
  ELSIF r.tgt_id IS NULL THEN
    RAISE EXCEPTION 'fn_apv_std_req: 012 이전 등록 신청(대상 행 없음)은 반려 후 재신청' USING ERRCODE = '22023';
  ELSE
    PERFORM fn_set_std_sts(r.tgt_tp_cd, r.tgt_id, 'REQ', 'CNFM', p_usr_id, p_req_id);
  END IF;
  v_id := r.tgt_id;
  UPDATE std_apv_req
     SET apv_sts_cd = 'APV', apv_usr_id = p_usr_id, apv_dtm = CURRENT_TIMESTAMP, apv_opn_txt = p_opn,
         aftr_val = CASE WHEN r.act_cd = 'INS' THEN aftr_val ELSE p_row END, modr_id = p_usr_id::TEXT
   WHERE apv_req_id = p_req_id;
  RETURN v_id;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_apv_std_req(uuid, jsonb, uuid, text)');

-- 반려(사유 필수) : 등록 신청이면 대상 행 반려 상태
CREATE OR REPLACE FUNCTION fn_rjct_std_req(p_req_id UUID, p_usr_id UUID, p_rsn TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r std_apv_req%ROWTYPE;
BEGIN
  IF coalesce(btrim(p_rsn), '') = '' THEN
    RAISE EXCEPTION 'fn_rjct_std_req: 반려사유 필수' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM std_apv_req WHERE apv_req_id = p_req_id AND del_yn = 'N' FOR UPDATE;
  IF NOT FOUND OR r.apv_sts_cd <> 'REQ' THEN
    RAISE EXCEPTION 'fn_rjct_std_req: 처리 대기 요청 없음' USING ERRCODE = 'P0002';
  END IF;
  IF r.act_cd = 'INS' AND r.tgt_id IS NOT NULL THEN
    PERFORM fn_set_std_sts(r.tgt_tp_cd, r.tgt_id, 'REQ', 'RJCT', p_usr_id, p_req_id);
  END IF;
  UPDATE std_apv_req SET apv_sts_cd = 'RJCT', rjct_rsn_txt = p_rsn, apv_usr_id = p_usr_id, apv_dtm = CURRENT_TIMESTAMP, modr_id = p_usr_id::TEXT
   WHERE apv_req_id = p_req_id;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_rjct_std_req(uuid, uuid, text)');

-- 취소(신청자 본인, API 확인) : 등록 신청이면 대상 행 논리 삭제(이름 반환)
CREATE OR REPLACE FUNCTION fn_cncl_std_req(p_req_id UUID, p_usr_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r std_apv_req%ROWTYPE;
BEGIN
  SELECT * INTO r FROM std_apv_req WHERE apv_req_id = p_req_id AND del_yn = 'N' FOR UPDATE;
  IF NOT FOUND OR r.apv_sts_cd <> 'REQ' THEN
    RAISE EXCEPTION 'fn_cncl_std_req: 처리 대기 요청 없음' USING ERRCODE = 'P0002';
  END IF;
  IF r.act_cd = 'INS' AND r.tgt_id IS NOT NULL THEN
    PERFORM fn_chg_std_row(r.tgt_tp_cd, r.tgt_id, 'DEL',
      (SELECT ver_no FROM (SELECT ver_no FROM std_dic WHERE dic_id = r.tgt_id UNION ALL SELECT ver_no FROM std_dom WHERE dom_id = r.tgt_id
                           UNION ALL SELECT ver_no FROM std_term WHERE term_id = r.tgt_id) v LIMIT 1),
      '{}'::JSONB, p_usr_id, p_req_id);
  END IF;
  UPDATE std_apv_req SET apv_sts_cd = 'CNCL', apv_usr_id = p_usr_id, apv_dtm = CURRENT_TIMESTAMP, modr_id = p_usr_id::TEXT
   WHERE apv_req_id = p_req_id;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cncl_std_req(uuid, uuid)');

-- 반려된 행 재신청 : 바뀐 칸 반영(fn_chg_std_row, 기준 버전) → 승인대기 → 새 등록 요청
CREATE OR REPLACE FUNCTION fn_resub_std_ins(p_tp TEXT, p_id UUID, p_ver INT, p_row JSONB, p_usr_id UUID, p_rsn TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_area UUID;
  v_req  UUID;
  v_cur  JSONB;
BEGIN
  IF p_row IS NOT NULL AND p_row <> '{}'::JSONB THEN
    p_ver := fn_chg_std_row(p_tp, p_id, 'UPD', p_ver, p_row, p_usr_id, NULL);
  END IF;
  PERFORM fn_set_std_sts(p_tp, p_id, 'RJCT', 'REQ', p_usr_id, NULL);
  EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE %I = $1',
                 CASE p_tp WHEN 'DIC' THEN 'std_dic' WHEN 'DOM' THEN 'std_dom' ELSE 'std_term' END,
                 CASE p_tp WHEN 'DIC' THEN 'dic_id' WHEN 'DOM' THEN 'dom_id' ELSE 'term_id' END) INTO v_cur USING p_id;
  v_area := (v_cur->>'area_id')::UUID;
  INSERT INTO std_apv_req (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, req_usr_id, req_rsn_txt, regr_id, modr_id)
  VALUES (v_area, p_tp, p_id, 'INS', v_cur, p_usr_id, p_rsn, p_usr_id::TEXT, p_usr_id::TEXT)
  RETURNING apv_req_id INTO v_req;
  RETURN v_req;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_resub_std_ins(text, uuid, integer, jsonb, uuid, text)');

-- 일괄등록 묶음 반영 : 승인대기 행 + 행마다 등록 요청(사유 '일괄등록') + 감사 이력. 반환 = 반영된 row_no
CREATE OR REPLACE FUNCTION fn_bulk_req_std(p_tp TEXT, p_area_id UUID, p_rows JSONB, p_usr_id UUID)
RETURNS INT[]
LANGUAGE plpgsql
AS $$
DECLARE
  r     JSONB;
  v_id  UUID;
  v_req UUID;
  v_usr TEXT := p_usr_id::TEXT;
  v_out INT[] := '{}';
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_id := fn_new_std_row(p_tp, p_area_id, r, 'REQ', v_usr);
    CONTINUE WHEN v_id IS NULL;
    INSERT INTO std_apv_req (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, req_usr_id, req_rsn_txt, regr_id, modr_id)
    VALUES (p_area_id, p_tp, v_id, 'INS', r - 'row_no', p_usr_id, '일괄등록', v_usr, v_usr)
    RETURNING apv_req_id INTO v_req;
    INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, apv_req_id, usr_id, regr_id, modr_id)
    VALUES (p_area_id, p_tp, v_id::TEXT, 'INS', (r - 'row_no') || jsonb_build_object('std_sts_cd', 'REQ', 'bulk', true), v_req, p_usr_id, v_usr, v_usr);
    v_out := v_out || (r->>'row_no')::INT;
  END LOOP;
  RETURN v_out;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_bulk_req_std(text, uuid, jsonb, uuid)');

-- 이관 기록 : 기존 승인완료 데이터는 승인완료로 간주(분류체계마다 요약 1건)
INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, regr_id, modr_id)
SELECT a.area_id, 'AREA', a.area_id::TEXT, 'UPD',
       jsonb_build_object('migration', '012 승인 절차 도입 : 기존 확정 데이터 승인완료 간주',
         'dic', (SELECT count(*) FROM std_dic d WHERE d.area_id = a.area_id AND d.del_yn = 'N' AND d.std_sts_cd = 'CNFM'),
         'dom', (SELECT count(*) FROM std_dom d WHERE d.area_id = a.area_id AND d.del_yn = 'N' AND d.std_sts_cd = 'CNFM'),
         'term', (SELECT count(*) FROM std_term t WHERE t.area_id = a.area_id AND t.del_yn = 'N' AND t.std_sts_cd = 'CNFM')),
       'MIG_012', 'MIG_012'
FROM std_area a WHERE a.del_yn = 'N';

COMMIT;

NOTIFY pgrst, 'reload schema';
