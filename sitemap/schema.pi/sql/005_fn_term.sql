-- 005_fn_term.sql : 표준용어 등록 함수 — 용어 행과 용어 구성(std_term_dic)을 한 트랜잭션으로 저장
-- 호출 : 서버 API(service_role) RPC 전용. 용어명·규칙 검증은 API 가 수행하고, 유일·FK 보장은 테이블 제약이 수행
-- 명명 : 정본 §6 함수 접두사 fn_
BEGIN;

CREATE OR REPLACE FUNCTION fn_ins_std_term(
  p_area_id  UUID,
  p_log_nm   TEXT,
  p_phy_nm   TEXT,
  p_dom_id   UUID,
  p_desc     TEXT,
  p_dic_ids  UUID[],
  p_usr_id   TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_term_id UUID;
BEGIN
  IF p_dic_ids IS NULL OR cardinality(p_dic_ids) = 0 THEN
    RAISE EXCEPTION 'fn_ins_std_term: 구성 단어 없음' USING ERRCODE = '22023';
  END IF;
  INSERT INTO std_term (area_id, term_log_nm, term_phy_nm, dom_id, term_desc, std_sts_cd, regr_id, modr_id)
  VALUES (p_area_id, p_log_nm, p_phy_nm, p_dom_id, p_desc, 'CNFM', p_usr_id, p_usr_id)
  RETURNING term_id INTO v_term_id;
  INSERT INTO std_term_dic (term_id, dic_seq, dic_id, regr_id, modr_id)
  SELECT v_term_id, o.n::INT, o.dic_id, p_usr_id, p_usr_id
  FROM unnest(p_dic_ids) WITH ORDINALITY AS o(dic_id, n);
  RETURN v_term_id;
END;
$$;

SELECT fn_grant_svc_only('FUNCTION', 'fn_ins_std_term(uuid, text, text, uuid, text, uuid[], text)');

COMMIT;

-- PostgREST 스키마 캐시 갱신(신규 함수 RPC 노출)
NOTIFY pgrst, 'reload schema';
