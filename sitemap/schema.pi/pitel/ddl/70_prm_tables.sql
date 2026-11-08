-- 파트너(PRM, 정산 STL 모듈 포함) 테이블 DDL — PostgreSQL 17, PK·인덱스 없음(적재 뒤 70_prm_constraints.sql), FK 미생성(D6)
-- 생성 : node tools/phy_PRM_build.js (손으로 고치지 말 것) · 실행 : psql -v ON_ERROR_STOP=1 -f 70_prm_tables.sql (재실행 안전)
-- 파티션 : ptl_prm_mgmt_fee_l (연 단위 2010~2027 + DEFAULT)

-- PRM-001 파트너기본 (목표 60,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_prtnr_m (
  prtnr_no VARCHAR(20) NOT NULL,
  rgn_cd VARCHAR(10),
  mgmt_org_cd VARCHAR(10),
  prtnr_nm VARCHAR(200) NOT NULL,
  prtnr_reg_dtm TIMESTAMP NOT NULL,
  prtnr_stts_ty_cd VARCHAR(10) NOT NULL,
  prtnr_ty_cd VARCHAR(10) NOT NULL,
  brno VARCHAR(20),
  crno VARCHAR(20),
  rprsv_nm VARCHAR(100),
  bzmn_txtn_ty_cd VARCHAR(10) NOT NULL,
  natn_cd VARCHAR(10) NOT NULL,
  rprs_telno VARCHAR(20),
  bplc_addr VARCHAR(200),
  trd_bgng_dt CHAR(8) NOT NULL,
  trd_end_dt CHAR(8),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_prtnr_m IS '파트너기본';
COMMENT ON COLUMN ptl_prm_prtnr_m.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_prm_prtnr_m.rgn_cd IS '지역코드';
COMMENT ON COLUMN ptl_prm_prtnr_m.mgmt_org_cd IS '관리조직코드';
COMMENT ON COLUMN ptl_prm_prtnr_m.prtnr_nm IS '파트너명';
COMMENT ON COLUMN ptl_prm_prtnr_m.prtnr_reg_dtm IS '파트너등록일시';
COMMENT ON COLUMN ptl_prm_prtnr_m.prtnr_stts_ty_cd IS '파트너상태유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_m.prtnr_ty_cd IS '파트너유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_m.brno IS '사업자등록번호';
COMMENT ON COLUMN ptl_prm_prtnr_m.crno IS '법인등록번호';
COMMENT ON COLUMN ptl_prm_prtnr_m.rprsv_nm IS '대표자명';
COMMENT ON COLUMN ptl_prm_prtnr_m.bzmn_txtn_ty_cd IS '사업자과세유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_m.natn_cd IS '국가코드';
COMMENT ON COLUMN ptl_prm_prtnr_m.rprs_telno IS '대표전화번호';
COMMENT ON COLUMN ptl_prm_prtnr_m.bplc_addr IS '사업장주소';
COMMENT ON COLUMN ptl_prm_prtnr_m.trd_bgng_dt IS '거래시작일자';
COMMENT ON COLUMN ptl_prm_prtnr_m.trd_end_dt IS '거래종료일자';
COMMENT ON COLUMN ptl_prm_prtnr_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_prtnr_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_prtnr_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_prtnr_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-002 조직기본 (목표 2,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_org_m (
  org_cd VARCHAR(10) NOT NULL,
  up_org_cd VARCHAR(10),
  org_nm VARCHAR(100) NOT NULL,
  org_reg_dtm TIMESTAMP NOT NULL,
  org_stts_ty_cd VARCHAR(10) NOT NULL,
  org_ty_cd VARCHAR(10) NOT NULL,
  org_hd_nm VARCHAR(100),
  cst_ctr_cd VARCHAR(10),
  vld_bgng_dt CHAR(8) NOT NULL,
  vld_end_dt CHAR(8),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_org_m IS '조직기본';
COMMENT ON COLUMN ptl_prm_org_m.org_cd IS '조직코드';
COMMENT ON COLUMN ptl_prm_org_m.up_org_cd IS '상위조직코드';
COMMENT ON COLUMN ptl_prm_org_m.org_nm IS '조직명';
COMMENT ON COLUMN ptl_prm_org_m.org_reg_dtm IS '조직등록일시';
COMMENT ON COLUMN ptl_prm_org_m.org_stts_ty_cd IS '조직상태유형코드';
COMMENT ON COLUMN ptl_prm_org_m.org_ty_cd IS '조직유형코드';
COMMENT ON COLUMN ptl_prm_org_m.org_hd_nm IS '조직장명';
COMMENT ON COLUMN ptl_prm_org_m.cst_ctr_cd IS '비용센터코드';
COMMENT ON COLUMN ptl_prm_org_m.vld_bgng_dt IS '유효시작일자';
COMMENT ON COLUMN ptl_prm_org_m.vld_end_dt IS '유효종료일자';
COMMENT ON COLUMN ptl_prm_org_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_org_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_org_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_org_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-003 대리점기본 (목표 5,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_agnc_m (
  agnc_no VARCHAR(20) NOT NULL,
  agnc_nm VARCHAR(100) NOT NULL,
  agnc_reg_dtm TIMESTAMP NOT NULL,
  agnc_stts_ty_cd VARCHAR(10) NOT NULL,
  agnc_ty_cd VARCHAR(10) NOT NULL,
  agnc_grd_ty_cd VARCHAR(10) NOT NULL,
  opn_dt CHAR(8) NOT NULL,
  clsr_dt CHAR(8),
  cltrl_amt NUMERIC(15) NOT NULL,
  excl_agnc_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_agnc_m IS '대리점기본';
COMMENT ON COLUMN ptl_prm_agnc_m.agnc_no IS '대리점번호';
COMMENT ON COLUMN ptl_prm_agnc_m.agnc_nm IS '대리점명';
COMMENT ON COLUMN ptl_prm_agnc_m.agnc_reg_dtm IS '대리점등록일시';
COMMENT ON COLUMN ptl_prm_agnc_m.agnc_stts_ty_cd IS '대리점상태유형코드';
COMMENT ON COLUMN ptl_prm_agnc_m.agnc_ty_cd IS '대리점유형코드';
COMMENT ON COLUMN ptl_prm_agnc_m.agnc_grd_ty_cd IS '대리점등급유형코드';
COMMENT ON COLUMN ptl_prm_agnc_m.opn_dt IS '개설일자';
COMMENT ON COLUMN ptl_prm_agnc_m.clsr_dt IS '폐쇄일자';
COMMENT ON COLUMN ptl_prm_agnc_m.cltrl_amt IS '담보금액';
COMMENT ON COLUMN ptl_prm_agnc_m.excl_agnc_yn IS '전속대리점여부';
COMMENT ON COLUMN ptl_prm_agnc_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_agnc_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_agnc_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_agnc_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-004 판매점기본 (목표 40,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_shop_m (
  shop_no VARCHAR(20) NOT NULL,
  agnc_no VARCHAR(20),
  shop_nm VARCHAR(100) NOT NULL,
  shop_reg_dtm TIMESTAMP NOT NULL,
  shop_stts_ty_cd VARCHAR(10) NOT NULL,
  shop_ty_cd VARCHAR(10) NOT NULL,
  praprv_no VARCHAR(20),
  praprv_dt CHAR(8),
  opn_dt CHAR(8) NOT NULL,
  clsr_dt CHAR(8),
  idcd_scnr_hold_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_shop_m IS '판매점기본';
COMMENT ON COLUMN ptl_prm_shop_m.shop_no IS '판매점번호';
COMMENT ON COLUMN ptl_prm_shop_m.agnc_no IS '대리점번호';
COMMENT ON COLUMN ptl_prm_shop_m.shop_nm IS '판매점명';
COMMENT ON COLUMN ptl_prm_shop_m.shop_reg_dtm IS '판매점등록일시';
COMMENT ON COLUMN ptl_prm_shop_m.shop_stts_ty_cd IS '판매점상태유형코드';
COMMENT ON COLUMN ptl_prm_shop_m.shop_ty_cd IS '판매점유형코드';
COMMENT ON COLUMN ptl_prm_shop_m.praprv_no IS '사전승낙번호';
COMMENT ON COLUMN ptl_prm_shop_m.praprv_dt IS '사전승낙일자';
COMMENT ON COLUMN ptl_prm_shop_m.opn_dt IS '개설일자';
COMMENT ON COLUMN ptl_prm_shop_m.clsr_dt IS '폐쇄일자';
COMMENT ON COLUMN ptl_prm_shop_m.idcd_scnr_hold_yn IS '신분증스캐너보유여부';
COMMENT ON COLUMN ptl_prm_shop_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_shop_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_shop_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_shop_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-005 콘텐츠제공사기본 (목표 8,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_cnts_prvd_co_m (
  cnts_prvd_co_no VARCHAR(20) NOT NULL,
  cnts_prvd_co_nm VARCHAR(100) NOT NULL,
  cnts_prvd_co_reg_dtm TIMESTAMP NOT NULL,
  cnts_prvd_co_stts_ty_cd VARCHAR(10) NOT NULL,
  cnts_prvd_co_ty_cd VARCHAR(10) NOT NULL,
  vasb_dclr_no VARCHAR(20),
  stlm_fee_rt NUMERIC(5,2) NOT NULL,
  hp_pymt_aflt_yn CHAR(1) NOT NULL,
  cust_ctr_telno VARCHAR(20),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_cnts_prvd_co_m IS '콘텐츠제공사기본';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.cnts_prvd_co_no IS '콘텐츠제공사번호';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.cnts_prvd_co_nm IS '콘텐츠제공사명';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.cnts_prvd_co_reg_dtm IS '콘텐츠제공사등록일시';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.cnts_prvd_co_stts_ty_cd IS '콘텐츠제공사상태유형코드';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.cnts_prvd_co_ty_cd IS '콘텐츠제공사유형코드';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.vasb_dclr_no IS '부가통신사업신고번호';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.stlm_fee_rt IS '정산수수료율';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.hp_pymt_aflt_yn IS '휴대폰결제가맹여부';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.cust_ctr_telno IS '고객센터전화번호';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_cnts_prvd_co_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-006 통신사업자기본 (목표 300행)
CREATE TABLE IF NOT EXISTS ptl_prm_carr_m (
  carr_no VARCHAR(20) NOT NULL,
  up_carr_no VARCHAR(20),
  carr_nm VARCHAR(100) NOT NULL,
  carr_reg_dtm TIMESTAMP NOT NULL,
  carr_stts_ty_cd VARCHAR(10) NOT NULL,
  carr_ty_cd VARCHAR(10) NOT NULL,
  mnp_bzmn_cd VARCHAR(10),
  ntwk_idfc_cd VARCHAR(10),
  intcn_ctrt_dt CHAR(8),
  intcn_stlm_trgt_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_carr_m IS '통신사업자기본';
COMMENT ON COLUMN ptl_prm_carr_m.carr_no IS '통신사업자번호';
COMMENT ON COLUMN ptl_prm_carr_m.up_carr_no IS '상위통신사업자번호';
COMMENT ON COLUMN ptl_prm_carr_m.carr_nm IS '통신사업자명';
COMMENT ON COLUMN ptl_prm_carr_m.carr_reg_dtm IS '통신사업자등록일시';
COMMENT ON COLUMN ptl_prm_carr_m.carr_stts_ty_cd IS '통신사업자상태유형코드';
COMMENT ON COLUMN ptl_prm_carr_m.carr_ty_cd IS '통신사업자유형코드';
COMMENT ON COLUMN ptl_prm_carr_m.mnp_bzmn_cd IS '번호이동사업자코드';
COMMENT ON COLUMN ptl_prm_carr_m.ntwk_idfc_cd IS '망식별코드';
COMMENT ON COLUMN ptl_prm_carr_m.intcn_ctrt_dt IS '상호접속계약일자';
COMMENT ON COLUMN ptl_prm_carr_m.intcn_stlm_trgt_yn IS '상호접속정산대상여부';
COMMENT ON COLUMN ptl_prm_carr_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_carr_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_carr_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_carr_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-007 로밍사업자기본 (목표 1,200행)
CREATE TABLE IF NOT EXISTS ptl_prm_roam_bzmn_m (
  roam_bzmn_no VARCHAR(20) NOT NULL,
  natn_cd VARCHAR(10) NOT NULL,
  roam_bzmn_nm VARCHAR(100) NOT NULL,
  roam_bzmn_reg_dtm TIMESTAMP NOT NULL,
  roam_bzmn_stts_ty_cd VARCHAR(10) NOT NULL,
  tadig_cd VARCHAR(10) NOT NULL,
  ntwk_idfc_cd VARCHAR(10) NOT NULL,
  roam_drct_se_cd VARCHAR(10) NOT NULL,
  roam_ctrt_dt CHAR(8) NOT NULL,
  stlm_crncy_cd VARCHAR(10) NOT NULL,
  data_clrh_co_nm VARCHAR(100),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_roam_bzmn_m IS '로밍사업자기본';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.roam_bzmn_no IS '로밍사업자번호';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.natn_cd IS '국가코드';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.roam_bzmn_nm IS '로밍사업자명';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.roam_bzmn_reg_dtm IS '로밍사업자등록일시';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.roam_bzmn_stts_ty_cd IS '로밍사업자상태유형코드';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.tadig_cd IS 'TADIG코드';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.ntwk_idfc_cd IS '망식별코드';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.roam_drct_se_cd IS '로밍방향구분코드';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.roam_ctrt_dt IS '로밍계약일자';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.stlm_crncy_cd IS '정산통화코드';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.data_clrh_co_nm IS '데이터청산사명';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_roam_bzmn_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-008 파트너계약기본 (목표 150,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_prtnr_ctrt_m (
  prtnr_ctrt_no VARCHAR(20) NOT NULL,
  prtnr_no VARCHAR(20) NOT NULL,
  prtnr_ctrt_nm VARCHAR(100) NOT NULL,
  prtnr_ctrt_dtm TIMESTAMP NOT NULL,
  prtnr_ctrt_stts_ty_cd VARCHAR(10) NOT NULL,
  prtnr_ctrt_ty_cd VARCHAR(10) NOT NULL,
  ctrt_bgng_dt CHAR(8) NOT NULL,
  ctrt_end_dt CHAR(8),
  atmt_rnw_yn CHAR(1) NOT NULL,
  stlm_cycl_ty_cd VARCHAR(10) NOT NULL,
  give_cnd_cn VARCHAR(200),
  ctrt_trmn_dt CHAR(8),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_prtnr_ctrt_m IS '파트너계약기본';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.prtnr_ctrt_no IS '파트너계약번호';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.prtnr_ctrt_nm IS '파트너계약명';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.prtnr_ctrt_dtm IS '파트너계약일시';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.prtnr_ctrt_stts_ty_cd IS '파트너계약상태유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.prtnr_ctrt_ty_cd IS '파트너계약유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.ctrt_bgng_dt IS '계약시작일자';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.ctrt_end_dt IS '계약종료일자';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.atmt_rnw_yn IS '자동갱신여부';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.stlm_cycl_ty_cd IS '정산주기유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.give_cnd_cn IS '지급조건내용';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.ctrt_trmn_dt IS '계약해지일자';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-009 정산기본 [STL] (목표 4,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_stlm_m (
  stlm_no VARCHAR(20) NOT NULL,
  prtnr_ctrt_no VARCHAR(20) NOT NULL,
  prtnr_no VARCHAR(20) NOT NULL,
  stlm_nm VARCHAR(100) NOT NULL,
  stlm_dtm TIMESTAMP NOT NULL,
  stlm_stts_ty_cd VARCHAR(10) NOT NULL,
  stlm_ym CHAR(6) NOT NULL,
  stlm_ty_cd VARCHAR(10) NOT NULL,
  stlm_drct_se_cd VARCHAR(10) NOT NULL,
  stlm_trgt_amt NUMERIC(15) NOT NULL,
  ddtn_amt NUMERIC(15) NOT NULL,
  splyamt NUMERIC(15) NOT NULL,
  vat_amt NUMERIC(15) NOT NULL,
  crncy_cd VARCHAR(10) NOT NULL,
  give_schd_dt CHAR(8),
  stlm_cfmtn_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_stlm_m IS '정산기본';
COMMENT ON COLUMN ptl_prm_stlm_m.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_stlm_m.prtnr_ctrt_no IS '파트너계약번호';
COMMENT ON COLUMN ptl_prm_stlm_m.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_prm_stlm_m.stlm_nm IS '정산명';
COMMENT ON COLUMN ptl_prm_stlm_m.stlm_dtm IS '정산일시';
COMMENT ON COLUMN ptl_prm_stlm_m.stlm_stts_ty_cd IS '정산상태유형코드';
COMMENT ON COLUMN ptl_prm_stlm_m.stlm_ym IS '정산년월';
COMMENT ON COLUMN ptl_prm_stlm_m.stlm_ty_cd IS '정산유형코드';
COMMENT ON COLUMN ptl_prm_stlm_m.stlm_drct_se_cd IS '정산방향구분코드';
COMMENT ON COLUMN ptl_prm_stlm_m.stlm_trgt_amt IS '정산대상금액';
COMMENT ON COLUMN ptl_prm_stlm_m.ddtn_amt IS '공제금액';
COMMENT ON COLUMN ptl_prm_stlm_m.splyamt IS '공급가액';
COMMENT ON COLUMN ptl_prm_stlm_m.vat_amt IS '부가가치세금액';
COMMENT ON COLUMN ptl_prm_stlm_m.crncy_cd IS '통화코드';
COMMENT ON COLUMN ptl_prm_stlm_m.give_schd_dt IS '지급예정일자';
COMMENT ON COLUMN ptl_prm_stlm_m.stlm_cfmtn_dtm IS '정산확정일시';
COMMENT ON COLUMN ptl_prm_stlm_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_stlm_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_stlm_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_stlm_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-010 세금계산서기본 [STL] (목표 3,500,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_txinv_m (
  txinv_no VARCHAR(20) NOT NULL,
  stlm_no VARCHAR(20) NOT NULL,
  orgn_txinv_no VARCHAR(20),
  prtnr_no VARCHAR(20) NOT NULL,
  txinv_prdlst_nm VARCHAR(200) NOT NULL,
  txinv_pblcn_dtm TIMESTAMP NOT NULL,
  txinv_stts_ty_cd VARCHAR(10) NOT NULL,
  txinv_ty_cd VARCHAR(10) NOT NULL,
  prchs_sls_se_cd VARCHAR(10) NOT NULL,
  wrt_dt CHAR(8) NOT NULL,
  splyamt NUMERIC(15) NOT NULL,
  txamt NUMERIC(15) NOT NULL,
  elctr_txinv_aprv_no VARCHAR(30),
  nts_trnm_dtm TIMESTAMP,
  mdfcn_rsn_ty_cd VARCHAR(10),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_txinv_m IS '세금계산서기본';
COMMENT ON COLUMN ptl_prm_txinv_m.txinv_no IS '세금계산서번호';
COMMENT ON COLUMN ptl_prm_txinv_m.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_txinv_m.orgn_txinv_no IS '원세금계산서번호';
COMMENT ON COLUMN ptl_prm_txinv_m.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_prm_txinv_m.txinv_prdlst_nm IS '세금계산서품목명';
COMMENT ON COLUMN ptl_prm_txinv_m.txinv_pblcn_dtm IS '세금계산서발행일시';
COMMENT ON COLUMN ptl_prm_txinv_m.txinv_stts_ty_cd IS '세금계산서상태유형코드';
COMMENT ON COLUMN ptl_prm_txinv_m.txinv_ty_cd IS '세금계산서유형코드';
COMMENT ON COLUMN ptl_prm_txinv_m.prchs_sls_se_cd IS '매입매출구분코드';
COMMENT ON COLUMN ptl_prm_txinv_m.wrt_dt IS '작성일자';
COMMENT ON COLUMN ptl_prm_txinv_m.splyamt IS '공급가액';
COMMENT ON COLUMN ptl_prm_txinv_m.txamt IS '세액';
COMMENT ON COLUMN ptl_prm_txinv_m.elctr_txinv_aprv_no IS '전자세금계산서승인번호';
COMMENT ON COLUMN ptl_prm_txinv_m.nts_trnm_dtm IS '국세청전송일시';
COMMENT ON COLUMN ptl_prm_txinv_m.mdfcn_rsn_ty_cd IS '수정사유유형코드';
COMMENT ON COLUMN ptl_prm_txinv_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_txinv_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_txinv_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_txinv_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-011 파트너이력 (목표 400,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_prtnr_h (
  prtnr_no VARCHAR(20) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  rgn_cd VARCHAR(10),
  mgmt_org_cd VARCHAR(10),
  vld_end_dtm TIMESTAMP,
  prtnr_nm VARCHAR(200) NOT NULL,
  prtnr_stts_ty_cd VARCHAR(10) NOT NULL,
  bzmn_txtn_ty_cd VARCHAR(10) NOT NULL,
  rprsv_nm VARCHAR(100),
  prtnr_chg_rsn_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_prtnr_h IS '파트너이력';
COMMENT ON COLUMN ptl_prm_prtnr_h.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_prm_prtnr_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_prm_prtnr_h.rgn_cd IS '지역코드';
COMMENT ON COLUMN ptl_prm_prtnr_h.mgmt_org_cd IS '관리조직코드';
COMMENT ON COLUMN ptl_prm_prtnr_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_prm_prtnr_h.prtnr_nm IS '파트너명';
COMMENT ON COLUMN ptl_prm_prtnr_h.prtnr_stts_ty_cd IS '파트너상태유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_h.bzmn_txtn_ty_cd IS '사업자과세유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_h.rprsv_nm IS '대표자명';
COMMENT ON COLUMN ptl_prm_prtnr_h.prtnr_chg_rsn_ty_cd IS '파트너변경사유유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_prtnr_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_prtnr_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_prtnr_h.lst_rgtr_id IS '최종등록자ID';

-- PRM-012 파트너계약이력 (목표 500,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_prtnr_ctrt_h (
  prtnr_ctrt_no VARCHAR(20) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP,
  prtnr_ctrt_stts_ty_cd VARCHAR(10) NOT NULL,
  ctrt_end_dt CHAR(8),
  stlm_cycl_ty_cd VARCHAR(10) NOT NULL,
  atmt_rnw_yn CHAR(1) NOT NULL,
  prtnr_ctrt_chg_rsn_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_prtnr_ctrt_h IS '파트너계약이력';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.prtnr_ctrt_no IS '파트너계약번호';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.prtnr_ctrt_stts_ty_cd IS '파트너계약상태유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.ctrt_end_dt IS '계약종료일자';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.stlm_cycl_ty_cd IS '정산주기유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.atmt_rnw_yn IS '자동갱신여부';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.prtnr_ctrt_chg_rsn_ty_cd IS '파트너계약변경사유유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_prtnr_ctrt_h.lst_rgtr_id IS '최종등록자ID';

-- PRM-013 파트너계좌상세 (목표 90,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_prtnr_acct_d (
  prtnr_no VARCHAR(20) NOT NULL,
  prtnr_acct_seq NUMERIC(5) NOT NULL,
  bank_cd VARCHAR(10) NOT NULL,
  acct_no_encpt_vl VARCHAR(256) NOT NULL,
  dpsown_nm VARCHAR(100) NOT NULL,
  rprs_acct_yn CHAR(1) NOT NULL,
  acct_rlnm_idntf_yn CHAR(1) NOT NULL,
  vld_bgng_dt CHAR(8) NOT NULL,
  vld_end_dt CHAR(8),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_prtnr_acct_d IS '파트너계좌상세';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.prtnr_acct_seq IS '파트너계좌순번';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.acct_no_encpt_vl IS '계좌번호암호화값';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.dpsown_nm IS '예금주명';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.rprs_acct_yn IS '대표계좌여부';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.acct_rlnm_idntf_yn IS '계좌실명확인여부';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.vld_bgng_dt IS '유효시작일자';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.vld_end_dt IS '유효종료일자';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_prtnr_acct_d.lst_rgtr_id IS '최종등록자ID';

-- PRM-014 파트너담당자상세 (목표 150,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_prtnr_pic_d (
  prtnr_no VARCHAR(20) NOT NULL,
  pic_seq NUMERIC(5) NOT NULL,
  pic_nm VARCHAR(100) NOT NULL,
  pic_ty_cd VARCHAR(10) NOT NULL,
  pic_mbl_telno VARCHAR(20),
  pic_eml_addr VARCHAR(100),
  rprs_pic_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_prtnr_pic_d IS '파트너담당자상세';
COMMENT ON COLUMN ptl_prm_prtnr_pic_d.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_prm_prtnr_pic_d.pic_seq IS '담당자순번';
COMMENT ON COLUMN ptl_prm_prtnr_pic_d.pic_nm IS '담당자명';
COMMENT ON COLUMN ptl_prm_prtnr_pic_d.pic_ty_cd IS '담당자유형코드';
COMMENT ON COLUMN ptl_prm_prtnr_pic_d.pic_mbl_telno IS '담당자휴대전화번호';
COMMENT ON COLUMN ptl_prm_prtnr_pic_d.pic_eml_addr IS '담당자이메일주소';
COMMENT ON COLUMN ptl_prm_prtnr_pic_d.rprs_pic_yn IS '대표담당자여부';
COMMENT ON COLUMN ptl_prm_prtnr_pic_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_prtnr_pic_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_prtnr_pic_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_prtnr_pic_d.lst_rgtr_id IS '최종등록자ID';

-- PRM-015 조직이력 (목표 10,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_org_h (
  org_cd VARCHAR(10) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  up_org_cd VARCHAR(10),
  vld_end_dtm TIMESTAMP,
  org_nm VARCHAR(100) NOT NULL,
  org_stts_ty_cd VARCHAR(10) NOT NULL,
  org_chg_rsn_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_org_h IS '조직이력';
COMMENT ON COLUMN ptl_prm_org_h.org_cd IS '조직코드';
COMMENT ON COLUMN ptl_prm_org_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_prm_org_h.up_org_cd IS '상위조직코드';
COMMENT ON COLUMN ptl_prm_org_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_prm_org_h.org_nm IS '조직명';
COMMENT ON COLUMN ptl_prm_org_h.org_stts_ty_cd IS '조직상태유형코드';
COMMENT ON COLUMN ptl_prm_org_h.org_chg_rsn_ty_cd IS '조직변경사유유형코드';
COMMENT ON COLUMN ptl_prm_org_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_org_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_org_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_org_h.lst_rgtr_id IS '최종등록자ID';

-- PRM-016 단말재고내역 (목표 9,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_eqp_stck_l (
  eqp_stck_no VARCHAR(20) NOT NULL,
  prtnr_no VARCHAR(20) NOT NULL,
  eqp_mdl_cd VARCHAR(20) NOT NULL,
  imei_no VARCHAR(20) NOT NULL,
  eqp_stck_ty_cd VARCHAR(10) NOT NULL,
  eqp_stck_stts_ty_cd VARCHAR(10) NOT NULL,
  wrhs_dtm TIMESTAMP NOT NULL,
  wrhs_amt NUMERIC(15) NOT NULL,
  shpm_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_eqp_stck_l IS '단말재고내역';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.eqp_stck_no IS '단말재고번호';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.eqp_mdl_cd IS '단말모델코드';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.imei_no IS 'IMEI번호';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.eqp_stck_ty_cd IS '단말재고유형코드';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.eqp_stck_stts_ty_cd IS '단말재고상태유형코드';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.wrhs_dtm IS '입고일시';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.wrhs_amt IS '입고금액';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.shpm_dtm IS '출고일시';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_eqp_stck_l.lst_rgtr_id IS '최종등록자ID';

-- PRM-017 유심재고내역 (목표 8,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_usim_stck_l (
  usim_stck_no VARCHAR(20) NOT NULL,
  prtnr_no VARCHAR(20) NOT NULL,
  usim_prod_cd VARCHAR(20) NOT NULL,
  usim_sn VARCHAR(20) NOT NULL,
  usim_stck_stts_ty_cd VARCHAR(10) NOT NULL,
  wrhs_dtm TIMESTAMP NOT NULL,
  shpm_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_usim_stck_l IS '유심재고내역';
COMMENT ON COLUMN ptl_prm_usim_stck_l.usim_stck_no IS '유심재고번호';
COMMENT ON COLUMN ptl_prm_usim_stck_l.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_prm_usim_stck_l.usim_prod_cd IS '유심상품코드';
COMMENT ON COLUMN ptl_prm_usim_stck_l.usim_sn IS '유심일련번호';
COMMENT ON COLUMN ptl_prm_usim_stck_l.usim_stck_stts_ty_cd IS '유심재고상태유형코드';
COMMENT ON COLUMN ptl_prm_usim_stck_l.wrhs_dtm IS '입고일시';
COMMENT ON COLUMN ptl_prm_usim_stck_l.shpm_dtm IS '출고일시';
COMMENT ON COLUMN ptl_prm_usim_stck_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_usim_stck_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_usim_stck_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_usim_stck_l.lst_rgtr_id IS '최종등록자ID';

-- PRM-018 정산상세 [STL] (목표 9,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_stlm_d (
  stlm_no VARCHAR(20) NOT NULL,
  stlm_dtl_seq NUMERIC(5) NOT NULL,
  stlm_itm_ty_cd VARCHAR(10) NOT NULL,
  stlm_nocs NUMERIC(10) NOT NULL,
  stlm_trgt_amt NUMERIC(15) NOT NULL,
  ddtn_amt NUMERIC(15) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_stlm_d IS '정산상세';
COMMENT ON COLUMN ptl_prm_stlm_d.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_stlm_d.stlm_dtl_seq IS '정산상세순번';
COMMENT ON COLUMN ptl_prm_stlm_d.stlm_itm_ty_cd IS '정산항목유형코드';
COMMENT ON COLUMN ptl_prm_stlm_d.stlm_nocs IS '정산건수';
COMMENT ON COLUMN ptl_prm_stlm_d.stlm_trgt_amt IS '정산대상금액';
COMMENT ON COLUMN ptl_prm_stlm_d.ddtn_amt IS '공제금액';
COMMENT ON COLUMN ptl_prm_stlm_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_stlm_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_stlm_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_stlm_d.lst_rgtr_id IS '최종등록자ID';

-- PRM-019 수수료정책기본 [STL] (목표 5,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_fee_plcy_m (
  fee_plcy_no VARCHAR(20) NOT NULL,
  fee_plcy_nm VARCHAR(100) NOT NULL,
  fee_ty_cd VARCHAR(10) NOT NULL,
  fee_plcy_stts_ty_cd VARCHAR(10) NOT NULL,
  aplcn_bgng_dt CHAR(8) NOT NULL,
  aplcn_end_dt CHAR(8),
  fee_plcy_cn VARCHAR(4000),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_fee_plcy_m IS '수수료정책기본';
COMMENT ON COLUMN ptl_prm_fee_plcy_m.fee_plcy_no IS '수수료정책번호';
COMMENT ON COLUMN ptl_prm_fee_plcy_m.fee_plcy_nm IS '수수료정책명';
COMMENT ON COLUMN ptl_prm_fee_plcy_m.fee_ty_cd IS '수수료유형코드';
COMMENT ON COLUMN ptl_prm_fee_plcy_m.fee_plcy_stts_ty_cd IS '수수료정책상태유형코드';
COMMENT ON COLUMN ptl_prm_fee_plcy_m.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_prm_fee_plcy_m.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_prm_fee_plcy_m.fee_plcy_cn IS '수수료정책내용';
COMMENT ON COLUMN ptl_prm_fee_plcy_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_fee_plcy_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_fee_plcy_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_fee_plcy_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-020 수수료요율상세 [STL] (목표 80,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_fee_trf_d (
  fee_plcy_no VARCHAR(20) NOT NULL,
  fee_trf_seq NUMERIC(5) NOT NULL,
  prod_cd VARCHAR(20),
  agnc_grd_ty_cd VARCHAR(10),
  fee_calc_ty_cd VARCHAR(10) NOT NULL,
  fee_rt NUMERIC(5,2),
  fee_amt NUMERIC(15),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_fee_trf_d IS '수수료요율상세';
COMMENT ON COLUMN ptl_prm_fee_trf_d.fee_plcy_no IS '수수료정책번호';
COMMENT ON COLUMN ptl_prm_fee_trf_d.fee_trf_seq IS '수수료요율순번';
COMMENT ON COLUMN ptl_prm_fee_trf_d.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prm_fee_trf_d.agnc_grd_ty_cd IS '대리점등급유형코드';
COMMENT ON COLUMN ptl_prm_fee_trf_d.fee_calc_ty_cd IS '수수료계산유형코드';
COMMENT ON COLUMN ptl_prm_fee_trf_d.fee_rt IS '수수료율';
COMMENT ON COLUMN ptl_prm_fee_trf_d.fee_amt IS '수수료금액';
COMMENT ON COLUMN ptl_prm_fee_trf_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_fee_trf_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_fee_trf_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_fee_trf_d.lst_rgtr_id IS '최종등록자ID';

-- PRM-021 유치수수료내역 [STL] (목표 9,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_atrct_fee_l (
  atrct_fee_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  shop_no VARCHAR(20) NOT NULL,
  fee_plcy_no VARCHAR(20) NOT NULL,
  stlm_no VARCHAR(20),
  fee_ocrn_dt CHAR(8) NOT NULL,
  fee_amt NUMERIC(15) NOT NULL,
  atrct_fee_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_atrct_fee_l IS '유치수수료내역';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.atrct_fee_no IS '유치수수료번호';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.shop_no IS '판매점번호';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.fee_plcy_no IS '수수료정책번호';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.fee_ocrn_dt IS '수수료발생일자';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.fee_amt IS '수수료금액';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.atrct_fee_stts_ty_cd IS '유치수수료상태유형코드';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_atrct_fee_l.lst_rgtr_id IS '최종등록자ID';

-- PRM-022 관리수수료내역 [STL] (목표 40,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_mgmt_fee_l (
  mgmt_fee_no VARCHAR(20) NOT NULL,
  stlm_ym CHAR(6) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  agnc_no VARCHAR(20) NOT NULL,
  fee_plcy_no VARCHAR(20) NOT NULL,
  stlm_no VARCHAR(20),
  fee_trgt_amt NUMERIC(15) NOT NULL,
  fee_rt NUMERIC(5,2) NOT NULL,
  fee_amt NUMERIC(15) NOT NULL,
  mgmt_fee_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
) PARTITION BY RANGE (stlm_ym);
DO $$
DECLARE y INT;
BEGIN
  FOR y IN 2010..2027 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', 'ptl_prm_mgmt_fee_l_p' || y, 'ptl_prm_mgmt_fee_l', y || '01', (y + 1) || '01');
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_prm_mgmt_fee_l_pdflt PARTITION OF ptl_prm_mgmt_fee_l DEFAULT;
COMMENT ON TABLE ptl_prm_mgmt_fee_l IS '관리수수료내역';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.mgmt_fee_no IS '관리수수료번호';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.stlm_ym IS '정산년월';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.agnc_no IS '대리점번호';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.fee_plcy_no IS '수수료정책번호';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.fee_trgt_amt IS '수수료대상금액';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.fee_rt IS '수수료율';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.fee_amt IS '수수료금액';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.mgmt_fee_stts_ty_cd IS '관리수수료상태유형코드';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_mgmt_fee_l.lst_rgtr_id IS '최종등록자ID';

-- PRM-023 수수료환수내역 [STL] (목표 1,500,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_fee_clbk_l (
  fee_clbk_no VARCHAR(20) NOT NULL,
  atrct_fee_no VARCHAR(20) NOT NULL,
  trmn_aply_no VARCHAR(20),
  stlm_no VARCHAR(20),
  fee_clbk_dt CHAR(8) NOT NULL,
  fee_clbk_amt NUMERIC(15) NOT NULL,
  fee_clbk_rsn_ty_cd VARCHAR(10) NOT NULL,
  fee_clbk_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_fee_clbk_l IS '수수료환수내역';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.fee_clbk_no IS '수수료환수번호';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.atrct_fee_no IS '유치수수료번호';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.trmn_aply_no IS '해지신청번호';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.fee_clbk_dt IS '수수료환수일자';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.fee_clbk_amt IS '수수료환수금액';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.fee_clbk_rsn_ty_cd IS '수수료환수사유유형코드';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.fee_clbk_stts_ty_cd IS '수수료환수상태유형코드';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_fee_clbk_l.lst_rgtr_id IS '최종등록자ID';

-- PRM-024 장려금정책기본 [STL] (목표 30,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_incntv_plcy_m (
  incntv_plcy_no VARCHAR(20) NOT NULL,
  eqp_mdl_cd VARCHAR(20),
  prod_cd VARCHAR(20),
  incntv_plcy_nm VARCHAR(100) NOT NULL,
  incntv_ty_cd VARCHAR(10) NOT NULL,
  aplcn_bgng_dt CHAR(8) NOT NULL,
  aplcn_end_dt CHAR(8),
  incntv_amt NUMERIC(15) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_incntv_plcy_m IS '장려금정책기본';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.incntv_plcy_no IS '장려금정책번호';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.eqp_mdl_cd IS '단말모델코드';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.incntv_plcy_nm IS '장려금정책명';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.incntv_ty_cd IS '장려금유형코드';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.incntv_amt IS '장려금금액';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_incntv_plcy_m.lst_rgtr_id IS '최종등록자ID';

-- PRM-025 장려금지급내역 [STL] (목표 8,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_incntv_give_l (
  incntv_give_no VARCHAR(20) NOT NULL,
  incntv_plcy_no VARCHAR(20) NOT NULL,
  prtnr_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20),
  stlm_no VARCHAR(20),
  incntv_ocrn_dt CHAR(8) NOT NULL,
  incntv_amt NUMERIC(15) NOT NULL,
  incntv_give_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_incntv_give_l IS '장려금지급내역';
COMMENT ON COLUMN ptl_prm_incntv_give_l.incntv_give_no IS '장려금지급번호';
COMMENT ON COLUMN ptl_prm_incntv_give_l.incntv_plcy_no IS '장려금정책번호';
COMMENT ON COLUMN ptl_prm_incntv_give_l.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_prm_incntv_give_l.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_prm_incntv_give_l.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_incntv_give_l.incntv_ocrn_dt IS '장려금발생일자';
COMMENT ON COLUMN ptl_prm_incntv_give_l.incntv_amt IS '장려금금액';
COMMENT ON COLUMN ptl_prm_incntv_give_l.incntv_give_stts_ty_cd IS '장려금지급상태유형코드';
COMMENT ON COLUMN ptl_prm_incntv_give_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_incntv_give_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_incntv_give_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_incntv_give_l.lst_rgtr_id IS '최종등록자ID';

-- PRM-026 상호접속요율상세 [STL] (목표 3,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_intcn_trf_d (
  carr_no VARCHAR(20) NOT NULL,
  intcn_ty_cd VARCHAR(10) NOT NULL,
  aplcn_bgng_dt CHAR(8) NOT NULL,
  aplcn_end_dt CHAR(8),
  intcn_rt NUMERIC(5,2) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_intcn_trf_d IS '상호접속요율상세';
COMMENT ON COLUMN ptl_prm_intcn_trf_d.carr_no IS '통신사업자번호';
COMMENT ON COLUMN ptl_prm_intcn_trf_d.intcn_ty_cd IS '상호접속유형코드';
COMMENT ON COLUMN ptl_prm_intcn_trf_d.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_prm_intcn_trf_d.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_prm_intcn_trf_d.intcn_rt IS '상호접속율';
COMMENT ON COLUMN ptl_prm_intcn_trf_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_intcn_trf_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_intcn_trf_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_intcn_trf_d.lst_rgtr_id IS '최종등록자ID';

-- PRM-027 상호접속사용집계 [STL] (목표 200,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_intcn_use_t (
  carr_no VARCHAR(20) NOT NULL,
  stlm_ym CHAR(6) NOT NULL,
  intcn_ty_cd VARCHAR(10) NOT NULL,
  stlm_no VARCHAR(20),
  intcn_nocs NUMERIC(10) NOT NULL,
  intcn_scnt NUMERIC(10) NOT NULL,
  intcn_amt NUMERIC(15) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_intcn_use_t IS '상호접속사용집계';
COMMENT ON COLUMN ptl_prm_intcn_use_t.carr_no IS '통신사업자번호';
COMMENT ON COLUMN ptl_prm_intcn_use_t.stlm_ym IS '정산년월';
COMMENT ON COLUMN ptl_prm_intcn_use_t.intcn_ty_cd IS '상호접속유형코드';
COMMENT ON COLUMN ptl_prm_intcn_use_t.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_intcn_use_t.intcn_nocs IS '상호접속건수';
COMMENT ON COLUMN ptl_prm_intcn_use_t.intcn_scnt IS '상호접속초수';
COMMENT ON COLUMN ptl_prm_intcn_use_t.intcn_amt IS '상호접속금액';
COMMENT ON COLUMN ptl_prm_intcn_use_t.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_intcn_use_t.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_intcn_use_t.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_intcn_use_t.lst_rgtr_id IS '최종등록자ID';

-- PRM-028 로밍정산파일내역 [STL] (목표 6,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_roam_stlm_file_l (
  roam_stlm_file_no VARCHAR(20) NOT NULL,
  roam_bzmn_no VARCHAR(20) NOT NULL,
  roam_stlm_no VARCHAR(20),
  roam_stlm_file_nm VARCHAR(100) NOT NULL,
  roam_stlm_file_ty_cd VARCHAR(10) NOT NULL,
  roam_drct_se_cd VARCHAR(10) NOT NULL,
  roam_stlm_file_seq NUMERIC(10) NOT NULL,
  roam_stlm_file_prcs_dtm TIMESTAMP NOT NULL,
  rcrd_nocs NUMERIC(10) NOT NULL,
  stlm_crncy_amt NUMERIC(18,4) NOT NULL,
  roam_stlm_file_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_roam_stlm_file_l IS '로밍정산파일내역';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.roam_stlm_file_no IS '로밍정산파일번호';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.roam_bzmn_no IS '로밍사업자번호';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.roam_stlm_no IS '로밍정산번호';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.roam_stlm_file_nm IS '로밍정산파일명';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.roam_stlm_file_ty_cd IS '로밍정산파일유형코드';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.roam_drct_se_cd IS '로밍방향구분코드';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.roam_stlm_file_seq IS '로밍정산파일순번';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.roam_stlm_file_prcs_dtm IS '로밍정산파일처리일시';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.rcrd_nocs IS '레코드건수';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.stlm_crncy_amt IS '정산통화금액';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.roam_stlm_file_stts_ty_cd IS '로밍정산파일상태유형코드';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_roam_stlm_file_l.lst_rgtr_id IS '최종등록자ID';

-- PRM-029 로밍정산내역 [STL] (목표 500,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_roam_stlm_l (
  roam_stlm_no VARCHAR(20) NOT NULL,
  roam_bzmn_no VARCHAR(20) NOT NULL,
  stlm_no VARCHAR(20),
  stlm_ym CHAR(6) NOT NULL,
  roam_drct_se_cd VARCHAR(10) NOT NULL,
  stlm_crncy_amt NUMERIC(18,4) NOT NULL,
  aplcn_exrt NUMERIC(15,4) NOT NULL,
  roam_stlm_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_roam_stlm_l IS '로밍정산내역';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.roam_stlm_no IS '로밍정산번호';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.roam_bzmn_no IS '로밍사업자번호';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.stlm_ym IS '정산년월';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.roam_drct_se_cd IS '로밍방향구분코드';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.stlm_crncy_amt IS '정산통화금액';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.aplcn_exrt IS '적용환율';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.roam_stlm_stts_ty_cd IS '로밍정산상태유형코드';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_roam_stlm_l.lst_rgtr_id IS '최종등록자ID';

-- PRM-030 콘텐츠정산내역 [STL] (목표 1,600,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_cnts_stlm_l (
  cnts_stlm_no VARCHAR(20) NOT NULL,
  cnts_prvd_co_no VARCHAR(20) NOT NULL,
  stlm_no VARCHAR(20),
  stlm_ym CHAR(6) NOT NULL,
  pymt_nocs NUMERIC(10) NOT NULL,
  bill_amt NUMERIC(15) NOT NULL,
  rcv_amt NUMERIC(15) NOT NULL,
  stlm_fee_amt NUMERIC(15) NOT NULL,
  cnts_stlm_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_cnts_stlm_l IS '콘텐츠정산내역';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.cnts_stlm_no IS '콘텐츠정산번호';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.cnts_prvd_co_no IS '콘텐츠제공사번호';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.stlm_ym IS '정산년월';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.pymt_nocs IS '결제건수';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.bill_amt IS '청구금액';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.rcv_amt IS '수납금액';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.stlm_fee_amt IS '정산수수료금액';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.cnts_stlm_stts_ty_cd IS '콘텐츠정산상태유형코드';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_cnts_stlm_l.lst_rgtr_id IS '최종등록자ID';

-- PRM-031 정산지급내역 [STL] (목표 4,200,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_stlm_give_l (
  stlm_no VARCHAR(20) NOT NULL,
  stlm_give_seq NUMERIC(5) NOT NULL,
  prtnr_no VARCHAR(20),
  prtnr_acct_seq NUMERIC(5),
  stlm_give_dtm TIMESTAMP NOT NULL,
  stlm_give_amt NUMERIC(15) NOT NULL,
  stlm_give_mthd_ty_cd VARCHAR(10) NOT NULL,
  stlm_give_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_stlm_give_l IS '정산지급내역';
COMMENT ON COLUMN ptl_prm_stlm_give_l.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_stlm_give_l.stlm_give_seq IS '정산지급순번';
COMMENT ON COLUMN ptl_prm_stlm_give_l.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_prm_stlm_give_l.prtnr_acct_seq IS '파트너계좌순번';
COMMENT ON COLUMN ptl_prm_stlm_give_l.stlm_give_dtm IS '정산지급일시';
COMMENT ON COLUMN ptl_prm_stlm_give_l.stlm_give_amt IS '정산지급금액';
COMMENT ON COLUMN ptl_prm_stlm_give_l.stlm_give_mthd_ty_cd IS '정산지급방법유형코드';
COMMENT ON COLUMN ptl_prm_stlm_give_l.stlm_give_stts_ty_cd IS '정산지급상태유형코드';
COMMENT ON COLUMN ptl_prm_stlm_give_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_stlm_give_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_stlm_give_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_stlm_give_l.lst_rgtr_id IS '최종등록자ID';

-- PRM-032 정산확정이력 [STL] (목표 9,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_stlm_cfmtn_h (
  stlm_no VARCHAR(20) NOT NULL,
  stlm_cfmtn_hist_seq NUMERIC(5) NOT NULL,
  stlm_stts_ty_cd VARCHAR(10) NOT NULL,
  prcs_dtm TIMESTAMP NOT NULL,
  stlm_trgt_amt NUMERIC(15) NOT NULL,
  objc_cn VARCHAR(4000),
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_stlm_cfmtn_h IS '정산확정이력';
COMMENT ON COLUMN ptl_prm_stlm_cfmtn_h.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_prm_stlm_cfmtn_h.stlm_cfmtn_hist_seq IS '정산확정이력순번';
COMMENT ON COLUMN ptl_prm_stlm_cfmtn_h.stlm_stts_ty_cd IS '정산상태유형코드';
COMMENT ON COLUMN ptl_prm_stlm_cfmtn_h.prcs_dtm IS '처리일시';
COMMENT ON COLUMN ptl_prm_stlm_cfmtn_h.stlm_trgt_amt IS '정산대상금액';
COMMENT ON COLUMN ptl_prm_stlm_cfmtn_h.objc_cn IS '이의내용';
COMMENT ON COLUMN ptl_prm_stlm_cfmtn_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_stlm_cfmtn_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_stlm_cfmtn_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_stlm_cfmtn_h.lst_rgtr_id IS '최종등록자ID';

-- PRM-033 세금계산서상세 [STL] (목표 7,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_txinv_d (
  txinv_no VARCHAR(20) NOT NULL,
  txinv_dtl_seq NUMERIC(5) NOT NULL,
  txinv_prdlst_nm VARCHAR(200) NOT NULL,
  splyamt NUMERIC(15) NOT NULL,
  txamt NUMERIC(15) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_txinv_d IS '세금계산서상세';
COMMENT ON COLUMN ptl_prm_txinv_d.txinv_no IS '세금계산서번호';
COMMENT ON COLUMN ptl_prm_txinv_d.txinv_dtl_seq IS '세금계산서상세순번';
COMMENT ON COLUMN ptl_prm_txinv_d.txinv_prdlst_nm IS '세금계산서품목명';
COMMENT ON COLUMN ptl_prm_txinv_d.splyamt IS '공급가액';
COMMENT ON COLUMN ptl_prm_txinv_d.txamt IS '세액';
COMMENT ON COLUMN ptl_prm_txinv_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_txinv_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_txinv_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_txinv_d.lst_rgtr_id IS '최종등록자ID';

-- PRM-034 정산월통계 [STL] (목표 20,000행)
CREATE TABLE IF NOT EXISTS ptl_prm_stlm_mm_s (
  stlm_ym CHAR(6) NOT NULL,
  stlm_ty_cd VARCHAR(10) NOT NULL,
  prtnr_ty_cd VARCHAR(10) NOT NULL,
  stlm_nocs NUMERIC(10) NOT NULL,
  stlm_trgt_amt NUMERIC(15) NOT NULL,
  ddtn_amt NUMERIC(15) NOT NULL,
  splyamt NUMERIC(15) NOT NULL,
  vat_amt NUMERIC(15) NOT NULL,
  lst_mddtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_mdfr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL,
  lst_rgdtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  lst_rgtr_id VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL
);
COMMENT ON TABLE ptl_prm_stlm_mm_s IS '정산월통계';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.stlm_ym IS '정산년월';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.stlm_ty_cd IS '정산유형코드';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.prtnr_ty_cd IS '파트너유형코드';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.stlm_nocs IS '정산건수';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.stlm_trgt_amt IS '정산대상금액';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.ddtn_amt IS '공제금액';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.splyamt IS '공급가액';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.vat_amt IS '부가가치세금액';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prm_stlm_mm_s.lst_rgtr_id IS '최종등록자ID';
