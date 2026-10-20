-- 061_std_cd_apv.sql : 표준코드 코드기본 승인 절차(마스터 지시 2026-10-20 '표준코드 등록도 승인절차를 준수') — 코드상세는 승인 대상 아님(마스터 확정)
-- DA-APPROVED: 마스터 지시 2026-10-20 — std_cd_bas 칼럼 1개(표준상태코드), std_apv_req 칼럼 1개(대상키텍스트, 자연키 대상용), 코드기본 전용 승인 함수 6종
-- 설계 :
--  · 코드기본 주식별자 = 자연키(분류체계 + 코드ID TEXT)라 UUID 전용 std_apv_req.tgt_id 에 담을 수 없음 → 대상키텍스트(tgt_key_txt) 추가(마스터 선택 : 텍스트 대상키)
--    tgt_tp_cd = 'CD' 이면 tgt_key_txt = 코드ID 필수·tgt_id 없음, 그 외 유형은 tgt_key_txt 없음(기존 UUID 경로 그대로)
--  · 기존 승인 함수(fn_apv_std_req 등, sql/012·033)는 고치지 않고 코드기본 전용 함수 fn_cd_* 를 둔다 — 앱(approval.ts)이 유형으로 분기
--  · std_cd_bas.std_sts_cd : REQ 승인대기·CNFM 승인완료·RJCT 반려·DSCD 폐기(단어·용어와 같은 값). 기존 행 = CNFM(승인완료 간주, 012 와 같은 이관 방식)
--  · 코드상세는 코드기본이 승인대기·승인완료일 때 바로 등록(앱 검사), 코드기본 등록 취소 시 그 코드상세도 논리 삭제
BEGIN;

SELECT fn_add_cols_keep_sys('std_cd_bas', $c$ADD COLUMN std_sts_cd VARCHAR(4) NOT NULL DEFAULT 'CNFM'$c$);
ALTER TABLE std_cd_bas ADD CONSTRAINT std_cd_bas_std_sts_cd_check CHECK (std_sts_cd IN ('REQ','CNFM','RJCT','DSCD'));
COMMENT ON COLUMN std_cd_bas.std_sts_cd IS '표준상태코드(REQ 승인대기·CNFM 승인완료·RJCT 반려·DSCD 폐기, 061 이전 행 = CNFM)';

SELECT fn_add_cols_keep_sys('std_apv_req', $c$ADD COLUMN tgt_key_txt VARCHAR(400)$c$);
COMMENT ON COLUMN std_apv_req.tgt_key_txt IS '대상키텍스트(자연키 대상 — 표준코드 CD = 코드ID, 그 외 유형은 NULL·tgt_id 사용)';
ALTER TABLE std_apv_req DROP CONSTRAINT std_apv_req_tgt_tp_cd_check;
ALTER TABLE std_apv_req ADD CONSTRAINT std_apv_req_tgt_tp_cd_check CHECK (tgt_tp_cd IN ('DIC','DOM','TERM','CD'));
ALTER TABLE std_apv_req ADD CONSTRAINT std_apv_req_tgt_key_check CHECK ((tgt_tp_cd = 'CD') = (tgt_key_txt IS NOT NULL) AND (tgt_tp_cd <> 'CD' OR tgt_id IS NULL));
ALTER TABLE std_apv_req DROP CONSTRAINT std_apv_req_tgt_id_check;
ALTER TABLE std_apv_req ADD CONSTRAINT std_apv_req_tgt_id_check CHECK (act_cd = 'INS' OR tgt_id IS NOT NULL OR tgt_key_txt IS NOT NULL);
-- 대상 하나당 처리 대기 요청 1건(자연키 대상, 기존 ux_std_apv_req_tgt_wait 는 tgt_id 기준)
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_apv_req_key_wait ON std_apv_req (area_id, tgt_tp_cd, tgt_key_txt)
  WHERE apv_sts_cd = 'REQ' AND tgt_key_txt IS NOT NULL AND del_yn = 'N';

-- 코드기본 변경 공용 : 기준 버전 확인 → 칸 반영(cd_cls_nm·cd_desc·use_yn·std_sts_cd·삭제) → 감사 이력. 반환 = 새 버전
--  p_set 키 : 위 칸 + del('Y' = 논리 삭제). 버전 불일치·없음 = 40001
CREATE OR REPLACE FUNCTION fn_cd_set(p_area_id UUID, p_cd_id TEXT, p_ver INT, p_set JSONB, p_usr_id UUID, p_req_id UUID, p_act TEXT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_bfr  JSONB;
  v_aftr JSONB;
  v_usr  TEXT := p_usr_id::TEXT;
BEGIN
  SELECT to_jsonb(b) INTO v_bfr FROM std_cd_bas b WHERE area_id = p_area_id AND cd_id = p_cd_id AND del_yn = 'N' FOR UPDATE;
  IF v_bfr IS NULL OR (p_ver IS NOT NULL AND (v_bfr->>'ver_no')::INT <> p_ver) THEN
    RAISE EXCEPTION 'fn_cd_set: 대상 없음 또는 버전 불일치' USING ERRCODE = '40001';
  END IF;
  UPDATE std_cd_bas
     SET cd_cls_nm  = CASE WHEN p_set ? 'cd_cls_nm' THEN p_set->>'cd_cls_nm' ELSE cd_cls_nm END,
         cd_desc    = CASE WHEN p_set ? 'cd_desc' THEN p_set->>'cd_desc' ELSE cd_desc END,
         use_yn     = CASE WHEN p_set ? 'use_yn' THEN p_set->>'use_yn' ELSE use_yn END,
         std_sts_cd = CASE WHEN p_set ? 'std_sts_cd' THEN p_set->>'std_sts_cd' ELSE std_sts_cd END,
         del_yn     = CASE WHEN p_set->>'del' = 'Y' THEN 'Y' ELSE del_yn END,
         del_dtm    = CASE WHEN p_set->>'del' = 'Y' THEN CURRENT_TIMESTAMP ELSE del_dtm END,
         ver_no     = ver_no + 1,
         modr_id    = v_usr
   WHERE area_id = p_area_id AND cd_id = p_cd_id AND del_yn = 'N'
   RETURNING to_jsonb(std_cd_bas.*) INTO v_aftr;
  INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, bfr_val, aftr_val, apv_req_id, usr_id, regr_id, modr_id)
  VALUES (p_area_id, 'CD', p_cd_id, p_act, v_bfr, v_aftr, p_req_id, p_usr_id, v_usr, v_usr);
  RETURN (v_aftr->>'ver_no')::INT;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cd_set(uuid, text, integer, jsonb, uuid, uuid, text)');

-- 신청 : INS = 코드기본 승인대기 행(새 행 또는 논리 삭제된 같은 코드ID 되살림) + 요청, UPD·DEL = 요청만(기준 버전). 반환 = 요청ID
--  활성 같은 코드ID·같은 용어 = 23505, 처리 대기 요청 존재 = 23505(ux_std_apv_req_key_wait)
CREATE OR REPLACE FUNCTION fn_cd_req(p_area_id UUID, p_act TEXT, p_cd_id TEXT, p_ver INT, p_row JSONB, p_usr_id UUID, p_rsn TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_usr TEXT := p_usr_id::TEXT;
  v_req UUID;
  v_ver INT;
BEGIN
  IF p_act = 'INS' THEN
    UPDATE std_cd_bas
       SET term_id = (p_row->>'term_id')::UUID, cd_cls_nm = p_row->>'cd_cls_nm', cd_desc = p_row->>'cd_desc', use_yn = coalesce(p_row->>'use_yn', 'Y'),
           std_sts_cd = 'REQ', del_yn = 'N', del_dtm = NULL, ver_no = ver_no + 1, modr_id = v_usr
     WHERE area_id = p_area_id AND cd_id = p_cd_id AND del_yn = 'Y'
     RETURNING ver_no INTO v_ver;
    IF v_ver IS NULL THEN
      INSERT INTO std_cd_bas (area_id, cd_id, term_id, cd_cls_nm, cd_desc, use_yn, std_sts_cd, regr_id, modr_id)
      VALUES (p_area_id, p_cd_id, (p_row->>'term_id')::UUID, p_row->>'cd_cls_nm', p_row->>'cd_desc', coalesce(p_row->>'use_yn', 'Y'), 'REQ', v_usr, v_usr);
    END IF;
  END IF;
  INSERT INTO std_apv_req (area_id, tgt_tp_cd, tgt_key_txt, act_cd, aftr_val, base_ver_no, req_usr_id, req_rsn_txt, regr_id, modr_id)
  VALUES (p_area_id, 'CD', p_cd_id, p_act, p_row, CASE WHEN p_act = 'INS' THEN NULL ELSE p_ver END, p_usr_id, p_rsn, v_usr, v_usr)
  RETURNING apv_req_id INTO v_req;
  IF p_act = 'INS' THEN
    INSERT INTO std_audit_log (area_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, apv_req_id, usr_id, regr_id, modr_id)
    VALUES (p_area_id, 'CD', p_cd_id, 'INS', p_row || jsonb_build_object('std_sts_cd', 'REQ'), v_req, p_usr_id, v_usr, v_usr);
  END IF;
  RETURN v_req;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cd_req(uuid, text, text, integer, jsonb, uuid, text)');

-- 처리 대기 요청 잠금(공용)
CREATE OR REPLACE FUNCTION fn_cd_wait_req(p_req_id UUID)
RETURNS std_apv_req
LANGUAGE plpgsql
AS $$
DECLARE
  r std_apv_req%ROWTYPE;
BEGIN
  SELECT * INTO r FROM std_apv_req WHERE apv_req_id = p_req_id AND tgt_tp_cd = 'CD' AND del_yn = 'N' FOR UPDATE;
  IF NOT FOUND OR r.apv_sts_cd <> 'REQ' THEN
    RAISE EXCEPTION 'fn_cd_wait_req: 처리 대기 요청 없음' USING ERRCODE = 'P0002';
  END IF;
  RETURN r;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cd_wait_req(uuid)');

-- 승인 : INS = 승인대기 → 승인완료, UPD = 신청 칸 반영, DEL = 논리 삭제(활성 코드상세가 있으면 P0003). 앱이 코드명 규칙·용어를 먼저 재검증
CREATE OR REPLACE FUNCTION fn_cd_apv(p_req_id UUID, p_usr_id UUID, p_opn TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  r std_apv_req%ROWTYPE := fn_cd_wait_req(p_req_id);
BEGIN
  IF r.act_cd = 'INS' THEN
    IF NOT EXISTS (SELECT 1 FROM std_cd_bas WHERE area_id = r.area_id AND cd_id = r.tgt_key_txt AND del_yn = 'N' AND std_sts_cd = 'REQ') THEN
      RAISE EXCEPTION 'fn_cd_apv: 승인대기 코드기본 없음' USING ERRCODE = '40001';
    END IF;
    PERFORM fn_cd_set(r.area_id, r.tgt_key_txt, NULL, '{"std_sts_cd":"CNFM"}'::JSONB, p_usr_id, p_req_id, 'UPD');
  ELSIF r.act_cd = 'UPD' THEN
    PERFORM fn_cd_set(r.area_id, r.tgt_key_txt, r.base_ver_no, r.aftr_val - 'std_sts_cd' - 'del', p_usr_id, p_req_id, 'UPD');
  ELSE
    IF EXISTS (SELECT 1 FROM std_cd_dtl WHERE area_id = r.area_id AND cd_id = r.tgt_key_txt AND del_yn = 'N') THEN
      RAISE EXCEPTION 'fn_cd_apv: 코드상세가 있는 코드기본' USING ERRCODE = 'P0003';
    END IF;
    PERFORM fn_cd_set(r.area_id, r.tgt_key_txt, r.base_ver_no, '{"del":"Y"}'::JSONB, p_usr_id, p_req_id, 'DEL');
  END IF;
  UPDATE std_apv_req SET apv_sts_cd = 'APV', apv_usr_id = p_usr_id, apv_dtm = CURRENT_TIMESTAMP, apv_opn_txt = p_opn, modr_id = p_usr_id::TEXT
   WHERE apv_req_id = p_req_id;
  RETURN r.tgt_key_txt;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cd_apv(uuid, uuid, text)');

-- 반려(사유 필수) : 등록 신청이면 코드기본 반려 상태
CREATE OR REPLACE FUNCTION fn_cd_rjct(p_req_id UUID, p_usr_id UUID, p_rsn TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r std_apv_req%ROWTYPE;
BEGIN
  IF coalesce(btrim(p_rsn), '') = '' THEN
    RAISE EXCEPTION 'fn_cd_rjct: 반려사유 필수' USING ERRCODE = '22023';
  END IF;
  r := fn_cd_wait_req(p_req_id);
  IF r.act_cd = 'INS' THEN
    PERFORM fn_cd_set(r.area_id, r.tgt_key_txt, NULL, '{"std_sts_cd":"RJCT"}'::JSONB, p_usr_id, p_req_id, 'UPD');
  END IF;
  UPDATE std_apv_req SET apv_sts_cd = 'RJCT', rjct_rsn_txt = p_rsn, apv_usr_id = p_usr_id, apv_dtm = CURRENT_TIMESTAMP, modr_id = p_usr_id::TEXT
   WHERE apv_req_id = p_req_id;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cd_rjct(uuid, uuid, text)');

-- 취소(신청자 본인, 앱 확인) : 등록 신청이면 코드기본과 그 코드상세 논리 삭제
CREATE OR REPLACE FUNCTION fn_cd_cncl(p_req_id UUID, p_usr_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r std_apv_req%ROWTYPE := fn_cd_wait_req(p_req_id);
BEGIN
  IF r.act_cd = 'INS' THEN
    UPDATE std_cd_dtl SET del_yn = 'Y', del_dtm = CURRENT_TIMESTAMP, ver_no = ver_no + 1, modr_id = p_usr_id::TEXT
     WHERE area_id = r.area_id AND cd_id = r.tgt_key_txt AND del_yn = 'N';
    PERFORM fn_cd_set(r.area_id, r.tgt_key_txt, NULL, '{"del":"Y"}'::JSONB, p_usr_id, p_req_id, 'DEL');
  END IF;
  UPDATE std_apv_req SET apv_sts_cd = 'CNCL', apv_usr_id = p_usr_id, apv_dtm = CURRENT_TIMESTAMP, modr_id = p_usr_id::TEXT
   WHERE apv_req_id = p_req_id;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cd_cncl(uuid, uuid)');

-- 반려된 코드기본 재신청 : 바뀐 칸 반영 + 승인대기 → 새 등록 요청. 반환 = 요청ID
CREATE OR REPLACE FUNCTION fn_cd_resub(p_area_id UUID, p_cd_id TEXT, p_ver INT, p_row JSONB, p_usr_id UUID, p_rsn TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_usr TEXT := p_usr_id::TEXT;
  v_req UUID;
  v_cur JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM std_cd_bas WHERE area_id = p_area_id AND cd_id = p_cd_id AND del_yn = 'N' AND std_sts_cd = 'RJCT') THEN
    RAISE EXCEPTION 'fn_cd_resub: 반려 상태 아님' USING ERRCODE = '40001';
  END IF;
  PERFORM fn_cd_set(p_area_id, p_cd_id, p_ver, (coalesce(p_row, '{}'::JSONB) - 'del') || '{"std_sts_cd":"REQ"}'::JSONB, p_usr_id, NULL, 'UPD');
  SELECT to_jsonb(b) INTO v_cur FROM std_cd_bas b WHERE area_id = p_area_id AND cd_id = p_cd_id AND del_yn = 'N';
  INSERT INTO std_apv_req (area_id, tgt_tp_cd, tgt_key_txt, act_cd, aftr_val, req_usr_id, req_rsn_txt, regr_id, modr_id)
  VALUES (p_area_id, 'CD', p_cd_id, 'INS', v_cur, p_usr_id, p_rsn, v_usr, v_usr)
  RETURNING apv_req_id INTO v_req;
  RETURN v_req;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cd_resub(uuid, text, integer, jsonb, uuid, text)');

COMMIT;

NOTIFY pgrst, 'reload schema';
