-- 20_cus_tables.sql — Pi통신 과금 CUS(고객) 주제영역 테이블 30개 (PostgreSQL 17)
-- 생성 : subagent_physical_modeler 2026-11-07 · 원본 model/physical/CUS.json
-- 실행 : psql -v ON_ERROR_STOP=1 -f 20_cus_tables.sql (search_path 대상 스키마). PK·인덱스는 적재 뒤 20_cus_constraints.sql (D14)
-- FK 제약 없음(D6 — 설계만). 시스템 칼럼 4개는 맨 끝(D7). 재실행 안전(IF NOT EXISTS)

-- CUS-001 고객기본 (예상 5,000,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_m (
  cust_no                      VARCHAR(20)    NOT NULL,
  cust_nm                      VARCHAR(100)   NOT NULL,
  cust_reg_dtm                 TIMESTAMP      NOT NULL,
  cust_stts_ty_cd              VARCHAR(10)    NOT NULL,
  cust_ty_cd                   VARCHAR(10)    NOT NULL,
  dmfrgn_se_cd                 VARCHAR(10)    NOT NULL,
  natn_cd                      VARCHAR(10),
  cust_grd_ty_cd               VARCHAR(10),
  frst_sbsc_dt                 CHAR(8),
  cust_trmn_dtm                TIMESTAMP,
  drmt_cnvr_dt                 CHAR(8),
  prvc_dstr_dtm                TIMESTAMP,
  nmne_thft_dclr_yn            CHAR(1)        NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_cust_m IS '고객기본';
COMMENT ON COLUMN ptl_cus_cust_m.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_m.cust_nm IS '고객명';
COMMENT ON COLUMN ptl_cus_cust_m.cust_reg_dtm IS '고객등록일시';
COMMENT ON COLUMN ptl_cus_cust_m.cust_stts_ty_cd IS '고객상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_m.cust_ty_cd IS '고객유형코드';
COMMENT ON COLUMN ptl_cus_cust_m.dmfrgn_se_cd IS '내외국인구분코드';
COMMENT ON COLUMN ptl_cus_cust_m.natn_cd IS '국가코드';
COMMENT ON COLUMN ptl_cus_cust_m.cust_grd_ty_cd IS '고객등급유형코드';
COMMENT ON COLUMN ptl_cus_cust_m.frst_sbsc_dt IS '최초가입일자';
COMMENT ON COLUMN ptl_cus_cust_m.cust_trmn_dtm IS '고객해지일시';
COMMENT ON COLUMN ptl_cus_cust_m.drmt_cnvr_dt IS '휴면전환일자';
COMMENT ON COLUMN ptl_cus_cust_m.prvc_dstr_dtm IS '개인정보파기일시';
COMMENT ON COLUMN ptl_cus_cust_m.nmne_thft_dclr_yn IS '명의도용신고여부';
COMMENT ON COLUMN ptl_cus_cust_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_m.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_m.lst_rgtr_id IS '최초등록자ID';

-- CUS-002 개인고객상세 (예상 4,650,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_indv_cust_d (
  cust_no                      VARCHAR(20)    NOT NULL,
  eng_cust_nm                  VARCHAR(100)   NOT NULL,
  indv_cust_reg_dtm            TIMESTAMP      NOT NULL,
  rlnm_crtf_stts_ty_cd         VARCHAR(10)    NOT NULL,
  brdt                         CHAR(8),
  gndr_se_cd                   VARCHAR(10),
  rlnm_idntf_no_encpt_vl       VARCHAR(256),
  idcd_knd_cd                  VARCHAR(10),
  rlnm_crtf_dtm                TIMESTAMP,
  frgnr_stay_expry_dt          CHAR(8),
  wlfr_trgt_ty_cd              VARCHAR(10),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_indv_cust_d IS '개인고객상세';
COMMENT ON COLUMN ptl_cus_indv_cust_d.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_indv_cust_d.eng_cust_nm IS '영문고객명';
COMMENT ON COLUMN ptl_cus_indv_cust_d.indv_cust_reg_dtm IS '개인고객등록일시';
COMMENT ON COLUMN ptl_cus_indv_cust_d.rlnm_crtf_stts_ty_cd IS '실명인증상태유형코드';
COMMENT ON COLUMN ptl_cus_indv_cust_d.brdt IS '생년월일';
COMMENT ON COLUMN ptl_cus_indv_cust_d.gndr_se_cd IS '성별구분코드';
COMMENT ON COLUMN ptl_cus_indv_cust_d.rlnm_idntf_no_encpt_vl IS '실명확인번호암호화값';
COMMENT ON COLUMN ptl_cus_indv_cust_d.idcd_knd_cd IS '신분증종류코드';
COMMENT ON COLUMN ptl_cus_indv_cust_d.rlnm_crtf_dtm IS '실명인증일시';
COMMENT ON COLUMN ptl_cus_indv_cust_d.frgnr_stay_expry_dt IS '외국인체류만료일자';
COMMENT ON COLUMN ptl_cus_indv_cust_d.wlfr_trgt_ty_cd IS '복지대상유형코드';
COMMENT ON COLUMN ptl_cus_indv_cust_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_indv_cust_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_indv_cust_d.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_indv_cust_d.lst_rgtr_id IS '최초등록자ID';

-- CUS-003 법인고객상세 (예상 350,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_corp_cust_d (
  cust_no                      VARCHAR(20)    NOT NULL,
  corp_nm                      VARCHAR(200)   NOT NULL,
  corp_cust_reg_dtm            TIMESTAMP      NOT NULL,
  bzmn_stts_ty_cd              VARCHAR(10)    NOT NULL,
  brno                         VARCHAR(20),
  crno                         VARCHAR(20),
  rprsv_nm                     VARCHAR(100),
  tpbiz_cd                     VARCHAR(10),
  corp_scl_ty_cd               VARCHAR(10),
  fndn_dt                      CHAR(8),
  emp_cnt                      NUMERIC(10),
  rprs_telno                   VARCHAR(20),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_corp_cust_d IS '법인고객상세';
COMMENT ON COLUMN ptl_cus_corp_cust_d.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_corp_cust_d.corp_nm IS '법인명';
COMMENT ON COLUMN ptl_cus_corp_cust_d.corp_cust_reg_dtm IS '법인고객등록일시';
COMMENT ON COLUMN ptl_cus_corp_cust_d.bzmn_stts_ty_cd IS '사업자상태유형코드';
COMMENT ON COLUMN ptl_cus_corp_cust_d.brno IS '사업자등록번호';
COMMENT ON COLUMN ptl_cus_corp_cust_d.crno IS '법인등록번호';
COMMENT ON COLUMN ptl_cus_corp_cust_d.rprsv_nm IS '대표자명';
COMMENT ON COLUMN ptl_cus_corp_cust_d.tpbiz_cd IS '업종코드';
COMMENT ON COLUMN ptl_cus_corp_cust_d.corp_scl_ty_cd IS '법인규모유형코드';
COMMENT ON COLUMN ptl_cus_corp_cust_d.fndn_dt IS '설립일자';
COMMENT ON COLUMN ptl_cus_corp_cust_d.emp_cnt IS '종업원수';
COMMENT ON COLUMN ptl_cus_corp_cust_d.rprs_telno IS '대표전화번호';
COMMENT ON COLUMN ptl_cus_corp_cust_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_corp_cust_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_corp_cust_d.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_corp_cust_d.lst_rgtr_id IS '최초등록자ID';

-- CUS-004 청구계정기본 (예상 6,000,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_bill_acnt_m (
  bill_acnt_no                 VARCHAR(20)    NOT NULL,
  cust_no                      VARCHAR(20)    NOT NULL,
  pyr_no                       VARCHAR(20)    NOT NULL,
  bill_cycl_cd                 VARCHAR(10)    NOT NULL,
  bill_plc_addr_seq            NUMERIC(5),
  bill_acnt_nm                 VARCHAR(100)   NOT NULL,
  bill_acnt_reg_dtm            TIMESTAMP      NOT NULL,
  bill_acnt_stts_ty_cd         VARCHAR(10)    NOT NULL,
  bill_acnt_ty_cd              VARCHAR(10)    NOT NULL,
  invc_rcpt_mthd_ty_cd         VARCHAR(10)    NOT NULL,
  invc_eml_addr                VARCHAR(100),
  intgr_bill_yn                CHAR(1)        NOT NULL,
  frst_bill_ym                 CHAR(6),
  bill_acnt_trmn_dtm           TIMESTAMP,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_bill_acnt_m IS '청구계정기본';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.pyr_no IS '납부자번호';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.bill_cycl_cd IS '청구주기코드';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.bill_plc_addr_seq IS '청구지주소순번';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.bill_acnt_nm IS '청구계정명';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.bill_acnt_reg_dtm IS '청구계정등록일시';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.bill_acnt_stts_ty_cd IS '청구계정상태유형코드';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.bill_acnt_ty_cd IS '청구계정유형코드';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.invc_rcpt_mthd_ty_cd IS '청구서수령방법유형코드';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.invc_eml_addr IS '청구서이메일주소';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.intgr_bill_yn IS '통합청구여부';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.frst_bill_ym IS '최초청구년월';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.bill_acnt_trmn_dtm IS '청구계정해지일시';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_bill_acnt_m.lst_rgtr_id IS '최초등록자ID';

-- CUS-005 납부자기본 (예상 5,500,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_pyr_m (
  pyr_no                       VARCHAR(20)    NOT NULL,
  cust_no                      VARCHAR(20),
  pyr_nm                       VARCHAR(100)   NOT NULL,
  pyr_reg_dtm                  TIMESTAMP      NOT NULL,
  pyr_stts_ty_cd               VARCHAR(10)    NOT NULL,
  pyr_ty_cd                    VARCHAR(10)    NOT NULL,
  nmne_prsn_rel_ty_cd          VARCHAR(10),
  pyr_brdt                     CHAR(8),
  pyr_brno                     VARCHAR(20),
  pyr_mbl_telno                VARCHAR(20),
  pyr_eml_addr                 VARCHAR(100),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_pyr_m IS '납부자기본';
COMMENT ON COLUMN ptl_cus_pyr_m.pyr_no IS '납부자번호';
COMMENT ON COLUMN ptl_cus_pyr_m.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_pyr_m.pyr_nm IS '납부자명';
COMMENT ON COLUMN ptl_cus_pyr_m.pyr_reg_dtm IS '납부자등록일시';
COMMENT ON COLUMN ptl_cus_pyr_m.pyr_stts_ty_cd IS '납부자상태유형코드';
COMMENT ON COLUMN ptl_cus_pyr_m.pyr_ty_cd IS '납부자유형코드';
COMMENT ON COLUMN ptl_cus_pyr_m.nmne_prsn_rel_ty_cd IS '명의자관계유형코드';
COMMENT ON COLUMN ptl_cus_pyr_m.pyr_brdt IS '납부자생년월일';
COMMENT ON COLUMN ptl_cus_pyr_m.pyr_brno IS '납부자사업자등록번호';
COMMENT ON COLUMN ptl_cus_pyr_m.pyr_mbl_telno IS '납부자휴대전화번호';
COMMENT ON COLUMN ptl_cus_pyr_m.pyr_eml_addr IS '납부자이메일주소';
COMMENT ON COLUMN ptl_cus_pyr_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_pyr_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_pyr_m.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_pyr_m.lst_rgtr_id IS '최초등록자ID';

-- CUS-006 고객연락처상세 (예상 8,000,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_cntc_d (
  cust_no                      VARCHAR(20)    NOT NULL,
  cntc_seq                     NUMERIC(5)     NOT NULL,
  cntc_nm                      VARCHAR(100)   NOT NULL,
  cntc_reg_dtm                 TIMESTAMP      NOT NULL,
  cntc_stts_ty_cd              VARCHAR(10)    NOT NULL,
  cntc_ty_cd                   VARCHAR(10)    NOT NULL,
  cntc_cn                      VARCHAR(200)   NOT NULL,
  rprs_cntc_yn                 CHAR(1)        NOT NULL,
  self_cntc_yn                 CHAR(1),
  cntc_vrfc_dtm                TIMESTAMP,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_cust_cntc_d IS '고객연락처상세';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.cntc_seq IS '연락처순번';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.cntc_nm IS '연락처명';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.cntc_reg_dtm IS '연락처등록일시';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.cntc_stts_ty_cd IS '연락처상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.cntc_ty_cd IS '연락처유형코드';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.cntc_cn IS '연락처내용';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.rprs_cntc_yn IS '대표연락처여부';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.self_cntc_yn IS '본인연락처여부';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.cntc_vrfc_dtm IS '연락처검증일시';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_cntc_d.lst_rgtr_id IS '최초등록자ID';

-- CUS-007 고객주소상세 (예상 6,000,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_addr_d (
  cust_no                      VARCHAR(20)    NOT NULL,
  addr_seq                     NUMERIC(5)     NOT NULL,
  rgn_cd                       VARCHAR(10)    NOT NULL,
  zip                          CHAR(5),
  rcpn_nm                      VARCHAR(100)   NOT NULL,
  addr_reg_dtm                 TIMESTAMP      NOT NULL,
  addr_stts_ty_cd              VARCHAR(10)    NOT NULL,
  addr_ty_cd                   VARCHAR(10)    NOT NULL,
  road_nm_addr                 VARCHAR(200),
  daddr                        VARCHAR(200),
  bldg_mgmt_no                 VARCHAR(30),
  rprs_addr_yn                 CHAR(1)        NOT NULL,
  rtrn_nmtm                    NUMERIC(5),
  cust_addr_chg_rsn_ty_cd      VARCHAR(10),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_cust_addr_d IS '고객주소상세';
COMMENT ON COLUMN ptl_cus_cust_addr_d.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_addr_d.addr_seq IS '주소순번';
COMMENT ON COLUMN ptl_cus_cust_addr_d.rgn_cd IS '지역코드';
COMMENT ON COLUMN ptl_cus_cust_addr_d.zip IS '우편번호';
COMMENT ON COLUMN ptl_cus_cust_addr_d.rcpn_nm IS '수령인명';
COMMENT ON COLUMN ptl_cus_cust_addr_d.addr_reg_dtm IS '주소등록일시';
COMMENT ON COLUMN ptl_cus_cust_addr_d.addr_stts_ty_cd IS '주소상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_addr_d.addr_ty_cd IS '주소유형코드';
COMMENT ON COLUMN ptl_cus_cust_addr_d.road_nm_addr IS '도로명주소';
COMMENT ON COLUMN ptl_cus_cust_addr_d.daddr IS '상세주소';
COMMENT ON COLUMN ptl_cus_cust_addr_d.bldg_mgmt_no IS '건물관리번호';
COMMENT ON COLUMN ptl_cus_cust_addr_d.rprs_addr_yn IS '대표주소여부';
COMMENT ON COLUMN ptl_cus_cust_addr_d.rtrn_nmtm IS '반송횟수';
COMMENT ON COLUMN ptl_cus_cust_addr_d.cust_addr_chg_rsn_ty_cd IS '고객주소변경사유유형코드';
COMMENT ON COLUMN ptl_cus_cust_addr_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_addr_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_addr_d.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_addr_d.lst_rgtr_id IS '최초등록자ID';

-- CUS-008 고객동의내역 (예상 10,000,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_agre_l (
  cust_agre_no                 VARCHAR(20)    NOT NULL,
  cust_no                      VARCHAR(20)    NOT NULL,
  agre_itm_ty_cd               VARCHAR(10)    NOT NULL,
  agre_itm_ver_no              VARCHAR(20)    NOT NULL,
  agre_prsn_nm                 VARCHAR(100)   NOT NULL,
  agre_dtm                     TIMESTAMP      NOT NULL,
  agre_stts_ty_cd              VARCHAR(10)    NOT NULL,
  agre_yn                      CHAR(1)        NOT NULL,
  agre_chnl_ty_cd              VARCHAR(10),
  lglrp_agre_yn                CHAR(1),
  agre_wthdr_dtm               TIMESTAMP,
  agre_expry_dt                CHAR(8),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_cust_agre_l IS '고객동의내역';
COMMENT ON COLUMN ptl_cus_cust_agre_l.cust_agre_no IS '고객동의번호';
COMMENT ON COLUMN ptl_cus_cust_agre_l.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_agre_l.agre_itm_ty_cd IS '동의항목유형코드';
COMMENT ON COLUMN ptl_cus_cust_agre_l.agre_itm_ver_no IS '동의항목버전번호';
COMMENT ON COLUMN ptl_cus_cust_agre_l.agre_prsn_nm IS '동의자명';
COMMENT ON COLUMN ptl_cus_cust_agre_l.agre_dtm IS '동의일시';
COMMENT ON COLUMN ptl_cus_cust_agre_l.agre_stts_ty_cd IS '동의상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_agre_l.agre_yn IS '동의여부';
COMMENT ON COLUMN ptl_cus_cust_agre_l.agre_chnl_ty_cd IS '동의채널유형코드';
COMMENT ON COLUMN ptl_cus_cust_agre_l.lglrp_agre_yn IS '법정대리인동의여부';
COMMENT ON COLUMN ptl_cus_cust_agre_l.agre_wthdr_dtm IS '동의철회일시';
COMMENT ON COLUMN ptl_cus_cust_agre_l.agre_expry_dt IS '동의만료일자';
COMMENT ON COLUMN ptl_cus_cust_agre_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_agre_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_agre_l.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_agre_l.lst_rgtr_id IS '최초등록자ID';

-- CUS-009 고객등급이력 (예상 7,000,000행, 연 파티션)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_grd_h (
  cust_no                      VARCHAR(20)    NOT NULL,
  grd_aplcn_bgng_dtm           TIMESTAMP      NOT NULL,
  cust_grd_nm                  VARCHAR(100)   NOT NULL,
  grd_asmt_dtm                 TIMESTAMP      NOT NULL,
  grd_aplcn_stts_ty_cd         VARCHAR(10)    NOT NULL,
  cust_grd_ty_cd               VARCHAR(10)    NOT NULL,
  grd_aplcn_end_dtm            TIMESTAMP,
  grd_asmt_std_ym              CHAR(6),
  asmt_bill_amt                NUMERIC(15),
  sbsc_prd_mcnt                NUMERIC(5),
  grd_chg_rsn_ty_cd            VARCHAR(10),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (grd_aplcn_bgng_dtm);
DO $$
DECLARE i INT; v_lo TEXT; v_hi TEXT; v_nm TEXT;
BEGIN
  FOR i IN 0..17 LOOP
    v_lo := (2010 + i)::TEXT || '-01-01';
    v_hi := (2011 + i)::TEXT || '-01-01';
    v_nm := 'ptl_cus_cust_grd_h_p' || (2010 + i)::TEXT;
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_cus_cust_grd_h FOR VALUES FROM (%L) TO (%L)', v_nm, v_lo, v_hi);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_cus_cust_grd_h_pdef PARTITION OF ptl_cus_cust_grd_h DEFAULT;
COMMENT ON TABLE ptl_cus_cust_grd_h IS '고객등급이력';
COMMENT ON COLUMN ptl_cus_cust_grd_h.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_grd_h.grd_aplcn_bgng_dtm IS '등급적용시작일시';
COMMENT ON COLUMN ptl_cus_cust_grd_h.cust_grd_nm IS '고객등급명';
COMMENT ON COLUMN ptl_cus_cust_grd_h.grd_asmt_dtm IS '등급산정일시';
COMMENT ON COLUMN ptl_cus_cust_grd_h.grd_aplcn_stts_ty_cd IS '등급적용상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_grd_h.cust_grd_ty_cd IS '고객등급유형코드';
COMMENT ON COLUMN ptl_cus_cust_grd_h.grd_aplcn_end_dtm IS '등급적용종료일시';
COMMENT ON COLUMN ptl_cus_cust_grd_h.grd_asmt_std_ym IS '등급산정기준년월';
COMMENT ON COLUMN ptl_cus_cust_grd_h.asmt_bill_amt IS '산정청구금액';
COMMENT ON COLUMN ptl_cus_cust_grd_h.sbsc_prd_mcnt IS '가입기간개월수';
COMMENT ON COLUMN ptl_cus_cust_grd_h.grd_chg_rsn_ty_cd IS '등급변경사유유형코드';
COMMENT ON COLUMN ptl_cus_cust_grd_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_grd_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_grd_h.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_grd_h.lst_rgtr_id IS '최초등록자ID';

-- CUS-010 지역코드 (예상 20,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_rgn_c (
  rgn_cd                       VARCHAR(10)    NOT NULL,
  up_rgn_cd                    VARCHAR(10),
  rgn_nm                       VARCHAR(100)   NOT NULL,
  rgn_reg_dtm                  TIMESTAMP      NOT NULL,
  rgn_stts_ty_cd               VARCHAR(10)    NOT NULL,
  rgn_step_se_cd               VARCHAR(10)    NOT NULL,
  eng_rgn_nm                   VARCHAR(100),
  aplcn_bgng_dt                CHAR(8),
  aplcn_end_dt                 CHAR(8),
  islnd_mntn_yn                CHAR(1),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_rgn_c IS '지역코드';
COMMENT ON COLUMN ptl_cus_rgn_c.rgn_cd IS '지역코드';
COMMENT ON COLUMN ptl_cus_rgn_c.up_rgn_cd IS '상위지역코드';
COMMENT ON COLUMN ptl_cus_rgn_c.rgn_nm IS '지역명';
COMMENT ON COLUMN ptl_cus_rgn_c.rgn_reg_dtm IS '지역등록일시';
COMMENT ON COLUMN ptl_cus_rgn_c.rgn_stts_ty_cd IS '지역상태유형코드';
COMMENT ON COLUMN ptl_cus_rgn_c.rgn_step_se_cd IS '지역단계구분코드';
COMMENT ON COLUMN ptl_cus_rgn_c.eng_rgn_nm IS '영문지역명';
COMMENT ON COLUMN ptl_cus_rgn_c.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_cus_rgn_c.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_cus_rgn_c.islnd_mntn_yn IS '도서산간여부';
COMMENT ON COLUMN ptl_cus_rgn_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_rgn_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_rgn_c.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_rgn_c.lst_rgtr_id IS '최초등록자ID';

-- CUS-011 고객이력 (예상 8,000,000행, 연 파티션)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_h (
  cust_no                      VARCHAR(20)    NOT NULL,
  vld_bgng_dtm                 TIMESTAMP      NOT NULL,
  vld_end_dtm                  TIMESTAMP      NOT NULL,
  cust_nm                      VARCHAR(100)   NOT NULL,
  cust_stts_ty_cd              VARCHAR(10)    NOT NULL,
  cust_ty_cd                   VARCHAR(10)    NOT NULL,
  cust_grd_ty_cd               VARCHAR(10),
  nmne_thft_dclr_yn            CHAR(1)        NOT NULL,
  cust_chg_rsn_ty_cd           VARCHAR(10)    NOT NULL,
  chg_chnl_ty_cd               VARCHAR(10),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (vld_bgng_dtm);
DO $$
DECLARE i INT; v_lo TEXT; v_hi TEXT; v_nm TEXT;
BEGIN
  FOR i IN 0..17 LOOP
    v_lo := (2010 + i)::TEXT || '-01-01';
    v_hi := (2011 + i)::TEXT || '-01-01';
    v_nm := 'ptl_cus_cust_h_p' || (2010 + i)::TEXT;
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_cus_cust_h FOR VALUES FROM (%L) TO (%L)', v_nm, v_lo, v_hi);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_cus_cust_h_pdef PARTITION OF ptl_cus_cust_h DEFAULT;
COMMENT ON TABLE ptl_cus_cust_h IS '고객이력';
COMMENT ON COLUMN ptl_cus_cust_h.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_cus_cust_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_cus_cust_h.cust_nm IS '고객명';
COMMENT ON COLUMN ptl_cus_cust_h.cust_stts_ty_cd IS '고객상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_h.cust_ty_cd IS '고객유형코드';
COMMENT ON COLUMN ptl_cus_cust_h.cust_grd_ty_cd IS '고객등급유형코드';
COMMENT ON COLUMN ptl_cus_cust_h.nmne_thft_dclr_yn IS '명의도용신고여부';
COMMENT ON COLUMN ptl_cus_cust_h.cust_chg_rsn_ty_cd IS '고객변경사유유형코드';
COMMENT ON COLUMN ptl_cus_cust_h.chg_chnl_ty_cd IS '변경채널유형코드';
COMMENT ON COLUMN ptl_cus_cust_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_h.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_h.lst_rgtr_id IS '최초등록자ID';

-- CUS-012 실명인증내역 (예상 6,000,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_rlnm_crtf_l (
  rlnm_crtf_no                 VARCHAR(20)    NOT NULL,
  cust_no                      VARCHAR(20),
  sbsc_aply_no                 VARCHAR(20),
  prtnr_no                     VARCHAR(20),
  crtf_trgt_nm                 VARCHAR(100)   NOT NULL,
  rlnm_crtf_dtm                TIMESTAMP      NOT NULL,
  rlnm_crtf_rslt_ty_cd         VARCHAR(10)    NOT NULL,
  rlnm_crtf_means_ty_cd        VARCHAR(10)    NOT NULL,
  idcd_knd_cd                  VARCHAR(10),
  idcd_issu_dt                 CHAR(8),
  rlnm_idntf_no_encpt_vl       VARCHAR(256)   NOT NULL,
  crtf_fail_rsn_ty_cd          VARCHAR(10),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_rlnm_crtf_l IS '실명인증내역';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.rlnm_crtf_no IS '실명인증번호';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.sbsc_aply_no IS '가입신청번호';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.crtf_trgt_nm IS '인증대상명';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.rlnm_crtf_dtm IS '실명인증일시';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.rlnm_crtf_rslt_ty_cd IS '실명인증결과유형코드';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.rlnm_crtf_means_ty_cd IS '실명인증수단유형코드';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.idcd_knd_cd IS '신분증종류코드';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.idcd_issu_dt IS '신분증발급일자';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.rlnm_idntf_no_encpt_vl IS '실명확인번호암호화값';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.crtf_fail_rsn_ty_cd IS '인증실패사유유형코드';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_rlnm_crtf_l.lst_rgtr_id IS '최초등록자ID';

-- CUS-013 법정대리인상세 (예상 300,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_lglrp_d (
  cust_no                      VARCHAR(20)    NOT NULL,
  lglrp_seq                    NUMERIC(5)     NOT NULL,
  lglrp_cust_no                VARCHAR(20),
  lglrp_nm                     VARCHAR(100)   NOT NULL,
  lglrp_rel_ty_cd              VARCHAR(10)    NOT NULL,
  lglrp_brdt                   CHAR(8),
  lglrp_mbl_telno              VARCHAR(20),
  lglrp_agre_dtm               TIMESTAMP      NOT NULL,
  lglrp_rel_end_dt             CHAR(8),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_lglrp_d IS '법정대리인상세';
COMMENT ON COLUMN ptl_cus_lglrp_d.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_lglrp_d.lglrp_seq IS '법정대리인순번';
COMMENT ON COLUMN ptl_cus_lglrp_d.lglrp_cust_no IS '법정대리인고객번호';
COMMENT ON COLUMN ptl_cus_lglrp_d.lglrp_nm IS '법정대리인명';
COMMENT ON COLUMN ptl_cus_lglrp_d.lglrp_rel_ty_cd IS '법정대리인관계유형코드';
COMMENT ON COLUMN ptl_cus_lglrp_d.lglrp_brdt IS '법정대리인생년월일';
COMMENT ON COLUMN ptl_cus_lglrp_d.lglrp_mbl_telno IS '법정대리인휴대전화번호';
COMMENT ON COLUMN ptl_cus_lglrp_d.lglrp_agre_dtm IS '법정대리인동의일시';
COMMENT ON COLUMN ptl_cus_lglrp_d.lglrp_rel_end_dt IS '법정대리인관계종료일자';
COMMENT ON COLUMN ptl_cus_lglrp_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_lglrp_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_lglrp_d.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_lglrp_d.lst_rgtr_id IS '최초등록자ID';

-- CUS-014 법인담당자상세 (예상 600,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_corp_pic_d (
  cust_no                      VARCHAR(20)    NOT NULL,
  pic_seq                      NUMERIC(5)     NOT NULL,
  pic_nm                       VARCHAR(100)   NOT NULL,
  pic_ty_cd                    VARCHAR(10)    NOT NULL,
  pic_dept_nm                  VARCHAR(100),
  pic_jbps_nm                  VARCHAR(100),
  pic_mbl_telno                VARCHAR(20),
  pic_eml_addr                 VARCHAR(100),
  rprs_pic_yn                  CHAR(1)        NOT NULL,
  pic_reg_dtm                  TIMESTAMP      NOT NULL,
  pic_stts_ty_cd               VARCHAR(10)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_corp_pic_d IS '법인담당자상세';
COMMENT ON COLUMN ptl_cus_corp_pic_d.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_corp_pic_d.pic_seq IS '담당자순번';
COMMENT ON COLUMN ptl_cus_corp_pic_d.pic_nm IS '담당자명';
COMMENT ON COLUMN ptl_cus_corp_pic_d.pic_ty_cd IS '담당자유형코드';
COMMENT ON COLUMN ptl_cus_corp_pic_d.pic_dept_nm IS '담당자부서명';
COMMENT ON COLUMN ptl_cus_corp_pic_d.pic_jbps_nm IS '담당자직위명';
COMMENT ON COLUMN ptl_cus_corp_pic_d.pic_mbl_telno IS '담당자휴대전화번호';
COMMENT ON COLUMN ptl_cus_corp_pic_d.pic_eml_addr IS '담당자이메일주소';
COMMENT ON COLUMN ptl_cus_corp_pic_d.rprs_pic_yn IS '대표담당자여부';
COMMENT ON COLUMN ptl_cus_corp_pic_d.pic_reg_dtm IS '담당자등록일시';
COMMENT ON COLUMN ptl_cus_corp_pic_d.pic_stts_ty_cd IS '담당자상태유형코드';
COMMENT ON COLUMN ptl_cus_corp_pic_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_corp_pic_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_corp_pic_d.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_corp_pic_d.lst_rgtr_id IS '최초등록자ID';

-- CUS-015 법인사업장상세 (예상 400,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_corp_bplc_d (
  cust_no                      VARCHAR(20)    NOT NULL,
  bplc_seq                     NUMERIC(5)     NOT NULL,
  rgn_cd                       VARCHAR(10)    NOT NULL,
  zip                          CHAR(5),
  bplc_nm                      VARCHAR(100)   NOT NULL,
  bplc_brno                    VARCHAR(20),
  road_nm_addr                 VARCHAR(200),
  daddr                        VARCHAR(200),
  bplc_rprs_telno              VARCHAR(20),
  hq_yn                        CHAR(1)        NOT NULL,
  bplc_reg_dtm                 TIMESTAMP      NOT NULL,
  bplc_stts_ty_cd              VARCHAR(10)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_corp_bplc_d IS '법인사업장상세';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.bplc_seq IS '사업장순번';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.rgn_cd IS '지역코드';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.zip IS '우편번호';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.bplc_nm IS '사업장명';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.bplc_brno IS '사업장사업자등록번호';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.road_nm_addr IS '도로명주소';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.daddr IS '상세주소';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.bplc_rprs_telno IS '사업장대표전화번호';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.hq_yn IS '본사여부';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.bplc_reg_dtm IS '사업장등록일시';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.bplc_stts_ty_cd IS '사업장상태유형코드';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_corp_bplc_d.lst_rgtr_id IS '최초등록자ID';

-- CUS-016 고객관계 (예상 1,500,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_r (
  cust_no                      VARCHAR(20)    NOT NULL,
  rel_cust_no                  VARCHAR(20)    NOT NULL,
  cust_rel_ty_cd               VARCHAR(10)    NOT NULL,
  rel_bgng_dt                  CHAR(8)        NOT NULL,
  rel_end_dt                   CHAR(8),
  rel_evdc_ty_cd               VARCHAR(10),
  rel_idntf_dtm                TIMESTAMP,
  rel_stts_ty_cd               VARCHAR(10)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_cust_r IS '고객관계';
COMMENT ON COLUMN ptl_cus_cust_r.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_r.rel_cust_no IS '관계고객번호';
COMMENT ON COLUMN ptl_cus_cust_r.cust_rel_ty_cd IS '고객관계유형코드';
COMMENT ON COLUMN ptl_cus_cust_r.rel_bgng_dt IS '관계시작일자';
COMMENT ON COLUMN ptl_cus_cust_r.rel_end_dt IS '관계종료일자';
COMMENT ON COLUMN ptl_cus_cust_r.rel_evdc_ty_cd IS '관계증빙유형코드';
COMMENT ON COLUMN ptl_cus_cust_r.rel_idntf_dtm IS '관계확인일시';
COMMENT ON COLUMN ptl_cus_cust_r.rel_stts_ty_cd IS '관계상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_r.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_r.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_r.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_r.lst_rgtr_id IS '최초등록자ID';

-- CUS-017 청구계정이력 (예상 7,000,000행, 연 파티션)
CREATE TABLE IF NOT EXISTS ptl_cus_bill_acnt_h (
  bill_acnt_no                 VARCHAR(20)    NOT NULL,
  vld_bgng_dtm                 TIMESTAMP      NOT NULL,
  pyr_no                       VARCHAR(20)    NOT NULL,
  bill_cycl_cd                 VARCHAR(10)    NOT NULL,
  vld_end_dtm                  TIMESTAMP      NOT NULL,
  bill_acnt_nm                 VARCHAR(100)   NOT NULL,
  bill_acnt_stts_ty_cd         VARCHAR(10)    NOT NULL,
  bill_acnt_ty_cd              VARCHAR(10)    NOT NULL,
  intgr_bill_yn                CHAR(1)        NOT NULL,
  bill_acnt_chg_rsn_ty_cd      VARCHAR(10)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (vld_bgng_dtm);
DO $$
DECLARE i INT; v_lo TEXT; v_hi TEXT; v_nm TEXT;
BEGIN
  FOR i IN 0..17 LOOP
    v_lo := (2010 + i)::TEXT || '-01-01';
    v_hi := (2011 + i)::TEXT || '-01-01';
    v_nm := 'ptl_cus_bill_acnt_h_p' || (2010 + i)::TEXT;
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_cus_bill_acnt_h FOR VALUES FROM (%L) TO (%L)', v_nm, v_lo, v_hi);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_cus_bill_acnt_h_pdef PARTITION OF ptl_cus_bill_acnt_h DEFAULT;
COMMENT ON TABLE ptl_cus_bill_acnt_h IS '청구계정이력';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.pyr_no IS '납부자번호';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.bill_cycl_cd IS '청구주기코드';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.bill_acnt_nm IS '청구계정명';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.bill_acnt_stts_ty_cd IS '청구계정상태유형코드';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.bill_acnt_ty_cd IS '청구계정유형코드';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.intgr_bill_yn IS '통합청구여부';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.bill_acnt_chg_rsn_ty_cd IS '청구계정변경사유유형코드';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_bill_acnt_h.lst_rgtr_id IS '최초등록자ID';

-- CUS-018 청구서수령방법이력 (예상 5,000,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_invc_rcpt_mthd_h (
  bill_acnt_no                 VARCHAR(20)    NOT NULL,
  vld_bgng_dtm                 TIMESTAMP      NOT NULL,
  vld_end_dtm                  TIMESTAMP      NOT NULL,
  invc_rcpt_mthd_ty_cd         VARCHAR(10)    NOT NULL,
  invc_eml_addr                VARCHAR(100),
  invc_rcptn_mbl_telno         VARCHAR(20),
  chg_chnl_ty_cd               VARCHAR(10),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_invc_rcpt_mthd_h IS '청구서수령방법이력';
COMMENT ON COLUMN ptl_cus_invc_rcpt_mthd_h.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_cus_invc_rcpt_mthd_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_cus_invc_rcpt_mthd_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_cus_invc_rcpt_mthd_h.invc_rcpt_mthd_ty_cd IS '청구서수령방법유형코드';
COMMENT ON COLUMN ptl_cus_invc_rcpt_mthd_h.invc_eml_addr IS '청구서이메일주소';
COMMENT ON COLUMN ptl_cus_invc_rcpt_mthd_h.invc_rcptn_mbl_telno IS '청구서수신휴대전화번호';
COMMENT ON COLUMN ptl_cus_invc_rcpt_mthd_h.chg_chnl_ty_cd IS '변경채널유형코드';
COMMENT ON COLUMN ptl_cus_invc_rcpt_mthd_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_invc_rcpt_mthd_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_invc_rcpt_mthd_h.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_invc_rcpt_mthd_h.lst_rgtr_id IS '최초등록자ID';

-- CUS-019 납부자이력 (예상 5,500,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_pyr_h (
  pyr_no                       VARCHAR(20)    NOT NULL,
  vld_bgng_dtm                 TIMESTAMP      NOT NULL,
  vld_end_dtm                  TIMESTAMP      NOT NULL,
  pyr_nm                       VARCHAR(100)   NOT NULL,
  pyr_stts_ty_cd               VARCHAR(10)    NOT NULL,
  pyr_ty_cd                    VARCHAR(10)    NOT NULL,
  nmne_prsn_rel_ty_cd          VARCHAR(10),
  pyr_mbl_telno                VARCHAR(20),
  pyr_eml_addr                 VARCHAR(100),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_pyr_h IS '납부자이력';
COMMENT ON COLUMN ptl_cus_pyr_h.pyr_no IS '납부자번호';
COMMENT ON COLUMN ptl_cus_pyr_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_cus_pyr_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_cus_pyr_h.pyr_nm IS '납부자명';
COMMENT ON COLUMN ptl_cus_pyr_h.pyr_stts_ty_cd IS '납부자상태유형코드';
COMMENT ON COLUMN ptl_cus_pyr_h.pyr_ty_cd IS '납부자유형코드';
COMMENT ON COLUMN ptl_cus_pyr_h.nmne_prsn_rel_ty_cd IS '명의자관계유형코드';
COMMENT ON COLUMN ptl_cus_pyr_h.pyr_mbl_telno IS '납부자휴대전화번호';
COMMENT ON COLUMN ptl_cus_pyr_h.pyr_eml_addr IS '납부자이메일주소';
COMMENT ON COLUMN ptl_cus_pyr_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_pyr_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_pyr_h.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_pyr_h.lst_rgtr_id IS '최초등록자ID';

-- CUS-020 고객연락처이력 (예상 9,000,000행, 연 파티션)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_cntc_h (
  cust_no                      VARCHAR(20)    NOT NULL,
  cntc_seq                     NUMERIC(5)     NOT NULL,
  vld_bgng_dtm                 TIMESTAMP      NOT NULL,
  vld_end_dtm                  TIMESTAMP      NOT NULL,
  cntc_ty_cd                   VARCHAR(10)    NOT NULL,
  cntc_cn                      VARCHAR(200)   NOT NULL,
  cntc_stts_ty_cd              VARCHAR(10)    NOT NULL,
  rprs_cntc_yn                 CHAR(1)        NOT NULL,
  chg_chnl_ty_cd               VARCHAR(10),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (vld_bgng_dtm);
DO $$
DECLARE i INT; v_lo TEXT; v_hi TEXT; v_nm TEXT;
BEGIN
  FOR i IN 0..17 LOOP
    v_lo := (2010 + i)::TEXT || '-01-01';
    v_hi := (2011 + i)::TEXT || '-01-01';
    v_nm := 'ptl_cus_cust_cntc_h_p' || (2010 + i)::TEXT;
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_cus_cust_cntc_h FOR VALUES FROM (%L) TO (%L)', v_nm, v_lo, v_hi);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_cus_cust_cntc_h_pdef PARTITION OF ptl_cus_cust_cntc_h DEFAULT;
COMMENT ON TABLE ptl_cus_cust_cntc_h IS '고객연락처이력';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.cntc_seq IS '연락처순번';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.cntc_ty_cd IS '연락처유형코드';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.cntc_cn IS '연락처내용';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.cntc_stts_ty_cd IS '연락처상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.rprs_cntc_yn IS '대표연락처여부';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.chg_chnl_ty_cd IS '변경채널유형코드';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_cntc_h.lst_rgtr_id IS '최초등록자ID';

-- CUS-021 고객주소이력 (예상 7,000,000행, 연 파티션)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_addr_h (
  cust_no                      VARCHAR(20)    NOT NULL,
  addr_seq                     NUMERIC(5)     NOT NULL,
  vld_bgng_dtm                 TIMESTAMP      NOT NULL,
  rgn_cd                       VARCHAR(10)    NOT NULL,
  zip                          CHAR(5),
  vld_end_dtm                  TIMESTAMP      NOT NULL,
  addr_ty_cd                   VARCHAR(10)    NOT NULL,
  road_nm_addr                 VARCHAR(200),
  daddr                        VARCHAR(200),
  addr_stts_ty_cd              VARCHAR(10)    NOT NULL,
  cust_addr_chg_rsn_ty_cd      VARCHAR(10)    NOT NULL,
  chg_chnl_ty_cd               VARCHAR(10),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (vld_bgng_dtm);
DO $$
DECLARE i INT; v_lo TEXT; v_hi TEXT; v_nm TEXT;
BEGIN
  FOR i IN 0..17 LOOP
    v_lo := (2010 + i)::TEXT || '-01-01';
    v_hi := (2011 + i)::TEXT || '-01-01';
    v_nm := 'ptl_cus_cust_addr_h_p' || (2010 + i)::TEXT;
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_cus_cust_addr_h FOR VALUES FROM (%L) TO (%L)', v_nm, v_lo, v_hi);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_cus_cust_addr_h_pdef PARTITION OF ptl_cus_cust_addr_h DEFAULT;
COMMENT ON TABLE ptl_cus_cust_addr_h IS '고객주소이력';
COMMENT ON COLUMN ptl_cus_cust_addr_h.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_addr_h.addr_seq IS '주소순번';
COMMENT ON COLUMN ptl_cus_cust_addr_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_cus_cust_addr_h.rgn_cd IS '지역코드';
COMMENT ON COLUMN ptl_cus_cust_addr_h.zip IS '우편번호';
COMMENT ON COLUMN ptl_cus_cust_addr_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_cus_cust_addr_h.addr_ty_cd IS '주소유형코드';
COMMENT ON COLUMN ptl_cus_cust_addr_h.road_nm_addr IS '도로명주소';
COMMENT ON COLUMN ptl_cus_cust_addr_h.daddr IS '상세주소';
COMMENT ON COLUMN ptl_cus_cust_addr_h.addr_stts_ty_cd IS '주소상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_addr_h.cust_addr_chg_rsn_ty_cd IS '고객주소변경사유유형코드';
COMMENT ON COLUMN ptl_cus_cust_addr_h.chg_chnl_ty_cd IS '변경채널유형코드';
COMMENT ON COLUMN ptl_cus_cust_addr_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_addr_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_addr_h.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_addr_h.lst_rgtr_id IS '최초등록자ID';

-- CUS-022 동의항목코드 (예상 10,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_agre_itm_c (
  agre_itm_ty_cd               VARCHAR(10)    NOT NULL,
  agre_itm_ver_no              VARCHAR(20)    NOT NULL,
  agre_itm_nm                  VARCHAR(100)   NOT NULL,
  esntl_agre_yn                CHAR(1)        NOT NULL,
  agre_itm_cn                  VARCHAR(4000),
  agre_vld_mcnt                NUMERIC(10),
  aplcn_bgng_dt                CHAR(8)        NOT NULL,
  aplcn_end_dt                 CHAR(8),
  agre_itm_reg_dtm             TIMESTAMP      NOT NULL,
  agre_itm_stts_ty_cd          VARCHAR(10)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_agre_itm_c IS '동의항목코드';
COMMENT ON COLUMN ptl_cus_agre_itm_c.agre_itm_ty_cd IS '동의항목유형코드';
COMMENT ON COLUMN ptl_cus_agre_itm_c.agre_itm_ver_no IS '동의항목버전번호';
COMMENT ON COLUMN ptl_cus_agre_itm_c.agre_itm_nm IS '동의항목명';
COMMENT ON COLUMN ptl_cus_agre_itm_c.esntl_agre_yn IS '필수동의여부';
COMMENT ON COLUMN ptl_cus_agre_itm_c.agre_itm_cn IS '동의항목내용';
COMMENT ON COLUMN ptl_cus_agre_itm_c.agre_vld_mcnt IS '동의유효개월수';
COMMENT ON COLUMN ptl_cus_agre_itm_c.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_cus_agre_itm_c.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_cus_agre_itm_c.agre_itm_reg_dtm IS '동의항목등록일시';
COMMENT ON COLUMN ptl_cus_agre_itm_c.agre_itm_stts_ty_cd IS '동의항목상태유형코드';
COMMENT ON COLUMN ptl_cus_agre_itm_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_agre_itm_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_agre_itm_c.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_agre_itm_c.lst_rgtr_id IS '최초등록자ID';

-- CUS-023 고객동의이력 (예상 12,000,000행, 연 파티션)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_agre_h (
  cust_agre_no                 VARCHAR(20)    NOT NULL,
  vld_bgng_dtm                 TIMESTAMP      NOT NULL,
  vld_end_dtm                  TIMESTAMP      NOT NULL,
  agre_stts_ty_cd              VARCHAR(10)    NOT NULL,
  agre_yn                      CHAR(1)        NOT NULL,
  agre_chnl_ty_cd              VARCHAR(10)    NOT NULL,
  agre_chg_rsn_ty_cd           VARCHAR(10),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (vld_bgng_dtm);
DO $$
DECLARE i INT; v_lo TEXT; v_hi TEXT; v_nm TEXT;
BEGIN
  FOR i IN 0..17 LOOP
    v_lo := (2010 + i)::TEXT || '-01-01';
    v_hi := (2011 + i)::TEXT || '-01-01';
    v_nm := 'ptl_cus_cust_agre_h_p' || (2010 + i)::TEXT;
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_cus_cust_agre_h FOR VALUES FROM (%L) TO (%L)', v_nm, v_lo, v_hi);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_cus_cust_agre_h_pdef PARTITION OF ptl_cus_cust_agre_h DEFAULT;
COMMENT ON TABLE ptl_cus_cust_agre_h IS '고객동의이력';
COMMENT ON COLUMN ptl_cus_cust_agre_h.cust_agre_no IS '고객동의번호';
COMMENT ON COLUMN ptl_cus_cust_agre_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_cus_cust_agre_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_cus_cust_agre_h.agre_stts_ty_cd IS '동의상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_agre_h.agre_yn IS '동의여부';
COMMENT ON COLUMN ptl_cus_cust_agre_h.agre_chnl_ty_cd IS '동의채널유형코드';
COMMENT ON COLUMN ptl_cus_cust_agre_h.agre_chg_rsn_ty_cd IS '동의변경사유유형코드';
COMMENT ON COLUMN ptl_cus_cust_agre_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_agre_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_agre_h.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_agre_h.lst_rgtr_id IS '최초등록자ID';

-- CUS-024 마케팅수신거부내역 (예상 1,000,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_mkt_rcptn_deny_l (
  rcptn_deny_no                VARCHAR(20)    NOT NULL,
  cust_no                      VARCHAR(20),
  rcptn_deny_telno             VARCHAR(20)    NOT NULL,
  rcptn_deny_dtm               TIMESTAMP      NOT NULL,
  rcptn_deny_mdm_ty_cd         VARCHAR(10)    NOT NULL,
  rcptn_deny_chnl_ty_cd        VARCHAR(10)    NOT NULL,
  rcptn_deny_stts_ty_cd        VARCHAR(10)    NOT NULL,
  rcptn_deny_rls_dtm           TIMESTAMP,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_mkt_rcptn_deny_l IS '마케팅수신거부내역';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.rcptn_deny_no IS '수신거부번호';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.rcptn_deny_telno IS '수신거부전화번호';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.rcptn_deny_dtm IS '수신거부일시';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.rcptn_deny_mdm_ty_cd IS '수신거부매체유형코드';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.rcptn_deny_chnl_ty_cd IS '수신거부채널유형코드';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.rcptn_deny_stts_ty_cd IS '수신거부상태유형코드';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.rcptn_deny_rls_dtm IS '수신거부해제일시';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_mkt_rcptn_deny_l.lst_rgtr_id IS '최초등록자ID';

-- CUS-025 우편번호기본 (예상 35,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_zip_m (
  zip                          CHAR(5)        NOT NULL,
  rgn_cd                       VARCHAR(10)    NOT NULL,
  islnd_mntn_yn                CHAR(1)        NOT NULL,
  aplcn_bgng_dt                CHAR(8)        NOT NULL,
  aplcn_end_dt                 CHAR(8),
  zip_reg_dtm                  TIMESTAMP      NOT NULL,
  zip_stts_ty_cd               VARCHAR(10)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_zip_m IS '우편번호기본';
COMMENT ON COLUMN ptl_cus_zip_m.zip IS '우편번호';
COMMENT ON COLUMN ptl_cus_zip_m.rgn_cd IS '지역코드';
COMMENT ON COLUMN ptl_cus_zip_m.islnd_mntn_yn IS '도서산간여부';
COMMENT ON COLUMN ptl_cus_zip_m.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_cus_zip_m.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_cus_zip_m.zip_reg_dtm IS '우편번호등록일시';
COMMENT ON COLUMN ptl_cus_zip_m.zip_stts_ty_cd IS '우편번호상태유형코드';
COMMENT ON COLUMN ptl_cus_zip_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_zip_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_zip_m.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_zip_m.lst_rgtr_id IS '최초등록자ID';

-- CUS-026 고객멤버십기본 (예상 3,000,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_mbsp_m (
  mbsp_no                      VARCHAR(20)    NOT NULL,
  cust_no                      VARCHAR(20)    NOT NULL,
  mbsp_card_no                 VARCHAR(20),
  mbsp_sbsc_dtm                TIMESTAMP      NOT NULL,
  mbsp_grd_ty_cd               VARCHAR(10)    NOT NULL,
  mbsp_stts_ty_cd              VARCHAR(10)    NOT NULL,
  mbsp_vld_end_dt              CHAR(8),
  mbsp_trmn_dtm                TIMESTAMP,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_cust_mbsp_m IS '고객멤버십기본';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.mbsp_no IS '멤버십번호';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.mbsp_card_no IS '멤버십카드번호';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.mbsp_sbsc_dtm IS '멤버십가입일시';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.mbsp_grd_ty_cd IS '멤버십등급유형코드';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.mbsp_stts_ty_cd IS '멤버십상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.mbsp_vld_end_dt IS '멤버십유효종료일자';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.mbsp_trmn_dtm IS '멤버십해지일시';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_mbsp_m.lst_rgtr_id IS '최초등록자ID';

-- CUS-027 멤버십포인트내역 (예상 15,000,000행, 연 파티션)
CREATE TABLE IF NOT EXISTS ptl_cus_mbsp_point_l (
  mbsp_no                      VARCHAR(20)    NOT NULL,
  point_trd_seq                NUMERIC(10)    NOT NULL,
  point_trd_dtm                TIMESTAMP      NOT NULL,
  prtnr_no                     VARCHAR(20),
  orgn_point_trd_seq           NUMERIC(10),
  point_trd_ty_cd              VARCHAR(10)    NOT NULL,
  trd_point_cnt                NUMERIC(10)    NOT NULL,
  point_extsh_schd_dt          CHAR(8),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (point_trd_dtm);
DO $$
DECLARE i INT; v_lo TEXT; v_hi TEXT; v_nm TEXT;
BEGIN
  FOR i IN 0..17 LOOP
    v_lo := (2010 + i)::TEXT || '-01-01';
    v_hi := (2011 + i)::TEXT || '-01-01';
    v_nm := 'ptl_cus_mbsp_point_l_p' || (2010 + i)::TEXT;
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_cus_mbsp_point_l FOR VALUES FROM (%L) TO (%L)', v_nm, v_lo, v_hi);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_cus_mbsp_point_l_pdef PARTITION OF ptl_cus_mbsp_point_l DEFAULT;
COMMENT ON TABLE ptl_cus_mbsp_point_l IS '멤버십포인트내역';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.mbsp_no IS '멤버십번호';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.point_trd_seq IS '포인트거래순번';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.point_trd_dtm IS '포인트거래일시';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.prtnr_no IS '파트너번호';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.orgn_point_trd_seq IS '원포인트거래순번';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.point_trd_ty_cd IS '포인트거래유형코드';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.trd_point_cnt IS '거래포인트수';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.point_extsh_schd_dt IS '포인트소멸예정일자';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_mbsp_point_l.lst_rgtr_id IS '최초등록자ID';

-- CUS-028 고객상담내역 (예상 12,000,000행, 연 파티션)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_cnsl_l (
  cnsl_no                      VARCHAR(20)    NOT NULL,
  cnsl_dtm                     TIMESTAMP      NOT NULL,
  cust_no                      VARCHAR(20),
  svc_mgmt_no                  VARCHAR(20),
  org_cd                       VARCHAR(10),
  cnsl_chnl_ty_cd              VARCHAR(10)    NOT NULL,
  cnsl_ty_cd                   VARCHAR(10)    NOT NULL,
  cnsl_rslt_ty_cd              VARCHAR(10)    NOT NULL,
  cnsl_scnt                    NUMERIC(10),
  cnsl_cn                      VARCHAR(4000),
  cvlcpt_cnvr_yn               CHAR(1)        NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (cnsl_dtm);
DO $$
DECLARE i INT; v_lo TEXT; v_hi TEXT; v_nm TEXT;
BEGIN
  FOR i IN 0..17 LOOP
    v_lo := (2010 + i)::TEXT || '-01-01';
    v_hi := (2011 + i)::TEXT || '-01-01';
    v_nm := 'ptl_cus_cust_cnsl_l_p' || (2010 + i)::TEXT;
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_cus_cust_cnsl_l FOR VALUES FROM (%L) TO (%L)', v_nm, v_lo, v_hi);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_cus_cust_cnsl_l_pdef PARTITION OF ptl_cus_cust_cnsl_l DEFAULT;
COMMENT ON TABLE ptl_cus_cust_cnsl_l IS '고객상담내역';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.cnsl_no IS '상담번호';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.cnsl_dtm IS '상담일시';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.org_cd IS '조직코드';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.cnsl_chnl_ty_cd IS '상담채널유형코드';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.cnsl_ty_cd IS '상담유형코드';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.cnsl_rslt_ty_cd IS '상담결과유형코드';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.cnsl_scnt IS '상담초수';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.cnsl_cn IS '상담내용';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.cvlcpt_cnvr_yn IS '민원전환여부';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_cnsl_l.lst_rgtr_id IS '최초등록자ID';

-- CUS-029 고객민원내역 (예상 500,000행)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_cvlcpt_l (
  cvlcpt_no                    VARCHAR(20)    NOT NULL,
  cust_no                      VARCHAR(20)    NOT NULL,
  cnsl_no                      VARCHAR(20),
  cnsl_dtm                     TIMESTAMP,
  svc_mgmt_no                  VARCHAR(20),
  cvlcpt_acpt_dtm              TIMESTAMP      NOT NULL,
  cvlcpt_ty_cd                 VARCHAR(10)    NOT NULL,
  cvlcpt_acpt_chnl_ty_cd       VARCHAR(10)    NOT NULL,
  cvlcpt_prcs_stts_ty_cd       VARCHAR(10)    NOT NULL,
  cvlcpt_cn                    VARCHAR(4000),
  prcs_tmlmt_dt                CHAR(8),
  prcs_cmptn_dtm               TIMESTAMP,
  prcs_rslt_cn                 VARCHAR(4000),
  cmpns_amt                    NUMERIC(15),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_cus_cust_cvlcpt_l IS '고객민원내역';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.cvlcpt_no IS '민원번호';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.cnsl_no IS '상담번호';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.cnsl_dtm IS '상담일시';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.cvlcpt_acpt_dtm IS '민원접수일시';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.cvlcpt_ty_cd IS '민원유형코드';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.cvlcpt_acpt_chnl_ty_cd IS '민원접수채널유형코드';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.cvlcpt_prcs_stts_ty_cd IS '민원처리상태유형코드';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.cvlcpt_cn IS '민원내용';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.prcs_tmlmt_dt IS '처리기한일자';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.prcs_cmptn_dtm IS '처리완료일시';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.prcs_rslt_cn IS '처리결과내용';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.cmpns_amt IS '보상금액';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_cvlcpt_l.lst_rgtr_id IS '최초등록자ID';

-- CUS-030 고객월통계 (예상 15,000,000행, 월 파티션)
CREATE TABLE IF NOT EXISTS ptl_cus_cust_mm_s (
  cust_no                      VARCHAR(20)    NOT NULL,
  std_ym                       CHAR(6)        NOT NULL,
  rgn_cd                       VARCHAR(10),
  cust_ty_cd                   VARCHAR(10)    NOT NULL,
  cust_grd_ty_cd               VARCHAR(10),
  line_cnt                     NUMERIC(10)    NOT NULL,
  actv_line_cnt                NUMERIC(10)    NOT NULL,
  bill_amt                     NUMERIC(15)    NOT NULL,
  rcv_amt                      NUMERIC(15)    NOT NULL,
  unpd_amt                     NUMERIC(15)    NOT NULL,
  sbsc_prd_mcnt                NUMERIC(5),
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (std_ym);
DO $$
DECLARE i INT; v_lo TEXT; v_hi TEXT; v_nm TEXT;
BEGIN
  FOR i IN 0..215 LOOP
    v_lo := to_char(DATE '2010-01-01' + make_interval(months => i), 'YYYYMM');
    v_hi := to_char(DATE '2010-01-01' + make_interval(months => i + 1), 'YYYYMM');
    v_nm := 'ptl_cus_cust_mm_s_p' || v_lo;
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_cus_cust_mm_s FOR VALUES FROM (%L) TO (%L)', v_nm, v_lo, v_hi);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_cus_cust_mm_s_pdef PARTITION OF ptl_cus_cust_mm_s DEFAULT;
COMMENT ON TABLE ptl_cus_cust_mm_s IS '고객월통계';
COMMENT ON COLUMN ptl_cus_cust_mm_s.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_cus_cust_mm_s.std_ym IS '기준년월';
COMMENT ON COLUMN ptl_cus_cust_mm_s.rgn_cd IS '지역코드';
COMMENT ON COLUMN ptl_cus_cust_mm_s.cust_ty_cd IS '고객유형코드';
COMMENT ON COLUMN ptl_cus_cust_mm_s.cust_grd_ty_cd IS '고객등급유형코드';
COMMENT ON COLUMN ptl_cus_cust_mm_s.line_cnt IS '회선수';
COMMENT ON COLUMN ptl_cus_cust_mm_s.actv_line_cnt IS '활성회선수';
COMMENT ON COLUMN ptl_cus_cust_mm_s.bill_amt IS '청구금액';
COMMENT ON COLUMN ptl_cus_cust_mm_s.rcv_amt IS '수납금액';
COMMENT ON COLUMN ptl_cus_cust_mm_s.unpd_amt IS '미납금액';
COMMENT ON COLUMN ptl_cus_cust_mm_s.sbsc_prd_mcnt IS '가입기간개월수';
COMMENT ON COLUMN ptl_cus_cust_mm_s.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_cus_cust_mm_s.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_cus_cust_mm_s.lst_rgdtm IS '최초등록일시';
COMMENT ON COLUMN ptl_cus_cust_mm_s.lst_rgtr_id IS '최초등록자ID';

