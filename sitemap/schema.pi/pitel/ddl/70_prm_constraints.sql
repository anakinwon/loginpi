-- 파트너(PRM) PK·인덱스 DDL — 적재 뒤 실행(D14), 재실행 안전. FK 제약은 만들지 않는다(D6, 정의는 model/physical/PRM.json)
-- 생성 : node tools/phy_PRM_build.js · 일반 테이블 = 유일 인덱스 pk_<테이블> → PRIMARY KEY USING INDEX, 파티션 테이블 = PRIMARY KEY (…) 직접

-- 파트너기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_prtnr_m ON ptl_prm_prtnr_m (prtnr_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_prtnr_m' AND conrelid = 'ptl_prm_prtnr_m'::regclass) THEN ALTER TABLE ptl_prm_prtnr_m ADD CONSTRAINT pk_ptl_prm_prtnr_m PRIMARY KEY USING INDEX pk_ptl_prm_prtnr_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_prtnr_m_01 ON ptl_prm_prtnr_m (mgmt_org_cd) WHERE mgmt_org_cd IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_prm_prtnr_m_02 ON ptl_prm_prtnr_m (rgn_cd) WHERE rgn_cd IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_prm_prtnr_m_03 ON ptl_prm_prtnr_m (brno) WHERE brno IS NOT NULL;

-- 조직기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_org_m ON ptl_prm_org_m (org_cd);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_org_m' AND conrelid = 'ptl_prm_org_m'::regclass) THEN ALTER TABLE ptl_prm_org_m ADD CONSTRAINT pk_ptl_prm_org_m PRIMARY KEY USING INDEX pk_ptl_prm_org_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_org_m_01 ON ptl_prm_org_m (up_org_cd) WHERE up_org_cd IS NOT NULL;

-- 대리점기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_agnc_m ON ptl_prm_agnc_m (agnc_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_agnc_m' AND conrelid = 'ptl_prm_agnc_m'::regclass) THEN ALTER TABLE ptl_prm_agnc_m ADD CONSTRAINT pk_ptl_prm_agnc_m PRIMARY KEY USING INDEX pk_ptl_prm_agnc_m; END IF; END $$;

-- 판매점기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_shop_m ON ptl_prm_shop_m (shop_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_shop_m' AND conrelid = 'ptl_prm_shop_m'::regclass) THEN ALTER TABLE ptl_prm_shop_m ADD CONSTRAINT pk_ptl_prm_shop_m PRIMARY KEY USING INDEX pk_ptl_prm_shop_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_shop_m_01 ON ptl_prm_shop_m (agnc_no) WHERE agnc_no IS NOT NULL;

-- 콘텐츠제공사기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_cnts_prvd_co_m ON ptl_prm_cnts_prvd_co_m (cnts_prvd_co_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_cnts_prvd_co_m' AND conrelid = 'ptl_prm_cnts_prvd_co_m'::regclass) THEN ALTER TABLE ptl_prm_cnts_prvd_co_m ADD CONSTRAINT pk_ptl_prm_cnts_prvd_co_m PRIMARY KEY USING INDEX pk_ptl_prm_cnts_prvd_co_m; END IF; END $$;

-- 통신사업자기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_carr_m ON ptl_prm_carr_m (carr_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_carr_m' AND conrelid = 'ptl_prm_carr_m'::regclass) THEN ALTER TABLE ptl_prm_carr_m ADD CONSTRAINT pk_ptl_prm_carr_m PRIMARY KEY USING INDEX pk_ptl_prm_carr_m; END IF; END $$;

-- 로밍사업자기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_roam_bzmn_m ON ptl_prm_roam_bzmn_m (roam_bzmn_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_roam_bzmn_m' AND conrelid = 'ptl_prm_roam_bzmn_m'::regclass) THEN ALTER TABLE ptl_prm_roam_bzmn_m ADD CONSTRAINT pk_ptl_prm_roam_bzmn_m PRIMARY KEY USING INDEX pk_ptl_prm_roam_bzmn_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_roam_bzmn_m_01 ON ptl_prm_roam_bzmn_m (tadig_cd);

-- 파트너계약기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_prtnr_ctrt_m ON ptl_prm_prtnr_ctrt_m (prtnr_ctrt_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_prtnr_ctrt_m' AND conrelid = 'ptl_prm_prtnr_ctrt_m'::regclass) THEN ALTER TABLE ptl_prm_prtnr_ctrt_m ADD CONSTRAINT pk_ptl_prm_prtnr_ctrt_m PRIMARY KEY USING INDEX pk_ptl_prm_prtnr_ctrt_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_prtnr_ctrt_m_01 ON ptl_prm_prtnr_ctrt_m (prtnr_no);
CREATE INDEX IF NOT EXISTS x_ptl_prm_prtnr_ctrt_m_02 ON ptl_prm_prtnr_ctrt_m (ctrt_end_dt) WHERE ctrt_trmn_dt IS NULL;

-- 정산기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_stlm_m ON ptl_prm_stlm_m (stlm_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_stlm_m' AND conrelid = 'ptl_prm_stlm_m'::regclass) THEN ALTER TABLE ptl_prm_stlm_m ADD CONSTRAINT pk_ptl_prm_stlm_m PRIMARY KEY USING INDEX pk_ptl_prm_stlm_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_stlm_m_01 ON ptl_prm_stlm_m (prtnr_ctrt_no, stlm_ym);
CREATE INDEX IF NOT EXISTS x_ptl_prm_stlm_m_02 ON ptl_prm_stlm_m (prtnr_no, stlm_ym);
CREATE INDEX IF NOT EXISTS x_ptl_prm_stlm_m_03 ON ptl_prm_stlm_m (stlm_ym, stlm_ty_cd);
CREATE INDEX IF NOT EXISTS x_ptl_prm_stlm_m_04 ON ptl_prm_stlm_m (give_schd_dt) WHERE give_schd_dt IS NOT NULL;

-- 세금계산서기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_txinv_m ON ptl_prm_txinv_m (txinv_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_txinv_m' AND conrelid = 'ptl_prm_txinv_m'::regclass) THEN ALTER TABLE ptl_prm_txinv_m ADD CONSTRAINT pk_ptl_prm_txinv_m PRIMARY KEY USING INDEX pk_ptl_prm_txinv_m; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_txinv_m_01 ON ptl_prm_txinv_m (stlm_no);
CREATE INDEX IF NOT EXISTS x_ptl_prm_txinv_m_02 ON ptl_prm_txinv_m (prtnr_no, wrt_dt);
CREATE INDEX IF NOT EXISTS x_ptl_prm_txinv_m_03 ON ptl_prm_txinv_m (orgn_txinv_no) WHERE orgn_txinv_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_prm_txinv_m_04 ON ptl_prm_txinv_m (elctr_txinv_aprv_no) WHERE elctr_txinv_aprv_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_prm_txinv_m_05 ON ptl_prm_txinv_m (wrt_dt) WHERE nts_trnm_dtm IS NULL;

-- 파트너이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_prtnr_h ON ptl_prm_prtnr_h (prtnr_no, vld_bgng_dtm);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_prtnr_h' AND conrelid = 'ptl_prm_prtnr_h'::regclass) THEN ALTER TABLE ptl_prm_prtnr_h ADD CONSTRAINT pk_ptl_prm_prtnr_h PRIMARY KEY USING INDEX pk_ptl_prm_prtnr_h; END IF; END $$;

-- 파트너계약이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_prtnr_ctrt_h ON ptl_prm_prtnr_ctrt_h (prtnr_ctrt_no, vld_bgng_dtm);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_prtnr_ctrt_h' AND conrelid = 'ptl_prm_prtnr_ctrt_h'::regclass) THEN ALTER TABLE ptl_prm_prtnr_ctrt_h ADD CONSTRAINT pk_ptl_prm_prtnr_ctrt_h PRIMARY KEY USING INDEX pk_ptl_prm_prtnr_ctrt_h; END IF; END $$;

-- 파트너계좌상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_prtnr_acct_d ON ptl_prm_prtnr_acct_d (prtnr_no, prtnr_acct_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_prtnr_acct_d' AND conrelid = 'ptl_prm_prtnr_acct_d'::regclass) THEN ALTER TABLE ptl_prm_prtnr_acct_d ADD CONSTRAINT pk_ptl_prm_prtnr_acct_d PRIMARY KEY USING INDEX pk_ptl_prm_prtnr_acct_d; END IF; END $$;

-- 파트너담당자상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_prtnr_pic_d ON ptl_prm_prtnr_pic_d (prtnr_no, pic_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_prtnr_pic_d' AND conrelid = 'ptl_prm_prtnr_pic_d'::regclass) THEN ALTER TABLE ptl_prm_prtnr_pic_d ADD CONSTRAINT pk_ptl_prm_prtnr_pic_d PRIMARY KEY USING INDEX pk_ptl_prm_prtnr_pic_d; END IF; END $$;

-- 조직이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_org_h ON ptl_prm_org_h (org_cd, vld_bgng_dtm);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_org_h' AND conrelid = 'ptl_prm_org_h'::regclass) THEN ALTER TABLE ptl_prm_org_h ADD CONSTRAINT pk_ptl_prm_org_h PRIMARY KEY USING INDEX pk_ptl_prm_org_h; END IF; END $$;

-- 단말재고내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_eqp_stck_l ON ptl_prm_eqp_stck_l (eqp_stck_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_eqp_stck_l' AND conrelid = 'ptl_prm_eqp_stck_l'::regclass) THEN ALTER TABLE ptl_prm_eqp_stck_l ADD CONSTRAINT pk_ptl_prm_eqp_stck_l PRIMARY KEY USING INDEX pk_ptl_prm_eqp_stck_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_eqp_stck_l_01 ON ptl_prm_eqp_stck_l (prtnr_no, eqp_stck_stts_ty_cd);
CREATE INDEX IF NOT EXISTS x_ptl_prm_eqp_stck_l_02 ON ptl_prm_eqp_stck_l (imei_no);

-- 유심재고내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_usim_stck_l ON ptl_prm_usim_stck_l (usim_stck_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_usim_stck_l' AND conrelid = 'ptl_prm_usim_stck_l'::regclass) THEN ALTER TABLE ptl_prm_usim_stck_l ADD CONSTRAINT pk_ptl_prm_usim_stck_l PRIMARY KEY USING INDEX pk_ptl_prm_usim_stck_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_usim_stck_l_01 ON ptl_prm_usim_stck_l (prtnr_no, usim_stck_stts_ty_cd);
CREATE INDEX IF NOT EXISTS x_ptl_prm_usim_stck_l_02 ON ptl_prm_usim_stck_l (usim_sn);

-- 정산상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_stlm_d ON ptl_prm_stlm_d (stlm_no, stlm_dtl_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_stlm_d' AND conrelid = 'ptl_prm_stlm_d'::regclass) THEN ALTER TABLE ptl_prm_stlm_d ADD CONSTRAINT pk_ptl_prm_stlm_d PRIMARY KEY USING INDEX pk_ptl_prm_stlm_d; END IF; END $$;

-- 수수료정책기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_fee_plcy_m ON ptl_prm_fee_plcy_m (fee_plcy_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_fee_plcy_m' AND conrelid = 'ptl_prm_fee_plcy_m'::regclass) THEN ALTER TABLE ptl_prm_fee_plcy_m ADD CONSTRAINT pk_ptl_prm_fee_plcy_m PRIMARY KEY USING INDEX pk_ptl_prm_fee_plcy_m; END IF; END $$;

-- 수수료요율상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_fee_trf_d ON ptl_prm_fee_trf_d (fee_plcy_no, fee_trf_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_fee_trf_d' AND conrelid = 'ptl_prm_fee_trf_d'::regclass) THEN ALTER TABLE ptl_prm_fee_trf_d ADD CONSTRAINT pk_ptl_prm_fee_trf_d PRIMARY KEY USING INDEX pk_ptl_prm_fee_trf_d; END IF; END $$;

-- 유치수수료내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_atrct_fee_l ON ptl_prm_atrct_fee_l (atrct_fee_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_atrct_fee_l' AND conrelid = 'ptl_prm_atrct_fee_l'::regclass) THEN ALTER TABLE ptl_prm_atrct_fee_l ADD CONSTRAINT pk_ptl_prm_atrct_fee_l PRIMARY KEY USING INDEX pk_ptl_prm_atrct_fee_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_atrct_fee_l_01 ON ptl_prm_atrct_fee_l (sbsc_ctrt_no);
CREATE INDEX IF NOT EXISTS x_ptl_prm_atrct_fee_l_02 ON ptl_prm_atrct_fee_l (shop_no, fee_ocrn_dt);
CREATE INDEX IF NOT EXISTS x_ptl_prm_atrct_fee_l_03 ON ptl_prm_atrct_fee_l (stlm_no) WHERE stlm_no IS NOT NULL;

-- 관리수수료내역
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_mgmt_fee_l' AND conrelid = 'ptl_prm_mgmt_fee_l'::regclass) THEN ALTER TABLE ptl_prm_mgmt_fee_l ADD CONSTRAINT pk_ptl_prm_mgmt_fee_l PRIMARY KEY (mgmt_fee_no, stlm_ym); END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_mgmt_fee_l_01 ON ptl_prm_mgmt_fee_l (agnc_no, stlm_ym);
CREATE INDEX IF NOT EXISTS x_ptl_prm_mgmt_fee_l_02 ON ptl_prm_mgmt_fee_l (sbsc_ctrt_no);
CREATE INDEX IF NOT EXISTS x_ptl_prm_mgmt_fee_l_03 ON ptl_prm_mgmt_fee_l (stlm_no) WHERE stlm_no IS NOT NULL;

-- 수수료환수내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_fee_clbk_l ON ptl_prm_fee_clbk_l (fee_clbk_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_fee_clbk_l' AND conrelid = 'ptl_prm_fee_clbk_l'::regclass) THEN ALTER TABLE ptl_prm_fee_clbk_l ADD CONSTRAINT pk_ptl_prm_fee_clbk_l PRIMARY KEY USING INDEX pk_ptl_prm_fee_clbk_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_fee_clbk_l_01 ON ptl_prm_fee_clbk_l (atrct_fee_no);
CREATE INDEX IF NOT EXISTS x_ptl_prm_fee_clbk_l_02 ON ptl_prm_fee_clbk_l (trmn_aply_no) WHERE trmn_aply_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_prm_fee_clbk_l_03 ON ptl_prm_fee_clbk_l (stlm_no) WHERE stlm_no IS NOT NULL;

-- 장려금정책기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_incntv_plcy_m ON ptl_prm_incntv_plcy_m (incntv_plcy_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_incntv_plcy_m' AND conrelid = 'ptl_prm_incntv_plcy_m'::regclass) THEN ALTER TABLE ptl_prm_incntv_plcy_m ADD CONSTRAINT pk_ptl_prm_incntv_plcy_m PRIMARY KEY USING INDEX pk_ptl_prm_incntv_plcy_m; END IF; END $$;

-- 장려금지급내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_incntv_give_l ON ptl_prm_incntv_give_l (incntv_give_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_incntv_give_l' AND conrelid = 'ptl_prm_incntv_give_l'::regclass) THEN ALTER TABLE ptl_prm_incntv_give_l ADD CONSTRAINT pk_ptl_prm_incntv_give_l PRIMARY KEY USING INDEX pk_ptl_prm_incntv_give_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_incntv_give_l_01 ON ptl_prm_incntv_give_l (prtnr_no, incntv_ocrn_dt);
CREATE INDEX IF NOT EXISTS x_ptl_prm_incntv_give_l_02 ON ptl_prm_incntv_give_l (sbsc_ctrt_no) WHERE sbsc_ctrt_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS x_ptl_prm_incntv_give_l_03 ON ptl_prm_incntv_give_l (stlm_no) WHERE stlm_no IS NOT NULL;

-- 상호접속요율상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_intcn_trf_d ON ptl_prm_intcn_trf_d (carr_no, intcn_ty_cd, aplcn_bgng_dt);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_intcn_trf_d' AND conrelid = 'ptl_prm_intcn_trf_d'::regclass) THEN ALTER TABLE ptl_prm_intcn_trf_d ADD CONSTRAINT pk_ptl_prm_intcn_trf_d PRIMARY KEY USING INDEX pk_ptl_prm_intcn_trf_d; END IF; END $$;

-- 상호접속사용집계
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_intcn_use_t ON ptl_prm_intcn_use_t (carr_no, stlm_ym, intcn_ty_cd);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_intcn_use_t' AND conrelid = 'ptl_prm_intcn_use_t'::regclass) THEN ALTER TABLE ptl_prm_intcn_use_t ADD CONSTRAINT pk_ptl_prm_intcn_use_t PRIMARY KEY USING INDEX pk_ptl_prm_intcn_use_t; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_intcn_use_t_01 ON ptl_prm_intcn_use_t (stlm_no) WHERE stlm_no IS NOT NULL;

-- 로밍정산파일내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_roam_stlm_file_l ON ptl_prm_roam_stlm_file_l (roam_stlm_file_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_roam_stlm_file_l' AND conrelid = 'ptl_prm_roam_stlm_file_l'::regclass) THEN ALTER TABLE ptl_prm_roam_stlm_file_l ADD CONSTRAINT pk_ptl_prm_roam_stlm_file_l PRIMARY KEY USING INDEX pk_ptl_prm_roam_stlm_file_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_roam_stlm_file_l_01 ON ptl_prm_roam_stlm_file_l (roam_bzmn_no, roam_drct_se_cd, roam_stlm_file_seq);
CREATE INDEX IF NOT EXISTS x_ptl_prm_roam_stlm_file_l_02 ON ptl_prm_roam_stlm_file_l (roam_stlm_file_prcs_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_prm_roam_stlm_file_l_03 ON ptl_prm_roam_stlm_file_l (roam_stlm_no) WHERE roam_stlm_no IS NOT NULL;

-- 로밍정산내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_roam_stlm_l ON ptl_prm_roam_stlm_l (roam_stlm_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_roam_stlm_l' AND conrelid = 'ptl_prm_roam_stlm_l'::regclass) THEN ALTER TABLE ptl_prm_roam_stlm_l ADD CONSTRAINT pk_ptl_prm_roam_stlm_l PRIMARY KEY USING INDEX pk_ptl_prm_roam_stlm_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_roam_stlm_l_01 ON ptl_prm_roam_stlm_l (roam_bzmn_no, stlm_ym);
CREATE INDEX IF NOT EXISTS x_ptl_prm_roam_stlm_l_02 ON ptl_prm_roam_stlm_l (stlm_no) WHERE stlm_no IS NOT NULL;

-- 콘텐츠정산내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_cnts_stlm_l ON ptl_prm_cnts_stlm_l (cnts_stlm_no);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_cnts_stlm_l' AND conrelid = 'ptl_prm_cnts_stlm_l'::regclass) THEN ALTER TABLE ptl_prm_cnts_stlm_l ADD CONSTRAINT pk_ptl_prm_cnts_stlm_l PRIMARY KEY USING INDEX pk_ptl_prm_cnts_stlm_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_cnts_stlm_l_01 ON ptl_prm_cnts_stlm_l (cnts_prvd_co_no, stlm_ym);
CREATE INDEX IF NOT EXISTS x_ptl_prm_cnts_stlm_l_02 ON ptl_prm_cnts_stlm_l (stlm_no) WHERE stlm_no IS NOT NULL;

-- 정산지급내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_stlm_give_l ON ptl_prm_stlm_give_l (stlm_no, stlm_give_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_stlm_give_l' AND conrelid = 'ptl_prm_stlm_give_l'::regclass) THEN ALTER TABLE ptl_prm_stlm_give_l ADD CONSTRAINT pk_ptl_prm_stlm_give_l PRIMARY KEY USING INDEX pk_ptl_prm_stlm_give_l; END IF; END $$;
CREATE INDEX IF NOT EXISTS x_ptl_prm_stlm_give_l_01 ON ptl_prm_stlm_give_l (stlm_give_dtm);
CREATE INDEX IF NOT EXISTS x_ptl_prm_stlm_give_l_02 ON ptl_prm_stlm_give_l (prtnr_no, prtnr_acct_seq) WHERE prtnr_no IS NOT NULL;

-- 정산확정이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_stlm_cfmtn_h ON ptl_prm_stlm_cfmtn_h (stlm_no, stlm_cfmtn_hist_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_stlm_cfmtn_h' AND conrelid = 'ptl_prm_stlm_cfmtn_h'::regclass) THEN ALTER TABLE ptl_prm_stlm_cfmtn_h ADD CONSTRAINT pk_ptl_prm_stlm_cfmtn_h PRIMARY KEY USING INDEX pk_ptl_prm_stlm_cfmtn_h; END IF; END $$;

-- 세금계산서상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_txinv_d ON ptl_prm_txinv_d (txinv_no, txinv_dtl_seq);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_txinv_d' AND conrelid = 'ptl_prm_txinv_d'::regclass) THEN ALTER TABLE ptl_prm_txinv_d ADD CONSTRAINT pk_ptl_prm_txinv_d PRIMARY KEY USING INDEX pk_ptl_prm_txinv_d; END IF; END $$;

-- 정산월통계
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_prm_stlm_mm_s ON ptl_prm_stlm_mm_s (stlm_ym, stlm_ty_cd, prtnr_ty_cd);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_prm_stlm_mm_s' AND conrelid = 'ptl_prm_stlm_mm_s'::regclass) THEN ALTER TABLE ptl_prm_stlm_mm_s ADD CONSTRAINT pk_ptl_prm_stlm_mm_s PRIMARY KEY USING INDEX pk_ptl_prm_stlm_mm_s; END IF; END $$;
