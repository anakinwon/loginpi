-- Pi통신 과금 데이터 표준화 — COL(미납) PK·인덱스(적재 뒤 실행 — D14)
-- 생성 : sitemap/pitel/tools/physical_COL_build.js (손으로 고치지 말고 생성기를 고칠 것)
-- 대상 : PostgreSQL 17, 실행 전 SET search_path 로 대상 스키마 지정. 재실행 안전(IF NOT EXISTS·존재 확인)
-- 참조무결성 FK 는 설계만(D6) — 이 파일에 FK 제약 없음

-- COL-001 미납기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_unpd_m ON ptl_col_unpd_m (unpd_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_unpd_m' AND conrelid = 'ptl_col_unpd_m'::regclass) THEN
    ALTER TABLE ptl_col_unpd_m ADD CONSTRAINT pk_ptl_col_unpd_m PRIMARY KEY USING INDEX pk_ptl_col_unpd_m;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS x_ptl_col_unpd_m_01 ON ptl_col_unpd_m (bill_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_unpd_m_02 ON ptl_col_unpd_m (bill_acnt_no, bill_ym);
CREATE INDEX IF NOT EXISTS x_ptl_col_unpd_m_03 ON ptl_col_unpd_m (cust_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_unpd_m_04 ON ptl_col_unpd_m (unpd_stts_ty_cd, unpd_ocrn_dtm) WHERE unpd_stts_ty_cd IN ('01','02','04');
CREATE INDEX IF NOT EXISTS x_ptl_col_unpd_m_05 ON ptl_col_unpd_m (rcvb_trnsf_no) WHERE rcvb_trnsf_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_col_unpd_m_06 ON ptl_col_unpd_m (div_pay_agrmt_no) WHERE div_pay_agrmt_no IS NOT NULL;

-- COL-002 미납상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_unpd_d ON ptl_col_unpd_d (unpd_no, unpd_dtl_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_unpd_d' AND conrelid = 'ptl_col_unpd_d'::regclass) THEN
    ALTER TABLE ptl_col_unpd_d ADD CONSTRAINT pk_ptl_col_unpd_d PRIMARY KEY USING INDEX pk_ptl_col_unpd_d;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_unpd_d_01 ON ptl_col_unpd_d (bill_no, bill_dtl_seq);

-- COL-003 연체가산금내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_ovdu_adchg_l' AND conrelid = 'ptl_col_ovdu_adchg_l'::regclass) THEN
    ALTER TABLE ptl_col_ovdu_adchg_l ADD CONSTRAINT pk_ptl_col_ovdu_adchg_l PRIMARY KEY (ovdu_adchg_no, adchg_imps_dtm);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_ovdu_adchg_l_01 ON ptl_col_ovdu_adchg_l (unpd_no, imps_ym);
CREATE INDEX IF NOT EXISTS x_ptl_col_ovdu_adchg_l_02 ON ptl_col_ovdu_adchg_l (rflt_bill_no) WHERE rflt_bill_no IS NOT NULL;

-- COL-004 독촉내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_dun_l' AND conrelid = 'ptl_col_dun_l'::regclass) THEN
    ALTER TABLE ptl_col_dun_l ADD CONSTRAINT pk_ptl_col_dun_l PRIMARY KEY (dun_no, dun_sndng_dtm);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_dun_l_01 ON ptl_col_dun_l (unpd_no, dun_sndng_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_col_dun_l_02 ON ptl_col_dun_l (dun_sndng_dtm) WHERE dun_sndng_stts_ty_cd = '01';

-- COL-005 이용정지기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_susp_m ON ptl_col_susp_m (susp_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_susp_m' AND conrelid = 'ptl_col_susp_m'::regclass) THEN
    ALTER TABLE ptl_col_susp_m ADD CONSTRAINT pk_ptl_col_susp_m PRIMARY KEY USING INDEX pk_ptl_col_susp_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_susp_m_01 ON ptl_col_susp_m (svc_mgmt_no, susp_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_col_susp_m_02 ON ptl_col_susp_m (unpd_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_susp_m_03 ON ptl_col_susp_m (susp_stts_ty_cd, susp_dtm) WHERE susp_stts_ty_cd IN ('01','02');

-- COL-006 직권해지기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_exoftrmn_m ON ptl_col_exoftrmn_m (exoftrmn_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_exoftrmn_m' AND conrelid = 'ptl_col_exoftrmn_m'::regclass) THEN
    ALTER TABLE ptl_col_exoftrmn_m ADD CONSTRAINT pk_ptl_col_exoftrmn_m PRIMARY KEY USING INDEX pk_ptl_col_exoftrmn_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_exoftrmn_m_01 ON ptl_col_exoftrmn_m (sbsc_ctrt_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_exoftrmn_m_02 ON ptl_col_exoftrmn_m (unpd_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_exoftrmn_m_03 ON ptl_col_exoftrmn_m (susp_no) WHERE susp_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_col_exoftrmn_m_04 ON ptl_col_exoftrmn_m (exoftrmn_schd_dt) WHERE exoftrmn_stts_ty_cd IN ('01','02');

-- COL-007 채권이관기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_rcvb_trnsf_m ON ptl_col_rcvb_trnsf_m (rcvb_trnsf_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_rcvb_trnsf_m' AND conrelid = 'ptl_col_rcvb_trnsf_m'::regclass) THEN
    ALTER TABLE ptl_col_rcvb_trnsf_m ADD CONSTRAINT pk_ptl_col_rcvb_trnsf_m PRIMARY KEY USING INDEX pk_ptl_col_rcvb_trnsf_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_rcvb_trnsf_m_01 ON ptl_col_rcvb_trnsf_m (cust_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_rcvb_trnsf_m_02 ON ptl_col_rcvb_trnsf_m (rcvb_dspsl_no) WHERE rcvb_dspsl_no IS NOT NULL;

-- COL-008 분할납부약정기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_div_pay_agrmt_m ON ptl_col_div_pay_agrmt_m (div_pay_agrmt_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_div_pay_agrmt_m' AND conrelid = 'ptl_col_div_pay_agrmt_m'::regclass) THEN
    ALTER TABLE ptl_col_div_pay_agrmt_m ADD CONSTRAINT pk_ptl_col_div_pay_agrmt_m PRIMARY KEY USING INDEX pk_ptl_col_div_pay_agrmt_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_div_pay_agrmt_m_01 ON ptl_col_div_pay_agrmt_m (bill_acnt_no);

-- COL-009 대손기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_bddt_m ON ptl_col_bddt_m (bddt_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_bddt_m' AND conrelid = 'ptl_col_bddt_m'::regclass) THEN
    ALTER TABLE ptl_col_bddt_m ADD CONSTRAINT pk_ptl_col_bddt_m PRIMARY KEY USING INDEX pk_ptl_col_bddt_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_bddt_m_01 ON ptl_col_bddt_m (unpd_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_bddt_m_02 ON ptl_col_bddt_m (rcvb_trnsf_no) WHERE rcvb_trnsf_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_col_bddt_m_03 ON ptl_col_bddt_m (bddt_cfmtn_dt);

-- COL-010 미납상태이력
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_unpd_stts_h' AND conrelid = 'ptl_col_unpd_stts_h'::regclass) THEN
    ALTER TABLE ptl_col_unpd_stts_h ADD CONSTRAINT pk_ptl_col_unpd_stts_h PRIMARY KEY (unpd_no, stts_chg_seq, stts_chg_dtm);
  END IF;
END $$;

-- COL-011 연체가산금기준코드
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_ovdu_adchg_std_c ON ptl_col_ovdu_adchg_std_c (ovdu_adchg_std_ty_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_ovdu_adchg_std_c' AND conrelid = 'ptl_col_ovdu_adchg_std_c'::regclass) THEN
    ALTER TABLE ptl_col_ovdu_adchg_std_c ADD CONSTRAINT pk_ptl_col_ovdu_adchg_std_c PRIMARY KEY USING INDEX pk_ptl_col_ovdu_adchg_std_c;
  END IF;
END $$;

-- COL-012 독촉정책기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_dun_plcy_m ON ptl_col_dun_plcy_m (dun_plcy_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_dun_plcy_m' AND conrelid = 'ptl_col_dun_plcy_m'::regclass) THEN
    ALTER TABLE ptl_col_dun_plcy_m ADD CONSTRAINT pk_ptl_col_dun_plcy_m PRIMARY KEY USING INDEX pk_ptl_col_dun_plcy_m;
  END IF;
END $$;

-- COL-013 독촉발송결과내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_dun_sndng_rslt_l' AND conrelid = 'ptl_col_dun_sndng_rslt_l'::regclass) THEN
    ALTER TABLE ptl_col_dun_sndng_rslt_l ADD CONSTRAINT pk_ptl_col_dun_sndng_rslt_l PRIMARY KEY (dun_no, sndng_rslt_seq, dun_sndng_dtm);
  END IF;
END $$;

-- COL-014 이용정지이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_susp_h ON ptl_col_susp_h (susp_no, susp_hist_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_susp_h' AND conrelid = 'ptl_col_susp_h'::regclass) THEN
    ALTER TABLE ptl_col_susp_h ADD CONSTRAINT pk_ptl_col_susp_h PRIMARY KEY USING INDEX pk_ptl_col_susp_h;
  END IF;
END $$;

-- COL-015 이용정지해제내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_susp_rls_l ON ptl_col_susp_rls_l (susp_rls_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_susp_rls_l' AND conrelid = 'ptl_col_susp_rls_l'::regclass) THEN
    ALTER TABLE ptl_col_susp_rls_l ADD CONSTRAINT pk_ptl_col_susp_rls_l PRIMARY KEY USING INDEX pk_ptl_col_susp_rls_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_susp_rls_l_01 ON ptl_col_susp_rls_l (susp_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_susp_rls_l_02 ON ptl_col_susp_rls_l (rcv_no) WHERE rcv_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_col_susp_rls_l_03 ON ptl_col_susp_rls_l (div_pay_agrmt_no) WHERE div_pay_agrmt_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_col_susp_rls_l_04 ON ptl_col_susp_rls_l (pay_prms_no) WHERE pay_prms_no IS NOT NULL;

-- COL-016 직권해지예고내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_exoftrmn_prntc_l ON ptl_col_exoftrmn_prntc_l (exoftrmn_no, prntc_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_exoftrmn_prntc_l' AND conrelid = 'ptl_col_exoftrmn_prntc_l'::regclass) THEN
    ALTER TABLE ptl_col_exoftrmn_prntc_l ADD CONSTRAINT pk_ptl_col_exoftrmn_prntc_l PRIMARY KEY USING INDEX pk_ptl_col_exoftrmn_prntc_l;
  END IF;
END $$;

-- COL-017 채권추심사기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_rcvb_coll_co_m ON ptl_col_rcvb_coll_co_m (rcvb_coll_co_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_rcvb_coll_co_m' AND conrelid = 'ptl_col_rcvb_coll_co_m'::regclass) THEN
    ALTER TABLE ptl_col_rcvb_coll_co_m ADD CONSTRAINT pk_ptl_col_rcvb_coll_co_m PRIMARY KEY USING INDEX pk_ptl_col_rcvb_coll_co_m;
  END IF;
END $$;

-- COL-018 추심위임상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_coll_dlgt_d ON ptl_col_coll_dlgt_d (rcvb_trnsf_no, coll_dlgt_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_coll_dlgt_d' AND conrelid = 'ptl_col_coll_dlgt_d'::regclass) THEN
    ALTER TABLE ptl_col_coll_dlgt_d ADD CONSTRAINT pk_ptl_col_coll_dlgt_d PRIMARY KEY USING INDEX pk_ptl_col_coll_dlgt_d;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_coll_dlgt_d_01 ON ptl_col_coll_dlgt_d (rcvb_coll_co_no, coll_dlgt_dt);

-- COL-019 추심회수내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_coll_rtrvl_l ON ptl_col_coll_rtrvl_l (coll_rtrvl_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_coll_rtrvl_l' AND conrelid = 'ptl_col_coll_rtrvl_l'::regclass) THEN
    ALTER TABLE ptl_col_coll_rtrvl_l ADD CONSTRAINT pk_ptl_col_coll_rtrvl_l PRIMARY KEY USING INDEX pk_ptl_col_coll_rtrvl_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_coll_rtrvl_l_01 ON ptl_col_coll_rtrvl_l (rcvb_trnsf_no, coll_dlgt_seq);
CREATE INDEX IF NOT EXISTS x_ptl_col_coll_rtrvl_l_02 ON ptl_col_coll_rtrvl_l (unpd_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_coll_rtrvl_l_03 ON ptl_col_coll_rtrvl_l (rcv_no) WHERE rcv_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_col_coll_rtrvl_l_04 ON ptl_col_coll_rtrvl_l (coll_fee_no) WHERE coll_fee_no IS NOT NULL;

-- COL-020 추심수수료내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_coll_fee_l ON ptl_col_coll_fee_l (coll_fee_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_coll_fee_l' AND conrelid = 'ptl_col_coll_fee_l'::regclass) THEN
    ALTER TABLE ptl_col_coll_fee_l ADD CONSTRAINT pk_ptl_col_coll_fee_l PRIMARY KEY USING INDEX pk_ptl_col_coll_fee_l;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS x_ptl_col_coll_fee_l_01 ON ptl_col_coll_fee_l (rcvb_coll_co_no, stlm_ym);
CREATE INDEX IF NOT EXISTS x_ptl_col_coll_fee_l_02 ON ptl_col_coll_fee_l (stlm_no) WHERE stlm_no IS NOT NULL;

-- COL-021 분할납부회차상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_div_pay_tms_d ON ptl_col_div_pay_tms_d (div_pay_agrmt_no, div_pay_tms);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_div_pay_tms_d' AND conrelid = 'ptl_col_div_pay_tms_d'::regclass) THEN
    ALTER TABLE ptl_col_div_pay_tms_d ADD CONSTRAINT pk_ptl_col_div_pay_tms_d PRIMARY KEY USING INDEX pk_ptl_col_div_pay_tms_d;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_div_pay_tms_d_01 ON ptl_col_div_pay_tms_d (rcv_no) WHERE rcv_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_col_div_pay_tms_d_02 ON ptl_col_div_pay_tms_d (pay_schd_dt) WHERE div_pay_tms_stts_ty_cd IN ('01','03');

-- COL-022 납부약속내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_pay_prms_l ON ptl_col_pay_prms_l (pay_prms_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_pay_prms_l' AND conrelid = 'ptl_col_pay_prms_l'::regclass) THEN
    ALTER TABLE ptl_col_pay_prms_l ADD CONSTRAINT pk_ptl_col_pay_prms_l PRIMARY KEY USING INDEX pk_ptl_col_pay_prms_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_pay_prms_l_01 ON ptl_col_pay_prms_l (bill_acnt_no, pay_prms_dt);
CREATE INDEX IF NOT EXISTS x_ptl_col_pay_prms_l_02 ON ptl_col_pay_prms_l (unpd_no) WHERE unpd_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_col_pay_prms_l_03 ON ptl_col_pay_prms_l (rcv_no) WHERE rcv_no IS NOT NULL;

-- COL-023 신용정보등록내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_crinfo_reg_l ON ptl_col_crinfo_reg_l (crinfo_reg_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_crinfo_reg_l' AND conrelid = 'ptl_col_crinfo_reg_l'::regclass) THEN
    ALTER TABLE ptl_col_crinfo_reg_l ADD CONSTRAINT pk_ptl_col_crinfo_reg_l PRIMARY KEY USING INDEX pk_ptl_col_crinfo_reg_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_crinfo_reg_l_01 ON ptl_col_crinfo_reg_l (cust_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_crinfo_reg_l_02 ON ptl_col_crinfo_reg_l (unpd_no) WHERE unpd_no IS NOT NULL;

-- COL-024 신용정보해제내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_crinfo_rls_l ON ptl_col_crinfo_rls_l (crinfo_rls_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_crinfo_rls_l' AND conrelid = 'ptl_col_crinfo_rls_l'::regclass) THEN
    ALTER TABLE ptl_col_crinfo_rls_l ADD CONSTRAINT pk_ptl_col_crinfo_rls_l PRIMARY KEY USING INDEX pk_ptl_col_crinfo_rls_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_crinfo_rls_l_01 ON ptl_col_crinfo_rls_l (crinfo_reg_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_crinfo_rls_l_02 ON ptl_col_crinfo_rls_l (rcv_no) WHERE rcv_no IS NOT NULL;

-- COL-025 대손상각상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_bddt_dprc_d ON ptl_col_bddt_dprc_d (bddt_no, bddt_dprc_dtl_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_bddt_dprc_d' AND conrelid = 'ptl_col_bddt_dprc_d'::regclass) THEN
    ALTER TABLE ptl_col_bddt_dprc_d ADD CONSTRAINT pk_ptl_col_bddt_dprc_d PRIMARY KEY USING INDEX pk_ptl_col_bddt_dprc_d;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_bddt_dprc_d_01 ON ptl_col_bddt_dprc_d (unpd_no, unpd_dtl_seq);

-- COL-026 대손회수내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_bddt_rtrvl_l ON ptl_col_bddt_rtrvl_l (bddt_rtrvl_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_bddt_rtrvl_l' AND conrelid = 'ptl_col_bddt_rtrvl_l'::regclass) THEN
    ALTER TABLE ptl_col_bddt_rtrvl_l ADD CONSTRAINT pk_ptl_col_bddt_rtrvl_l PRIMARY KEY USING INDEX pk_ptl_col_bddt_rtrvl_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_bddt_rtrvl_l_01 ON ptl_col_bddt_rtrvl_l (bddt_no);
CREATE INDEX IF NOT EXISTS x_ptl_col_bddt_rtrvl_l_02 ON ptl_col_bddt_rtrvl_l (rcv_no) WHERE rcv_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_col_bddt_rtrvl_l_03 ON ptl_col_bddt_rtrvl_l (coll_rtrvl_no) WHERE coll_rtrvl_no IS NOT NULL;

-- COL-027 채권매각내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_rcvb_dspsl_l ON ptl_col_rcvb_dspsl_l (rcvb_dspsl_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_rcvb_dspsl_l' AND conrelid = 'ptl_col_rcvb_dspsl_l'::regclass) THEN
    ALTER TABLE ptl_col_rcvb_dspsl_l ADD CONSTRAINT pk_ptl_col_rcvb_dspsl_l PRIMARY KEY USING INDEX pk_ptl_col_rcvb_dspsl_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_rcvb_dspsl_l_01 ON ptl_col_rcvb_dspsl_l (rcvb_coll_co_no);

-- COL-028 채권시효이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_rcvb_prscr_h ON ptl_col_rcvb_prscr_h (unpd_no, prscr_chg_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_rcvb_prscr_h' AND conrelid = 'ptl_col_rcvb_prscr_h'::regclass) THEN
    ALTER TABLE ptl_col_rcvb_prscr_h ADD CONSTRAINT pk_ptl_col_rcvb_prscr_h PRIMARY KEY USING INDEX pk_ptl_col_rcvb_prscr_h;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_col_rcvb_prscr_h_01 ON ptl_col_rcvb_prscr_h (extsh_prscr_expry_dt) WHERE vld_end_dtm = '9999-12-31 23:59:59';

-- COL-029 미납월집계
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_unpd_mm_t' AND conrelid = 'ptl_col_unpd_mm_t'::regclass) THEN
    ALTER TABLE ptl_col_unpd_mm_t ADD CONSTRAINT pk_ptl_col_unpd_mm_t PRIMARY KEY (bill_acnt_no, std_ym);
  END IF;
END $$;

-- COL-030 미납회수월통계
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_col_unpd_rtrvl_mm_s ON ptl_col_unpd_rtrvl_mm_s (std_ym, unpd_elps_sctn_ty_cd, cust_ty_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_col_unpd_rtrvl_mm_s' AND conrelid = 'ptl_col_unpd_rtrvl_mm_s'::regclass) THEN
    ALTER TABLE ptl_col_unpd_rtrvl_mm_s ADD CONSTRAINT pk_ptl_col_unpd_rtrvl_mm_s PRIMARY KEY USING INDEX pk_ptl_col_unpd_rtrvl_mm_s;
  END IF;
END $$;

