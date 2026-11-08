-- 40_pay_constraints.sql : PAY PK·인덱스 — 데이터 적재 뒤 실행(D14). 재실행 안전(IF NOT EXISTS·제약 존재 확인)
-- 일반 테이블 = 유일 인덱스 pk_<테이블> → PRIMARY KEY USING INDEX / 파티션 테이블 = ADD CONSTRAINT PRIMARY KEY (파티션 키 포함). FK 제약은 만들지 않음(D6)
-- 실행 후 ANALYZE 는 메인 적재 절차가 수행. 생성기 tools/physical_PAY.js

-- PAY-001 원시사용내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_raw_use_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_raw_use_l ADD CONSTRAINT pk_ptl_pay_raw_use_l PRIMARY KEY (raw_use_no, clct_dtm);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_raw_use_l_01 ON ptl_pay_raw_use_l (clct_file_no);
CREATE INDEX IF NOT EXISTS x_ptl_pay_raw_use_l_02 ON ptl_pay_raw_use_l (svc_no, use_bgng_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_pay_raw_use_l_03 ON ptl_pay_raw_use_l (clct_dtm) WHERE raw_use_prcs_stts_ty_cd IN ('01','02','03','05');

-- PAY-002 사용내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_use_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_use_l ADD CONSTRAINT pk_ptl_pay_use_l PRIMARY KEY (use_no, bill_ym);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_use_l_01 ON ptl_pay_use_l (svc_mgmt_no, bill_ym, use_bgng_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_pay_use_l_02 ON ptl_pay_use_l (svc_no, use_bgng_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_pay_use_l_03 ON ptl_pay_use_l (raw_use_no);
CREATE INDEX IF NOT EXISTS x_ptl_pay_use_l_04 ON ptl_pay_use_l (bill_ym) WHERE use_rat_stts_ty_cd IN ('01','03','05');

-- PAY-003 사용량월집계
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_use_qty_mm_t'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_use_qty_mm_t ADD CONSTRAINT pk_ptl_pay_use_qty_mm_t PRIMARY KEY (svc_mgmt_no, bill_ym, use_svc_ty_cd);
  END IF;
END $$;

-- PAY-004 요금계산내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_chrg_calc_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_chrg_calc_l ADD CONSTRAINT pk_ptl_pay_chrg_calc_l PRIMARY KEY (chrg_calc_no, bill_ym);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_chrg_calc_l_01 ON ptl_pay_chrg_calc_l (bill_acnt_no, bill_ym);
CREATE INDEX IF NOT EXISTS x_ptl_pay_chrg_calc_l_02 ON ptl_pay_chrg_calc_l (svc_mgmt_no, bill_ym);
CREATE INDEX IF NOT EXISTS x_ptl_pay_chrg_calc_l_03 ON ptl_pay_chrg_calc_l (bill_job_no);
CREATE INDEX IF NOT EXISTS x_ptl_pay_chrg_calc_l_04 ON ptl_pay_chrg_calc_l (bill_no, bill_dtl_seq);
CREATE INDEX IF NOT EXISTS x_ptl_pay_chrg_calc_l_05 ON ptl_pay_chrg_calc_l (sbsc_prod_no);

-- PAY-005 청구주기코드
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_bill_cycl_c ON ptl_pay_bill_cycl_c (bill_cycl_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_bill_cycl_c'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_bill_cycl_c ADD CONSTRAINT pk_ptl_pay_bill_cycl_c PRIMARY KEY USING INDEX pk_ptl_pay_bill_cycl_c;
  END IF;
END $$;

-- PAY-006 청구작업기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_bill_job_m ON ptl_pay_bill_job_m (bill_job_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_bill_job_m'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_bill_job_m ADD CONSTRAINT pk_ptl_pay_bill_job_m PRIMARY KEY USING INDEX pk_ptl_pay_bill_job_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_bill_job_m_01 ON ptl_pay_bill_job_m (bill_ym, bill_cycl_cd);

-- PAY-007 청구기본
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_bill_m'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_bill_m ADD CONSTRAINT pk_ptl_pay_bill_m PRIMARY KEY (bill_no, bill_ym);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_bill_m_01 ON ptl_pay_bill_m (bill_acnt_no, bill_ym);
CREATE INDEX IF NOT EXISTS x_ptl_pay_bill_m_02 ON ptl_pay_bill_m (bill_job_no);
CREATE INDEX IF NOT EXISTS x_ptl_pay_bill_m_03 ON ptl_pay_bill_m (orgn_bill_no) WHERE orgn_bill_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_pay_bill_m_04 ON ptl_pay_bill_m (pay_tmlmt_dt) WHERE bill_stts_ty_cd IN ('03','05','06');

-- PAY-008 청구상세
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_bill_d'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_bill_d ADD CONSTRAINT pk_ptl_pay_bill_d PRIMARY KEY (bill_no, bill_dtl_seq, bill_ym);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_bill_d_01 ON ptl_pay_bill_d (svc_mgmt_no, bill_ym);

-- PAY-009 청구조정내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_bill_adj_l ON ptl_pay_bill_adj_l (bill_adj_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_bill_adj_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_bill_adj_l ADD CONSTRAINT pk_ptl_pay_bill_adj_l PRIMARY KEY USING INDEX pk_ptl_pay_bill_adj_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_bill_adj_l_01 ON ptl_pay_bill_adj_l (bill_no, bill_dtl_seq);
CREATE INDEX IF NOT EXISTS x_ptl_pay_bill_adj_l_02 ON ptl_pay_bill_adj_l (rflt_bill_ym) WHERE bill_adj_stts_ty_cd = '02';

-- PAY-010 청구세금상세
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_bill_tax_d'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_bill_tax_d ADD CONSTRAINT pk_ptl_pay_bill_tax_d PRIMARY KEY (bill_no, txtn_ty_cd, bill_ym);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_bill_tax_d_01 ON ptl_pay_bill_tax_d (elctr_txinv_aprv_no) WHERE elctr_txinv_aprv_no IS NOT NULL;

-- PAY-011 사용량수집파일내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_use_qty_clct_file_l ON ptl_pay_use_qty_clct_file_l (clct_file_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_use_qty_clct_file_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_use_qty_clct_file_l ADD CONSTRAINT pk_ptl_pay_use_qty_clct_file_l PRIMARY KEY USING INDEX pk_ptl_pay_use_qty_clct_file_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_use_qty_clct_file_l_01 ON ptl_pay_use_qty_clct_file_l (clct_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_pay_use_qty_clct_file_l_02 ON ptl_pay_use_qty_clct_file_l (clct_file_nm);

-- PAY-012 사용량오류내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_use_qty_err_l ON ptl_pay_use_qty_err_l (use_qty_err_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_use_qty_err_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_use_qty_err_l ADD CONSTRAINT pk_ptl_pay_use_qty_err_l PRIMARY KEY USING INDEX pk_ptl_pay_use_qty_err_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_use_qty_err_l_01 ON ptl_pay_use_qty_err_l (raw_use_no);
CREATE INDEX IF NOT EXISTS x_ptl_pay_use_qty_err_l_02 ON ptl_pay_use_qty_err_l (err_ocrn_dtm) WHERE err_prcs_stts_ty_cd IN ('01','02');

-- PAY-013 사용량일집계
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_use_qty_dd_t'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_use_qty_dd_t ADD CONSTRAINT pk_ptl_pay_use_qty_dd_t PRIMARY KEY (svc_mgmt_no, use_dt, use_svc_ty_cd);
  END IF;
END $$;

-- PAY-014 기본제공소진내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_bscprvd_exhst_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_bscprvd_exhst_l ADD CONSTRAINT pk_ptl_pay_bscprvd_exhst_l PRIMARY KEY (svc_mgmt_no, bill_ym, use_svc_ty_cd, sbsc_prod_no);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_bscprvd_exhst_l_01 ON ptl_pay_bscprvd_exhst_l (sbsc_prod_no, bill_ym);

-- PAY-015 요금계산이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_chrg_calc_h ON ptl_pay_chrg_calc_h (chrg_calc_no, chrg_calc_hist_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_chrg_calc_h'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_chrg_calc_h ADD CONSTRAINT pk_ptl_pay_chrg_calc_h PRIMARY KEY USING INDEX pk_ptl_pay_chrg_calc_h;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_chrg_calc_h_01 ON ptl_pay_chrg_calc_h (bill_job_no);

-- PAY-016 일할요금상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_dyprt_chrg_d ON ptl_pay_dyprt_chrg_d (chrg_calc_no, dyprt_chrg_dtl_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_dyprt_chrg_d'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_dyprt_chrg_d ADD CONSTRAINT pk_ptl_pay_dyprt_chrg_d PRIMARY KEY USING INDEX pk_ptl_pay_dyprt_chrg_d;
  END IF;
END $$;

-- PAY-017 할인적용내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_dscnt_aplcn_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_dscnt_aplcn_l ADD CONSTRAINT pk_ptl_pay_dscnt_aplcn_l PRIMARY KEY (dscnt_aplcn_no, dscnt_aplcn_dtm);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_dscnt_aplcn_l_01 ON ptl_pay_dscnt_aplcn_l (chrg_calc_no);
CREATE INDEX IF NOT EXISTS x_ptl_pay_dscnt_aplcn_l_02 ON ptl_pay_dscnt_aplcn_l (sbsc_prod_no);
CREATE INDEX IF NOT EXISTS x_ptl_pay_dscnt_aplcn_l_03 ON ptl_pay_dscnt_aplcn_l (prod_cd, dscnt_aplcn_dtm);

-- PAY-018 결합할인배분내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_cmbn_dscnt_allc_l ON ptl_pay_cmbn_dscnt_allc_l (cmbn_dscnt_allc_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_cmbn_dscnt_allc_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_cmbn_dscnt_allc_l ADD CONSTRAINT pk_ptl_pay_cmbn_dscnt_allc_l PRIMARY KEY USING INDEX pk_ptl_pay_cmbn_dscnt_allc_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_cmbn_dscnt_allc_l_01 ON ptl_pay_cmbn_dscnt_allc_l (cmbn_ctrt_no, bill_ym);
CREATE INDEX IF NOT EXISTS x_ptl_pay_cmbn_dscnt_allc_l_02 ON ptl_pay_cmbn_dscnt_allc_l (svc_mgmt_no, bill_ym);
CREATE INDEX IF NOT EXISTS x_ptl_pay_cmbn_dscnt_allc_l_03 ON ptl_pay_cmbn_dscnt_allc_l (chrg_calc_no);

-- PAY-019 위약금부과내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_pnlt_imps_l ON ptl_pay_pnlt_imps_l (pnlt_imps_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_pnlt_imps_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_pnlt_imps_l ADD CONSTRAINT pk_ptl_pay_pnlt_imps_l PRIMARY KEY USING INDEX pk_ptl_pay_pnlt_imps_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_pnlt_imps_l_01 ON ptl_pay_pnlt_imps_l (svc_mgmt_no);
CREATE INDEX IF NOT EXISTS x_ptl_pay_pnlt_imps_l_02 ON ptl_pay_pnlt_imps_l (agrmt_ctrt_no);
CREATE INDEX IF NOT EXISTS x_ptl_pay_pnlt_imps_l_03 ON ptl_pay_pnlt_imps_l (chrg_calc_no);

-- PAY-020 단말할부청구상세
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_eqp_instl_bill_d'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_eqp_instl_bill_d ADD CONSTRAINT pk_ptl_pay_eqp_instl_bill_d PRIMARY KEY (eqp_instl_ctrt_no, instl_tms, bill_ym);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_eqp_instl_bill_d_01 ON ptl_pay_eqp_instl_bill_d (bill_no, bill_dtl_seq);

-- PAY-021 로밍사용내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_roam_use_l ON ptl_pay_roam_use_l (roam_use_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_roam_use_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_roam_use_l ADD CONSTRAINT pk_ptl_pay_roam_use_l PRIMARY KEY USING INDEX pk_ptl_pay_roam_use_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_roam_use_l_01 ON ptl_pay_roam_use_l (svc_mgmt_no, use_bgng_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_pay_roam_use_l_02 ON ptl_pay_roam_use_l (roam_bzmn_no, bill_ym);
CREATE INDEX IF NOT EXISTS x_ptl_pay_roam_use_l_03 ON ptl_pay_roam_use_l (use_no);
CREATE INDEX IF NOT EXISTS x_ptl_pay_roam_use_l_04 ON ptl_pay_roam_use_l (tap_file_nm);

-- PAY-022 소액결제청구상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_mcpay_bill_d ON ptl_pay_mcpay_bill_d (mcpay_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_mcpay_bill_d'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_mcpay_bill_d ADD CONSTRAINT pk_ptl_pay_mcpay_bill_d PRIMARY KEY USING INDEX pk_ptl_pay_mcpay_bill_d;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_mcpay_bill_d_01 ON ptl_pay_mcpay_bill_d (svc_mgmt_no, pymt_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_pay_mcpay_bill_d_02 ON ptl_pay_mcpay_bill_d (cnts_prvd_co_no, bill_ym);
CREATE INDEX IF NOT EXISTS x_ptl_pay_mcpay_bill_d_03 ON ptl_pay_mcpay_bill_d (bill_no, bill_dtl_seq);

-- PAY-023 콘텐츠이용요금내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_cnts_utlz_chrg_l ON ptl_pay_cnts_utlz_chrg_l (cnts_utlz_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_cnts_utlz_chrg_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_cnts_utlz_chrg_l ADD CONSTRAINT pk_ptl_pay_cnts_utlz_chrg_l PRIMARY KEY USING INDEX pk_ptl_pay_cnts_utlz_chrg_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_cnts_utlz_chrg_l_01 ON ptl_pay_cnts_utlz_chrg_l (svc_mgmt_no, cnts_utlz_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_pay_cnts_utlz_chrg_l_02 ON ptl_pay_cnts_utlz_chrg_l (cnts_prvd_co_no, bill_ym);
CREATE INDEX IF NOT EXISTS x_ptl_pay_cnts_utlz_chrg_l_03 ON ptl_pay_cnts_utlz_chrg_l (bill_no, bill_dtl_seq);
CREATE INDEX IF NOT EXISTS x_ptl_pay_cnts_utlz_chrg_l_04 ON ptl_pay_cnts_utlz_chrg_l (use_no);

-- PAY-024 청구조정사유코드
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_bill_adj_rsn_c ON ptl_pay_bill_adj_rsn_c (bill_adj_rsn_ty_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_bill_adj_rsn_c'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_bill_adj_rsn_c ADD CONSTRAINT pk_ptl_pay_bill_adj_rsn_c PRIMARY KEY USING INDEX pk_ptl_pay_bill_adj_rsn_c;
  END IF;
END $$;

-- PAY-025 청구마감이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_bill_ddln_h ON ptl_pay_bill_ddln_h (bill_job_no, bill_ddln_hist_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_bill_ddln_h'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_bill_ddln_h ADD CONSTRAINT pk_ptl_pay_bill_ddln_h PRIMARY KEY USING INDEX pk_ptl_pay_bill_ddln_h;
  END IF;
END $$;

-- PAY-026 청구서발행내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_invc_pblcn_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_invc_pblcn_l ADD CONSTRAINT pk_ptl_pay_invc_pblcn_l PRIMARY KEY (invc_pblcn_no, invc_pblcn_dtm);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_invc_pblcn_l_01 ON ptl_pay_invc_pblcn_l (bill_no);

-- PAY-027 청구서재발행내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_invc_re_pblcn_l ON ptl_pay_invc_re_pblcn_l (invc_re_pblcn_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_invc_re_pblcn_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_invc_re_pblcn_l ADD CONSTRAINT pk_ptl_pay_invc_re_pblcn_l PRIMARY KEY USING INDEX pk_ptl_pay_invc_re_pblcn_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_invc_re_pblcn_l_01 ON ptl_pay_invc_re_pblcn_l (bill_no);
CREATE INDEX IF NOT EXISTS x_ptl_pay_invc_re_pblcn_l_02 ON ptl_pay_invc_re_pblcn_l (invc_pblcn_no);

-- PAY-028 청구계정월집계
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_bill_acnt_mm_t'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_bill_acnt_mm_t ADD CONSTRAINT pk_ptl_pay_bill_acnt_mm_t PRIMARY KEY (bill_acnt_no, bill_ym);
  END IF;
END $$;

-- PAY-029 요금항목월통계
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_chrg_itm_mm_s ON ptl_pay_chrg_itm_mm_s (chrg_itm_cd, bill_ym);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_chrg_itm_mm_s'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_chrg_itm_mm_s ADD CONSTRAINT pk_ptl_pay_chrg_itm_mm_s PRIMARY KEY USING INDEX pk_ptl_pay_chrg_itm_mm_s;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_pay_chrg_itm_mm_s_01 ON ptl_pay_chrg_itm_mm_s (bill_ym);

-- PAY-030 청구작업단계이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_pay_bill_job_step_h ON ptl_pay_bill_job_step_h (bill_job_no, bill_job_step_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_pay_bill_job_step_h'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_pay_bill_job_step_h ADD CONSTRAINT pk_ptl_pay_bill_job_step_h PRIMARY KEY USING INDEX pk_ptl_pay_bill_job_step_h;
  END IF;
END $$;
