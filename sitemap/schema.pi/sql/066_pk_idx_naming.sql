-- 066_pk_idx_naming.sql : PK·인덱스 이름 규칙 소급 적용(마스터 지시 2026-10-20) — PK = pk_<테이블>(구 <테이블>_pkey), 인덱스 = x_<테이블>_NN(구 ux_·ix_·idx_·<테이블>_<칼럼>_key)
-- DA-APPROVED: 마스터 지시 2026-10-20 "모든 PK_테이블명·X_테이블명_01 규칙 소급 적용, 기존 실수 모두 바로잡을 것" — 이름만 바꿈(데이터·구조·FK 무변경, PostgREST 임베디드 조인은 FK 이름이라 영향 없음)
-- 대상 = 운영 DB 실측(2026-10-20) PK 52개 + 인덱스 81개. 번호 = 테이블별 인덱스 생성 순서(oid), 이미 규칙에 맞는 이름(x_ecm_cst_cust_01~03·pk_ecm_cst_cust)은 제외
-- 존재할 때만 바꿈(새 환경 재생·ModelPi 로 만든 대상 테이블 ecm_* 유무와 무관), 인덱스 설명(COMMENT)에 구 이름을 덧붙여 추적. 유일 제약(UQC)은 RENAME CONSTRAINT(인덱스도 함께 바뀜)
-- 앱 코드의 유일 위반 판정(구 이름 부분 문자열 phy_nm·tbl_sfx·prj_dbms·ux_std_apv_req_key_wait)은 같은 커밋에서 새 이름 상수(src/lib/api.ts UQ)로 교체
-- 끝에 public 전체 검사 : 규칙에 안 맞는 PK·인덱스가 하나라도 남으면 예외(트랜잭션 전체 취소)
BEGIN;

DO $$
DECLARE
  r RECORD;
  v_cmt TEXT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('PK', 'ecm_cst_cust_addr_info', 'ecm_cst_cust_addr_info_pkey', 'pk_ecm_cst_cust_addr_info'),
    ('PK', 'ecm_cst_mbr_grd', 'ecm_cst_mbr_grd_pkey', 'pk_ecm_cst_mbr_grd'),
    ('PK', 'mdl_attr', 'mdl_attr_pkey', 'pk_mdl_attr'),
    ('PK', 'mdl_db_agt', 'mdl_db_agt_pkey', 'pk_mdl_db_agt'),
    ('PK', 'mdl_db_conn', 'mdl_db_conn_pkey', 'pk_mdl_db_conn'),
    ('PK', 'mdl_ddl_exec_stmt', 'mdl_ddl_exec_stmt_pkey', 'pk_mdl_ddl_exec_stmt'),
    ('PK', 'mdl_ddl_req', 'mdl_ddl_req_pkey', 'pk_mdl_ddl_req'),
    ('PK', 'mdl_dgm', 'mdl_dgm_pkey', 'pk_mdl_dgm'),
    ('PK', 'mdl_dgm_ent', 'mdl_dgm_ent_pkey', 'pk_mdl_dgm_ent'),
    ('PK', 'mdl_dgm_rel', 'mdl_dgm_rel_pkey', 'pk_mdl_dgm_rel'),
    ('PK', 'mdl_ent', 'mdl_ent_pkey', 'pk_mdl_ent'),
    ('PK', 'mdl_phy_col', 'mdl_phy_col_pkey', 'pk_mdl_phy_col'),
    ('PK', 'mdl_phy_fk', 'mdl_phy_fk_pkey', 'pk_mdl_phy_fk'),
    ('PK', 'mdl_phy_idx', 'mdl_phy_idx_pkey', 'pk_mdl_phy_idx'),
    ('PK', 'mdl_phy_mdl', 'mdl_phy_mdl_pkey', 'pk_mdl_phy_mdl'),
    ('PK', 'mdl_phy_subj', 'mdl_phy_subj_pkey', 'pk_mdl_phy_subj'),
    ('PK', 'mdl_phy_tbl', 'mdl_phy_tbl_pkey', 'pk_mdl_phy_tbl'),
    ('PK', 'mdl_prj', 'mdl_prj_pkey', 'pk_mdl_prj'),
    ('PK', 'mdl_rel', 'mdl_rel_pkey', 'pk_mdl_rel'),
    ('PK', 'mdl_rvs_col', 'mdl_rvs_col_pkey', 'pk_mdl_rvs_col'),
    ('PK', 'mdl_rvs_job', 'mdl_rvs_job_pkey', 'pk_mdl_rvs_job'),
    ('PK', 'mdl_rvs_tbl', 'mdl_rvs_tbl_pkey', 'pk_mdl_rvs_tbl'),
    ('PK', 'mdl_sql_exec_hist', 'mdl_sql_exec_hist_pkey', 'pk_mdl_sql_exec_hist'),
    ('PK', 'mdl_sql_tab', 'mdl_sql_tab_pkey', 'pk_mdl_sql_tab'),
    ('PK', 'mdl_subj', 'mdl_subj_pkey', 'pk_mdl_subj'),
    ('PK', 'mdl_ver', 'mdl_ver_pkey', 'pk_mdl_ver'),
    ('PK', 'pi_pymnt', 'pi_pymnt_pkey', 'pk_pi_pymnt'),
    ('PK', 'std_abbr', 'std_abbr_pkey', 'pk_std_abbr'),
    ('PK', 'std_apv_req', 'std_apv_req_pkey', 'pk_std_apv_req'),
    ('PK', 'std_area', 'std_area_pkey', 'pk_std_area'),
    ('PK', 'std_area_mbr', 'std_area_mbr_pkey', 'pk_std_area_mbr'),
    ('PK', 'std_area_plan', 'std_area_plan_pkey', 'pk_std_area_plan'),
    ('PK', 'std_audit_log', 'std_audit_log_pkey', 'pk_std_audit_log'),
    ('PK', 'std_cd', 'std_cd_pkey', 'pk_std_cd'),
    ('PK', 'std_cd_bas', 'std_cd_bas_pkey', 'pk_std_cd_bas'),
    ('PK', 'std_cd_dtl', 'std_cd_dtl_pkey', 'pk_std_cd_dtl'),
    ('PK', 'std_cd_val', 'std_cd_val_pkey', 'pk_std_cd_val'),
    ('PK', 'std_cmn_cd', 'std_cmn_cd_pkey', 'pk_std_cmn_cd'),
    ('PK', 'std_dbms', 'std_dbms_pkey', 'pk_std_dbms'),
    ('PK', 'std_dic', 'std_dic_pkey', 'pk_std_dic'),
    ('PK', 'std_dic_rel', 'std_dic_rel_pkey', 'pk_std_dic_rel'),
    ('PK', 'std_dom', 'std_dom_pkey', 'pk_std_dom'),
    ('PK', 'std_dom_grp', 'std_dom_grp_pkey', 'pk_std_dom_grp'),
    ('PK', 'std_lgc_tp', 'std_lgc_tp_pkey', 'pk_std_lgc_tp'),
    ('PK', 'std_term', 'std_term_pkey', 'pk_std_term'),
    ('PK', 'std_term_dic', 'std_term_dic_pkey', 'pk_std_term_dic'),
    ('PK', 'std_tp_map', 'std_tp_map_pkey', 'pk_std_tp_map'),
    ('PK', 'sys_auth_lnk_cd', 'sys_auth_lnk_cd_pkey', 'pk_sys_auth_lnk_cd'),
    ('PK', 'sys_fee_plan', 'sys_fee_plan_pkey', 'pk_sys_fee_plan'),
    ('PK', 'sys_mgrt_hist', 'sys_mgrt_hist_pkey', 'pk_sys_mgrt_hist'),
    ('PK', 'sys_user', 'sys_user_pkey', 'pk_sys_user'),
    ('PK', 'sys_usr_auth_lnk', 'sys_usr_auth_lnk_pkey', 'pk_sys_usr_auth_lnk'),
    ('IDX', 'mdl_attr', 'ux_mdl_attr_ent_term_actv', 'x_mdl_attr_01'),
    ('IDX', 'mdl_attr', 'ix_mdl_attr_ent', 'x_mdl_attr_02'),
    ('IDX', 'mdl_attr', 'ix_mdl_attr_term', 'x_mdl_attr_03'),
    ('IDX', 'mdl_attr', 'ix_mdl_attr_src', 'x_mdl_attr_04'),
    ('IDX', 'mdl_db_agt', 'ux_mdl_db_agt_tkn_hash', 'x_mdl_db_agt_01'),
    ('IDX', 'mdl_db_agt', 'ux_mdl_db_agt_area_nm_actv', 'x_mdl_db_agt_02'),
    ('IDX', 'mdl_db_conn', 'ux_mdl_db_conn_area_nm_actv', 'x_mdl_db_conn_01'),
    ('IDX', 'mdl_db_conn', 'idx_mdl_db_conn_agt', 'x_mdl_db_conn_02'),
    ('IDX', 'mdl_ddl_exec_stmt', 'ux_mdl_ddl_exec_stmt_req_try_seq', 'x_mdl_ddl_exec_stmt_01'),
    ('IDX', 'mdl_ddl_req', 'ux_mdl_ddl_req_conn_live', 'x_mdl_ddl_req_01'),
    ('IDX', 'mdl_dgm', 'ux_mdl_dgm_prj_subj_lvl_actv', 'x_mdl_dgm_01'),
    ('IDX', 'mdl_dgm_ent', 'ux_mdl_dgm_ent_dgm_ent_actv', 'x_mdl_dgm_ent_01'),
    ('IDX', 'mdl_dgm_rel', 'ux_mdl_dgm_rel_dgm_rel_actv', 'x_mdl_dgm_rel_01'),
    ('IDX', 'mdl_ent', 'ix_mdl_ent_subj', 'x_mdl_ent_01'),
    ('IDX', 'mdl_ent', 'ix_mdl_ent_dic_ids', 'x_mdl_ent_02'),
    ('IDX', 'mdl_ent', 'ux_mdl_ent_prj_nm_actv', 'x_mdl_ent_03'),
    ('IDX', 'mdl_phy_col', 'ux_mdl_phy_col_tbl_nm_actv', 'x_mdl_phy_col_01'),
    ('IDX', 'mdl_phy_col', 'ux_mdl_phy_col_tbl_attr_actv', 'x_mdl_phy_col_02'),
    ('IDX', 'mdl_phy_col', 'ux_mdl_phy_col_tbl_pk_seq_actv', 'x_mdl_phy_col_03'),
    ('IDX', 'mdl_phy_col', 'ix_mdl_phy_col_dom', 'x_mdl_phy_col_04'),
    ('IDX', 'mdl_phy_fk', 'ux_mdl_phy_fk_mdl_rel_actv', 'x_mdl_phy_fk_01'),
    ('IDX', 'mdl_phy_fk', 'ux_mdl_phy_fk_mdl_nm_actv', 'x_mdl_phy_fk_02'),
    ('IDX', 'mdl_phy_idx', 'ux_mdl_phy_idx_tbl_nm_actv', 'x_mdl_phy_idx_01'),
    ('IDX', 'mdl_phy_mdl', 'ux_mdl_phy_mdl_prj_dbms_actv', 'x_mdl_phy_mdl_01'),
    ('IDX', 'mdl_phy_subj', 'ux_mdl_phy_subj_mdl_subj_actv', 'x_mdl_phy_subj_01'),
    ('IDX', 'mdl_phy_tbl', 'ux_mdl_phy_tbl_mdl_ent_actv', 'x_mdl_phy_tbl_01'),
    ('IDX', 'mdl_phy_tbl', 'ux_mdl_phy_tbl_mdl_nm_actv', 'x_mdl_phy_tbl_02'),
    ('IDX', 'mdl_prj', 'ux_mdl_prj_area_nm_actv', 'x_mdl_prj_01'),
    ('IDX', 'mdl_rel', 'ux_mdl_rel_pair_nm_actv', 'x_mdl_rel_01'),
    ('IDX', 'mdl_rel', 'ix_mdl_rel_prnt', 'x_mdl_rel_02'),
    ('IDX', 'mdl_rel', 'ix_mdl_rel_chld', 'x_mdl_rel_03'),
    ('IDX', 'mdl_rel', 'ix_mdl_rel_prj', 'x_mdl_rel_04'),
    ('IDX', 'mdl_rvs_col', 'ux_mdl_rvs_col_tbl_nm_actv', 'x_mdl_rvs_col_01'),
    ('IDX', 'mdl_rvs_job', 'ix_mdl_rvs_job_prj', 'x_mdl_rvs_job_01'),
    ('IDX', 'mdl_rvs_tbl', 'ux_mdl_rvs_tbl_job_nm_actv', 'x_mdl_rvs_tbl_01'),
    ('IDX', 'mdl_sql_exec_hist', 'ix_mdl_sql_exec_hist_area_usr', 'x_mdl_sql_exec_hist_01'),
    ('IDX', 'mdl_sql_exec_hist', 'ix_mdl_sql_exec_hist_area', 'x_mdl_sql_exec_hist_02'),
    ('IDX', 'mdl_sql_tab', 'ix_mdl_sql_tab_area_usr', 'x_mdl_sql_tab_01'),
    ('IDX', 'mdl_sql_tab', 'ux_mdl_sql_tab_nm_actv', 'x_mdl_sql_tab_02'),
    ('IDX', 'mdl_subj', 'ux_mdl_subj_prj_nm_actv', 'x_mdl_subj_01'),
    ('IDX', 'mdl_subj', 'ux_mdl_subj_prj_abbr_actv', 'x_mdl_subj_02'),
    ('IDX', 'mdl_ver', 'ux_mdl_ver_prj_seq', 'x_mdl_ver_01'),
    ('IDX', 'pi_pymnt', 'idx_pi_pymnt_usr_id', 'x_pi_pymnt_01'),
    ('IDX', 'pi_pymnt', 'idx_pi_pymnt_pymnt_tp_cd_sts', 'x_pi_pymnt_02'),
    ('IDX', 'std_abbr', 'ux_std_abbr_area_log_nm_actv', 'x_std_abbr_01'),
    ('IDX', 'std_apv_req', 'idx_std_apv_req_area_sts', 'x_std_apv_req_01'),
    ('IDX', 'std_apv_req', 'ux_std_apv_req_tgt_wait', 'x_std_apv_req_02'),
    ('IDX', 'std_apv_req', 'ux_std_apv_req_key_wait', 'x_std_apv_req_03'),
    ('IDX', 'std_area', 'ux_std_area_area_nm_actv', 'x_std_area_01'),
    ('IDX', 'std_area_mbr', 'ux_std_area_mbr_area_usr_actv', 'x_std_area_mbr_01'),
    ('UQC', 'std_area_plan', 'std_area_plan_pymnt_id_key', 'x_std_area_plan_01'),
    ('IDX', 'std_area_plan', 'idx_std_area_plan_area_end', 'x_std_area_plan_02'),
    ('IDX', 'std_audit_log', 'idx_std_audit_log_area_reg_dtm', 'x_std_audit_log_01'),
    ('IDX', 'std_audit_log', 'idx_std_audit_log_tgt', 'x_std_audit_log_02'),
    ('IDX', 'std_cd', 'ux_std_cd_area_term_actv', 'x_std_cd_01'),
    ('IDX', 'std_cd_bas', 'ux_std_cd_bas_area_term_actv', 'x_std_cd_bas_01'),
    ('IDX', 'std_cd_dtl', 'ux_std_cd_dtl_nm_actv', 'x_std_cd_dtl_01'),
    ('IDX', 'std_cd_dtl', 'idx_std_cd_dtl_sort', 'x_std_cd_dtl_02'),
    ('IDX', 'std_cd_val', 'ux_std_cd_val_cd_val_actv', 'x_std_cd_val_01'),
    ('IDX', 'std_cd_val', 'idx_std_cd_val_cd_sort', 'x_std_cd_val_02'),
    ('IDX', 'std_cd_val', 'ux_std_cd_val_cd_nm_actv', 'x_std_cd_val_03'),
    ('IDX', 'std_dic', 'ux_std_dic_area_log_nm_actv', 'x_std_dic_01'),
    ('IDX', 'std_dic', 'idx_std_dic_area_phy_nm', 'x_std_dic_02'),
    ('IDX', 'std_dic', 'ux_std_dic_area_phy_nm_actv', 'x_std_dic_03'),
    ('IDX', 'std_dic', 'ix_std_dic_area_reg_actv', 'x_std_dic_04'),
    ('IDX', 'std_dic', 'ux_std_dic_area_tbl_sfx_actv', 'x_std_dic_05'),
    ('IDX', 'std_dic_rel', 'ux_std_dic_rel_dic_tp_txt_actv', 'x_std_dic_rel_01'),
    ('IDX', 'std_dom', 'ux_std_dom_area_nm_actv', 'x_std_dom_01'),
    ('IDX', 'std_dom', 'ix_std_dom_area_reg_actv', 'x_std_dom_02'),
    ('IDX', 'std_dom_grp', 'ux_std_dom_grp_area_nm_actv', 'x_std_dom_grp_01'),
    ('IDX', 'std_term', 'ux_std_term_area_log_nm_actv', 'x_std_term_01'),
    ('IDX', 'std_term', 'ux_std_term_area_phy_nm_actv', 'x_std_term_02'),
    ('IDX', 'std_term', 'ix_std_term_area_reg_actv', 'x_std_term_03'),
    ('IDX', 'std_term_dic', 'idx_std_term_dic_dic_id', 'x_std_term_dic_01'),
    ('IDX', 'std_tp_map', 'ux_std_tp_map_dbms_lgc_actv', 'x_std_tp_map_01'),
    ('IDX', 'std_tp_map', 'idx_std_tp_map_dbms_phy', 'x_std_tp_map_02'),
    ('IDX', 'sys_auth_lnk_cd', 'ux_sys_auth_lnk_cd_lnk_cd_actv', 'x_sys_auth_lnk_cd_01'),
    ('IDX', 'sys_auth_lnk_cd', 'idx_sys_auth_lnk_cd_usr_id', 'x_sys_auth_lnk_cd_02'),
    ('IDX', 'sys_user', 'ux_sys_user_pi_usr_nm_actv', 'x_sys_user_01'),
    ('IDX', 'sys_usr_auth_lnk', 'ux_sys_usr_auth_lnk_prvd_actv', 'x_sys_usr_auth_lnk_01'),
    ('IDX', 'sys_usr_auth_lnk', 'ux_sys_usr_auth_lnk_usr_prvd_actv', 'x_sys_usr_auth_lnk_02')
  ) v(k, tbl, old_nm, new_nm) LOOP
    IF r.k IN ('PK', 'UQC') THEN
      IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
                 WHERE n.nspname = 'public' AND t.relname = r.tbl AND c.conname = r.old_nm) THEN
        EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', r.tbl, r.old_nm, r.new_nm);
      ELSE
        CONTINUE;
      END IF;
    ELSIF EXISTS (SELECT 1 FROM pg_class i JOIN pg_namespace n ON n.oid = i.relnamespace WHERE n.nspname = 'public' AND i.relkind = 'i' AND i.relname = r.old_nm) THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.old_nm, r.new_nm);
    ELSE
      CONTINUE;
    END IF;
    IF r.k <> 'PK' THEN
      SELECT obj_description(format('public.%I', r.new_nm)::regclass, 'pg_class') INTO v_cmt;
      EXECUTE format('COMMENT ON INDEX public.%I IS %L', r.new_nm, coalesce(v_cmt || ' / ', '') || '구 이름 ' || r.old_nm || '(sql/066 명명 규칙 소급)');
    END IF;
  END LOOP;
END
$$;

-- 검사 : public 의 모든 PK = pk_<테이블>, PK 아닌 인덱스 = x_<테이블>_NN
DO $$
DECLARE
  v_bad TEXT;
BEGIN
  SELECT string_agg(t.relname || '.' || c.conname, ', ') INTO v_bad
  FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND c.contype = 'p' AND c.conname <> 'pk_' || t.relname;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'PK 이름 규칙 위반 남음 : %', v_bad; END IF;
  SELECT string_agg(i.relname, ', ') INTO v_bad
  FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class t ON t.oid = x.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND NOT x.indisprimary AND i.relname !~ ('^x_' || t.relname || '_[0-9]{2}$');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '인덱스 이름 규칙 위반 남음 : %', v_bad; END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
