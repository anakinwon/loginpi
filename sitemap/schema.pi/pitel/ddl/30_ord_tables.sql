-- 가입(ORD) 테이블 DDL — PostgreSQL 17, PK·인덱스 없음(적재 뒤 30_ord_constraints.sql), FK 미생성(D6)
-- 생성 : node tools/phy_ORD_build.js (손으로 고치지 말 것) · 실행 : psql -v ON_ERROR_STOP=1 -f 30_ord_tables.sql (재실행 안전)
-- 파티션 : ptl_ord_line_stts_h, ptl_ord_sbsc_ctrt_h, ptl_ord_line_chg_h, ptl_ord_sbsc_prod_h (연 단위 2010~2027 + DEFAULT)

-- ORD-001 가입신청기본 (목표 13,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_sbsc_aply_m (
  sbsc_aply_no VARCHAR(20) NOT NULL,
  cust_no VARCHAR(20),
  bill_acnt_no VARCHAR(20),
  shop_no VARCHAR(20) NOT NULL,
  prod_cd VARCHAR(20) NOT NULL,
  sbsc_aply_nm VARCHAR(100) NOT NULL,
  sbsc_aply_dtm TIMESTAMP NOT NULL,
  sbsc_aply_stts_ty_cd VARCHAR(10) NOT NULL,
  sbsc_aply_ty_cd VARCHAR(10) NOT NULL,
  sbsc_chnl_ty_cd VARCHAR(10) NOT NULL,
  aply_line_cnt NUMERIC(5) NOT NULL,
  hope_svc_no VARCHAR(20),
  rlnm_crtf_yn CHAR(1) NOT NULL,
  opng_hope_dt CHAR(8),
  sbsc_aply_cncl_dtm TIMESTAMP,
  sbsc_aply_rjct_rsn_ty_cd VARCHAR(10),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_sbsc_aply_m IS '가입신청기본';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.sbsc_aply_no IS '가입신청번호';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.shop_no IS '판매점번호';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.sbsc_aply_nm IS '가입신청명';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.sbsc_aply_dtm IS '가입신청일시';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.sbsc_aply_stts_ty_cd IS '가입신청상태유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.sbsc_aply_ty_cd IS '가입신청유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.sbsc_chnl_ty_cd IS '가입채널유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.aply_line_cnt IS '신청회선수';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.hope_svc_no IS '희망서비스번호';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.rlnm_crtf_yn IS '실명인증여부';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.opng_hope_dt IS '개통희망일자';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.sbsc_aply_cncl_dtm IS '가입신청취소일시';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.sbsc_aply_rjct_rsn_ty_cd IS '가입신청반려사유유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_sbsc_aply_m.lst_rgtr_id IS '최종등록자ID';

-- ORD-002 가입계약기본 (목표 13,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_sbsc_ctrt_m (
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  cust_no VARCHAR(20) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  svc_mgmt_no VARCHAR(20) NOT NULL,
  sbsc_aply_no VARCHAR(20),
  agnc_no VARCHAR(20),
  svc_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_nm VARCHAR(100) NOT NULL,
  sbsc_ctrt_dtm TIMESTAMP NOT NULL,
  sbsc_ctrt_stts_ty_cd VARCHAR(10) NOT NULL,
  sbsc_ctrt_ty_cd VARCHAR(10) NOT NULL,
  opng_dtm TIMESTAMP,
  trmn_dtm TIMESTAMP,
  trmn_rsn_ty_cd VARCHAR(10),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_sbsc_ctrt_m IS '가입계약기본';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.sbsc_aply_no IS '가입신청번호';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.agnc_no IS '대리점번호';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.svc_no IS '서비스번호';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.sbsc_ctrt_nm IS '가입계약명';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.sbsc_ctrt_dtm IS '가입계약일시';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.sbsc_ctrt_stts_ty_cd IS '가입계약상태유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.sbsc_ctrt_ty_cd IS '가입계약유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.opng_dtm IS '개통일시';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.trmn_dtm IS '해지일시';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.trmn_rsn_ty_cd IS '해지사유유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_m.lst_rgtr_id IS '최종등록자ID';

-- ORD-003 회선기본 (목표 12,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_line_m (
  svc_mgmt_no VARCHAR(20) NOT NULL,
  svc_no VARCHAR(20) NOT NULL,
  usim_prod_cd VARCHAR(20) NOT NULL,
  eqp_mdl_cd VARCHAR(20),
  line_nm VARCHAR(100) NOT NULL,
  line_reg_dtm TIMESTAMP NOT NULL,
  line_stts_ty_cd VARCHAR(10) NOT NULL,
  usim_sn VARCHAR(20) NOT NULL,
  imsi_no VARCHAR(20) NOT NULL,
  imei_no VARCHAR(20),
  svc_ty_cd VARCHAR(10) NOT NULL,
  ntwk_ty_cd VARCHAR(10) NOT NULL,
  esim_yn CHAR(1) NOT NULL,
  opng_dtm TIMESTAMP NOT NULL,
  trmn_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_line_m IS '회선기본';
COMMENT ON COLUMN ptl_ord_line_m.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_ord_line_m.svc_no IS '서비스번호';
COMMENT ON COLUMN ptl_ord_line_m.usim_prod_cd IS '유심상품코드';
COMMENT ON COLUMN ptl_ord_line_m.eqp_mdl_cd IS '단말모델코드';
COMMENT ON COLUMN ptl_ord_line_m.line_nm IS '회선명';
COMMENT ON COLUMN ptl_ord_line_m.line_reg_dtm IS '회선등록일시';
COMMENT ON COLUMN ptl_ord_line_m.line_stts_ty_cd IS '회선상태유형코드';
COMMENT ON COLUMN ptl_ord_line_m.usim_sn IS '유심일련번호';
COMMENT ON COLUMN ptl_ord_line_m.imsi_no IS 'IMSI번호';
COMMENT ON COLUMN ptl_ord_line_m.imei_no IS 'IMEI번호';
COMMENT ON COLUMN ptl_ord_line_m.svc_ty_cd IS '서비스유형코드';
COMMENT ON COLUMN ptl_ord_line_m.ntwk_ty_cd IS '망유형코드';
COMMENT ON COLUMN ptl_ord_line_m.esim_yn IS 'eSIM여부';
COMMENT ON COLUMN ptl_ord_line_m.opng_dtm IS '개통일시';
COMMENT ON COLUMN ptl_ord_line_m.trmn_dtm IS '해지일시';
COMMENT ON COLUMN ptl_ord_line_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_line_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_line_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_line_m.lst_rgtr_id IS '최종등록자ID';

-- ORD-004 서비스번호기본 (목표 10,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_svc_no_m (
  svc_no VARCHAR(20) NOT NULL,
  orgn_carr_no VARCHAR(20),
  svc_no_nm VARCHAR(100) NOT NULL,
  svc_no_reg_dtm TIMESTAMP NOT NULL,
  svc_no_stts_ty_cd VARCHAR(10) NOT NULL,
  svc_no_grd_ty_cd VARCHAR(10) NOT NULL,
  exch_no VARCHAR(20) NOT NULL,
  mnp_mvin_yn CHAR(1) NOT NULL,
  last_asgn_dtm TIMESTAMP,
  last_rtrvl_dtm TIMESTAMP,
  re_use_psbl_dt CHAR(8),
  svc_no_asgn_nmtm NUMERIC(5) DEFAULT 0 NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_svc_no_m IS '서비스번호기본';
COMMENT ON COLUMN ptl_ord_svc_no_m.svc_no IS '서비스번호';
COMMENT ON COLUMN ptl_ord_svc_no_m.orgn_carr_no IS '원통신사업자번호';
COMMENT ON COLUMN ptl_ord_svc_no_m.svc_no_nm IS '서비스번호명';
COMMENT ON COLUMN ptl_ord_svc_no_m.svc_no_reg_dtm IS '서비스번호등록일시';
COMMENT ON COLUMN ptl_ord_svc_no_m.svc_no_stts_ty_cd IS '서비스번호상태유형코드';
COMMENT ON COLUMN ptl_ord_svc_no_m.svc_no_grd_ty_cd IS '서비스번호등급유형코드';
COMMENT ON COLUMN ptl_ord_svc_no_m.exch_no IS '국번호';
COMMENT ON COLUMN ptl_ord_svc_no_m.mnp_mvin_yn IS '번호이동전입여부';
COMMENT ON COLUMN ptl_ord_svc_no_m.last_asgn_dtm IS '최종할당일시';
COMMENT ON COLUMN ptl_ord_svc_no_m.last_rtrvl_dtm IS '최종회수일시';
COMMENT ON COLUMN ptl_ord_svc_no_m.re_use_psbl_dt IS '재사용가능일자';
COMMENT ON COLUMN ptl_ord_svc_no_m.svc_no_asgn_nmtm IS '서비스번호할당횟수';
COMMENT ON COLUMN ptl_ord_svc_no_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_svc_no_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_svc_no_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_svc_no_m.lst_rgtr_id IS '최종등록자ID';

-- ORD-005 가입상품기본 (목표 30,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_sbsc_prod_m (
  sbsc_prod_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  prod_cd VARCHAR(20) NOT NULL,
  shop_no VARCHAR(20),
  svc_mgmt_no VARCHAR(20) NOT NULL,
  sbsc_prod_nm VARCHAR(100) NOT NULL,
  prod_sbsc_dtm TIMESTAMP NOT NULL,
  sbsc_prod_stts_ty_cd VARCHAR(10) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP,
  prod_trmn_dtm TIMESTAMP,
  prod_trmn_rsn_ty_cd VARCHAR(10),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_sbsc_prod_m IS '가입상품기본';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.sbsc_prod_no IS '가입상품번호';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.shop_no IS '판매점번호';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.sbsc_prod_nm IS '가입상품명';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.prod_sbsc_dtm IS '상품가입일시';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.sbsc_prod_stts_ty_cd IS '가입상품상태유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.prod_trmn_dtm IS '상품해지일시';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.prod_trmn_rsn_ty_cd IS '상품해지사유유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_sbsc_prod_m.lst_rgtr_id IS '최종등록자ID';

-- ORD-006 약정계약기본 (목표 8,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_agrmt_ctrt_m (
  agrmt_ctrt_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  agrmt_prod_cd VARCHAR(20) NOT NULL,
  agrmt_ctrt_nm VARCHAR(100) NOT NULL,
  agrmt_ctrt_dtm TIMESTAMP NOT NULL,
  agrmt_ctrt_stts_ty_cd VARCHAR(10) NOT NULL,
  subsd_ty_cd VARCHAR(10) NOT NULL,
  agrmt_mcnt NUMERIC(5) NOT NULL,
  agrmt_bgng_dt CHAR(8) NOT NULL,
  agrmt_end_dt CHAR(8) NOT NULL,
  chc_agrmt_dscnt_rt NUMERIC(5,2),
  re_agrmt_yn CHAR(1) NOT NULL,
  agrmt_trmn_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_agrmt_ctrt_m IS '약정계약기본';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.agrmt_ctrt_no IS '약정계약번호';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.agrmt_prod_cd IS '약정상품코드';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.agrmt_ctrt_nm IS '약정계약명';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.agrmt_ctrt_dtm IS '약정계약일시';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.agrmt_ctrt_stts_ty_cd IS '약정계약상태유형코드';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.subsd_ty_cd IS '지원금유형코드';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.agrmt_mcnt IS '약정개월수';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.agrmt_bgng_dt IS '약정시작일자';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.agrmt_end_dt IS '약정종료일자';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.chc_agrmt_dscnt_rt IS '선택약정할인율';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.re_agrmt_yn IS '재약정여부';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.agrmt_trmn_dtm IS '약정해지일시';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_m.lst_rgtr_id IS '최종등록자ID';

-- ORD-007 단말할부계약기본 (목표 2,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_eqp_instl_ctrt_m (
  eqp_instl_ctrt_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  eqp_mdl_cd VARCHAR(20) NOT NULL,
  eqp_instl_ctrt_nm VARCHAR(100) NOT NULL,
  eqp_instl_ctrt_dtm TIMESTAMP NOT NULL,
  eqp_instl_ctrt_stts_ty_cd VARCHAR(10) NOT NULL,
  imei_no VARCHAR(20) NOT NULL,
  eqp_shpm_prc NUMERIC(15) NOT NULL,
  eqp_prpay_amt NUMERIC(15) NOT NULL,
  instl_prnc NUMERIC(15) NOT NULL,
  instl_mcnt NUMERIC(5) NOT NULL,
  instl_intrt NUMERIC(5,2) NOT NULL,
  mm_instl_amt NUMERIC(15) NOT NULL,
  instl_bgng_bill_ym CHAR(6) NOT NULL,
  instl_cmptn_dt CHAR(8),
  instl_rmnd_prnc NUMERIC(15) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_eqp_instl_ctrt_m IS '단말할부계약기본';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.eqp_instl_ctrt_no IS '단말할부계약번호';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.eqp_mdl_cd IS '단말모델코드';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.eqp_instl_ctrt_nm IS '단말할부계약명';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.eqp_instl_ctrt_dtm IS '단말할부계약일시';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.eqp_instl_ctrt_stts_ty_cd IS '단말할부계약상태유형코드';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.imei_no IS 'IMEI번호';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.eqp_shpm_prc IS '단말출고가격';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.eqp_prpay_amt IS '단말선납금액';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.instl_prnc IS '할부원금';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.instl_mcnt IS '할부개월수';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.instl_intrt IS '할부이자율';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.mm_instl_amt IS '월할부금액';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.instl_bgng_bill_ym IS '할부시작청구년월';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.instl_cmptn_dt IS '할부완료일자';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.instl_rmnd_prnc IS '할부잔여원금';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_eqp_instl_ctrt_m.lst_rgtr_id IS '최종등록자ID';

-- ORD-008 번호이동신청기본 (목표 3,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_mnp_aply_m (
  mnp_aply_no VARCHAR(20) NOT NULL,
  svc_no VARCHAR(20) NOT NULL,
  sbsc_aply_no VARCHAR(20),
  sbsc_ctrt_no VARCHAR(20),
  carr_no VARCHAR(20) NOT NULL,
  mnp_aply_nm VARCHAR(100) NOT NULL,
  mnp_aply_dtm TIMESTAMP NOT NULL,
  mnp_aply_stts_ty_cd VARCHAR(10) NOT NULL,
  mnp_se_cd VARCHAR(10) NOT NULL,
  mnp_crtf_ty_cd VARCHAR(10) NOT NULL,
  mnp_acpt_no VARCHAR(20) NOT NULL,
  mnp_cmptn_dtm TIMESTAMP,
  mnp_rfsl_rsn_ty_cd VARCHAR(10),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_mnp_aply_m IS '번호이동신청기본';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.mnp_aply_no IS '번호이동신청번호';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.svc_no IS '서비스번호';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.sbsc_aply_no IS '가입신청번호';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.carr_no IS '통신사업자번호';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.mnp_aply_nm IS '번호이동신청명';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.mnp_aply_dtm IS '번호이동신청일시';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.mnp_aply_stts_ty_cd IS '번호이동신청상태유형코드';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.mnp_se_cd IS '번호이동구분코드';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.mnp_crtf_ty_cd IS '번호이동인증유형코드';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.mnp_acpt_no IS '번호이동접수번호';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.mnp_cmptn_dtm IS '번호이동완료일시';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.mnp_rfsl_rsn_ty_cd IS '번호이동거절사유유형코드';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_mnp_aply_m.lst_rgtr_id IS '최종등록자ID';

-- ORD-009 결합계약기본 (목표 2,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_cmbn_ctrt_m (
  cmbn_ctrt_no VARCHAR(20) NOT NULL,
  cmbn_prod_cd VARCHAR(20) NOT NULL,
  rprs_cust_no VARCHAR(20) NOT NULL,
  rprs_sbsc_ctrt_no VARCHAR(20) NOT NULL,
  cmbn_ctrt_nm VARCHAR(100) NOT NULL,
  cmbn_ctrt_dtm TIMESTAMP NOT NULL,
  cmbn_ctrt_stts_ty_cd VARCHAR(10) NOT NULL,
  cmbn_bgng_dt CHAR(8) NOT NULL,
  cmbn_end_dt CHAR(8),
  cmbn_trmn_rsn_ty_cd VARCHAR(10),
  cmbn_ty_cd VARCHAR(10) NOT NULL,
  cmbn_line_cnt NUMERIC(5) DEFAULT 0 NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_cmbn_ctrt_m IS '결합계약기본';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.cmbn_ctrt_no IS '결합계약번호';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.cmbn_prod_cd IS '결합상품코드';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.rprs_cust_no IS '대표고객번호';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.rprs_sbsc_ctrt_no IS '대표가입계약번호';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.cmbn_ctrt_nm IS '결합계약명';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.cmbn_ctrt_dtm IS '결합계약일시';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.cmbn_ctrt_stts_ty_cd IS '결합계약상태유형코드';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.cmbn_bgng_dt IS '결합시작일자';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.cmbn_end_dt IS '결합종료일자';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.cmbn_trmn_rsn_ty_cd IS '결합해지사유유형코드';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.cmbn_ty_cd IS '결합유형코드';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.cmbn_line_cnt IS '결합회선수';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_cmbn_ctrt_m.lst_rgtr_id IS '최종등록자ID';

-- ORD-010 회선상태이력 (목표 28,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_line_stts_h (
  svc_mgmt_no VARCHAR(20) NOT NULL,
  line_stts_hist_seq NUMERIC(10) NOT NULL,
  line_stts_chg_dtm TIMESTAMP NOT NULL,
  sbsc_ctrt_no VARCHAR(20),
  susp_no VARCHAR(20),
  exoftrmn_no VARCHAR(20),
  line_stts_hist_nm VARCHAR(100) NOT NULL,
  line_stts_ty_cd VARCHAR(10) NOT NULL,
  bfr_line_stts_ty_cd VARCHAR(10),
  line_stts_chg_rsn_ty_cd VARCHAR(10) NOT NULL,
  stts_chg_caus_task_ty_cd VARCHAR(10) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
) PARTITION BY RANGE (line_stts_chg_dtm);
DO $$
DECLARE y INT;
BEGIN
  FOR y IN 2010..2027 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', 'ptl_ord_line_stts_h_p' || y, 'ptl_ord_line_stts_h', y || '-01-01', (y + 1) || '-01-01');
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_ord_line_stts_h_pdflt PARTITION OF ptl_ord_line_stts_h DEFAULT;
COMMENT ON TABLE ptl_ord_line_stts_h IS '회선상태이력';
COMMENT ON COLUMN ptl_ord_line_stts_h.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_ord_line_stts_h.line_stts_hist_seq IS '회선상태이력순번';
COMMENT ON COLUMN ptl_ord_line_stts_h.line_stts_chg_dtm IS '회선상태변경일시';
COMMENT ON COLUMN ptl_ord_line_stts_h.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_line_stts_h.susp_no IS '이용정지번호';
COMMENT ON COLUMN ptl_ord_line_stts_h.exoftrmn_no IS '직권해지번호';
COMMENT ON COLUMN ptl_ord_line_stts_h.line_stts_hist_nm IS '회선상태이력명';
COMMENT ON COLUMN ptl_ord_line_stts_h.line_stts_ty_cd IS '회선상태유형코드';
COMMENT ON COLUMN ptl_ord_line_stts_h.bfr_line_stts_ty_cd IS '이전회선상태유형코드';
COMMENT ON COLUMN ptl_ord_line_stts_h.line_stts_chg_rsn_ty_cd IS '회선상태변경사유유형코드';
COMMENT ON COLUMN ptl_ord_line_stts_h.stts_chg_caus_task_ty_cd IS '상태변경원인업무유형코드';
COMMENT ON COLUMN ptl_ord_line_stts_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_ord_line_stts_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_ord_line_stts_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_line_stts_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_line_stts_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_line_stts_h.lst_rgtr_id IS '최종등록자ID';

-- ORD-011 가입신청상세 (목표 20,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_sbsc_aply_d (
  sbsc_aply_no VARCHAR(20) NOT NULL,
  sbsc_aply_dtl_seq NUMERIC(5) NOT NULL,
  prod_cd VARCHAR(20) NOT NULL,
  sbsc_prod_no VARCHAR(20),
  aply_prod_cnt NUMERIC(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_sbsc_aply_d IS '가입신청상세';
COMMENT ON COLUMN ptl_ord_sbsc_aply_d.sbsc_aply_no IS '가입신청번호';
COMMENT ON COLUMN ptl_ord_sbsc_aply_d.sbsc_aply_dtl_seq IS '가입신청상세순번';
COMMENT ON COLUMN ptl_ord_sbsc_aply_d.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_ord_sbsc_aply_d.sbsc_prod_no IS '가입상품번호';
COMMENT ON COLUMN ptl_ord_sbsc_aply_d.aply_prod_cnt IS '신청상품수';
COMMENT ON COLUMN ptl_ord_sbsc_aply_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_sbsc_aply_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_sbsc_aply_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_sbsc_aply_d.lst_rgtr_id IS '최종등록자ID';

-- ORD-012 가입서류내역 (목표 15,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_sbsc_doc_l (
  sbsc_aply_no VARCHAR(20) NOT NULL,
  sbsc_doc_seq NUMERIC(5) NOT NULL,
  doc_ty_cd VARCHAR(10) NOT NULL,
  doc_sbmsn_dtm TIMESTAMP NOT NULL,
  doc_vrfc_yn CHAR(1) NOT NULL,
  doc_vrfc_dtm TIMESTAMP,
  doc_file_nm VARCHAR(100),
  dstr_schd_dt CHAR(8) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_sbsc_doc_l IS '가입서류내역';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.sbsc_aply_no IS '가입신청번호';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.sbsc_doc_seq IS '가입서류순번';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.doc_ty_cd IS '서류유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.doc_sbmsn_dtm IS '서류제출일시';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.doc_vrfc_yn IS '서류검증여부';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.doc_vrfc_dtm IS '서류검증일시';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.doc_file_nm IS '서류파일명';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.dstr_schd_dt IS '파기예정일자';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_sbsc_doc_l.lst_rgtr_id IS '최종등록자ID';

-- ORD-013 개통처리내역 (목표 13,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_opng_prcs_l (
  opng_prcs_no VARCHAR(20) NOT NULL,
  sbsc_aply_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20),
  opng_prcs_dtm TIMESTAMP NOT NULL,
  opng_prcs_stts_ty_cd VARCHAR(10) NOT NULL,
  opng_prcs_ty_cd VARCHAR(10) NOT NULL,
  ntwk_lnk_rslt_ty_cd VARCHAR(10) NOT NULL,
  opng_prcs_cmptn_dtm TIMESTAMP,
  opng_err_cn VARCHAR(4000),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_opng_prcs_l IS '개통처리내역';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.opng_prcs_no IS '개통처리번호';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.sbsc_aply_no IS '가입신청번호';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.opng_prcs_dtm IS '개통처리일시';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.opng_prcs_stts_ty_cd IS '개통처리상태유형코드';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.opng_prcs_ty_cd IS '개통처리유형코드';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.ntwk_lnk_rslt_ty_cd IS '망연동결과유형코드';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.opng_prcs_cmptn_dtm IS '개통처리완료일시';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.opng_err_cn IS '개통오류내용';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_opng_prcs_l.lst_rgtr_id IS '최종등록자ID';

-- ORD-014 가입계약이력 (목표 18,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_sbsc_ctrt_h (
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_hist_seq NUMERIC(10) NOT NULL,
  sbsc_ctrt_chg_dtm TIMESTAMP NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  agnc_no VARCHAR(20),
  sbsc_ctrt_chg_ty_cd VARCHAR(10) NOT NULL,
  sbsc_ctrt_stts_ty_cd VARCHAR(10) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
) PARTITION BY RANGE (sbsc_ctrt_chg_dtm);
DO $$
DECLARE y INT;
BEGIN
  FOR y IN 2010..2027 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', 'ptl_ord_sbsc_ctrt_h_p' || y, 'ptl_ord_sbsc_ctrt_h', y || '-01-01', (y + 1) || '-01-01');
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_ord_sbsc_ctrt_h_pdflt PARTITION OF ptl_ord_sbsc_ctrt_h DEFAULT;
COMMENT ON TABLE ptl_ord_sbsc_ctrt_h IS '가입계약이력';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.sbsc_ctrt_hist_seq IS '가입계약이력순번';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.sbsc_ctrt_chg_dtm IS '가입계약변경일시';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.agnc_no IS '대리점번호';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.sbsc_ctrt_chg_ty_cd IS '가입계약변경유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.sbsc_ctrt_stts_ty_cd IS '가입계약상태유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_sbsc_ctrt_h.lst_rgtr_id IS '최종등록자ID';

-- ORD-015 회선변경이력 (목표 16,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_line_chg_h (
  svc_mgmt_no VARCHAR(20) NOT NULL,
  line_chg_hist_seq NUMERIC(10) NOT NULL,
  line_chg_dtm TIMESTAMP NOT NULL,
  svc_no VARCHAR(20) NOT NULL,
  usim_prod_cd VARCHAR(20) NOT NULL,
  eqp_mdl_cd VARCHAR(20),
  line_chg_ty_cd VARCHAR(10) NOT NULL,
  usim_sn VARCHAR(20) NOT NULL,
  imsi_no VARCHAR(20) NOT NULL,
  imei_no VARCHAR(20),
  ntwk_ty_cd VARCHAR(10) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
) PARTITION BY RANGE (line_chg_dtm);
DO $$
DECLARE y INT;
BEGIN
  FOR y IN 2010..2027 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', 'ptl_ord_line_chg_h_p' || y, 'ptl_ord_line_chg_h', y || '-01-01', (y + 1) || '-01-01');
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_ord_line_chg_h_pdflt PARTITION OF ptl_ord_line_chg_h DEFAULT;
COMMENT ON TABLE ptl_ord_line_chg_h IS '회선변경이력';
COMMENT ON COLUMN ptl_ord_line_chg_h.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_ord_line_chg_h.line_chg_hist_seq IS '회선변경이력순번';
COMMENT ON COLUMN ptl_ord_line_chg_h.line_chg_dtm IS '회선변경일시';
COMMENT ON COLUMN ptl_ord_line_chg_h.svc_no IS '서비스번호';
COMMENT ON COLUMN ptl_ord_line_chg_h.usim_prod_cd IS '유심상품코드';
COMMENT ON COLUMN ptl_ord_line_chg_h.eqp_mdl_cd IS '단말모델코드';
COMMENT ON COLUMN ptl_ord_line_chg_h.line_chg_ty_cd IS '회선변경유형코드';
COMMENT ON COLUMN ptl_ord_line_chg_h.usim_sn IS '유심일련번호';
COMMENT ON COLUMN ptl_ord_line_chg_h.imsi_no IS 'IMSI번호';
COMMENT ON COLUMN ptl_ord_line_chg_h.imei_no IS 'IMEI번호';
COMMENT ON COLUMN ptl_ord_line_chg_h.ntwk_ty_cd IS '망유형코드';
COMMENT ON COLUMN ptl_ord_line_chg_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_ord_line_chg_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_ord_line_chg_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_line_chg_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_line_chg_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_line_chg_h.lst_rgtr_id IS '최종등록자ID';

-- ORD-016 가입상품이력 (목표 32,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_sbsc_prod_h (
  sbsc_prod_no VARCHAR(20) NOT NULL,
  sbsc_prod_hist_seq NUMERIC(10) NOT NULL,
  sbsc_prod_chg_dtm TIMESTAMP NOT NULL,
  prod_cd VARCHAR(20) NOT NULL,
  rtpln_chg_aply_no VARCHAR(20),
  adsvc_aply_no VARCHAR(20),
  sbsc_prod_chg_ty_cd VARCHAR(10) NOT NULL,
  sbsc_prod_stts_ty_cd VARCHAR(10) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
) PARTITION BY RANGE (sbsc_prod_chg_dtm);
DO $$
DECLARE y INT;
BEGIN
  FOR y IN 2010..2027 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', 'ptl_ord_sbsc_prod_h_p' || y, 'ptl_ord_sbsc_prod_h', y || '-01-01', (y + 1) || '-01-01');
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_ord_sbsc_prod_h_pdflt PARTITION OF ptl_ord_sbsc_prod_h DEFAULT;
COMMENT ON TABLE ptl_ord_sbsc_prod_h IS '가입상품이력';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.sbsc_prod_no IS '가입상품번호';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.sbsc_prod_hist_seq IS '가입상품이력순번';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.sbsc_prod_chg_dtm IS '가입상품변경일시';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.rtpln_chg_aply_no IS '요금제변경신청번호';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.adsvc_aply_no IS '부가서비스신청번호';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.sbsc_prod_chg_ty_cd IS '가입상품변경유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.sbsc_prod_stts_ty_cd IS '가입상품상태유형코드';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_sbsc_prod_h.lst_rgtr_id IS '최종등록자ID';

-- ORD-017 요금제변경신청내역 (목표 6,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_rtpln_chg_aply_l (
  rtpln_chg_aply_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  bfr_prod_cd VARCHAR(20) NOT NULL,
  chg_prod_cd VARCHAR(20) NOT NULL,
  shop_no VARCHAR(20),
  rtpln_chg_aply_dtm TIMESTAMP NOT NULL,
  rtpln_chg_aply_stts_ty_cd VARCHAR(10) NOT NULL,
  aply_chnl_ty_cd VARCHAR(10) NOT NULL,
  aplcn_pnt_se_cd VARCHAR(10) NOT NULL,
  aplcn_schd_dt CHAR(8) NOT NULL,
  rtpln_chg_aply_cncl_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_rtpln_chg_aply_l IS '요금제변경신청내역';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.rtpln_chg_aply_no IS '요금제변경신청번호';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.bfr_prod_cd IS '이전상품코드';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.chg_prod_cd IS '변경상품코드';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.shop_no IS '판매점번호';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.rtpln_chg_aply_dtm IS '요금제변경신청일시';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.rtpln_chg_aply_stts_ty_cd IS '요금제변경신청상태유형코드';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.aply_chnl_ty_cd IS '신청채널유형코드';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.aplcn_pnt_se_cd IS '적용시점구분코드';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.aplcn_schd_dt IS '적용예정일자';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.rtpln_chg_aply_cncl_dtm IS '요금제변경신청취소일시';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_rtpln_chg_aply_l.lst_rgtr_id IS '최종등록자ID';

-- ORD-018 부가서비스신청내역 (목표 12,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_adsvc_aply_l (
  adsvc_aply_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  prod_cd VARCHAR(20) NOT NULL,
  sbsc_prod_no VARCHAR(20),
  shop_no VARCHAR(20),
  adsvc_aply_dtm TIMESTAMP NOT NULL,
  adsvc_aply_stts_ty_cd VARCHAR(10) NOT NULL,
  adsvc_aply_ty_cd VARCHAR(10) NOT NULL,
  aply_chnl_ty_cd VARCHAR(10) NOT NULL,
  aplcn_schd_dt CHAR(8) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_adsvc_aply_l IS '부가서비스신청내역';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.adsvc_aply_no IS '부가서비스신청번호';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.sbsc_prod_no IS '가입상품번호';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.shop_no IS '판매점번호';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.adsvc_aply_dtm IS '부가서비스신청일시';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.adsvc_aply_stts_ty_cd IS '부가서비스신청상태유형코드';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.adsvc_aply_ty_cd IS '부가서비스신청유형코드';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.aply_chnl_ty_cd IS '신청채널유형코드';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.aplcn_schd_dt IS '적용예정일자';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_adsvc_aply_l.lst_rgtr_id IS '최종등록자ID';

-- ORD-019 약정계약이력 (목표 9,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_agrmt_ctrt_h (
  agrmt_ctrt_no VARCHAR(20) NOT NULL,
  agrmt_ctrt_hist_seq NUMERIC(10) NOT NULL,
  agrmt_ctrt_chg_dtm TIMESTAMP NOT NULL,
  agrmt_ctrt_chg_ty_cd VARCHAR(10) NOT NULL,
  agrmt_ctrt_stts_ty_cd VARCHAR(10) NOT NULL,
  agrmt_bgng_dt CHAR(8) NOT NULL,
  agrmt_end_dt CHAR(8) NOT NULL,
  chc_agrmt_dscnt_rt NUMERIC(5,2),
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_agrmt_ctrt_h IS '약정계약이력';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.agrmt_ctrt_no IS '약정계약번호';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.agrmt_ctrt_hist_seq IS '약정계약이력순번';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.agrmt_ctrt_chg_dtm IS '약정계약변경일시';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.agrmt_ctrt_chg_ty_cd IS '약정계약변경유형코드';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.agrmt_ctrt_stts_ty_cd IS '약정계약상태유형코드';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.agrmt_bgng_dt IS '약정시작일자';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.agrmt_end_dt IS '약정종료일자';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.chc_agrmt_dscnt_rt IS '선택약정할인율';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_agrmt_ctrt_h.lst_rgtr_id IS '최종등록자ID';

-- ORD-020 지원금적용내역 (목표 8,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_subsd_aplcn_l (
  agrmt_ctrt_no VARCHAR(20) NOT NULL,
  subsd_aplcn_seq NUMERIC(5) NOT NULL,
  eqp_mdl_cd VARCHAR(20) NOT NULL,
  shop_no VARCHAR(20),
  subsd_aplcn_dtm TIMESTAMP NOT NULL,
  subsd_aplcn_ty_cd VARCHAR(10) NOT NULL,
  subsd_aplcn_stts_ty_cd VARCHAR(10) NOT NULL,
  subsd_aplcn_amt NUMERIC(15) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_subsd_aplcn_l IS '지원금적용내역';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.agrmt_ctrt_no IS '약정계약번호';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.subsd_aplcn_seq IS '지원금적용순번';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.eqp_mdl_cd IS '단말모델코드';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.shop_no IS '판매점번호';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.subsd_aplcn_dtm IS '지원금적용일시';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.subsd_aplcn_ty_cd IS '지원금적용유형코드';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.subsd_aplcn_stts_ty_cd IS '지원금적용상태유형코드';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.subsd_aplcn_amt IS '지원금적용금액';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_subsd_aplcn_l.lst_rgtr_id IS '최종등록자ID';

-- ORD-021 단말할부상세 (목표 45,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_eqp_instl_d (
  eqp_instl_ctrt_no VARCHAR(20) NOT NULL,
  instl_tms NUMERIC(3) NOT NULL,
  instl_bill_ym CHAR(6) NOT NULL,
  tms_prnc NUMERIC(15) NOT NULL,
  tms_instl_fee_amt NUMERIC(15) NOT NULL,
  tms_bill_amt NUMERIC(15) NOT NULL,
  instl_rmnd_prnc NUMERIC(15) NOT NULL,
  instl_tms_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_eqp_instl_d IS '단말할부상세';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.eqp_instl_ctrt_no IS '단말할부계약번호';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.instl_tms IS '할부회차';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.instl_bill_ym IS '할부청구년월';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.tms_prnc IS '회차원금';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.tms_instl_fee_amt IS '회차할부수수료금액';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.tms_bill_amt IS '회차청구금액';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.instl_rmnd_prnc IS '할부잔여원금';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.instl_tms_stts_ty_cd IS '할부회차상태유형코드';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_eqp_instl_d.lst_rgtr_id IS '최종등록자ID';

-- ORD-022 회선단말관계 (목표 15,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_line_eqp_r (
  svc_mgmt_no VARCHAR(20) NOT NULL,
  line_eqp_rel_seq NUMERIC(5) NOT NULL,
  eqp_mdl_cd VARCHAR(20),
  eqp_instl_ctrt_no VARCHAR(20),
  eqp_chg_no VARCHAR(20),
  imei_no VARCHAR(20) NOT NULL,
  slfsply_yn CHAR(1) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_line_eqp_r IS '회선단말관계';
COMMENT ON COLUMN ptl_ord_line_eqp_r.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_ord_line_eqp_r.line_eqp_rel_seq IS '회선단말관계순번';
COMMENT ON COLUMN ptl_ord_line_eqp_r.eqp_mdl_cd IS '단말모델코드';
COMMENT ON COLUMN ptl_ord_line_eqp_r.eqp_instl_ctrt_no IS '단말할부계약번호';
COMMENT ON COLUMN ptl_ord_line_eqp_r.eqp_chg_no IS '단말변경번호';
COMMENT ON COLUMN ptl_ord_line_eqp_r.imei_no IS 'IMEI번호';
COMMENT ON COLUMN ptl_ord_line_eqp_r.slfsply_yn IS '자급제여부';
COMMENT ON COLUMN ptl_ord_line_eqp_r.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_ord_line_eqp_r.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_ord_line_eqp_r.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_line_eqp_r.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_line_eqp_r.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_line_eqp_r.lst_rgtr_id IS '최종등록자ID';

-- ORD-023 단말변경내역 (목표 5,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_eqp_chg_l (
  eqp_chg_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  sbsc_aply_no VARCHAR(20),
  bfr_eqp_mdl_cd VARCHAR(20),
  eqp_mdl_cd VARCHAR(20) NOT NULL,
  shop_no VARCHAR(20) NOT NULL,
  eqp_instl_ctrt_no VARCHAR(20),
  agrmt_ctrt_no VARCHAR(20),
  eqp_chg_dtm TIMESTAMP NOT NULL,
  eqp_chg_stts_ty_cd VARCHAR(10) NOT NULL,
  eqp_chg_ty_cd VARCHAR(10) NOT NULL,
  bfr_imei_no VARCHAR(20),
  imei_no VARCHAR(20) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_eqp_chg_l IS '단말변경내역';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.eqp_chg_no IS '단말변경번호';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.sbsc_aply_no IS '가입신청번호';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.bfr_eqp_mdl_cd IS '이전단말모델코드';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.eqp_mdl_cd IS '단말모델코드';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.shop_no IS '판매점번호';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.eqp_instl_ctrt_no IS '단말할부계약번호';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.agrmt_ctrt_no IS '약정계약번호';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.eqp_chg_dtm IS '단말변경일시';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.eqp_chg_stts_ty_cd IS '단말변경상태유형코드';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.eqp_chg_ty_cd IS '단말변경유형코드';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.bfr_imei_no IS '이전IMEI번호';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.imei_no IS 'IMEI번호';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_eqp_chg_l.lst_rgtr_id IS '최종등록자ID';

-- ORD-024 유심변경내역 (목표 4,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_usim_chg_l (
  usim_chg_no VARCHAR(20) NOT NULL,
  svc_mgmt_no VARCHAR(20) NOT NULL,
  bfr_usim_prod_cd VARCHAR(20) NOT NULL,
  usim_prod_cd VARCHAR(20) NOT NULL,
  shop_no VARCHAR(20),
  usim_chg_dtm TIMESTAMP NOT NULL,
  usim_chg_stts_ty_cd VARCHAR(10) NOT NULL,
  usim_chg_rsn_ty_cd VARCHAR(10) NOT NULL,
  bfr_usim_sn VARCHAR(20) NOT NULL,
  usim_sn VARCHAR(20) NOT NULL,
  bfr_imsi_no VARCHAR(20) NOT NULL,
  imsi_no VARCHAR(20) NOT NULL,
  esim_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_usim_chg_l IS '유심변경내역';
COMMENT ON COLUMN ptl_ord_usim_chg_l.usim_chg_no IS '유심변경번호';
COMMENT ON COLUMN ptl_ord_usim_chg_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_ord_usim_chg_l.bfr_usim_prod_cd IS '이전유심상품코드';
COMMENT ON COLUMN ptl_ord_usim_chg_l.usim_prod_cd IS '유심상품코드';
COMMENT ON COLUMN ptl_ord_usim_chg_l.shop_no IS '판매점번호';
COMMENT ON COLUMN ptl_ord_usim_chg_l.usim_chg_dtm IS '유심변경일시';
COMMENT ON COLUMN ptl_ord_usim_chg_l.usim_chg_stts_ty_cd IS '유심변경상태유형코드';
COMMENT ON COLUMN ptl_ord_usim_chg_l.usim_chg_rsn_ty_cd IS '유심변경사유유형코드';
COMMENT ON COLUMN ptl_ord_usim_chg_l.bfr_usim_sn IS '이전유심일련번호';
COMMENT ON COLUMN ptl_ord_usim_chg_l.usim_sn IS '유심일련번호';
COMMENT ON COLUMN ptl_ord_usim_chg_l.bfr_imsi_no IS '이전IMSI번호';
COMMENT ON COLUMN ptl_ord_usim_chg_l.imsi_no IS 'IMSI번호';
COMMENT ON COLUMN ptl_ord_usim_chg_l.esim_yn IS 'eSIM여부';
COMMENT ON COLUMN ptl_ord_usim_chg_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_usim_chg_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_usim_chg_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_usim_chg_l.lst_rgtr_id IS '최종등록자ID';

-- ORD-025 번호이동이력 (목표 10,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_mnp_h (
  mnp_aply_no VARCHAR(20) NOT NULL,
  mnp_hist_seq NUMERIC(5) NOT NULL,
  mnp_stts_chg_dtm TIMESTAMP NOT NULL,
  mnp_aply_stts_ty_cd VARCHAR(10) NOT NULL,
  mnp_step_ty_cd VARCHAR(10) NOT NULL,
  mnp_rfsl_rsn_ty_cd VARCHAR(10),
  mnp_prcs_rslt_cn VARCHAR(200),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_mnp_h IS '번호이동이력';
COMMENT ON COLUMN ptl_ord_mnp_h.mnp_aply_no IS '번호이동신청번호';
COMMENT ON COLUMN ptl_ord_mnp_h.mnp_hist_seq IS '번호이동이력순번';
COMMENT ON COLUMN ptl_ord_mnp_h.mnp_stts_chg_dtm IS '번호이동상태변경일시';
COMMENT ON COLUMN ptl_ord_mnp_h.mnp_aply_stts_ty_cd IS '번호이동신청상태유형코드';
COMMENT ON COLUMN ptl_ord_mnp_h.mnp_step_ty_cd IS '번호이동단계유형코드';
COMMENT ON COLUMN ptl_ord_mnp_h.mnp_rfsl_rsn_ty_cd IS '번호이동거절사유유형코드';
COMMENT ON COLUMN ptl_ord_mnp_h.mnp_prcs_rslt_cn IS '번호이동처리결과내용';
COMMENT ON COLUMN ptl_ord_mnp_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_mnp_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_mnp_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_mnp_h.lst_rgtr_id IS '최종등록자ID';

-- ORD-026 명의변경내역 (목표 1,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_nmne_chg_l (
  nmne_chg_no VARCHAR(20) NOT NULL,
  svc_mgmt_no VARCHAR(20) NOT NULL,
  bfr_sbsc_ctrt_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20),
  bfr_cust_no VARCHAR(20) NOT NULL,
  cust_no VARCHAR(20) NOT NULL,
  sbsc_aply_no VARCHAR(20),
  nmne_chg_dtm TIMESTAMP NOT NULL,
  nmne_chg_stts_ty_cd VARCHAR(10) NOT NULL,
  nmne_chg_ty_cd VARCHAR(10) NOT NULL,
  unpd_scsn_yn CHAR(1) NOT NULL,
  agrmt_scsn_yn CHAR(1) NOT NULL,
  instl_scsn_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_nmne_chg_l IS '명의변경내역';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.nmne_chg_no IS '명의변경번호';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.bfr_sbsc_ctrt_no IS '이전가입계약번호';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.bfr_cust_no IS '이전고객번호';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.sbsc_aply_no IS '가입신청번호';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.nmne_chg_dtm IS '명의변경일시';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.nmne_chg_stts_ty_cd IS '명의변경상태유형코드';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.nmne_chg_ty_cd IS '명의변경유형코드';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.unpd_scsn_yn IS '미납승계여부';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.agrmt_scsn_yn IS '약정승계여부';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.instl_scsn_yn IS '할부승계여부';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_nmne_chg_l.lst_rgtr_id IS '최종등록자ID';

-- ORD-027 일시정지내역 (목표 1,500,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_paus_l (
  paus_no VARCHAR(20) NOT NULL,
  svc_mgmt_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  paus_aply_dtm TIMESTAMP NOT NULL,
  paus_stts_ty_cd VARCHAR(10) NOT NULL,
  paus_rsn_ty_cd VARCHAR(10) NOT NULL,
  paus_bgng_dtm TIMESTAMP NOT NULL,
  paus_end_schd_dt CHAR(8) NOT NULL,
  paus_rls_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_paus_l IS '일시정지내역';
COMMENT ON COLUMN ptl_ord_paus_l.paus_no IS '일시정지번호';
COMMENT ON COLUMN ptl_ord_paus_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_ord_paus_l.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_paus_l.paus_aply_dtm IS '일시정지신청일시';
COMMENT ON COLUMN ptl_ord_paus_l.paus_stts_ty_cd IS '일시정지상태유형코드';
COMMENT ON COLUMN ptl_ord_paus_l.paus_rsn_ty_cd IS '일시정지사유유형코드';
COMMENT ON COLUMN ptl_ord_paus_l.paus_bgng_dtm IS '일시정지시작일시';
COMMENT ON COLUMN ptl_ord_paus_l.paus_end_schd_dt IS '일시정지종료예정일자';
COMMENT ON COLUMN ptl_ord_paus_l.paus_rls_dtm IS '일시정지해제일시';
COMMENT ON COLUMN ptl_ord_paus_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_paus_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_paus_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_paus_l.lst_rgtr_id IS '최종등록자ID';

-- ORD-028 해지신청내역 (목표 7,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_trmn_aply_l (
  trmn_aply_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  mnp_aply_no VARCHAR(20),
  trmn_aply_dtm TIMESTAMP NOT NULL,
  trmn_aply_stts_ty_cd VARCHAR(10) NOT NULL,
  trmn_rsn_ty_cd VARCHAR(10) NOT NULL,
  trmn_acpt_chnl_ty_cd VARCHAR(10) NOT NULL,
  trmn_schd_dt CHAR(8) NOT NULL,
  trmn_prcs_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_trmn_aply_l IS '해지신청내역';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.trmn_aply_no IS '해지신청번호';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.mnp_aply_no IS '번호이동신청번호';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.trmn_aply_dtm IS '해지신청일시';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.trmn_aply_stts_ty_cd IS '해지신청상태유형코드';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.trmn_rsn_ty_cd IS '해지사유유형코드';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.trmn_acpt_chnl_ty_cd IS '해지접수채널유형코드';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.trmn_schd_dt IS '해지예정일자';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.trmn_prcs_dtm IS '해지처리일시';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_trmn_aply_l.lst_rgtr_id IS '최종등록자ID';

-- ORD-029 결합구성회선관계 (목표 5,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_cmbn_cmps_line_r (
  cmbn_ctrt_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  cmbn_cmps_stts_ty_cd VARCHAR(10) NOT NULL,
  fmly_rel_ty_cd VARCHAR(10),
  cmbn_bgng_dt CHAR(8) NOT NULL,
  cmbn_end_dt CHAR(8),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_cmbn_cmps_line_r IS '결합구성회선관계';
COMMENT ON COLUMN ptl_ord_cmbn_cmps_line_r.cmbn_ctrt_no IS '결합계약번호';
COMMENT ON COLUMN ptl_ord_cmbn_cmps_line_r.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_ord_cmbn_cmps_line_r.cmbn_cmps_stts_ty_cd IS '결합구성상태유형코드';
COMMENT ON COLUMN ptl_ord_cmbn_cmps_line_r.fmly_rel_ty_cd IS '가족관계유형코드';
COMMENT ON COLUMN ptl_ord_cmbn_cmps_line_r.cmbn_bgng_dt IS '결합시작일자';
COMMENT ON COLUMN ptl_ord_cmbn_cmps_line_r.cmbn_end_dt IS '결합종료일자';
COMMENT ON COLUMN ptl_ord_cmbn_cmps_line_r.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_cmbn_cmps_line_r.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_cmbn_cmps_line_r.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_cmbn_cmps_line_r.lst_rgtr_id IS '최종등록자ID';

-- ORD-030 서비스번호이력 (목표 23,000,000행)
CREATE TABLE IF NOT EXISTS ptl_ord_svc_no_h (
  svc_no VARCHAR(20) NOT NULL,
  svc_no_hist_seq NUMERIC(5) NOT NULL,
  svc_mgmt_no VARCHAR(20),
  svc_no_stts_chg_dtm TIMESTAMP NOT NULL,
  svc_no_stts_ty_cd VARCHAR(10) NOT NULL,
  svc_no_chg_rsn_ty_cd VARCHAR(10) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_ord_svc_no_h IS '서비스번호이력';
COMMENT ON COLUMN ptl_ord_svc_no_h.svc_no IS '서비스번호';
COMMENT ON COLUMN ptl_ord_svc_no_h.svc_no_hist_seq IS '서비스번호이력순번';
COMMENT ON COLUMN ptl_ord_svc_no_h.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_ord_svc_no_h.svc_no_stts_chg_dtm IS '서비스번호상태변경일시';
COMMENT ON COLUMN ptl_ord_svc_no_h.svc_no_stts_ty_cd IS '서비스번호상태유형코드';
COMMENT ON COLUMN ptl_ord_svc_no_h.svc_no_chg_rsn_ty_cd IS '서비스번호변경사유유형코드';
COMMENT ON COLUMN ptl_ord_svc_no_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_ord_svc_no_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_ord_svc_no_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_ord_svc_no_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_ord_svc_no_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_ord_svc_no_h.lst_rgtr_id IS '최종등록자ID';
