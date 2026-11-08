-- 가입(ORD) PK·인덱스 DDL — 적재 뒤 실행(D14), 재실행 안전. FK 제약은 만들지 않는다(D6, 정의는 model/physical/ORD.json)
-- 생성 : node tools/phy_ORD_build.js · 일반 테이블 = 유일 인덱스 pk_<테이블> → PRIMARY KEY USING INDEX, 파티션 테이블 = PRIMARY KEY (…) 직접

-- 가입신청기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_sbsc_aply_m ON ptl_ord_sbsc_aply_m (sbsc_aply_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_sbsc_aply_m' AND conrelid = 'ptl_ord_sbsc_aply_m'::regclass) THEN ALTER TABLE ptl_ord_sbsc_aply_m ADD CONSTRAINT pk_ptl_ord_sbsc_aply_m PRIMARY KEY USING INDEX pk_ptl_ord_sbsc_aply_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_aply_m_01 ON ptl_ord_sbsc_aply_m (cust_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_aply_m_02 ON ptl_ord_sbsc_aply_m (shop_no, sbsc_aply_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_aply_m_03 ON ptl_ord_sbsc_aply_m (sbsc_aply_dtm);

-- 가입계약기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_sbsc_ctrt_m ON ptl_ord_sbsc_ctrt_m (sbsc_ctrt_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_sbsc_ctrt_m' AND conrelid = 'ptl_ord_sbsc_ctrt_m'::regclass) THEN ALTER TABLE ptl_ord_sbsc_ctrt_m ADD CONSTRAINT pk_ptl_ord_sbsc_ctrt_m PRIMARY KEY USING INDEX pk_ptl_ord_sbsc_ctrt_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_ctrt_m_01 ON ptl_ord_sbsc_ctrt_m (cust_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_ctrt_m_02 ON ptl_ord_sbsc_ctrt_m (bill_acnt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_ctrt_m_03 ON ptl_ord_sbsc_ctrt_m (svc_mgmt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_ctrt_m_04 ON ptl_ord_sbsc_ctrt_m (svc_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_ctrt_m_05 ON ptl_ord_sbsc_ctrt_m (agnc_no, sbsc_ctrt_dtm) WHERE agnc_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_ctrt_m_06 ON ptl_ord_sbsc_ctrt_m (sbsc_aply_no) WHERE sbsc_aply_no IS NOT NULL;

-- 회선기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_line_m ON ptl_ord_line_m (svc_mgmt_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_line_m' AND conrelid = 'ptl_ord_line_m'::regclass) THEN ALTER TABLE ptl_ord_line_m ADD CONSTRAINT pk_ptl_ord_line_m PRIMARY KEY USING INDEX pk_ptl_ord_line_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_line_m_01 ON ptl_ord_line_m (svc_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_line_m_02 ON ptl_ord_line_m (imsi_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_line_m_03 ON ptl_ord_line_m (imei_no) WHERE imei_no IS NOT NULL;

-- 서비스번호기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_svc_no_m ON ptl_ord_svc_no_m (svc_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_svc_no_m' AND conrelid = 'ptl_ord_svc_no_m'::regclass) THEN ALTER TABLE ptl_ord_svc_no_m ADD CONSTRAINT pk_ptl_ord_svc_no_m PRIMARY KEY USING INDEX pk_ptl_ord_svc_no_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_svc_no_m_01 ON ptl_ord_svc_no_m (svc_no_stts_ty_cd, re_use_psbl_dt);

-- 가입상품기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_sbsc_prod_m ON ptl_ord_sbsc_prod_m (sbsc_prod_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_sbsc_prod_m' AND conrelid = 'ptl_ord_sbsc_prod_m'::regclass) THEN ALTER TABLE ptl_ord_sbsc_prod_m ADD CONSTRAINT pk_ptl_ord_sbsc_prod_m PRIMARY KEY USING INDEX pk_ptl_ord_sbsc_prod_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_prod_m_01 ON ptl_ord_sbsc_prod_m (sbsc_ctrt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_prod_m_02 ON ptl_ord_sbsc_prod_m (svc_mgmt_no, vld_bgng_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_prod_m_03 ON ptl_ord_sbsc_prod_m (prod_cd, sbsc_prod_stts_ty_cd);

-- 약정계약기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_agrmt_ctrt_m ON ptl_ord_agrmt_ctrt_m (agrmt_ctrt_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_agrmt_ctrt_m' AND conrelid = 'ptl_ord_agrmt_ctrt_m'::regclass) THEN ALTER TABLE ptl_ord_agrmt_ctrt_m ADD CONSTRAINT pk_ptl_ord_agrmt_ctrt_m PRIMARY KEY USING INDEX pk_ptl_ord_agrmt_ctrt_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_agrmt_ctrt_m_01 ON ptl_ord_agrmt_ctrt_m (sbsc_ctrt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_agrmt_ctrt_m_02 ON ptl_ord_agrmt_ctrt_m (agrmt_end_dt);

-- 단말할부계약기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_eqp_instl_ctrt_m ON ptl_ord_eqp_instl_ctrt_m (eqp_instl_ctrt_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_eqp_instl_ctrt_m' AND conrelid = 'ptl_ord_eqp_instl_ctrt_m'::regclass) THEN ALTER TABLE ptl_ord_eqp_instl_ctrt_m ADD CONSTRAINT pk_ptl_ord_eqp_instl_ctrt_m PRIMARY KEY USING INDEX pk_ptl_ord_eqp_instl_ctrt_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_eqp_instl_ctrt_m_01 ON ptl_ord_eqp_instl_ctrt_m (sbsc_ctrt_no);

-- 번호이동신청기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_mnp_aply_m ON ptl_ord_mnp_aply_m (mnp_aply_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_mnp_aply_m' AND conrelid = 'ptl_ord_mnp_aply_m'::regclass) THEN ALTER TABLE ptl_ord_mnp_aply_m ADD CONSTRAINT pk_ptl_ord_mnp_aply_m PRIMARY KEY USING INDEX pk_ptl_ord_mnp_aply_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_mnp_aply_m_01 ON ptl_ord_mnp_aply_m (svc_no, mnp_aply_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_ord_mnp_aply_m_02 ON ptl_ord_mnp_aply_m (carr_no, mnp_aply_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_ord_mnp_aply_m_03 ON ptl_ord_mnp_aply_m (mnp_acpt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_mnp_aply_m_04 ON ptl_ord_mnp_aply_m (sbsc_ctrt_no) WHERE sbsc_ctrt_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_ord_mnp_aply_m_05 ON ptl_ord_mnp_aply_m (sbsc_aply_no) WHERE sbsc_aply_no IS NOT NULL;

-- 결합계약기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_cmbn_ctrt_m ON ptl_ord_cmbn_ctrt_m (cmbn_ctrt_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_cmbn_ctrt_m' AND conrelid = 'ptl_ord_cmbn_ctrt_m'::regclass) THEN ALTER TABLE ptl_ord_cmbn_ctrt_m ADD CONSTRAINT pk_ptl_ord_cmbn_ctrt_m PRIMARY KEY USING INDEX pk_ptl_ord_cmbn_ctrt_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_cmbn_ctrt_m_01 ON ptl_ord_cmbn_ctrt_m (rprs_cust_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_cmbn_ctrt_m_02 ON ptl_ord_cmbn_ctrt_m (rprs_sbsc_ctrt_no);

-- 회선상태이력
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_line_stts_h' AND conrelid = 'ptl_ord_line_stts_h'::regclass) THEN ALTER TABLE ptl_ord_line_stts_h ADD CONSTRAINT pk_ptl_ord_line_stts_h PRIMARY KEY (svc_mgmt_no, line_stts_hist_seq, line_stts_chg_dtm); END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_line_stts_h_01 ON ptl_ord_line_stts_h (sbsc_ctrt_no) WHERE sbsc_ctrt_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_ord_line_stts_h_02 ON ptl_ord_line_stts_h (susp_no) WHERE susp_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_ord_line_stts_h_03 ON ptl_ord_line_stts_h (exoftrmn_no) WHERE exoftrmn_no IS NOT NULL;

-- 가입신청상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_sbsc_aply_d ON ptl_ord_sbsc_aply_d (sbsc_aply_no, sbsc_aply_dtl_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_sbsc_aply_d' AND conrelid = 'ptl_ord_sbsc_aply_d'::regclass) THEN ALTER TABLE ptl_ord_sbsc_aply_d ADD CONSTRAINT pk_ptl_ord_sbsc_aply_d PRIMARY KEY USING INDEX pk_ptl_ord_sbsc_aply_d; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_aply_d_01 ON ptl_ord_sbsc_aply_d (sbsc_prod_no) WHERE sbsc_prod_no IS NOT NULL;

-- 가입서류내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_sbsc_doc_l ON ptl_ord_sbsc_doc_l (sbsc_aply_no, sbsc_doc_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_sbsc_doc_l' AND conrelid = 'ptl_ord_sbsc_doc_l'::regclass) THEN ALTER TABLE ptl_ord_sbsc_doc_l ADD CONSTRAINT pk_ptl_ord_sbsc_doc_l PRIMARY KEY USING INDEX pk_ptl_ord_sbsc_doc_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_doc_l_01 ON ptl_ord_sbsc_doc_l (dstr_schd_dt);

-- 개통처리내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_opng_prcs_l ON ptl_ord_opng_prcs_l (opng_prcs_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_opng_prcs_l' AND conrelid = 'ptl_ord_opng_prcs_l'::regclass) THEN ALTER TABLE ptl_ord_opng_prcs_l ADD CONSTRAINT pk_ptl_ord_opng_prcs_l PRIMARY KEY USING INDEX pk_ptl_ord_opng_prcs_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_opng_prcs_l_01 ON ptl_ord_opng_prcs_l (sbsc_aply_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_opng_prcs_l_02 ON ptl_ord_opng_prcs_l (sbsc_ctrt_no) WHERE sbsc_ctrt_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_ord_opng_prcs_l_03 ON ptl_ord_opng_prcs_l (opng_prcs_dtm);

-- 가입계약이력
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_sbsc_ctrt_h' AND conrelid = 'ptl_ord_sbsc_ctrt_h'::regclass) THEN ALTER TABLE ptl_ord_sbsc_ctrt_h ADD CONSTRAINT pk_ptl_ord_sbsc_ctrt_h PRIMARY KEY (sbsc_ctrt_no, sbsc_ctrt_hist_seq, sbsc_ctrt_chg_dtm); END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_ctrt_h_01 ON ptl_ord_sbsc_ctrt_h (bill_acnt_no);

-- 회선변경이력
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_line_chg_h' AND conrelid = 'ptl_ord_line_chg_h'::regclass) THEN ALTER TABLE ptl_ord_line_chg_h ADD CONSTRAINT pk_ptl_ord_line_chg_h PRIMARY KEY (svc_mgmt_no, line_chg_hist_seq, line_chg_dtm); END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_line_chg_h_01 ON ptl_ord_line_chg_h (svc_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_line_chg_h_02 ON ptl_ord_line_chg_h (imsi_no);

-- 가입상품이력
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_sbsc_prod_h' AND conrelid = 'ptl_ord_sbsc_prod_h'::regclass) THEN ALTER TABLE ptl_ord_sbsc_prod_h ADD CONSTRAINT pk_ptl_ord_sbsc_prod_h PRIMARY KEY (sbsc_prod_no, sbsc_prod_hist_seq, sbsc_prod_chg_dtm); END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_prod_h_01 ON ptl_ord_sbsc_prod_h (rtpln_chg_aply_no) WHERE rtpln_chg_aply_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_ord_sbsc_prod_h_02 ON ptl_ord_sbsc_prod_h (adsvc_aply_no) WHERE adsvc_aply_no IS NOT NULL;

-- 요금제변경신청내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_rtpln_chg_aply_l ON ptl_ord_rtpln_chg_aply_l (rtpln_chg_aply_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_rtpln_chg_aply_l' AND conrelid = 'ptl_ord_rtpln_chg_aply_l'::regclass) THEN ALTER TABLE ptl_ord_rtpln_chg_aply_l ADD CONSTRAINT pk_ptl_ord_rtpln_chg_aply_l PRIMARY KEY USING INDEX pk_ptl_ord_rtpln_chg_aply_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_rtpln_chg_aply_l_01 ON ptl_ord_rtpln_chg_aply_l (sbsc_ctrt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_rtpln_chg_aply_l_02 ON ptl_ord_rtpln_chg_aply_l (aplcn_schd_dt, rtpln_chg_aply_stts_ty_cd);

-- 부가서비스신청내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_adsvc_aply_l ON ptl_ord_adsvc_aply_l (adsvc_aply_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_adsvc_aply_l' AND conrelid = 'ptl_ord_adsvc_aply_l'::regclass) THEN ALTER TABLE ptl_ord_adsvc_aply_l ADD CONSTRAINT pk_ptl_ord_adsvc_aply_l PRIMARY KEY USING INDEX pk_ptl_ord_adsvc_aply_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_adsvc_aply_l_01 ON ptl_ord_adsvc_aply_l (sbsc_ctrt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_adsvc_aply_l_02 ON ptl_ord_adsvc_aply_l (sbsc_prod_no) WHERE sbsc_prod_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_ord_adsvc_aply_l_03 ON ptl_ord_adsvc_aply_l (aplcn_schd_dt);

-- 약정계약이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_agrmt_ctrt_h ON ptl_ord_agrmt_ctrt_h (agrmt_ctrt_no, agrmt_ctrt_hist_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_agrmt_ctrt_h' AND conrelid = 'ptl_ord_agrmt_ctrt_h'::regclass) THEN ALTER TABLE ptl_ord_agrmt_ctrt_h ADD CONSTRAINT pk_ptl_ord_agrmt_ctrt_h PRIMARY KEY USING INDEX pk_ptl_ord_agrmt_ctrt_h; END IF; END $$;

-- 지원금적용내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_subsd_aplcn_l ON ptl_ord_subsd_aplcn_l (agrmt_ctrt_no, subsd_aplcn_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_subsd_aplcn_l' AND conrelid = 'ptl_ord_subsd_aplcn_l'::regclass) THEN ALTER TABLE ptl_ord_subsd_aplcn_l ADD CONSTRAINT pk_ptl_ord_subsd_aplcn_l PRIMARY KEY USING INDEX pk_ptl_ord_subsd_aplcn_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_subsd_aplcn_l_01 ON ptl_ord_subsd_aplcn_l (shop_no, subsd_aplcn_dtm) WHERE shop_no IS NOT NULL;

-- 단말할부상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_eqp_instl_d ON ptl_ord_eqp_instl_d (eqp_instl_ctrt_no, instl_tms);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_eqp_instl_d' AND conrelid = 'ptl_ord_eqp_instl_d'::regclass) THEN ALTER TABLE ptl_ord_eqp_instl_d ADD CONSTRAINT pk_ptl_ord_eqp_instl_d PRIMARY KEY USING INDEX pk_ptl_ord_eqp_instl_d; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_eqp_instl_d_01 ON ptl_ord_eqp_instl_d (instl_bill_ym);

-- 회선단말관계
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_line_eqp_r ON ptl_ord_line_eqp_r (svc_mgmt_no, line_eqp_rel_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_line_eqp_r' AND conrelid = 'ptl_ord_line_eqp_r'::regclass) THEN ALTER TABLE ptl_ord_line_eqp_r ADD CONSTRAINT pk_ptl_ord_line_eqp_r PRIMARY KEY USING INDEX pk_ptl_ord_line_eqp_r; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_line_eqp_r_01 ON ptl_ord_line_eqp_r (imei_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_line_eqp_r_02 ON ptl_ord_line_eqp_r (eqp_instl_ctrt_no) WHERE eqp_instl_ctrt_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_ord_line_eqp_r_03 ON ptl_ord_line_eqp_r (eqp_chg_no) WHERE eqp_chg_no IS NOT NULL;

-- 단말변경내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_eqp_chg_l ON ptl_ord_eqp_chg_l (eqp_chg_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_eqp_chg_l' AND conrelid = 'ptl_ord_eqp_chg_l'::regclass) THEN ALTER TABLE ptl_ord_eqp_chg_l ADD CONSTRAINT pk_ptl_ord_eqp_chg_l PRIMARY KEY USING INDEX pk_ptl_ord_eqp_chg_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_eqp_chg_l_01 ON ptl_ord_eqp_chg_l (sbsc_ctrt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_eqp_chg_l_02 ON ptl_ord_eqp_chg_l (shop_no, eqp_chg_dtm);

-- 유심변경내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_usim_chg_l ON ptl_ord_usim_chg_l (usim_chg_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_usim_chg_l' AND conrelid = 'ptl_ord_usim_chg_l'::regclass) THEN ALTER TABLE ptl_ord_usim_chg_l ADD CONSTRAINT pk_ptl_ord_usim_chg_l PRIMARY KEY USING INDEX pk_ptl_ord_usim_chg_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_usim_chg_l_01 ON ptl_ord_usim_chg_l (svc_mgmt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_usim_chg_l_02 ON ptl_ord_usim_chg_l (usim_sn);

-- 번호이동이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_mnp_h ON ptl_ord_mnp_h (mnp_aply_no, mnp_hist_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_mnp_h' AND conrelid = 'ptl_ord_mnp_h'::regclass) THEN ALTER TABLE ptl_ord_mnp_h ADD CONSTRAINT pk_ptl_ord_mnp_h PRIMARY KEY USING INDEX pk_ptl_ord_mnp_h; END IF; END $$;

-- 명의변경내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_nmne_chg_l ON ptl_ord_nmne_chg_l (nmne_chg_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_nmne_chg_l' AND conrelid = 'ptl_ord_nmne_chg_l'::regclass) THEN ALTER TABLE ptl_ord_nmne_chg_l ADD CONSTRAINT pk_ptl_ord_nmne_chg_l PRIMARY KEY USING INDEX pk_ptl_ord_nmne_chg_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_nmne_chg_l_01 ON ptl_ord_nmne_chg_l (svc_mgmt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_nmne_chg_l_02 ON ptl_ord_nmne_chg_l (bfr_cust_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_nmne_chg_l_03 ON ptl_ord_nmne_chg_l (cust_no);

-- 일시정지내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_paus_l ON ptl_ord_paus_l (paus_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_paus_l' AND conrelid = 'ptl_ord_paus_l'::regclass) THEN ALTER TABLE ptl_ord_paus_l ADD CONSTRAINT pk_ptl_ord_paus_l PRIMARY KEY USING INDEX pk_ptl_ord_paus_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_paus_l_01 ON ptl_ord_paus_l (svc_mgmt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_paus_l_02 ON ptl_ord_paus_l (sbsc_ctrt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_paus_l_03 ON ptl_ord_paus_l (paus_end_schd_dt) WHERE paus_rls_dtm IS NULL;

-- 해지신청내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_trmn_aply_l ON ptl_ord_trmn_aply_l (trmn_aply_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_trmn_aply_l' AND conrelid = 'ptl_ord_trmn_aply_l'::regclass) THEN ALTER TABLE ptl_ord_trmn_aply_l ADD CONSTRAINT pk_ptl_ord_trmn_aply_l PRIMARY KEY USING INDEX pk_ptl_ord_trmn_aply_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_trmn_aply_l_01 ON ptl_ord_trmn_aply_l (sbsc_ctrt_no);
CREATE INDEX IF NOT EXISTS x_ptl_ord_trmn_aply_l_02 ON ptl_ord_trmn_aply_l (mnp_aply_no) WHERE mnp_aply_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_ord_trmn_aply_l_03 ON ptl_ord_trmn_aply_l (trmn_schd_dt);

-- 결합구성회선관계
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_cmbn_cmps_line_r ON ptl_ord_cmbn_cmps_line_r (cmbn_ctrt_no, sbsc_ctrt_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_cmbn_cmps_line_r' AND conrelid = 'ptl_ord_cmbn_cmps_line_r'::regclass) THEN ALTER TABLE ptl_ord_cmbn_cmps_line_r ADD CONSTRAINT pk_ptl_ord_cmbn_cmps_line_r PRIMARY KEY USING INDEX pk_ptl_ord_cmbn_cmps_line_r; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_cmbn_cmps_line_r_01 ON ptl_ord_cmbn_cmps_line_r (sbsc_ctrt_no);

-- 서비스번호이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_ord_svc_no_h ON ptl_ord_svc_no_h (svc_no, svc_no_hist_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_ord_svc_no_h' AND conrelid = 'ptl_ord_svc_no_h'::regclass) THEN ALTER TABLE ptl_ord_svc_no_h ADD CONSTRAINT pk_ptl_ord_svc_no_h PRIMARY KEY USING INDEX pk_ptl_ord_svc_no_h; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_ord_svc_no_h_01 ON ptl_ord_svc_no_h (svc_mgmt_no) WHERE svc_mgmt_no IS NOT NULL;
