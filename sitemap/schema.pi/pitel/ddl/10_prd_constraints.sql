-- 10_prd_constraints.sql — 상품(PRD) PK·인덱스 (적재 뒤 실행, D14 · 재실행 안전)
-- PK = 유일 인덱스 pk_<테이블> 먼저 → ADD CONSTRAINT ... USING INDEX, 인덱스 = x_<테이블>_NN · FK 는 정의만(model/physical/PRD.json fks, D6)

-- 상품기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_prod_m ON ptl_prd_prod_m (prod_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_prod_m' AND conrelid = 'ptl_prd_prod_m'::regclass) THEN
    ALTER TABLE ptl_prd_prod_m ADD CONSTRAINT pk_ptl_prd_prod_m PRIMARY KEY USING INDEX pk_ptl_prd_prod_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_prod_m_01 ON ptl_prd_prod_m (bas_chrg_itm_cd);
CREATE INDEX IF NOT EXISTS x_ptl_prd_prod_m_02 ON ptl_prd_prod_m (prod_ty_cd, prod_stts_ty_cd);

-- 요금제기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_rtpln_m ON ptl_prd_rtpln_m (prod_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_rtpln_m' AND conrelid = 'ptl_prd_rtpln_m'::regclass) THEN
    ALTER TABLE ptl_prd_rtpln_m ADD CONSTRAINT pk_ptl_prd_rtpln_m PRIMARY KEY USING INDEX pk_ptl_prd_rtpln_m;
  END IF;
END $$;

-- 부가서비스기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_adsvc_m ON ptl_prd_adsvc_m (prod_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_adsvc_m' AND conrelid = 'ptl_prd_adsvc_m'::regclass) THEN
    ALTER TABLE ptl_prd_adsvc_m ADD CONSTRAINT pk_ptl_prd_adsvc_m PRIMARY KEY USING INDEX pk_ptl_prd_adsvc_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_adsvc_m_01 ON ptl_prd_adsvc_m (cnts_prvd_co_no);
CREATE INDEX IF NOT EXISTS x_ptl_prd_adsvc_m_02 ON ptl_prd_adsvc_m (ntwk_svc_no);

-- 할인상품기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_dscnt_prod_m ON ptl_prd_dscnt_prod_m (prod_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_dscnt_prod_m' AND conrelid = 'ptl_prd_dscnt_prod_m'::regclass) THEN
    ALTER TABLE ptl_prd_dscnt_prod_m ADD CONSTRAINT pk_ptl_prd_dscnt_prod_m PRIMARY KEY USING INDEX pk_ptl_prd_dscnt_prod_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_dscnt_prod_m_01 ON ptl_prd_dscnt_prod_m (dscnt_trgt_chrg_itm_cd);
CREATE INDEX IF NOT EXISTS x_ptl_prd_dscnt_prod_m_02 ON ptl_prd_dscnt_prod_m (dscnt_chrg_itm_cd);
CREATE INDEX IF NOT EXISTS x_ptl_prd_dscnt_prod_m_03 ON ptl_prd_dscnt_prod_m (alnc_prtnr_no);

-- 결합상품기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_cmbn_prod_m ON ptl_prd_cmbn_prod_m (prod_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_cmbn_prod_m' AND conrelid = 'ptl_prd_cmbn_prod_m'::regclass) THEN
    ALTER TABLE ptl_prd_cmbn_prod_m ADD CONSTRAINT pk_ptl_prd_cmbn_prod_m PRIMARY KEY USING INDEX pk_ptl_prd_cmbn_prod_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_cmbn_prod_m_01 ON ptl_prd_cmbn_prod_m (cmbn_dscnt_prod_cd);

-- 약정상품기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_agrmt_prod_m ON ptl_prd_agrmt_prod_m (prod_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_agrmt_prod_m' AND conrelid = 'ptl_prd_agrmt_prod_m'::regclass) THEN
    ALTER TABLE ptl_prd_agrmt_prod_m ADD CONSTRAINT pk_ptl_prd_agrmt_prod_m PRIMARY KEY USING INDEX pk_ptl_prd_agrmt_prod_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_agrmt_prod_m_01 ON ptl_prd_agrmt_prod_m (lnkg_dscnt_prod_cd);

-- 단말모델기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_eqp_mdl_m ON ptl_prd_eqp_mdl_m (eqp_mdl_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_eqp_mdl_m' AND conrelid = 'ptl_prd_eqp_mdl_m'::regclass) THEN
    ALTER TABLE ptl_prd_eqp_mdl_m ADD CONSTRAINT pk_ptl_prd_eqp_mdl_m PRIMARY KEY USING INDEX pk_ptl_prd_eqp_mdl_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_eqp_mdl_m_01 ON ptl_prd_eqp_mdl_m (mnfct_co_ty_cd, lnch_dt);

-- 유심상품기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_usim_prod_m ON ptl_prd_usim_prod_m (prod_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_usim_prod_m' AND conrelid = 'ptl_prd_usim_prod_m'::regclass) THEN
    ALTER TABLE ptl_prd_usim_prod_m ADD CONSTRAINT pk_ptl_prd_usim_prod_m PRIMARY KEY USING INDEX pk_ptl_prd_usim_prod_m;
  END IF;
END $$;

-- 요금항목코드
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_chrg_itm_c ON ptl_prd_chrg_itm_c (chrg_itm_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_chrg_itm_c' AND conrelid = 'ptl_prd_chrg_itm_c'::regclass) THEN
    ALTER TABLE ptl_prd_chrg_itm_c ADD CONSTRAINT pk_ptl_prd_chrg_itm_c PRIMARY KEY USING INDEX pk_ptl_prd_chrg_itm_c;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_chrg_itm_c_01 ON ptl_prd_chrg_itm_c (chrg_itm_clsf_cd);

-- 상품가격이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_prod_prc_h ON ptl_prd_prod_prc_h (prod_cd, prc_aplcn_bgng_dtm);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_prod_prc_h' AND conrelid = 'ptl_prd_prod_prc_h'::regclass) THEN
    ALTER TABLE ptl_prd_prod_prc_h ADD CONSTRAINT pk_ptl_prd_prod_prc_h PRIMARY KEY USING INDEX pk_ptl_prd_prod_prc_h;
  END IF;
END $$;

-- 상품구성관계
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_prod_cmps_r ON ptl_prd_prod_cmps_r (up_prod_cd, cmps_prod_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_prod_cmps_r' AND conrelid = 'ptl_prd_prod_cmps_r'::regclass) THEN
    ALTER TABLE ptl_prd_prod_cmps_r ADD CONSTRAINT pk_ptl_prd_prod_cmps_r PRIMARY KEY USING INDEX pk_ptl_prd_prod_cmps_r;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_prod_cmps_r_01 ON ptl_prd_prod_cmps_r (cmps_prod_cd);

-- 상품배타관계
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_prod_excln_r ON ptl_prd_prod_excln_r (std_prod_cd, trgt_prod_cd, excln_rel_ty_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_prod_excln_r' AND conrelid = 'ptl_prd_prod_excln_r'::regclass) THEN
    ALTER TABLE ptl_prd_prod_excln_r ADD CONSTRAINT pk_ptl_prd_prod_excln_r PRIMARY KEY USING INDEX pk_ptl_prd_prod_excln_r;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_prod_excln_r_01 ON ptl_prd_prod_excln_r (trgt_prod_cd);

-- 요금제기본제공상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_rtpln_bscprvd_d ON ptl_prd_rtpln_bscprvd_d (prod_cd, use_svc_ty_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_rtpln_bscprvd_d' AND conrelid = 'ptl_prd_rtpln_bscprvd_d'::regclass) THEN
    ALTER TABLE ptl_prd_rtpln_bscprvd_d ADD CONSTRAINT pk_ptl_prd_rtpln_bscprvd_d PRIMARY KEY USING INDEX pk_ptl_prd_rtpln_bscprvd_d;
  END IF;
END $$;

-- 요금제초과요율상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_rtpln_excs_trf_d ON ptl_prd_rtpln_excs_trf_d (prod_cd, rat_zone_cd, use_svc_ty_cd, trf_aplcn_bgng_dt);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_rtpln_excs_trf_d' AND conrelid = 'ptl_prd_rtpln_excs_trf_d'::regclass) THEN
    ALTER TABLE ptl_prd_rtpln_excs_trf_d ADD CONSTRAINT pk_ptl_prd_rtpln_excs_trf_d PRIMARY KEY USING INDEX pk_ptl_prd_rtpln_excs_trf_d;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_rtpln_excs_trf_d_01 ON ptl_prd_rtpln_excs_trf_d (rat_zone_cd);
CREATE INDEX IF NOT EXISTS x_ptl_prd_rtpln_excs_trf_d_02 ON ptl_prd_rtpln_excs_trf_d (chrg_itm_cd);

-- 과금권역코드
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_rat_zone_c ON ptl_prd_rat_zone_c (rat_zone_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_rat_zone_c' AND conrelid = 'ptl_prd_rat_zone_c'::regclass) THEN
    ALTER TABLE ptl_prd_rat_zone_c ADD CONSTRAINT pk_ptl_prd_rat_zone_c PRIMARY KEY USING INDEX pk_ptl_prd_rat_zone_c;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_rat_zone_c_01 ON ptl_prd_rat_zone_c (up_rat_zone_cd);

-- 시간대요율상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_tmbnd_trf_d ON ptl_prd_tmbnd_trf_d (rat_zone_cd, use_svc_ty_cd, tmbnd_ty_cd, trf_aplcn_bgng_dt);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_tmbnd_trf_d' AND conrelid = 'ptl_prd_tmbnd_trf_d'::regclass) THEN
    ALTER TABLE ptl_prd_tmbnd_trf_d ADD CONSTRAINT pk_ptl_prd_tmbnd_trf_d PRIMARY KEY USING INDEX pk_ptl_prd_tmbnd_trf_d;
  END IF;
END $$;

-- 로밍국가코드
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_roam_natn_c ON ptl_prd_roam_natn_c (natn_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_roam_natn_c' AND conrelid = 'ptl_prd_roam_natn_c'::regclass) THEN
    ALTER TABLE ptl_prd_roam_natn_c ADD CONSTRAINT pk_ptl_prd_roam_natn_c PRIMARY KEY USING INDEX pk_ptl_prd_roam_natn_c;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_roam_natn_c_01 ON ptl_prd_roam_natn_c (natn_no);

-- 로밍요율상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_roam_trf_d ON ptl_prd_roam_trf_d (natn_cd, use_svc_ty_cd, use_drct_se_cd, trf_aplcn_bgng_dt);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_roam_trf_d' AND conrelid = 'ptl_prd_roam_trf_d'::regclass) THEN
    ALTER TABLE ptl_prd_roam_trf_d ADD CONSTRAINT pk_ptl_prd_roam_trf_d PRIMARY KEY USING INDEX pk_ptl_prd_roam_trf_d;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_roam_trf_d_01 ON ptl_prd_roam_trf_d (chrg_itm_cd);

-- 부가서비스요금상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_adsvc_chrg_d ON ptl_prd_adsvc_chrg_d (prod_cd, chrg_itm_cd, chrg_aplcn_bgng_dt);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_adsvc_chrg_d' AND conrelid = 'ptl_prd_adsvc_chrg_d'::regclass) THEN
    ALTER TABLE ptl_prd_adsvc_chrg_d ADD CONSTRAINT pk_ptl_prd_adsvc_chrg_d PRIMARY KEY USING INDEX pk_ptl_prd_adsvc_chrg_d;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_adsvc_chrg_d_01 ON ptl_prd_adsvc_chrg_d (chrg_itm_cd);

-- 할인조건상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_dscnt_cnd_d ON ptl_prd_dscnt_cnd_d (prod_cd, cnd_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_dscnt_cnd_d' AND conrelid = 'ptl_prd_dscnt_cnd_d'::regclass) THEN
    ALTER TABLE ptl_prd_dscnt_cnd_d ADD CONSTRAINT pk_ptl_prd_dscnt_cnd_d PRIMARY KEY USING INDEX pk_ptl_prd_dscnt_cnd_d;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_dscnt_cnd_d_01 ON ptl_prd_dscnt_cnd_d (cnd_trgt_prod_cd);

-- 할인율상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_dscnt_rt_d ON ptl_prd_dscnt_rt_d (prod_cd, dscnt_step_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_dscnt_rt_d' AND conrelid = 'ptl_prd_dscnt_rt_d'::regclass) THEN
    ALTER TABLE ptl_prd_dscnt_rt_d ADD CONSTRAINT pk_ptl_prd_dscnt_rt_d PRIMARY KEY USING INDEX pk_ptl_prd_dscnt_rt_d;
  END IF;
END $$;

-- 결합구성상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_cmbn_cmps_d ON ptl_prd_cmbn_cmps_d (prod_cd, cmps_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_cmbn_cmps_d' AND conrelid = 'ptl_prd_cmbn_cmps_d'::regclass) THEN
    ALTER TABLE ptl_prd_cmbn_cmps_d ADD CONSTRAINT pk_ptl_prd_cmbn_cmps_d PRIMARY KEY USING INDEX pk_ptl_prd_cmbn_cmps_d;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_cmbn_cmps_d_01 ON ptl_prd_cmbn_cmps_d (cmps_prod_cd);

-- 결합할인상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_cmbn_dscnt_d ON ptl_prd_cmbn_dscnt_d (prod_cd, cmbn_line_cnt, dscnt_aplcn_bgng_dt);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_cmbn_dscnt_d' AND conrelid = 'ptl_prd_cmbn_dscnt_d'::regclass) THEN
    ALTER TABLE ptl_prd_cmbn_dscnt_d ADD CONSTRAINT pk_ptl_prd_cmbn_dscnt_d PRIMARY KEY USING INDEX pk_ptl_prd_cmbn_dscnt_d;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_cmbn_dscnt_d_01 ON ptl_prd_cmbn_dscnt_d (dscnt_chrg_itm_cd);

-- 약정위약금상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_agrmt_pnlt_d ON ptl_prd_agrmt_pnlt_d (prod_cd, pnlt_step_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_agrmt_pnlt_d' AND conrelid = 'ptl_prd_agrmt_pnlt_d'::regclass) THEN
    ALTER TABLE ptl_prd_agrmt_pnlt_d ADD CONSTRAINT pk_ptl_prd_agrmt_pnlt_d PRIMARY KEY USING INDEX pk_ptl_prd_agrmt_pnlt_d;
  END IF;
END $$;

-- 단말출고가격이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_eqp_shpm_prc_h ON ptl_prd_eqp_shpm_prc_h (eqp_mdl_cd, prc_aplcn_bgng_dtm);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_eqp_shpm_prc_h' AND conrelid = 'ptl_prd_eqp_shpm_prc_h'::regclass) THEN
    ALTER TABLE ptl_prd_eqp_shpm_prc_h ADD CONSTRAINT pk_ptl_prd_eqp_shpm_prc_h PRIMARY KEY USING INDEX pk_ptl_prd_eqp_shpm_prc_h;
  END IF;
END $$;

-- 공시지원금이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_pbanc_subsd_h ON ptl_prd_pbanc_subsd_h (eqp_mdl_cd, rtpln_prod_cd, subsd_aplcn_bgng_dtm);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_pbanc_subsd_h' AND conrelid = 'ptl_prd_pbanc_subsd_h'::regclass) THEN
    ALTER TABLE ptl_prd_pbanc_subsd_h ADD CONSTRAINT pk_ptl_prd_pbanc_subsd_h PRIMARY KEY USING INDEX pk_ptl_prd_pbanc_subsd_h;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_pbanc_subsd_h_01 ON ptl_prd_pbanc_subsd_h (rtpln_prod_cd, subsd_aplcn_bgng_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_prd_pbanc_subsd_h_02 ON ptl_prd_pbanc_subsd_h (pbanc_dt);

-- 상품판매채널관계
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_prod_sale_chnl_r ON ptl_prd_prod_sale_chnl_r (prod_cd, sale_chnl_ty_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_prod_sale_chnl_r' AND conrelid = 'ptl_prd_prod_sale_chnl_r'::regclass) THEN
    ALTER TABLE ptl_prd_prod_sale_chnl_r ADD CONSTRAINT pk_ptl_prd_prod_sale_chnl_r PRIMARY KEY USING INDEX pk_ptl_prd_prod_sale_chnl_r;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_prod_sale_chnl_r_01 ON ptl_prd_prod_sale_chnl_r (sale_chnl_ty_cd);

-- 상품판매기간이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_prod_sale_prd_h ON ptl_prd_prod_sale_prd_h (prod_cd, sale_bgng_dt);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_prod_sale_prd_h' AND conrelid = 'ptl_prd_prod_sale_prd_h'::regclass) THEN
    ALTER TABLE ptl_prd_prod_sale_prd_h ADD CONSTRAINT pk_ptl_prd_prod_sale_prd_h PRIMARY KEY USING INDEX pk_ptl_prd_prod_sale_prd_h;
  END IF;
END $$;

-- 요금항목분류코드
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_chrg_itm_clsf_c ON ptl_prd_chrg_itm_clsf_c (chrg_itm_clsf_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_chrg_itm_clsf_c' AND conrelid = 'ptl_prd_chrg_itm_clsf_c'::regclass) THEN
    ALTER TABLE ptl_prd_chrg_itm_clsf_c ADD CONSTRAINT pk_ptl_prd_chrg_itm_clsf_c PRIMARY KEY USING INDEX pk_ptl_prd_chrg_itm_clsf_c;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_chrg_itm_clsf_c_01 ON ptl_prd_chrg_itm_clsf_c (up_chrg_itm_clsf_cd);

-- 상품변경이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prd_prod_chg_h ON ptl_prd_prod_chg_h (prod_cd, prod_chg_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prd_prod_chg_h' AND conrelid = 'ptl_prd_prod_chg_h'::regclass) THEN
    ALTER TABLE ptl_prd_prod_chg_h ADD CONSTRAINT pk_ptl_prd_prod_chg_h PRIMARY KEY USING INDEX pk_ptl_prd_prod_chg_h;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prd_prod_chg_h_01 ON ptl_prd_prod_chg_h (prod_chg_dtm);

