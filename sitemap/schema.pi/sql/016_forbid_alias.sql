-- 016_forbid_alias.sql : 금칙어 관리(P05) + 동의어 원천 차단(2026-10-16 마스터 지시)
-- 원칙 : 분류체계 안에서 표준단어 논리명과 대체 표기(이음동의어 SYN·금칙어 BAN)는 서로 겹칠 수 없고, 같은 대체 표기는 한 표준단어에만 둔다
--        동음이의어(같은 논리명)는 ux_std_dic_area_log_nm_actv, 물리명 중복은 sql/014 가 차단. 이 파일은 표기 상호 배타를 DB 트리거로 강제
-- 금칙어 저장 위치 일원화 : std_dic.forbid_word_txt(쉼표 문자열) → std_dic_rel(rel_tp_cd = BAN) 이관, 칸은 남기되 사용 중단
BEGIN;

ALTER TABLE std_dic_rel DROP CONSTRAINT std_dic_rel_rel_tp_cd_check;
ALTER TABLE std_dic_rel ADD  CONSTRAINT std_dic_rel_rel_tp_cd_check CHECK (rel_tp_cd IN ('SYN','BAN','ANT','SIM'));
COMMENT ON COLUMN std_dic_rel.rel_tp_cd IS '관계유형코드 : SYN 이음동의어 / BAN 금칙어(대체 표기, 표준단어로 등록 불가) / ANT 반의어 / SIM 유의어';

-- 이관 : 금칙어 목록 문자열 → BAN 행(중복 제거), 원래 칸은 비움(mod_dtm 트리거 정지)
INSERT INTO std_dic_rel (dic_id, rel_tp_cd, rel_txt, regr_id, modr_id)
SELECT DISTINCT d.dic_id, 'BAN', trim(x), 'MIG_016', 'MIG_016'
FROM std_dic d, unnest(string_to_array(d.forbid_word_txt, ',')) AS x
WHERE d.del_yn = 'N' AND trim(x) <> ''
ON CONFLICT DO NOTHING;
ALTER TABLE std_dic DISABLE TRIGGER trg_std_dic_mod_dtm;
UPDATE std_dic SET forbid_word_txt = NULL WHERE forbid_word_txt IS NOT NULL;
ALTER TABLE std_dic ENABLE TRIGGER trg_std_dic_mod_dtm;
COMMENT ON COLUMN std_dic.forbid_word_txt IS '(사용 중단, sql/016) 금칙어는 std_dic_rel rel_tp_cd = BAN';

-- 단어 논리명이 같은 분류체계의 대체 표기(SYN·BAN)이면 거부
CREATE OR REPLACE FUNCTION fn_chk_dic_not_alias()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.del_yn = 'N' AND EXISTS (
    SELECT 1 FROM std_dic_rel r JOIN std_dic d ON d.dic_id = r.dic_id
    WHERE r.del_yn = 'N' AND r.rel_tp_cd IN ('SYN','BAN') AND d.del_yn = 'N' AND d.area_id = NEW.area_id AND r.rel_txt = NEW.dic_log_nm
  ) THEN
    RAISE EXCEPTION 'std_dic_alias: 대체 표기(이음동의어·금칙어)는 표준단어로 등록할 수 없음 (%)', NEW.dic_log_nm USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_std_dic_not_alias ON std_dic;
CREATE TRIGGER trg_std_dic_not_alias BEFORE INSERT OR UPDATE OF dic_log_nm, del_yn ON std_dic FOR EACH ROW EXECUTE FUNCTION fn_chk_dic_not_alias();

-- 대체 표기가 같은 분류체계의 표준단어 논리명이거나 다른 단어의 대체 표기이면 거부
CREATE OR REPLACE FUNCTION fn_chk_rel_not_word()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_area UUID;
BEGIN
  IF NEW.del_yn <> 'N' OR NEW.rel_tp_cd NOT IN ('SYN','BAN') THEN
    RETURN NEW;
  END IF;
  SELECT area_id INTO v_area FROM std_dic WHERE dic_id = NEW.dic_id;
  IF EXISTS (SELECT 1 FROM std_dic WHERE area_id = v_area AND del_yn = 'N' AND dic_log_nm = NEW.rel_txt) THEN
    RAISE EXCEPTION 'std_dic_rel_word: 표준단어 논리명은 대체 표기로 둘 수 없음 (%)', NEW.rel_txt USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM std_dic_rel r JOIN std_dic d ON d.dic_id = r.dic_id
    WHERE r.del_yn = 'N' AND r.rel_tp_cd IN ('SYN','BAN') AND d.del_yn = 'N' AND d.area_id = v_area AND r.rel_txt = NEW.rel_txt AND r.rel_id <> NEW.rel_id
  ) THEN
    RAISE EXCEPTION 'std_dic_rel_dup: 이미 다른 표준단어의 대체 표기 (%)', NEW.rel_txt USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_std_dic_rel_not_word ON std_dic_rel;
CREATE TRIGGER trg_std_dic_rel_not_word BEFORE INSERT OR UPDATE OF rel_txt, rel_tp_cd, del_yn ON std_dic_rel FOR EACH ROW EXECUTE FUNCTION fn_chk_rel_not_word();
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_dic_not_alias()'), fn_grant_svc_only('FUNCTION', 'fn_chk_rel_not_word()');

-- 표준 행 생성(sql/013 정의 + 금칙어 bans → BAN 행) : 등록 신청·일괄등록 공용
CREATE OR REPLACE FUNCTION fn_new_std_row(p_tp TEXT, p_area_id UUID, r JSONB, p_sts TEXT, p_usr TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_tp = 'DIC' THEN
    INSERT INTO std_dic (area_id, dic_log_nm, dic_phy_nm, dic_eng_nm, dic_chn_nm, ent_clss_yn, attr_clss_yn, forbid_yn, dic_desc, forbid_word_txt, key_dom_yn, std_sts_cd, regr_id, modr_id)
    VALUES (p_area_id, r->>'dic_log_nm', r->>'dic_phy_nm', r->>'dic_eng_nm', r->>'dic_chn_nm', coalesce(r->>'ent_clss_yn', 'N'), coalesce(r->>'attr_clss_yn', 'N'),
            coalesce(r->>'forbid_yn', 'N'), r->>'dic_desc', r->>'forbid_word_txt', coalesce(r->>'key_dom_yn', 'N'), p_sts, p_usr, p_usr)
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

COMMIT;

NOTIFY pgrst, 'reload schema';
