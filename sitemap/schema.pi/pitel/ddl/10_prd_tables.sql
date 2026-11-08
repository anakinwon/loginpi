-- 10_prd_tables.sql — Pi통신 과금 시스템 상품(PRD) 주제영역 테이블 30개 (PostgreSQL 17)
-- 정본 model/physical/PRD.json · PK·인덱스는 적재 뒤 10_prd_constraints.sql(D14) · FK 제약 없음(D6) · 파티션 없음(P1)
-- 실행 : psql -v ON_ERROR_STOP=1 -f 10_prd_tables.sql (search_path 대상 스키마에 생성, 재실행 안전)

-- PRD-001 상품기본 (목표 20,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_prod_m (
  prod_cd                          VARCHAR(20) NOT NULL,
  bas_chrg_itm_cd                  VARCHAR(10),
  prod_nm                          VARCHAR(200) NOT NULL,
  prod_reg_dtm                     TIMESTAMP NOT NULL,
  prod_stts_ty_cd                  VARCHAR(10) NOT NULL,
  prod_ty_cd                       VARCHAR(10) NOT NULL,
  svc_ntwk_ty_cd                   VARCHAR(10) NOT NULL,
  sbsc_trgt_ty_cd                  VARCHAR(10) NOT NULL,
  sale_bgng_dt                     CHAR(8) NOT NULL,
  sale_end_dt                      CHAR(8),
  mm_fxamt_amt                     NUMERIC(15),
  vat_incl_yn                      CHAR(1) NOT NULL,
  prod_cn                          VARCHAR(4000),
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_prod_m IS '상품기본';
COMMENT ON COLUMN ptl_prd_prod_m.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_prod_m.bas_chrg_itm_cd IS '기본요금항목코드';
COMMENT ON COLUMN ptl_prd_prod_m.prod_nm IS '상품명';
COMMENT ON COLUMN ptl_prd_prod_m.prod_reg_dtm IS '상품등록일시';
COMMENT ON COLUMN ptl_prd_prod_m.prod_stts_ty_cd IS '상품상태유형코드';
COMMENT ON COLUMN ptl_prd_prod_m.prod_ty_cd IS '상품유형코드';
COMMENT ON COLUMN ptl_prd_prod_m.svc_ntwk_ty_cd IS '서비스망유형코드';
COMMENT ON COLUMN ptl_prd_prod_m.sbsc_trgt_ty_cd IS '가입대상유형코드';
COMMENT ON COLUMN ptl_prd_prod_m.sale_bgng_dt IS '판매시작일자';
COMMENT ON COLUMN ptl_prd_prod_m.sale_end_dt IS '판매종료일자';
COMMENT ON COLUMN ptl_prd_prod_m.mm_fxamt_amt IS '월정액금액';
COMMENT ON COLUMN ptl_prd_prod_m.vat_incl_yn IS '부가가치세포함여부';
COMMENT ON COLUMN ptl_prd_prod_m.prod_cn IS '상품내용';
COMMENT ON COLUMN ptl_prd_prod_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_prod_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_prod_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_prod_m.lst_rgtr_id IS '최종등록자ID';

-- PRD-002 요금제기본 (목표 3,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_rtpln_m (
  prod_cd                          VARCHAR(20) NOT NULL,
  rtpln_pbanc_nm                   VARCHAR(200) NOT NULL,
  rtpln_reg_dtm                    TIMESTAMP NOT NULL,
  rtpln_trms_dclr_stts_ty_cd       VARCHAR(10) NOT NULL,
  rtpln_ty_cd                      VARCHAR(10) NOT NULL,
  chc_agrmt_dscnt_trgt_yn          CHAR(1) NOT NULL,
  trms_dclr_dt                     CHAR(8),
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_rtpln_m IS '요금제기본';
COMMENT ON COLUMN ptl_prd_rtpln_m.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_rtpln_m.rtpln_pbanc_nm IS '요금제공시명';
COMMENT ON COLUMN ptl_prd_rtpln_m.rtpln_reg_dtm IS '요금제등록일시';
COMMENT ON COLUMN ptl_prd_rtpln_m.rtpln_trms_dclr_stts_ty_cd IS '요금제약관신고상태유형코드';
COMMENT ON COLUMN ptl_prd_rtpln_m.rtpln_ty_cd IS '요금제유형코드';
COMMENT ON COLUMN ptl_prd_rtpln_m.chc_agrmt_dscnt_trgt_yn IS '선택약정할인대상여부';
COMMENT ON COLUMN ptl_prd_rtpln_m.trms_dclr_dt IS '약관신고일자';
COMMENT ON COLUMN ptl_prd_rtpln_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_rtpln_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_rtpln_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_rtpln_m.lst_rgtr_id IS '최종등록자ID';

-- PRD-003 부가서비스기본 (목표 10,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_adsvc_m (
  prod_cd                          VARCHAR(20) NOT NULL,
  cnts_prvd_co_no                  VARCHAR(20),
  adsvc_pbanc_nm                   VARCHAR(200) NOT NULL,
  adsvc_reg_dtm                    TIMESTAMP NOT NULL,
  adsvc_ntwk_lnk_stts_ty_cd        VARCHAR(10) NOT NULL,
  adsvc_ty_cd                      VARCHAR(10) NOT NULL,
  rat_schm_ty_cd                   VARCHAR(10) NOT NULL,
  ntwk_svc_no                      VARCHAR(20),
  free_prvd_mcnt                   NUMERIC(5),
  dup_sbsc_psbl_yn                 CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_adsvc_m IS '부가서비스기본';
COMMENT ON COLUMN ptl_prd_adsvc_m.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_adsvc_m.cnts_prvd_co_no IS '콘텐츠제공사번호';
COMMENT ON COLUMN ptl_prd_adsvc_m.adsvc_pbanc_nm IS '부가서비스공시명';
COMMENT ON COLUMN ptl_prd_adsvc_m.adsvc_reg_dtm IS '부가서비스등록일시';
COMMENT ON COLUMN ptl_prd_adsvc_m.adsvc_ntwk_lnk_stts_ty_cd IS '부가서비스망연동상태유형코드';
COMMENT ON COLUMN ptl_prd_adsvc_m.adsvc_ty_cd IS '부가서비스유형코드';
COMMENT ON COLUMN ptl_prd_adsvc_m.rat_schm_ty_cd IS '과금방식유형코드';
COMMENT ON COLUMN ptl_prd_adsvc_m.ntwk_svc_no IS '망서비스번호';
COMMENT ON COLUMN ptl_prd_adsvc_m.free_prvd_mcnt IS '무료제공개월수';
COMMENT ON COLUMN ptl_prd_adsvc_m.dup_sbsc_psbl_yn IS '중복가입가능여부';
COMMENT ON COLUMN ptl_prd_adsvc_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_adsvc_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_adsvc_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_adsvc_m.lst_rgtr_id IS '최종등록자ID';

-- PRD-004 할인상품기본 (목표 4,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_dscnt_prod_m (
  prod_cd                          VARCHAR(20) NOT NULL,
  dscnt_trgt_chrg_itm_cd           VARCHAR(10),
  dscnt_chrg_itm_cd                VARCHAR(10) NOT NULL,
  alnc_prtnr_no                    VARCHAR(20),
  dscnt_pbanc_nm                   VARCHAR(200) NOT NULL,
  dscnt_prod_reg_dtm               TIMESTAMP NOT NULL,
  dscnt_aprv_stts_ty_cd            VARCHAR(10) NOT NULL,
  dscnt_ty_cd                      VARCHAR(10) NOT NULL,
  dscnt_schm_ty_cd                 VARCHAR(10) NOT NULL,
  dscnt_rt                         NUMERIC(5,2),
  dscnt_amt                        NUMERIC(15),
  dscnt_lmt_amt                    NUMERIC(15),
  dup_dscnt_psbl_yn                CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_dscnt_prod_m IS '할인상품기본';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.dscnt_trgt_chrg_itm_cd IS '할인대상요금항목코드';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.dscnt_chrg_itm_cd IS '할인요금항목코드';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.alnc_prtnr_no IS '제휴파트너번호';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.dscnt_pbanc_nm IS '할인공시명';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.dscnt_prod_reg_dtm IS '할인상품등록일시';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.dscnt_aprv_stts_ty_cd IS '할인승인상태유형코드';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.dscnt_ty_cd IS '할인유형코드';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.dscnt_schm_ty_cd IS '할인방식유형코드';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.dscnt_rt IS '할인율';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.dscnt_amt IS '할인금액';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.dscnt_lmt_amt IS '할인한도금액';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.dup_dscnt_psbl_yn IS '중복할인가능여부';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_dscnt_prod_m.lst_rgtr_id IS '최종등록자ID';

-- PRD-005 결합상품기본 (목표 500행)
CREATE TABLE IF NOT EXISTS ptl_prd_cmbn_prod_m (
  prod_cd                          VARCHAR(20) NOT NULL,
  cmbn_dscnt_prod_cd               VARCHAR(20),
  cmbn_prod_pbanc_nm               VARCHAR(200) NOT NULL,
  cmbn_prod_reg_dtm                TIMESTAMP NOT NULL,
  cmbn_prod_oper_stts_ty_cd        VARCHAR(10) NOT NULL,
  cmbn_ty_cd                       VARCHAR(10) NOT NULL,
  min_cmbn_line_cnt                NUMERIC(5) NOT NULL,
  max_cmbn_line_cnt                NUMERIC(5) NOT NULL,
  cmbn_dscnt_allc_schm_ty_cd       VARCHAR(10) NOT NULL,
  fmly_rel_idntf_need_yn           CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_cmbn_prod_m IS '결합상품기본';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.cmbn_dscnt_prod_cd IS '결합할인상품코드';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.cmbn_prod_pbanc_nm IS '결합상품공시명';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.cmbn_prod_reg_dtm IS '결합상품등록일시';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.cmbn_prod_oper_stts_ty_cd IS '결합상품운영상태유형코드';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.cmbn_ty_cd IS '결합유형코드';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.min_cmbn_line_cnt IS '최소결합회선수';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.max_cmbn_line_cnt IS '최대결합회선수';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.cmbn_dscnt_allc_schm_ty_cd IS '결합할인배분방식유형코드';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.fmly_rel_idntf_need_yn IS '가족관계확인필요여부';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_cmbn_prod_m.lst_rgtr_id IS '최종등록자ID';

-- PRD-006 약정상품기본 (목표 300행)
CREATE TABLE IF NOT EXISTS ptl_prd_agrmt_prod_m (
  prod_cd                          VARCHAR(20) NOT NULL,
  lnkg_dscnt_prod_cd               VARCHAR(20),
  agrmt_prod_pbanc_nm              VARCHAR(200) NOT NULL,
  agrmt_prod_reg_dtm               TIMESTAMP NOT NULL,
  agrmt_prod_oper_stts_ty_cd       VARCHAR(10) NOT NULL,
  agrmt_ty_cd                      VARCHAR(10) NOT NULL,
  agrmt_mcnt                       NUMERIC(5) NOT NULL,
  pnlt_asmt_schm_ty_cd             VARCHAR(10) NOT NULL,
  pnlt_uplmt_amt                   NUMERIC(15),
  re_agrmt_psbl_yn                 CHAR(1) NOT NULL,
  agrmt_scsn_psbl_yn               CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_agrmt_prod_m IS '약정상품기본';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.lnkg_dscnt_prod_cd IS '연계할인상품코드';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.agrmt_prod_pbanc_nm IS '약정상품공시명';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.agrmt_prod_reg_dtm IS '약정상품등록일시';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.agrmt_prod_oper_stts_ty_cd IS '약정상품운영상태유형코드';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.agrmt_ty_cd IS '약정유형코드';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.agrmt_mcnt IS '약정개월수';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.pnlt_asmt_schm_ty_cd IS '위약금산정방식유형코드';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.pnlt_uplmt_amt IS '위약금상한금액';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.re_agrmt_psbl_yn IS '재약정가능여부';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.agrmt_scsn_psbl_yn IS '약정승계가능여부';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_agrmt_prod_m.lst_rgtr_id IS '최종등록자ID';

-- PRD-007 단말모델기본 (목표 5,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_eqp_mdl_m (
  eqp_mdl_cd                       VARCHAR(20) NOT NULL,
  eqp_mdl_nm                       VARCHAR(100) NOT NULL,
  eqp_mdl_reg_dtm                  TIMESTAMP NOT NULL,
  eqp_mdl_sale_stts_ty_cd          VARCHAR(10) NOT NULL,
  mnfct_co_ty_cd                   VARCHAR(10) NOT NULL,
  eqp_ty_cd                        VARCHAR(10) NOT NULL,
  svc_ntwk_ty_cd                   VARCHAR(10) NOT NULL,
  lnch_dt                          CHAR(8) NOT NULL,
  eqp_shpm_prc                     NUMERIC(15) NOT NULL,
  esim_sprt_yn                     CHAR(1) NOT NULL,
  slfsply_yn                       CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_eqp_mdl_m IS '단말모델기본';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.eqp_mdl_cd IS '단말모델코드';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.eqp_mdl_nm IS '단말모델명';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.eqp_mdl_reg_dtm IS '단말모델등록일시';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.eqp_mdl_sale_stts_ty_cd IS '단말모델판매상태유형코드';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.mnfct_co_ty_cd IS '제조사유형코드';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.eqp_ty_cd IS '단말유형코드';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.svc_ntwk_ty_cd IS '서비스망유형코드';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.lnch_dt IS '출시일자';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.eqp_shpm_prc IS '단말출고가격';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.esim_sprt_yn IS 'eSIM지원여부';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.slfsply_yn IS '자급제여부';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_eqp_mdl_m.lst_rgtr_id IS '최종등록자ID';

-- PRD-008 유심상품기본 (목표 200행)
CREATE TABLE IF NOT EXISTS ptl_prd_usim_prod_m (
  prod_cd                          VARCHAR(20) NOT NULL,
  usim_prod_pbanc_nm               VARCHAR(200) NOT NULL,
  usim_prod_reg_dtm                TIMESTAMP NOT NULL,
  usim_prod_sply_stts_ty_cd        VARCHAR(10) NOT NULL,
  usim_knd_cd                      VARCHAR(10) NOT NULL,
  usim_form_ty_cd                  VARCHAR(10) NOT NULL,
  usim_sale_prc                    NUMERIC(15) NOT NULL,
  nfc_sprt_yn                      CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_usim_prod_m IS '유심상품기본';
COMMENT ON COLUMN ptl_prd_usim_prod_m.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_usim_prod_m.usim_prod_pbanc_nm IS '유심상품공시명';
COMMENT ON COLUMN ptl_prd_usim_prod_m.usim_prod_reg_dtm IS '유심상품등록일시';
COMMENT ON COLUMN ptl_prd_usim_prod_m.usim_prod_sply_stts_ty_cd IS '유심상품공급상태유형코드';
COMMENT ON COLUMN ptl_prd_usim_prod_m.usim_knd_cd IS '유심종류코드';
COMMENT ON COLUMN ptl_prd_usim_prod_m.usim_form_ty_cd IS '유심형태유형코드';
COMMENT ON COLUMN ptl_prd_usim_prod_m.usim_sale_prc IS '유심판매가격';
COMMENT ON COLUMN ptl_prd_usim_prod_m.nfc_sprt_yn IS 'NFC지원여부';
COMMENT ON COLUMN ptl_prd_usim_prod_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_usim_prod_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_usim_prod_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_usim_prod_m.lst_rgtr_id IS '최종등록자ID';

-- PRD-009 요금항목코드 (목표 2,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_chrg_itm_c (
  chrg_itm_cd                      VARCHAR(10) NOT NULL,
  chrg_itm_clsf_cd                 VARCHAR(10) NOT NULL,
  chrg_itm_nm                      VARCHAR(100) NOT NULL,
  chrg_itm_reg_dtm                 TIMESTAMP NOT NULL,
  chrg_itm_use_stts_ty_cd          VARCHAR(10) NOT NULL,
  chrg_itm_ty_cd                   VARCHAR(10) NOT NULL,
  txtn_ty_cd                       VARCHAR(10) NOT NULL,
  invc_outpt_seq                   NUMERIC(5) NOT NULL,
  rcv_allc_prrt                    NUMERIC(5) NOT NULL,
  dscnt_trgt_yn                    CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_chrg_itm_c IS '요금항목코드';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.chrg_itm_cd IS '요금항목코드';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.chrg_itm_clsf_cd IS '요금항목분류코드';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.chrg_itm_nm IS '요금항목명';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.chrg_itm_reg_dtm IS '요금항목등록일시';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.chrg_itm_use_stts_ty_cd IS '요금항목사용상태유형코드';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.chrg_itm_ty_cd IS '요금항목유형코드';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.txtn_ty_cd IS '과세유형코드';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.invc_outpt_seq IS '청구서출력순번';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.rcv_allc_prrt IS '수납배분우선순위';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.dscnt_trgt_yn IS '할인대상여부';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_chrg_itm_c.lst_rgtr_id IS '최종등록자ID';

-- PRD-010 상품가격이력 (목표 200,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_prod_prc_h (
  prod_cd                          VARCHAR(20) NOT NULL,
  prc_aplcn_bgng_dtm               TIMESTAMP NOT NULL,
  aplcn_prod_nm                    VARCHAR(200) NOT NULL,
  prc_chg_dtm                      TIMESTAMP NOT NULL,
  prc_aplcn_stts_ty_cd             VARCHAR(10) NOT NULL,
  prc_aplcn_end_dtm                TIMESTAMP,
  mm_fxamt_amt                     NUMERIC(15) NOT NULL,
  prc_chg_rsn_ty_cd                VARCHAR(10) NOT NULL,
  vat_incl_yn                      CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_prod_prc_h IS '상품가격이력';
COMMENT ON COLUMN ptl_prd_prod_prc_h.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_prod_prc_h.prc_aplcn_bgng_dtm IS '가격적용시작일시';
COMMENT ON COLUMN ptl_prd_prod_prc_h.aplcn_prod_nm IS '적용상품명';
COMMENT ON COLUMN ptl_prd_prod_prc_h.prc_chg_dtm IS '가격변경일시';
COMMENT ON COLUMN ptl_prd_prod_prc_h.prc_aplcn_stts_ty_cd IS '가격적용상태유형코드';
COMMENT ON COLUMN ptl_prd_prod_prc_h.prc_aplcn_end_dtm IS '가격적용종료일시';
COMMENT ON COLUMN ptl_prd_prod_prc_h.mm_fxamt_amt IS '월정액금액';
COMMENT ON COLUMN ptl_prd_prod_prc_h.prc_chg_rsn_ty_cd IS '가격변경사유유형코드';
COMMENT ON COLUMN ptl_prd_prod_prc_h.vat_incl_yn IS '부가가치세포함여부';
COMMENT ON COLUMN ptl_prd_prod_prc_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_prod_prc_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_prod_prc_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_prod_prc_h.lst_rgtr_id IS '최종등록자ID';

-- PRD-011 상품구성관계 (목표 30,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_prod_cmps_r (
  up_prod_cd                       VARCHAR(20) NOT NULL,
  cmps_prod_cd                     VARCHAR(20) NOT NULL,
  cmps_need_yn                     CHAR(1) NOT NULL,
  cmps_prod_cnt                    NUMERIC(5) NOT NULL,
  aplcn_bgng_dt                    CHAR(8) NOT NULL,
  aplcn_end_dt                     CHAR(8),
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_prod_cmps_r IS '상품구성관계';
COMMENT ON COLUMN ptl_prd_prod_cmps_r.up_prod_cd IS '상위상품코드';
COMMENT ON COLUMN ptl_prd_prod_cmps_r.cmps_prod_cd IS '구성상품코드';
COMMENT ON COLUMN ptl_prd_prod_cmps_r.cmps_need_yn IS '구성필요여부';
COMMENT ON COLUMN ptl_prd_prod_cmps_r.cmps_prod_cnt IS '구성상품수';
COMMENT ON COLUMN ptl_prd_prod_cmps_r.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_prd_prod_cmps_r.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_prd_prod_cmps_r.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_prod_cmps_r.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_prod_cmps_r.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_prod_cmps_r.lst_rgtr_id IS '최종등록자ID';

-- PRD-012 상품배타관계 (목표 50,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_prod_excln_r (
  std_prod_cd                      VARCHAR(20) NOT NULL,
  trgt_prod_cd                     VARCHAR(20) NOT NULL,
  excln_rel_ty_cd                  VARCHAR(10) NOT NULL,
  aplcn_bgng_dt                    CHAR(8) NOT NULL,
  aplcn_end_dt                     CHAR(8),
  excln_rsn_cn                     VARCHAR(200),
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_prod_excln_r IS '상품배타관계';
COMMENT ON COLUMN ptl_prd_prod_excln_r.std_prod_cd IS '기준상품코드';
COMMENT ON COLUMN ptl_prd_prod_excln_r.trgt_prod_cd IS '대상상품코드';
COMMENT ON COLUMN ptl_prd_prod_excln_r.excln_rel_ty_cd IS '배타관계유형코드';
COMMENT ON COLUMN ptl_prd_prod_excln_r.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_prd_prod_excln_r.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_prd_prod_excln_r.excln_rsn_cn IS '배타사유내용';
COMMENT ON COLUMN ptl_prd_prod_excln_r.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_prod_excln_r.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_prod_excln_r.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_prod_excln_r.lst_rgtr_id IS '최종등록자ID';

-- PRD-013 요금제기본제공상세 (목표 15,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_rtpln_bscprvd_d (
  prod_cd                          VARCHAR(20) NOT NULL,
  use_svc_ty_cd                    VARCHAR(10) NOT NULL,
  use_unit_ty_cd                   VARCHAR(10) NOT NULL,
  bscprvd_qty                      NUMERIC(18),
  unlmt_yn                         CHAR(1) NOT NULL,
  cyov_psbl_yn                     CHAR(1) NOT NULL,
  exhst_aftr_rstr_spd_vl           NUMERIC(10),
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_rtpln_bscprvd_d IS '요금제기본제공상세';
COMMENT ON COLUMN ptl_prd_rtpln_bscprvd_d.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_rtpln_bscprvd_d.use_svc_ty_cd IS '사용서비스유형코드';
COMMENT ON COLUMN ptl_prd_rtpln_bscprvd_d.use_unit_ty_cd IS '사용단위유형코드';
COMMENT ON COLUMN ptl_prd_rtpln_bscprvd_d.bscprvd_qty IS '기본제공량';
COMMENT ON COLUMN ptl_prd_rtpln_bscprvd_d.unlmt_yn IS '무제한여부';
COMMENT ON COLUMN ptl_prd_rtpln_bscprvd_d.cyov_psbl_yn IS '이월가능여부';
COMMENT ON COLUMN ptl_prd_rtpln_bscprvd_d.exhst_aftr_rstr_spd_vl IS '소진후제한속도값';
COMMENT ON COLUMN ptl_prd_rtpln_bscprvd_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_rtpln_bscprvd_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_rtpln_bscprvd_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_rtpln_bscprvd_d.lst_rgtr_id IS '최종등록자ID';

-- PRD-014 요금제초과요율상세 (목표 60,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_rtpln_excs_trf_d (
  prod_cd                          VARCHAR(20) NOT NULL,
  rat_zone_cd                      VARCHAR(10) NOT NULL,
  use_svc_ty_cd                    VARCHAR(10) NOT NULL,
  trf_aplcn_bgng_dt                CHAR(8) NOT NULL,
  chrg_itm_cd                      VARCHAR(10) NOT NULL,
  trf_aplcn_end_dt                 CHAR(8),
  use_unit_ty_cd                   VARCHAR(10) NOT NULL,
  rat_unit_vl                      NUMERIC(10) NOT NULL,
  unit_chrg_amt                    NUMERIC(15) NOT NULL,
  excs_chrg_uplmt_amt              NUMERIC(15),
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_rtpln_excs_trf_d IS '요금제초과요율상세';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.rat_zone_cd IS '과금권역코드';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.use_svc_ty_cd IS '사용서비스유형코드';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.trf_aplcn_bgng_dt IS '요율적용시작일자';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.chrg_itm_cd IS '요금항목코드';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.trf_aplcn_end_dt IS '요율적용종료일자';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.use_unit_ty_cd IS '사용단위유형코드';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.rat_unit_vl IS '과금단위값';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.unit_chrg_amt IS '단위요금금액';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.excs_chrg_uplmt_amt IS '초과요금상한금액';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_rtpln_excs_trf_d.lst_rgtr_id IS '최종등록자ID';

-- PRD-015 과금권역코드 (목표 200행)
CREATE TABLE IF NOT EXISTS ptl_prd_rat_zone_c (
  rat_zone_cd                      VARCHAR(10) NOT NULL,
  up_rat_zone_cd                   VARCHAR(10),
  rat_zone_nm                      VARCHAR(100) NOT NULL,
  rat_zone_ty_cd                   VARCHAR(10) NOT NULL,
  rat_zone_reg_dtm                 TIMESTAMP NOT NULL,
  use_yn                           CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_rat_zone_c IS '과금권역코드';
COMMENT ON COLUMN ptl_prd_rat_zone_c.rat_zone_cd IS '과금권역코드';
COMMENT ON COLUMN ptl_prd_rat_zone_c.up_rat_zone_cd IS '상위과금권역코드';
COMMENT ON COLUMN ptl_prd_rat_zone_c.rat_zone_nm IS '과금권역명';
COMMENT ON COLUMN ptl_prd_rat_zone_c.rat_zone_ty_cd IS '과금권역유형코드';
COMMENT ON COLUMN ptl_prd_rat_zone_c.rat_zone_reg_dtm IS '과금권역등록일시';
COMMENT ON COLUMN ptl_prd_rat_zone_c.use_yn IS '사용여부';
COMMENT ON COLUMN ptl_prd_rat_zone_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_rat_zone_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_rat_zone_c.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_rat_zone_c.lst_rgtr_id IS '최종등록자ID';

-- PRD-016 시간대요율상세 (목표 5,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_tmbnd_trf_d (
  rat_zone_cd                      VARCHAR(10) NOT NULL,
  use_svc_ty_cd                    VARCHAR(10) NOT NULL,
  tmbnd_ty_cd                      VARCHAR(10) NOT NULL,
  trf_aplcn_bgng_dt                CHAR(8) NOT NULL,
  trf_aplcn_end_dt                 CHAR(8),
  bgng_hr_vl                       NUMERIC(10) NOT NULL,
  end_hr_vl                        NUMERIC(10) NOT NULL,
  tmbnd_adtn_rt                    NUMERIC(5,2) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_tmbnd_trf_d IS '시간대요율상세';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.rat_zone_cd IS '과금권역코드';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.use_svc_ty_cd IS '사용서비스유형코드';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.tmbnd_ty_cd IS '시간대유형코드';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.trf_aplcn_bgng_dt IS '요율적용시작일자';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.trf_aplcn_end_dt IS '요율적용종료일자';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.bgng_hr_vl IS '시작시간값';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.end_hr_vl IS '종료시간값';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.tmbnd_adtn_rt IS '시간대가산율';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_tmbnd_trf_d.lst_rgtr_id IS '최종등록자ID';

-- PRD-017 로밍국가코드 (목표 250행)
CREATE TABLE IF NOT EXISTS ptl_prd_roam_natn_c (
  natn_cd                          VARCHAR(10) NOT NULL,
  natn_nm                          VARCHAR(100) NOT NULL,
  eng_natn_nm                      VARCHAR(100) NOT NULL,
  roam_zone_ty_cd                  VARCHAR(10) NOT NULL,
  natn_no                          VARCHAR(20) NOT NULL,
  crncy_cd                         VARCHAR(10) NOT NULL,
  roam_psbl_yn                     CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_roam_natn_c IS '로밍국가코드';
COMMENT ON COLUMN ptl_prd_roam_natn_c.natn_cd IS '국가코드';
COMMENT ON COLUMN ptl_prd_roam_natn_c.natn_nm IS '국가명';
COMMENT ON COLUMN ptl_prd_roam_natn_c.eng_natn_nm IS '영문국가명';
COMMENT ON COLUMN ptl_prd_roam_natn_c.roam_zone_ty_cd IS '로밍권역유형코드';
COMMENT ON COLUMN ptl_prd_roam_natn_c.natn_no IS '국가번호';
COMMENT ON COLUMN ptl_prd_roam_natn_c.crncy_cd IS '통화코드';
COMMENT ON COLUMN ptl_prd_roam_natn_c.roam_psbl_yn IS '로밍가능여부';
COMMENT ON COLUMN ptl_prd_roam_natn_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_roam_natn_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_roam_natn_c.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_roam_natn_c.lst_rgtr_id IS '최종등록자ID';

-- PRD-018 로밍요율상세 (목표 30,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_roam_trf_d (
  natn_cd                          VARCHAR(10) NOT NULL,
  use_svc_ty_cd                    VARCHAR(10) NOT NULL,
  use_drct_se_cd                   VARCHAR(10) NOT NULL,
  trf_aplcn_bgng_dt                CHAR(8) NOT NULL,
  chrg_itm_cd                      VARCHAR(10) NOT NULL,
  trf_aplcn_end_dt                 CHAR(8),
  use_unit_ty_cd                   VARCHAR(10) NOT NULL,
  rat_unit_vl                      NUMERIC(10) NOT NULL,
  unit_chrg_amt                    NUMERIC(15) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_roam_trf_d IS '로밍요율상세';
COMMENT ON COLUMN ptl_prd_roam_trf_d.natn_cd IS '국가코드';
COMMENT ON COLUMN ptl_prd_roam_trf_d.use_svc_ty_cd IS '사용서비스유형코드';
COMMENT ON COLUMN ptl_prd_roam_trf_d.use_drct_se_cd IS '사용방향구분코드';
COMMENT ON COLUMN ptl_prd_roam_trf_d.trf_aplcn_bgng_dt IS '요율적용시작일자';
COMMENT ON COLUMN ptl_prd_roam_trf_d.chrg_itm_cd IS '요금항목코드';
COMMENT ON COLUMN ptl_prd_roam_trf_d.trf_aplcn_end_dt IS '요율적용종료일자';
COMMENT ON COLUMN ptl_prd_roam_trf_d.use_unit_ty_cd IS '사용단위유형코드';
COMMENT ON COLUMN ptl_prd_roam_trf_d.rat_unit_vl IS '과금단위값';
COMMENT ON COLUMN ptl_prd_roam_trf_d.unit_chrg_amt IS '단위요금금액';
COMMENT ON COLUMN ptl_prd_roam_trf_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_roam_trf_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_roam_trf_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_roam_trf_d.lst_rgtr_id IS '최종등록자ID';

-- PRD-019 부가서비스요금상세 (목표 30,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_adsvc_chrg_d (
  prod_cd                          VARCHAR(20) NOT NULL,
  chrg_itm_cd                      VARCHAR(10) NOT NULL,
  chrg_aplcn_bgng_dt               CHAR(8) NOT NULL,
  chrg_aplcn_end_dt                CHAR(8),
  rat_schm_ty_cd                   VARCHAR(10) NOT NULL,
  mm_fxamt_amt                     NUMERIC(15),
  unit_chrg_amt                    NUMERIC(15),
  dyprt_calc_yn                    CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_adsvc_chrg_d IS '부가서비스요금상세';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.chrg_itm_cd IS '요금항목코드';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.chrg_aplcn_bgng_dt IS '요금적용시작일자';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.chrg_aplcn_end_dt IS '요금적용종료일자';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.rat_schm_ty_cd IS '과금방식유형코드';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.mm_fxamt_amt IS '월정액금액';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.unit_chrg_amt IS '단위요금금액';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.dyprt_calc_yn IS '일할계산여부';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_adsvc_chrg_d.lst_rgtr_id IS '최종등록자ID';

-- PRD-020 할인조건상세 (목표 12,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_dscnt_cnd_d (
  prod_cd                          VARCHAR(20) NOT NULL,
  cnd_seq                          NUMERIC(5) NOT NULL,
  cnd_trgt_prod_cd                 VARCHAR(20),
  dscnt_cnd_ty_cd                  VARCHAR(10) NOT NULL,
  cnd_min_vl                       NUMERIC(10),
  cnd_max_vl                       NUMERIC(10),
  cnd_cn                           VARCHAR(200),
  aplcn_bgng_dt                    CHAR(8) NOT NULL,
  aplcn_end_dt                     CHAR(8),
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_dscnt_cnd_d IS '할인조건상세';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.cnd_seq IS '조건순번';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.cnd_trgt_prod_cd IS '조건대상상품코드';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.dscnt_cnd_ty_cd IS '할인조건유형코드';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.cnd_min_vl IS '조건최소값';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.cnd_max_vl IS '조건최대값';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.cnd_cn IS '조건내용';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_dscnt_cnd_d.lst_rgtr_id IS '최종등록자ID';

-- PRD-021 할인율상세 (목표 12,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_dscnt_rt_d (
  prod_cd                          VARCHAR(20) NOT NULL,
  dscnt_step_seq                   NUMERIC(5) NOT NULL,
  step_min_vl                      NUMERIC(10) NOT NULL,
  step_max_vl                      NUMERIC(10),
  dscnt_rt                         NUMERIC(5,2),
  dscnt_amt                        NUMERIC(15),
  dscnt_lmt_amt                    NUMERIC(15),
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_dscnt_rt_d IS '할인율상세';
COMMENT ON COLUMN ptl_prd_dscnt_rt_d.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_dscnt_rt_d.dscnt_step_seq IS '할인단계순번';
COMMENT ON COLUMN ptl_prd_dscnt_rt_d.step_min_vl IS '단계최소값';
COMMENT ON COLUMN ptl_prd_dscnt_rt_d.step_max_vl IS '단계최대값';
COMMENT ON COLUMN ptl_prd_dscnt_rt_d.dscnt_rt IS '할인율';
COMMENT ON COLUMN ptl_prd_dscnt_rt_d.dscnt_amt IS '할인금액';
COMMENT ON COLUMN ptl_prd_dscnt_rt_d.dscnt_lmt_amt IS '할인한도금액';
COMMENT ON COLUMN ptl_prd_dscnt_rt_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_dscnt_rt_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_dscnt_rt_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_dscnt_rt_d.lst_rgtr_id IS '최종등록자ID';

-- PRD-022 결합구성상세 (목표 2,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_cmbn_cmps_d (
  prod_cd                          VARCHAR(20) NOT NULL,
  cmps_seq                         NUMERIC(5) NOT NULL,
  cmps_prod_cd                     VARCHAR(20),
  cmbn_cmps_ty_cd                  VARCHAR(10) NOT NULL,
  min_line_cnt                     NUMERIC(5) NOT NULL,
  max_line_cnt                     NUMERIC(5) NOT NULL,
  rprs_line_psbl_yn                CHAR(1) NOT NULL,
  cmps_need_yn                     CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_cmbn_cmps_d IS '결합구성상세';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.cmps_seq IS '구성순번';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.cmps_prod_cd IS '구성상품코드';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.cmbn_cmps_ty_cd IS '결합구성유형코드';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.min_line_cnt IS '최소회선수';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.max_line_cnt IS '최대회선수';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.rprs_line_psbl_yn IS '대표회선가능여부';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.cmps_need_yn IS '구성필요여부';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_cmbn_cmps_d.lst_rgtr_id IS '최종등록자ID';

-- PRD-023 결합할인상세 (목표 3,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_cmbn_dscnt_d (
  prod_cd                          VARCHAR(20) NOT NULL,
  cmbn_line_cnt                    NUMERIC(5) NOT NULL,
  dscnt_aplcn_bgng_dt              CHAR(8) NOT NULL,
  dscnt_chrg_itm_cd                VARCHAR(10) NOT NULL,
  dscnt_aplcn_end_dt               CHAR(8),
  line_dscnt_amt                   NUMERIC(15) NOT NULL,
  rprs_line_dscnt_amt              NUMERIC(15),
  dscnt_rt                         NUMERIC(5,2),
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_cmbn_dscnt_d IS '결합할인상세';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.cmbn_line_cnt IS '결합회선수';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.dscnt_aplcn_bgng_dt IS '할인적용시작일자';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.dscnt_chrg_itm_cd IS '할인요금항목코드';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.dscnt_aplcn_end_dt IS '할인적용종료일자';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.line_dscnt_amt IS '회선할인금액';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.rprs_line_dscnt_amt IS '대표회선할인금액';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.dscnt_rt IS '할인율';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_cmbn_dscnt_d.lst_rgtr_id IS '최종등록자ID';

-- PRD-024 약정위약금상세 (목표 3,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_agrmt_pnlt_d (
  prod_cd                          VARCHAR(20) NOT NULL,
  pnlt_step_seq                    NUMERIC(5) NOT NULL,
  elps_bgng_mcnt                   NUMERIC(5) NOT NULL,
  elps_end_mcnt                    NUMERIC(5) NOT NULL,
  pnlt_asmt_schm_ty_cd             VARCHAR(10) NOT NULL,
  pnlt_rt                          NUMERIC(5,2),
  pnlt_amt                         NUMERIC(15),
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_agrmt_pnlt_d IS '약정위약금상세';
COMMENT ON COLUMN ptl_prd_agrmt_pnlt_d.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_agrmt_pnlt_d.pnlt_step_seq IS '위약금단계순번';
COMMENT ON COLUMN ptl_prd_agrmt_pnlt_d.elps_bgng_mcnt IS '경과시작개월수';
COMMENT ON COLUMN ptl_prd_agrmt_pnlt_d.elps_end_mcnt IS '경과종료개월수';
COMMENT ON COLUMN ptl_prd_agrmt_pnlt_d.pnlt_asmt_schm_ty_cd IS '위약금산정방식유형코드';
COMMENT ON COLUMN ptl_prd_agrmt_pnlt_d.pnlt_rt IS '위약금율';
COMMENT ON COLUMN ptl_prd_agrmt_pnlt_d.pnlt_amt IS '위약금금액';
COMMENT ON COLUMN ptl_prd_agrmt_pnlt_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_agrmt_pnlt_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_agrmt_pnlt_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_agrmt_pnlt_d.lst_rgtr_id IS '최종등록자ID';

-- PRD-025 단말출고가격이력 (목표 50,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_eqp_shpm_prc_h (
  eqp_mdl_cd                       VARCHAR(20) NOT NULL,
  prc_aplcn_bgng_dtm               TIMESTAMP NOT NULL,
  prc_aplcn_end_dtm                TIMESTAMP,
  eqp_shpm_prc                     NUMERIC(15) NOT NULL,
  prc_chg_rsn_ty_cd                VARCHAR(10) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_eqp_shpm_prc_h IS '단말출고가격이력';
COMMENT ON COLUMN ptl_prd_eqp_shpm_prc_h.eqp_mdl_cd IS '단말모델코드';
COMMENT ON COLUMN ptl_prd_eqp_shpm_prc_h.prc_aplcn_bgng_dtm IS '가격적용시작일시';
COMMENT ON COLUMN ptl_prd_eqp_shpm_prc_h.prc_aplcn_end_dtm IS '가격적용종료일시';
COMMENT ON COLUMN ptl_prd_eqp_shpm_prc_h.eqp_shpm_prc IS '단말출고가격';
COMMENT ON COLUMN ptl_prd_eqp_shpm_prc_h.prc_chg_rsn_ty_cd IS '가격변경사유유형코드';
COMMENT ON COLUMN ptl_prd_eqp_shpm_prc_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_eqp_shpm_prc_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_eqp_shpm_prc_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_eqp_shpm_prc_h.lst_rgtr_id IS '최종등록자ID';

-- PRD-026 공시지원금이력 (목표 3,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_pbanc_subsd_h (
  eqp_mdl_cd                       VARCHAR(20) NOT NULL,
  rtpln_prod_cd                    VARCHAR(20) NOT NULL,
  subsd_aplcn_bgng_dtm             TIMESTAMP NOT NULL,
  subsd_aplcn_end_dtm              TIMESTAMP,
  pbanc_dt                         CHAR(8) NOT NULL,
  pbanc_subsd                      NUMERIC(15) NOT NULL,
  add_subsd                        NUMERIC(15),
  min_pbanc_dcnt                   NUMERIC(3) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_pbanc_subsd_h IS '공시지원금이력';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.eqp_mdl_cd IS '단말모델코드';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.rtpln_prod_cd IS '요금제상품코드';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.subsd_aplcn_bgng_dtm IS '지원금적용시작일시';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.subsd_aplcn_end_dtm IS '지원금적용종료일시';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.pbanc_dt IS '공시일자';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.pbanc_subsd IS '공시지원금';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.add_subsd IS '추가지원금';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.min_pbanc_dcnt IS '최소공시일수';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_pbanc_subsd_h.lst_rgtr_id IS '최종등록자ID';

-- PRD-027 상품판매채널관계 (목표 100,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_prod_sale_chnl_r (
  prod_cd                          VARCHAR(20) NOT NULL,
  sale_chnl_ty_cd                  VARCHAR(10) NOT NULL,
  sale_bgng_dt                     CHAR(8) NOT NULL,
  sale_end_dt                      CHAR(8),
  sale_psbl_yn                     CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_prod_sale_chnl_r IS '상품판매채널관계';
COMMENT ON COLUMN ptl_prd_prod_sale_chnl_r.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_prod_sale_chnl_r.sale_chnl_ty_cd IS '판매채널유형코드';
COMMENT ON COLUMN ptl_prd_prod_sale_chnl_r.sale_bgng_dt IS '판매시작일자';
COMMENT ON COLUMN ptl_prd_prod_sale_chnl_r.sale_end_dt IS '판매종료일자';
COMMENT ON COLUMN ptl_prd_prod_sale_chnl_r.sale_psbl_yn IS '판매가능여부';
COMMENT ON COLUMN ptl_prd_prod_sale_chnl_r.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_prod_sale_chnl_r.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_prod_sale_chnl_r.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_prod_sale_chnl_r.lst_rgtr_id IS '최종등록자ID';

-- PRD-028 상품판매기간이력 (목표 40,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_prod_sale_prd_h (
  prod_cd                          VARCHAR(20) NOT NULL,
  sale_bgng_dt                     CHAR(8) NOT NULL,
  sale_end_dt                      CHAR(8),
  sale_end_rsn_ty_cd               VARCHAR(10),
  sbsc_psbl_yn                     CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_prod_sale_prd_h IS '상품판매기간이력';
COMMENT ON COLUMN ptl_prd_prod_sale_prd_h.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_prod_sale_prd_h.sale_bgng_dt IS '판매시작일자';
COMMENT ON COLUMN ptl_prd_prod_sale_prd_h.sale_end_dt IS '판매종료일자';
COMMENT ON COLUMN ptl_prd_prod_sale_prd_h.sale_end_rsn_ty_cd IS '판매종료사유유형코드';
COMMENT ON COLUMN ptl_prd_prod_sale_prd_h.sbsc_psbl_yn IS '가입가능여부';
COMMENT ON COLUMN ptl_prd_prod_sale_prd_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_prod_sale_prd_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_prod_sale_prd_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_prod_sale_prd_h.lst_rgtr_id IS '최종등록자ID';

-- PRD-029 요금항목분류코드 (목표 50행)
CREATE TABLE IF NOT EXISTS ptl_prd_chrg_itm_clsf_c (
  chrg_itm_clsf_cd                 VARCHAR(10) NOT NULL,
  up_chrg_itm_clsf_cd              VARCHAR(10),
  chrg_itm_clsf_nm                 VARCHAR(100) NOT NULL,
  invc_outpt_seq                   NUMERIC(5) NOT NULL,
  use_yn                           CHAR(1) NOT NULL,
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_chrg_itm_clsf_c IS '요금항목분류코드';
COMMENT ON COLUMN ptl_prd_chrg_itm_clsf_c.chrg_itm_clsf_cd IS '요금항목분류코드';
COMMENT ON COLUMN ptl_prd_chrg_itm_clsf_c.up_chrg_itm_clsf_cd IS '상위요금항목분류코드';
COMMENT ON COLUMN ptl_prd_chrg_itm_clsf_c.chrg_itm_clsf_nm IS '요금항목분류명';
COMMENT ON COLUMN ptl_prd_chrg_itm_clsf_c.invc_outpt_seq IS '청구서출력순번';
COMMENT ON COLUMN ptl_prd_chrg_itm_clsf_c.use_yn IS '사용여부';
COMMENT ON COLUMN ptl_prd_chrg_itm_clsf_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_chrg_itm_clsf_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_chrg_itm_clsf_c.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_chrg_itm_clsf_c.lst_rgtr_id IS '최종등록자ID';

-- PRD-030 상품변경이력 (목표 2,000,000행)
CREATE TABLE IF NOT EXISTS ptl_prd_prod_chg_h (
  prod_cd                          VARCHAR(20) NOT NULL,
  prod_chg_seq                     NUMERIC(10) NOT NULL,
  prod_chg_dtm                     TIMESTAMP NOT NULL,
  prod_chg_rsn_ty_cd               VARCHAR(10) NOT NULL,
  chg_itm_nm                       VARCHAR(100) NOT NULL,
  chg_bfr_vl                       VARCHAR(256),
  chg_aftr_vl                      VARCHAR(256),
  chg_rsn_cn                       VARCHAR(200),
  lst_mddtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_prd_prod_chg_h IS '상품변경이력';
COMMENT ON COLUMN ptl_prd_prod_chg_h.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_prd_prod_chg_h.prod_chg_seq IS '상품변경순번';
COMMENT ON COLUMN ptl_prd_prod_chg_h.prod_chg_dtm IS '상품변경일시';
COMMENT ON COLUMN ptl_prd_prod_chg_h.prod_chg_rsn_ty_cd IS '상품변경사유유형코드';
COMMENT ON COLUMN ptl_prd_prod_chg_h.chg_itm_nm IS '변경항목명';
COMMENT ON COLUMN ptl_prd_prod_chg_h.chg_bfr_vl IS '변경이전값';
COMMENT ON COLUMN ptl_prd_prod_chg_h.chg_aftr_vl IS '변경후값';
COMMENT ON COLUMN ptl_prd_prod_chg_h.chg_rsn_cn IS '변경사유내용';
COMMENT ON COLUMN ptl_prd_prod_chg_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_prd_prod_chg_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_prd_prod_chg_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_prd_prod_chg_h.lst_rgtr_id IS '최종등록자ID';

