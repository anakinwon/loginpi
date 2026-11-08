-- Pi통신 과금 데이터 표준화 — COL(미납) 테이블(PK·인덱스 없음, 적재 전 실행 — D14)
-- 생성 : sitemap/pitel/tools/physical_COL_build.js (손으로 고치지 말고 생성기를 고칠 것)
-- 대상 : PostgreSQL 17, 실행 전 SET search_path 로 대상 스키마 지정. 재실행 안전(IF NOT EXISTS·존재 확인)
-- 참조무결성 FK 는 설계만(D6) — 이 파일에 FK 제약 없음

-- COL-001 미납기본 · 목표 20,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_unpd_m (
  unpd_no VARCHAR(20) NOT NULL,
  bill_no VARCHAR(20) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  bill_ym CHAR(6) NOT NULL,
  cust_no VARCHAR(20) NOT NULL,
  rcvb_trnsf_no VARCHAR(20),
  div_pay_agrmt_no VARCHAR(20),
  unpd_rcvb_nm VARCHAR(100) NOT NULL,
  unpd_ocrn_dtm TIMESTAMP NOT NULL,
  unpd_stts_ty_cd VARCHAR(10) NOT NULL,
  frst_unpd_amt NUMERIC(15) NOT NULL,
  unpd_rmnd_amt NUMERIC(15) NOT NULL,
  dun_step_ty_cd VARCHAR(10),
  cmplpay_dtm TIMESTAMP,
  extsh_prscr_expry_dt CHAR(8) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_unpd_m IS '미납기본';
COMMENT ON COLUMN ptl_col_unpd_m.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_unpd_m.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_col_unpd_m.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_col_unpd_m.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_col_unpd_m.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_col_unpd_m.rcvb_trnsf_no IS '채권이관번호';
COMMENT ON COLUMN ptl_col_unpd_m.div_pay_agrmt_no IS '분할납부약정번호';
COMMENT ON COLUMN ptl_col_unpd_m.unpd_rcvb_nm IS '미납채권명';
COMMENT ON COLUMN ptl_col_unpd_m.unpd_ocrn_dtm IS '미납발생일시';
COMMENT ON COLUMN ptl_col_unpd_m.unpd_stts_ty_cd IS '미납상태유형코드';
COMMENT ON COLUMN ptl_col_unpd_m.frst_unpd_amt IS '최초미납금액';
COMMENT ON COLUMN ptl_col_unpd_m.unpd_rmnd_amt IS '미납잔여금액';
COMMENT ON COLUMN ptl_col_unpd_m.dun_step_ty_cd IS '독촉단계유형코드';
COMMENT ON COLUMN ptl_col_unpd_m.cmplpay_dtm IS '완납일시';
COMMENT ON COLUMN ptl_col_unpd_m.extsh_prscr_expry_dt IS '소멸시효만료일자';
COMMENT ON COLUMN ptl_col_unpd_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_unpd_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_unpd_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_unpd_m.lst_rgtr_id IS '최종등록자ID';

-- COL-002 미납상세 · 목표 60,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_unpd_d (
  unpd_no VARCHAR(20) NOT NULL,
  unpd_dtl_seq NUMERIC(10) NOT NULL,
  bill_no VARCHAR(20) NOT NULL,
  bill_dtl_seq NUMERIC(5) NOT NULL,
  bill_ym CHAR(6) NOT NULL,
  unpd_itm_nm VARCHAR(100) NOT NULL,
  last_rcv_rflt_dtm TIMESTAMP,
  unpd_itm_stts_ty_cd VARCHAR(10) NOT NULL,
  frst_unpd_amt NUMERIC(15) NOT NULL,
  acml_rcv_amt NUMERIC(15) NOT NULL,
  unpd_rmnd_amt NUMERIC(15) NOT NULL,
  unpd_adj_amt NUMERIC(15) NOT NULL,
  div_pay_trgt_yn CHAR(1) NOT NULL,
  bddt_prcs_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_unpd_d IS '미납상세';
COMMENT ON COLUMN ptl_col_unpd_d.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_unpd_d.unpd_dtl_seq IS '미납상세순번';
COMMENT ON COLUMN ptl_col_unpd_d.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_col_unpd_d.bill_dtl_seq IS '청구상세순번';
COMMENT ON COLUMN ptl_col_unpd_d.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_col_unpd_d.unpd_itm_nm IS '미납항목명';
COMMENT ON COLUMN ptl_col_unpd_d.last_rcv_rflt_dtm IS '최종수납반영일시';
COMMENT ON COLUMN ptl_col_unpd_d.unpd_itm_stts_ty_cd IS '미납항목상태유형코드';
COMMENT ON COLUMN ptl_col_unpd_d.frst_unpd_amt IS '최초미납금액';
COMMENT ON COLUMN ptl_col_unpd_d.acml_rcv_amt IS '누적수납금액';
COMMENT ON COLUMN ptl_col_unpd_d.unpd_rmnd_amt IS '미납잔여금액';
COMMENT ON COLUMN ptl_col_unpd_d.unpd_adj_amt IS '미납조정금액';
COMMENT ON COLUMN ptl_col_unpd_d.div_pay_trgt_yn IS '분할납부대상여부';
COMMENT ON COLUMN ptl_col_unpd_d.bddt_prcs_yn IS '대손처리여부';
COMMENT ON COLUMN ptl_col_unpd_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_unpd_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_unpd_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_unpd_d.lst_rgtr_id IS '최종등록자ID';

-- COL-003 연체가산금내역 · 목표 40,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_ovdu_adchg_l (
  ovdu_adchg_no VARCHAR(20) NOT NULL,
  adchg_imps_dtm TIMESTAMP NOT NULL,
  unpd_no VARCHAR(20) NOT NULL,
  rflt_bill_no VARCHAR(20),
  rflt_bill_ym CHAR(6),
  ovdu_adchg_std_ty_cd VARCHAR(10) NOT NULL,
  ovdu_adchg_nm VARCHAR(100) NOT NULL,
  adchg_imps_stts_ty_cd VARCHAR(10) NOT NULL,
  imps_ym CHAR(6) NOT NULL,
  adtn_trgt_amt NUMERIC(15) NOT NULL,
  aplcn_adchg_rt NUMERIC(5,2) NOT NULL,
  imps_amt NUMERIC(15) NOT NULL,
  rdct_amt NUMERIC(15) NOT NULL,
  adchg_uplmt_aplcn_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (adchg_imps_dtm);
DO $$
BEGIN
  FOR y IN 2010..2027 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_col_ovdu_adchg_l FOR VALUES FROM (%L) TO (%L)', 'ptl_col_ovdu_adchg_l_y' || y, make_date(y, 1, 1)::text, make_date(y + 1, 1, 1)::text);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_col_ovdu_adchg_l_def PARTITION OF ptl_col_ovdu_adchg_l DEFAULT;
COMMENT ON TABLE ptl_col_ovdu_adchg_l IS '연체가산금내역';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.ovdu_adchg_no IS '연체가산금번호';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.adchg_imps_dtm IS '가산금부과일시';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.rflt_bill_no IS '반영청구번호';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.rflt_bill_ym IS '반영청구년월';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.ovdu_adchg_std_ty_cd IS '연체가산금기준유형코드';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.ovdu_adchg_nm IS '연체가산금명';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.adchg_imps_stts_ty_cd IS '가산금부과상태유형코드';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.imps_ym IS '부과년월';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.adtn_trgt_amt IS '가산대상금액';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.aplcn_adchg_rt IS '적용가산금율';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.imps_amt IS '부과금액';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.rdct_amt IS '감면금액';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.adchg_uplmt_aplcn_yn IS '가산금상한적용여부';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_ovdu_adchg_l.lst_rgtr_id IS '최종등록자ID';

-- COL-004 독촉내역 · 목표 50,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_dun_l (
  dun_no VARCHAR(20) NOT NULL,
  dun_sndng_dtm TIMESTAMP NOT NULL,
  unpd_no VARCHAR(20) NOT NULL,
  dun_plcy_no VARCHAR(20) NOT NULL,
  dun_ttl_nm VARCHAR(100) NOT NULL,
  dun_sndng_stts_ty_cd VARCHAR(10) NOT NULL,
  dun_mdm_ty_cd VARCHAR(10) NOT NULL,
  dun_trgt_amt NUMERIC(15) NOT NULL,
  rcptn_telno_encpt_vl VARCHAR(256),
  dun_cn VARCHAR(4000),
  sndng_rslt_rcptn_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (dun_sndng_dtm);
DO $$
BEGIN
  FOR y IN 2010..2027 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_col_dun_l FOR VALUES FROM (%L) TO (%L)', 'ptl_col_dun_l_y' || y, make_date(y, 1, 1)::text, make_date(y + 1, 1, 1)::text);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_col_dun_l_def PARTITION OF ptl_col_dun_l DEFAULT;
COMMENT ON TABLE ptl_col_dun_l IS '독촉내역';
COMMENT ON COLUMN ptl_col_dun_l.dun_no IS '독촉번호';
COMMENT ON COLUMN ptl_col_dun_l.dun_sndng_dtm IS '독촉발송일시';
COMMENT ON COLUMN ptl_col_dun_l.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_dun_l.dun_plcy_no IS '독촉정책번호';
COMMENT ON COLUMN ptl_col_dun_l.dun_ttl_nm IS '독촉제목명';
COMMENT ON COLUMN ptl_col_dun_l.dun_sndng_stts_ty_cd IS '독촉발송상태유형코드';
COMMENT ON COLUMN ptl_col_dun_l.dun_mdm_ty_cd IS '독촉매체유형코드';
COMMENT ON COLUMN ptl_col_dun_l.dun_trgt_amt IS '독촉대상금액';
COMMENT ON COLUMN ptl_col_dun_l.rcptn_telno_encpt_vl IS '수신전화번호암호화값';
COMMENT ON COLUMN ptl_col_dun_l.dun_cn IS '독촉내용';
COMMENT ON COLUMN ptl_col_dun_l.sndng_rslt_rcptn_dtm IS '발송결과수신일시';
COMMENT ON COLUMN ptl_col_dun_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_dun_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_dun_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_dun_l.lst_rgtr_id IS '최종등록자ID';

-- COL-005 이용정지기본 · 목표 6,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_susp_m (
  susp_no VARCHAR(20) NOT NULL,
  svc_mgmt_no VARCHAR(20) NOT NULL,
  unpd_no VARCHAR(20) NOT NULL,
  susp_nm VARCHAR(100) NOT NULL,
  susp_dtm TIMESTAMP NOT NULL,
  susp_stts_ty_cd VARCHAR(10) NOT NULL,
  susp_step_ty_cd VARCHAR(10) NOT NULL,
  susp_prntc_dtm TIMESTAMP,
  susp_std_unpd_amt NUMERIC(15) NOT NULL,
  susp_std_elps_dcnt NUMERIC(5) NOT NULL,
  susp_rls_dtm TIMESTAMP,
  susp_rls_rsn_ty_cd VARCHAR(10),
  line_stts_rflt_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_susp_m IS '이용정지기본';
COMMENT ON COLUMN ptl_col_susp_m.susp_no IS '이용정지번호';
COMMENT ON COLUMN ptl_col_susp_m.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_col_susp_m.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_susp_m.susp_nm IS '이용정지명';
COMMENT ON COLUMN ptl_col_susp_m.susp_dtm IS '이용정지일시';
COMMENT ON COLUMN ptl_col_susp_m.susp_stts_ty_cd IS '이용정지상태유형코드';
COMMENT ON COLUMN ptl_col_susp_m.susp_step_ty_cd IS '이용정지단계유형코드';
COMMENT ON COLUMN ptl_col_susp_m.susp_prntc_dtm IS '이용정지예고일시';
COMMENT ON COLUMN ptl_col_susp_m.susp_std_unpd_amt IS '이용정지기준미납금액';
COMMENT ON COLUMN ptl_col_susp_m.susp_std_elps_dcnt IS '이용정지기준경과일수';
COMMENT ON COLUMN ptl_col_susp_m.susp_rls_dtm IS '이용정지해제일시';
COMMENT ON COLUMN ptl_col_susp_m.susp_rls_rsn_ty_cd IS '이용정지해제사유유형코드';
COMMENT ON COLUMN ptl_col_susp_m.line_stts_rflt_yn IS '회선상태반영여부';
COMMENT ON COLUMN ptl_col_susp_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_susp_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_susp_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_susp_m.lst_rgtr_id IS '최종등록자ID';

-- COL-006 직권해지기본 · 목표 1,500,000행
CREATE TABLE IF NOT EXISTS ptl_col_exoftrmn_m (
  exoftrmn_no VARCHAR(20) NOT NULL,
  sbsc_ctrt_no VARCHAR(20) NOT NULL,
  unpd_no VARCHAR(20) NOT NULL,
  susp_no VARCHAR(20),
  exoftrmn_nm VARCHAR(100) NOT NULL,
  exoftrmn_dtm TIMESTAMP NOT NULL,
  exoftrmn_stts_ty_cd VARCHAR(10) NOT NULL,
  exoftrmn_rsn_ty_cd VARCHAR(10) NOT NULL,
  exoftrmn_prntc_dtm TIMESTAMP,
  exoftrmn_schd_dt CHAR(8) NOT NULL,
  trmn_std_unpd_amt NUMERIC(15) NOT NULL,
  exoftrmn_wthdr_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_exoftrmn_m IS '직권해지기본';
COMMENT ON COLUMN ptl_col_exoftrmn_m.exoftrmn_no IS '직권해지번호';
COMMENT ON COLUMN ptl_col_exoftrmn_m.sbsc_ctrt_no IS '가입계약번호';
COMMENT ON COLUMN ptl_col_exoftrmn_m.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_exoftrmn_m.susp_no IS '이용정지번호';
COMMENT ON COLUMN ptl_col_exoftrmn_m.exoftrmn_nm IS '직권해지명';
COMMENT ON COLUMN ptl_col_exoftrmn_m.exoftrmn_dtm IS '직권해지일시';
COMMENT ON COLUMN ptl_col_exoftrmn_m.exoftrmn_stts_ty_cd IS '직권해지상태유형코드';
COMMENT ON COLUMN ptl_col_exoftrmn_m.exoftrmn_rsn_ty_cd IS '직권해지사유유형코드';
COMMENT ON COLUMN ptl_col_exoftrmn_m.exoftrmn_prntc_dtm IS '직권해지예고일시';
COMMENT ON COLUMN ptl_col_exoftrmn_m.exoftrmn_schd_dt IS '직권해지예정일자';
COMMENT ON COLUMN ptl_col_exoftrmn_m.trmn_std_unpd_amt IS '해지기준미납금액';
COMMENT ON COLUMN ptl_col_exoftrmn_m.exoftrmn_wthdr_dtm IS '직권해지철회일시';
COMMENT ON COLUMN ptl_col_exoftrmn_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_exoftrmn_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_exoftrmn_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_exoftrmn_m.lst_rgtr_id IS '최종등록자ID';

-- COL-007 채권이관기본 · 목표 1,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_rcvb_trnsf_m (
  rcvb_trnsf_no VARCHAR(20) NOT NULL,
  cust_no VARCHAR(20) NOT NULL,
  rcvb_dspsl_no VARCHAR(20),
  rcvb_trnsf_nm VARCHAR(100) NOT NULL,
  rcvb_trnsf_dtm TIMESTAMP NOT NULL,
  rcvb_trnsf_stts_ty_cd VARCHAR(10) NOT NULL,
  rcvb_trnsf_ty_cd VARCHAR(10) NOT NULL,
  trnsf_rcvb_amt NUMERIC(15) NOT NULL,
  trnsf_rcvb_nocs NUMERIC(10) NOT NULL,
  rtrvl_end_dt CHAR(8),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_rcvb_trnsf_m IS '채권이관기본';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.rcvb_trnsf_no IS '채권이관번호';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.rcvb_dspsl_no IS '채권매각번호';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.rcvb_trnsf_nm IS '채권이관명';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.rcvb_trnsf_dtm IS '채권이관일시';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.rcvb_trnsf_stts_ty_cd IS '채권이관상태유형코드';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.rcvb_trnsf_ty_cd IS '채권이관유형코드';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.trnsf_rcvb_amt IS '이관채권금액';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.trnsf_rcvb_nocs IS '이관채권건수';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.rtrvl_end_dt IS '회수종료일자';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_rcvb_trnsf_m.lst_rgtr_id IS '최종등록자ID';

-- COL-008 분할납부약정기본 · 목표 2,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_div_pay_agrmt_m (
  div_pay_agrmt_no VARCHAR(20) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  div_pay_agrmt_nm VARCHAR(100) NOT NULL,
  div_pay_agrmt_dtm TIMESTAMP NOT NULL,
  div_pay_agrmt_stts_ty_cd VARCHAR(10) NOT NULL,
  agrmt_trgt_amt NUMERIC(15) NOT NULL,
  div_tms_cnt NUMERIC(3) NOT NULL,
  frst_pay_schd_dt CHAR(8) NOT NULL,
  susp_rls_cnd_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_div_pay_agrmt_m IS '분할납부약정기본';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.div_pay_agrmt_no IS '분할납부약정번호';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.div_pay_agrmt_nm IS '분할납부약정명';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.div_pay_agrmt_dtm IS '분할납부약정일시';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.div_pay_agrmt_stts_ty_cd IS '분할납부약정상태유형코드';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.agrmt_trgt_amt IS '약정대상금액';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.div_tms_cnt IS '분할회차수';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.frst_pay_schd_dt IS '최초납부예정일자';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.susp_rls_cnd_yn IS '이용정지해제조건여부';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_div_pay_agrmt_m.lst_rgtr_id IS '최종등록자ID';

-- COL-009 대손기본 · 목표 4,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_bddt_m (
  bddt_no VARCHAR(20) NOT NULL,
  unpd_no VARCHAR(20) NOT NULL,
  rcvb_trnsf_no VARCHAR(20),
  bddt_nm VARCHAR(100) NOT NULL,
  bddt_dprc_dtm TIMESTAMP NOT NULL,
  bddt_stts_ty_cd VARCHAR(10) NOT NULL,
  bddt_rsn_ty_cd VARCHAR(10) NOT NULL,
  bddt_cfmtn_dt CHAR(8) NOT NULL,
  bddt_amt NUMERIC(15) NOT NULL,
  txaf_lsexp_rcgtn_yn CHAR(1) NOT NULL,
  acntg_slip_no VARCHAR(20),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_bddt_m IS '대손기본';
COMMENT ON COLUMN ptl_col_bddt_m.bddt_no IS '대손번호';
COMMENT ON COLUMN ptl_col_bddt_m.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_bddt_m.rcvb_trnsf_no IS '채권이관번호';
COMMENT ON COLUMN ptl_col_bddt_m.bddt_nm IS '대손명';
COMMENT ON COLUMN ptl_col_bddt_m.bddt_dprc_dtm IS '대손상각일시';
COMMENT ON COLUMN ptl_col_bddt_m.bddt_stts_ty_cd IS '대손상태유형코드';
COMMENT ON COLUMN ptl_col_bddt_m.bddt_rsn_ty_cd IS '대손사유유형코드';
COMMENT ON COLUMN ptl_col_bddt_m.bddt_cfmtn_dt IS '대손확정일자';
COMMENT ON COLUMN ptl_col_bddt_m.bddt_amt IS '대손금액';
COMMENT ON COLUMN ptl_col_bddt_m.txaf_lsexp_rcgtn_yn IS '세무손금인정여부';
COMMENT ON COLUMN ptl_col_bddt_m.acntg_slip_no IS '회계전표번호';
COMMENT ON COLUMN ptl_col_bddt_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_bddt_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_bddt_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_bddt_m.lst_rgtr_id IS '최종등록자ID';

-- COL-010 미납상태이력 · 목표 70,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_unpd_stts_h (
  unpd_no VARCHAR(20) NOT NULL,
  stts_chg_seq NUMERIC(10) NOT NULL,
  stts_chg_dtm TIMESTAMP NOT NULL,
  stts_chg_rsn_nm VARCHAR(100) NOT NULL,
  unpd_stts_ty_cd VARCHAR(10) NOT NULL,
  bfr_unpd_stts_ty_cd VARCHAR(10),
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP NOT NULL,
  chg_pnt_unpd_rmnd_amt NUMERIC(15) NOT NULL,
  caus_task_ty_cd VARCHAR(10) NOT NULL,
  caus_task_no VARCHAR(20),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (stts_chg_dtm);
DO $$
BEGIN
  FOR y IN 2010..2027 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_col_unpd_stts_h FOR VALUES FROM (%L) TO (%L)', 'ptl_col_unpd_stts_h_y' || y, make_date(y, 1, 1)::text, make_date(y + 1, 1, 1)::text);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_col_unpd_stts_h_def PARTITION OF ptl_col_unpd_stts_h DEFAULT;
COMMENT ON TABLE ptl_col_unpd_stts_h IS '미납상태이력';
COMMENT ON COLUMN ptl_col_unpd_stts_h.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_unpd_stts_h.stts_chg_seq IS '상태변경순번';
COMMENT ON COLUMN ptl_col_unpd_stts_h.stts_chg_dtm IS '상태변경일시';
COMMENT ON COLUMN ptl_col_unpd_stts_h.stts_chg_rsn_nm IS '상태변경사유명';
COMMENT ON COLUMN ptl_col_unpd_stts_h.unpd_stts_ty_cd IS '미납상태유형코드';
COMMENT ON COLUMN ptl_col_unpd_stts_h.bfr_unpd_stts_ty_cd IS '이전미납상태유형코드';
COMMENT ON COLUMN ptl_col_unpd_stts_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_col_unpd_stts_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_col_unpd_stts_h.chg_pnt_unpd_rmnd_amt IS '변경시점미납잔여금액';
COMMENT ON COLUMN ptl_col_unpd_stts_h.caus_task_ty_cd IS '원인업무유형코드';
COMMENT ON COLUMN ptl_col_unpd_stts_h.caus_task_no IS '원인업무번호';
COMMENT ON COLUMN ptl_col_unpd_stts_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_unpd_stts_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_unpd_stts_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_unpd_stts_h.lst_rgtr_id IS '최종등록자ID';

-- COL-011 연체가산금기준코드 · 목표 20행
CREATE TABLE IF NOT EXISTS ptl_col_ovdu_adchg_std_c (
  ovdu_adchg_std_ty_cd VARCHAR(10) NOT NULL,
  ovdu_adchg_std_nm VARCHAR(100) NOT NULL,
  std_adchg_rt NUMERIC(5,2) NOT NULL,
  adchg_uplmt_rt NUMERIC(5,2) NOT NULL,
  adchg_rdct_std_amt NUMERIC(15) NOT NULL,
  aplcn_bgng_dt CHAR(8) NOT NULL,
  aplcn_end_dt CHAR(8) NOT NULL,
  use_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_ovdu_adchg_std_c IS '연체가산금기준코드';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.ovdu_adchg_std_ty_cd IS '연체가산금기준유형코드';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.ovdu_adchg_std_nm IS '연체가산금기준명';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.std_adchg_rt IS '기준가산금율';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.adchg_uplmt_rt IS '가산금상한율';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.adchg_rdct_std_amt IS '가산금감면기준금액';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.use_yn IS '사용여부';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_ovdu_adchg_std_c.lst_rgtr_id IS '최종등록자ID';

-- COL-012 독촉정책기본 · 목표 2,000행
CREATE TABLE IF NOT EXISTS ptl_col_dun_plcy_m (
  dun_plcy_no VARCHAR(20) NOT NULL,
  dun_plcy_nm VARCHAR(100) NOT NULL,
  dun_step_ty_cd VARCHAR(10) NOT NULL,
  cust_ty_cd VARCHAR(10) NOT NULL,
  dun_std_elps_dcnt NUMERIC(5) NOT NULL,
  dun_std_unpd_amt NUMERIC(15) NOT NULL,
  dun_mdm_ty_cd VARCHAR(10) NOT NULL,
  aplcn_bgng_dt CHAR(8) NOT NULL,
  aplcn_end_dt CHAR(8) NOT NULL,
  use_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_dun_plcy_m IS '독촉정책기본';
COMMENT ON COLUMN ptl_col_dun_plcy_m.dun_plcy_no IS '독촉정책번호';
COMMENT ON COLUMN ptl_col_dun_plcy_m.dun_plcy_nm IS '독촉정책명';
COMMENT ON COLUMN ptl_col_dun_plcy_m.dun_step_ty_cd IS '독촉단계유형코드';
COMMENT ON COLUMN ptl_col_dun_plcy_m.cust_ty_cd IS '고객유형코드';
COMMENT ON COLUMN ptl_col_dun_plcy_m.dun_std_elps_dcnt IS '독촉기준경과일수';
COMMENT ON COLUMN ptl_col_dun_plcy_m.dun_std_unpd_amt IS '독촉기준미납금액';
COMMENT ON COLUMN ptl_col_dun_plcy_m.dun_mdm_ty_cd IS '독촉매체유형코드';
COMMENT ON COLUMN ptl_col_dun_plcy_m.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_col_dun_plcy_m.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_col_dun_plcy_m.use_yn IS '사용여부';
COMMENT ON COLUMN ptl_col_dun_plcy_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_dun_plcy_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_dun_plcy_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_dun_plcy_m.lst_rgtr_id IS '최종등록자ID';

-- COL-013 독촉발송결과내역 · 목표 55,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_dun_sndng_rslt_l (
  dun_no VARCHAR(20) NOT NULL,
  dun_sndng_dtm TIMESTAMP NOT NULL,
  sndng_rslt_seq NUMERIC(5) NOT NULL,
  dun_mdm_ty_cd VARCHAR(10) NOT NULL,
  sndng_rslt_ty_cd VARCHAR(10) NOT NULL,
  sndng_rslt_rcptn_dtm TIMESTAMP NOT NULL,
  sndng_err_cn VARCHAR(200),
  re_sndng_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (dun_sndng_dtm);
DO $$
BEGIN
  FOR y IN 2010..2027 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_col_dun_sndng_rslt_l FOR VALUES FROM (%L) TO (%L)', 'ptl_col_dun_sndng_rslt_l_y' || y, make_date(y, 1, 1)::text, make_date(y + 1, 1, 1)::text);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_col_dun_sndng_rslt_l_def PARTITION OF ptl_col_dun_sndng_rslt_l DEFAULT;
COMMENT ON TABLE ptl_col_dun_sndng_rslt_l IS '독촉발송결과내역';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.dun_no IS '독촉번호';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.dun_sndng_dtm IS '독촉발송일시';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.sndng_rslt_seq IS '발송결과순번';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.dun_mdm_ty_cd IS '독촉매체유형코드';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.sndng_rslt_ty_cd IS '발송결과유형코드';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.sndng_rslt_rcptn_dtm IS '발송결과수신일시';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.sndng_err_cn IS '발송오류내용';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.re_sndng_yn IS '재발송여부';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_dun_sndng_rslt_l.lst_rgtr_id IS '최종등록자ID';

-- COL-014 이용정지이력 · 목표 15,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_susp_h (
  susp_no VARCHAR(20) NOT NULL,
  susp_hist_seq NUMERIC(5) NOT NULL,
  susp_stts_ty_cd VARCHAR(10) NOT NULL,
  susp_step_ty_cd VARCHAR(10) NOT NULL,
  bfr_susp_step_ty_cd VARCHAR(10),
  stts_chg_rsn_nm VARCHAR(100) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_susp_h IS '이용정지이력';
COMMENT ON COLUMN ptl_col_susp_h.susp_no IS '이용정지번호';
COMMENT ON COLUMN ptl_col_susp_h.susp_hist_seq IS '이용정지이력순번';
COMMENT ON COLUMN ptl_col_susp_h.susp_stts_ty_cd IS '이용정지상태유형코드';
COMMENT ON COLUMN ptl_col_susp_h.susp_step_ty_cd IS '이용정지단계유형코드';
COMMENT ON COLUMN ptl_col_susp_h.bfr_susp_step_ty_cd IS '이전이용정지단계유형코드';
COMMENT ON COLUMN ptl_col_susp_h.stts_chg_rsn_nm IS '상태변경사유명';
COMMENT ON COLUMN ptl_col_susp_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_col_susp_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_col_susp_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_susp_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_susp_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_susp_h.lst_rgtr_id IS '최종등록자ID';

-- COL-015 이용정지해제내역 · 목표 5,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_susp_rls_l (
  susp_rls_no VARCHAR(20) NOT NULL,
  susp_no VARCHAR(20) NOT NULL,
  rcv_no VARCHAR(20),
  rcv_dt CHAR(8),
  div_pay_agrmt_no VARCHAR(20),
  pay_prms_no VARCHAR(20),
  susp_rls_dtm TIMESTAMP NOT NULL,
  susp_rls_rsn_ty_cd VARCHAR(10) NOT NULL,
  rls_req_dtm TIMESTAMP NOT NULL,
  line_stts_rflt_yn CHAR(1) NOT NULL,
  prcs_rslt_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_susp_rls_l IS '이용정지해제내역';
COMMENT ON COLUMN ptl_col_susp_rls_l.susp_rls_no IS '이용정지해제번호';
COMMENT ON COLUMN ptl_col_susp_rls_l.susp_no IS '이용정지번호';
COMMENT ON COLUMN ptl_col_susp_rls_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_col_susp_rls_l.rcv_dt IS '수납일자';
COMMENT ON COLUMN ptl_col_susp_rls_l.div_pay_agrmt_no IS '분할납부약정번호';
COMMENT ON COLUMN ptl_col_susp_rls_l.pay_prms_no IS '납부약속번호';
COMMENT ON COLUMN ptl_col_susp_rls_l.susp_rls_dtm IS '이용정지해제일시';
COMMENT ON COLUMN ptl_col_susp_rls_l.susp_rls_rsn_ty_cd IS '이용정지해제사유유형코드';
COMMENT ON COLUMN ptl_col_susp_rls_l.rls_req_dtm IS '해제요청일시';
COMMENT ON COLUMN ptl_col_susp_rls_l.line_stts_rflt_yn IS '회선상태반영여부';
COMMENT ON COLUMN ptl_col_susp_rls_l.prcs_rslt_ty_cd IS '처리결과유형코드';
COMMENT ON COLUMN ptl_col_susp_rls_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_susp_rls_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_susp_rls_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_susp_rls_l.lst_rgtr_id IS '최종등록자ID';

-- COL-016 직권해지예고내역 · 목표 3,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_exoftrmn_prntc_l (
  exoftrmn_no VARCHAR(20) NOT NULL,
  prntc_seq NUMERIC(5) NOT NULL,
  exoftrmn_prntc_dtm TIMESTAMP NOT NULL,
  dun_mdm_ty_cd VARCHAR(10) NOT NULL,
  prntc_sndng_stts_ty_cd VARCHAR(10) NOT NULL,
  rcptn_telno_encpt_vl VARCHAR(256),
  prntc_cn VARCHAR(4000),
  sndng_rslt_rcptn_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_exoftrmn_prntc_l IS '직권해지예고내역';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.exoftrmn_no IS '직권해지번호';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.prntc_seq IS '예고순번';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.exoftrmn_prntc_dtm IS '직권해지예고일시';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.dun_mdm_ty_cd IS '독촉매체유형코드';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.prntc_sndng_stts_ty_cd IS '예고발송상태유형코드';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.rcptn_telno_encpt_vl IS '수신전화번호암호화값';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.prntc_cn IS '예고내용';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.sndng_rslt_rcptn_dtm IS '발송결과수신일시';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_exoftrmn_prntc_l.lst_rgtr_id IS '최종등록자ID';

-- COL-017 채권추심사기본 · 목표 200행
CREATE TABLE IF NOT EXISTS ptl_col_rcvb_coll_co_m (
  rcvb_coll_co_no VARCHAR(20) NOT NULL,
  rcvb_coll_co_nm VARCHAR(100) NOT NULL,
  rcvb_coll_co_ty_cd VARCHAR(10) NOT NULL,
  rcvb_coll_co_stts_ty_cd VARCHAR(10) NOT NULL,
  brno VARCHAR(20) NOT NULL,
  rprs_telno VARCHAR(20),
  coll_fee_rt NUMERIC(5,2) NOT NULL,
  ctrt_bgng_dt CHAR(8) NOT NULL,
  ctrt_end_dt CHAR(8),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_rcvb_coll_co_m IS '채권추심사기본';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.rcvb_coll_co_no IS '채권추심사번호';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.rcvb_coll_co_nm IS '채권추심사명';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.rcvb_coll_co_ty_cd IS '채권추심사유형코드';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.rcvb_coll_co_stts_ty_cd IS '채권추심사상태유형코드';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.brno IS '사업자등록번호';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.rprs_telno IS '대표전화번호';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.coll_fee_rt IS '추심수수료율';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.ctrt_bgng_dt IS '계약시작일자';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.ctrt_end_dt IS '계약종료일자';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_rcvb_coll_co_m.lst_rgtr_id IS '최종등록자ID';

-- COL-018 추심위임상세 · 목표 1,500,000행
CREATE TABLE IF NOT EXISTS ptl_col_coll_dlgt_d (
  rcvb_trnsf_no VARCHAR(20) NOT NULL,
  coll_dlgt_seq NUMERIC(5) NOT NULL,
  rcvb_coll_co_no VARCHAR(20) NOT NULL,
  coll_dlgt_dt CHAR(8) NOT NULL,
  coll_dlgt_end_dt CHAR(8),
  dlgt_rcvb_amt NUMERIC(15) NOT NULL,
  aplcn_coll_fee_rt NUMERIC(5,2) NOT NULL,
  coll_dlgt_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_coll_dlgt_d IS '추심위임상세';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.rcvb_trnsf_no IS '채권이관번호';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.coll_dlgt_seq IS '추심위임순번';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.rcvb_coll_co_no IS '채권추심사번호';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.coll_dlgt_dt IS '추심위임일자';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.coll_dlgt_end_dt IS '추심위임종료일자';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.dlgt_rcvb_amt IS '위임채권금액';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.aplcn_coll_fee_rt IS '적용추심수수료율';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.coll_dlgt_stts_ty_cd IS '추심위임상태유형코드';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_coll_dlgt_d.lst_rgtr_id IS '최종등록자ID';

-- COL-019 추심회수내역 · 목표 3,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_coll_rtrvl_l (
  coll_rtrvl_no VARCHAR(20) NOT NULL,
  rcvb_trnsf_no VARCHAR(20) NOT NULL,
  coll_dlgt_seq NUMERIC(5) NOT NULL,
  unpd_no VARCHAR(20) NOT NULL,
  rcv_no VARCHAR(20),
  rcv_dt CHAR(8),
  coll_fee_no VARCHAR(20),
  coll_rtrvl_dtm TIMESTAMP NOT NULL,
  coll_rtrvl_amt NUMERIC(15) NOT NULL,
  rtrvl_mthd_ty_cd VARCHAR(10) NOT NULL,
  coll_rtrvl_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_coll_rtrvl_l IS '추심회수내역';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.coll_rtrvl_no IS '추심회수번호';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.rcvb_trnsf_no IS '채권이관번호';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.coll_dlgt_seq IS '추심위임순번';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.rcv_dt IS '수납일자';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.coll_fee_no IS '추심수수료번호';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.coll_rtrvl_dtm IS '추심회수일시';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.coll_rtrvl_amt IS '추심회수금액';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.rtrvl_mthd_ty_cd IS '회수방법유형코드';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.coll_rtrvl_stts_ty_cd IS '추심회수상태유형코드';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_coll_rtrvl_l.lst_rgtr_id IS '최종등록자ID';

-- COL-020 추심수수료내역 [STL] · 목표 12,000행
CREATE TABLE IF NOT EXISTS ptl_col_coll_fee_l (
  coll_fee_no VARCHAR(20) NOT NULL,
  rcvb_coll_co_no VARCHAR(20) NOT NULL,
  stlm_no VARCHAR(20),
  stlm_ym CHAR(6) NOT NULL,
  fee_trgt_amt NUMERIC(15) NOT NULL,
  coll_fee_amt NUMERIC(15) NOT NULL,
  txamt NUMERIC(15) NOT NULL,
  coll_fee_stts_ty_cd VARCHAR(10) NOT NULL,
  coll_fee_cfmtn_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_coll_fee_l IS '추심수수료내역';
COMMENT ON COLUMN ptl_col_coll_fee_l.coll_fee_no IS '추심수수료번호';
COMMENT ON COLUMN ptl_col_coll_fee_l.rcvb_coll_co_no IS '채권추심사번호';
COMMENT ON COLUMN ptl_col_coll_fee_l.stlm_no IS '정산번호';
COMMENT ON COLUMN ptl_col_coll_fee_l.stlm_ym IS '정산년월';
COMMENT ON COLUMN ptl_col_coll_fee_l.fee_trgt_amt IS '수수료대상금액';
COMMENT ON COLUMN ptl_col_coll_fee_l.coll_fee_amt IS '추심수수료금액';
COMMENT ON COLUMN ptl_col_coll_fee_l.txamt IS '세액';
COMMENT ON COLUMN ptl_col_coll_fee_l.coll_fee_stts_ty_cd IS '추심수수료상태유형코드';
COMMENT ON COLUMN ptl_col_coll_fee_l.coll_fee_cfmtn_dtm IS '추심수수료확정일시';
COMMENT ON COLUMN ptl_col_coll_fee_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_coll_fee_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_coll_fee_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_coll_fee_l.lst_rgtr_id IS '최종등록자ID';

-- COL-021 분할납부회차상세 · 목표 12,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_div_pay_tms_d (
  div_pay_agrmt_no VARCHAR(20) NOT NULL,
  div_pay_tms NUMERIC(3) NOT NULL,
  rcv_no VARCHAR(20),
  rcv_dt CHAR(8),
  pay_schd_dt CHAR(8) NOT NULL,
  pay_schd_amt NUMERIC(15) NOT NULL,
  tms_pay_amt NUMERIC(15) NOT NULL,
  pay_cmptn_dtm TIMESTAMP,
  div_pay_tms_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_div_pay_tms_d IS '분할납부회차상세';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.div_pay_agrmt_no IS '분할납부약정번호';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.div_pay_tms IS '분할납부회차';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.rcv_dt IS '수납일자';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.pay_schd_dt IS '납부예정일자';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.pay_schd_amt IS '납부예정금액';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.tms_pay_amt IS '회차납부금액';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.pay_cmptn_dtm IS '납부완료일시';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.div_pay_tms_stts_ty_cd IS '분할납부회차상태유형코드';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_div_pay_tms_d.lst_rgtr_id IS '최종등록자ID';

-- COL-022 납부약속내역 · 목표 4,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_pay_prms_l (
  pay_prms_no VARCHAR(20) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  unpd_no VARCHAR(20),
  rcv_no VARCHAR(20),
  rcv_dt CHAR(8),
  pay_prms_dtm TIMESTAMP NOT NULL,
  pay_prms_dt CHAR(8) NOT NULL,
  pay_prms_amt NUMERIC(15) NOT NULL,
  pay_prms_stts_ty_cd VARCHAR(10) NOT NULL,
  susp_dfrm_yn CHAR(1) NOT NULL,
  prms_flfl_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_pay_prms_l IS '납부약속내역';
COMMENT ON COLUMN ptl_col_pay_prms_l.pay_prms_no IS '납부약속번호';
COMMENT ON COLUMN ptl_col_pay_prms_l.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_col_pay_prms_l.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_pay_prms_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_col_pay_prms_l.rcv_dt IS '수납일자';
COMMENT ON COLUMN ptl_col_pay_prms_l.pay_prms_dtm IS '납부약속일시';
COMMENT ON COLUMN ptl_col_pay_prms_l.pay_prms_dt IS '납부약속일자';
COMMENT ON COLUMN ptl_col_pay_prms_l.pay_prms_amt IS '납부약속금액';
COMMENT ON COLUMN ptl_col_pay_prms_l.pay_prms_stts_ty_cd IS '납부약속상태유형코드';
COMMENT ON COLUMN ptl_col_pay_prms_l.susp_dfrm_yn IS '이용정지유예여부';
COMMENT ON COLUMN ptl_col_pay_prms_l.prms_flfl_dtm IS '약속이행일시';
COMMENT ON COLUMN ptl_col_pay_prms_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_pay_prms_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_pay_prms_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_pay_prms_l.lst_rgtr_id IS '최종등록자ID';

-- COL-023 신용정보등록내역 · 목표 3,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_crinfo_reg_l (
  crinfo_reg_no VARCHAR(20) NOT NULL,
  cust_no VARCHAR(20) NOT NULL,
  unpd_no VARCHAR(20),
  crinfo_reg_dtm TIMESTAMP NOT NULL,
  crinfo_reg_stts_ty_cd VARCHAR(10) NOT NULL,
  crinfo_inst_ty_cd VARCHAR(10) NOT NULL,
  crinfo_reg_rsn_ty_cd VARCHAR(10) NOT NULL,
  crinfo_reg_amt NUMERIC(15) NOT NULL,
  reg_prntc_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_crinfo_reg_l IS '신용정보등록내역';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.crinfo_reg_no IS '신용정보등록번호';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.cust_no IS '고객번호';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.crinfo_reg_dtm IS '신용정보등록일시';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.crinfo_reg_stts_ty_cd IS '신용정보등록상태유형코드';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.crinfo_inst_ty_cd IS '신용정보기관유형코드';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.crinfo_reg_rsn_ty_cd IS '신용정보등록사유유형코드';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.crinfo_reg_amt IS '신용정보등록금액';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.reg_prntc_dtm IS '등록예고일시';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_crinfo_reg_l.lst_rgtr_id IS '최종등록자ID';

-- COL-024 신용정보해제내역 · 목표 2,500,000행
CREATE TABLE IF NOT EXISTS ptl_col_crinfo_rls_l (
  crinfo_rls_no VARCHAR(20) NOT NULL,
  crinfo_reg_no VARCHAR(20) NOT NULL,
  rcv_no VARCHAR(20),
  rcv_dt CHAR(8),
  crinfo_rls_dtm TIMESTAMP NOT NULL,
  crinfo_rls_rsn_ty_cd VARCHAR(10) NOT NULL,
  prcs_rslt_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_crinfo_rls_l IS '신용정보해제내역';
COMMENT ON COLUMN ptl_col_crinfo_rls_l.crinfo_rls_no IS '신용정보해제번호';
COMMENT ON COLUMN ptl_col_crinfo_rls_l.crinfo_reg_no IS '신용정보등록번호';
COMMENT ON COLUMN ptl_col_crinfo_rls_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_col_crinfo_rls_l.rcv_dt IS '수납일자';
COMMENT ON COLUMN ptl_col_crinfo_rls_l.crinfo_rls_dtm IS '신용정보해제일시';
COMMENT ON COLUMN ptl_col_crinfo_rls_l.crinfo_rls_rsn_ty_cd IS '신용정보해제사유유형코드';
COMMENT ON COLUMN ptl_col_crinfo_rls_l.prcs_rslt_ty_cd IS '처리결과유형코드';
COMMENT ON COLUMN ptl_col_crinfo_rls_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_crinfo_rls_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_crinfo_rls_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_crinfo_rls_l.lst_rgtr_id IS '최종등록자ID';

-- COL-025 대손상각상세 · 목표 12,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_bddt_dprc_d (
  bddt_no VARCHAR(20) NOT NULL,
  bddt_dprc_dtl_seq NUMERIC(5) NOT NULL,
  unpd_no VARCHAR(20) NOT NULL,
  unpd_dtl_seq NUMERIC(10) NOT NULL,
  bddt_dprc_amt NUMERIC(15) NOT NULL,
  bddt_txamt_ddtn_amt NUMERIC(15) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_bddt_dprc_d IS '대손상각상세';
COMMENT ON COLUMN ptl_col_bddt_dprc_d.bddt_no IS '대손번호';
COMMENT ON COLUMN ptl_col_bddt_dprc_d.bddt_dprc_dtl_seq IS '대손상각상세순번';
COMMENT ON COLUMN ptl_col_bddt_dprc_d.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_bddt_dprc_d.unpd_dtl_seq IS '미납상세순번';
COMMENT ON COLUMN ptl_col_bddt_dprc_d.bddt_dprc_amt IS '대손상각금액';
COMMENT ON COLUMN ptl_col_bddt_dprc_d.bddt_txamt_ddtn_amt IS '대손세액공제금액';
COMMENT ON COLUMN ptl_col_bddt_dprc_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_bddt_dprc_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_bddt_dprc_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_bddt_dprc_d.lst_rgtr_id IS '최종등록자ID';

-- COL-026 대손회수내역 · 목표 400,000행
CREATE TABLE IF NOT EXISTS ptl_col_bddt_rtrvl_l (
  bddt_rtrvl_no VARCHAR(20) NOT NULL,
  bddt_no VARCHAR(20) NOT NULL,
  rcv_no VARCHAR(20),
  rcv_dt CHAR(8),
  coll_rtrvl_no VARCHAR(20),
  bddt_rtrvl_dtm TIMESTAMP NOT NULL,
  bddt_rtrvl_amt NUMERIC(15) NOT NULL,
  rtrvl_mthd_ty_cd VARCHAR(10) NOT NULL,
  acntg_slip_no VARCHAR(20),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_bddt_rtrvl_l IS '대손회수내역';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.bddt_rtrvl_no IS '대손회수번호';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.bddt_no IS '대손번호';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.rcv_dt IS '수납일자';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.coll_rtrvl_no IS '추심회수번호';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.bddt_rtrvl_dtm IS '대손회수일시';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.bddt_rtrvl_amt IS '대손회수금액';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.rtrvl_mthd_ty_cd IS '회수방법유형코드';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.acntg_slip_no IS '회계전표번호';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_bddt_rtrvl_l.lst_rgtr_id IS '최종등록자ID';

-- COL-027 채권매각내역 · 목표 3,000행
CREATE TABLE IF NOT EXISTS ptl_col_rcvb_dspsl_l (
  rcvb_dspsl_no VARCHAR(20) NOT NULL,
  rcvb_coll_co_no VARCHAR(20) NOT NULL,
  rcvb_dspsl_dtm TIMESTAMP NOT NULL,
  rcvb_dspsl_stts_ty_cd VARCHAR(10) NOT NULL,
  dspsl_rcvb_amt NUMERIC(15) NOT NULL,
  dspsl_rcvb_nocs NUMERIC(10) NOT NULL,
  dspsl_amt NUMERIC(15) NOT NULL,
  acntg_slip_no VARCHAR(20),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_rcvb_dspsl_l IS '채권매각내역';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.rcvb_dspsl_no IS '채권매각번호';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.rcvb_coll_co_no IS '채권추심사번호';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.rcvb_dspsl_dtm IS '채권매각일시';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.rcvb_dspsl_stts_ty_cd IS '채권매각상태유형코드';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.dspsl_rcvb_amt IS '매각채권금액';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.dspsl_rcvb_nocs IS '매각채권건수';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.dspsl_amt IS '매각금액';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.acntg_slip_no IS '회계전표번호';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_rcvb_dspsl_l.lst_rgtr_id IS '최종등록자ID';

-- COL-028 채권시효이력 · 목표 26,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_rcvb_prscr_h (
  unpd_no VARCHAR(20) NOT NULL,
  prscr_chg_seq NUMERIC(5) NOT NULL,
  prscr_rckn_dt CHAR(8) NOT NULL,
  prscr_intrpt_rsn_ty_cd VARCHAR(10),
  prscr_intrpt_dt CHAR(8),
  extsh_prscr_expry_dt CHAR(8) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_rcvb_prscr_h IS '채권시효이력';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.unpd_no IS '미납번호';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.prscr_chg_seq IS '시효변경순번';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.prscr_rckn_dt IS '시효기산일자';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.prscr_intrpt_rsn_ty_cd IS '시효중단사유유형코드';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.prscr_intrpt_dt IS '시효중단일자';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.extsh_prscr_expry_dt IS '소멸시효만료일자';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_rcvb_prscr_h.lst_rgtr_id IS '최종등록자ID';

-- COL-029 미납월집계 · 목표 60,000,000행
CREATE TABLE IF NOT EXISTS ptl_col_unpd_mm_t (
  std_ym CHAR(6) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  unpd_nocs NUMERIC(10) NOT NULL,
  unpd_rmnd_amt NUMERIC(15) NOT NULL,
  ovdu_adchg_acml_amt NUMERIC(15) NOT NULL,
  max_unpd_elps_dcnt NUMERIC(5) NOT NULL,
  unpd_elps_sctn_ty_cd VARCHAR(10) NOT NULL,
  susp_yn CHAR(1) NOT NULL,
  agg_stts_ty_cd VARCHAR(10) NOT NULL,
  agg_dtm TIMESTAMP NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (std_ym);
DO $$
BEGIN
  FOR y IN 2010..2027 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_col_unpd_mm_t FOR VALUES FROM (%L) TO (%L)', 'ptl_col_unpd_mm_t_y' || y, y || '01', (y + 1) || '01');
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_col_unpd_mm_t_def PARTITION OF ptl_col_unpd_mm_t DEFAULT;
COMMENT ON TABLE ptl_col_unpd_mm_t IS '미납월집계';
COMMENT ON COLUMN ptl_col_unpd_mm_t.std_ym IS '기준년월';
COMMENT ON COLUMN ptl_col_unpd_mm_t.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_col_unpd_mm_t.unpd_nocs IS '미납건수';
COMMENT ON COLUMN ptl_col_unpd_mm_t.unpd_rmnd_amt IS '미납잔여금액';
COMMENT ON COLUMN ptl_col_unpd_mm_t.ovdu_adchg_acml_amt IS '연체가산금누적금액';
COMMENT ON COLUMN ptl_col_unpd_mm_t.max_unpd_elps_dcnt IS '최대미납경과일수';
COMMENT ON COLUMN ptl_col_unpd_mm_t.unpd_elps_sctn_ty_cd IS '미납경과구간유형코드';
COMMENT ON COLUMN ptl_col_unpd_mm_t.susp_yn IS '이용정지여부';
COMMENT ON COLUMN ptl_col_unpd_mm_t.agg_stts_ty_cd IS '집계상태유형코드';
COMMENT ON COLUMN ptl_col_unpd_mm_t.agg_dtm IS '집계일시';
COMMENT ON COLUMN ptl_col_unpd_mm_t.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_unpd_mm_t.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_unpd_mm_t.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_unpd_mm_t.lst_rgtr_id IS '최종등록자ID';

-- COL-030 미납회수월통계 · 목표 20,000행
CREATE TABLE IF NOT EXISTS ptl_col_unpd_rtrvl_mm_s (
  std_ym CHAR(6) NOT NULL,
  unpd_elps_sctn_ty_cd VARCHAR(10) NOT NULL,
  cust_ty_cd VARCHAR(10) NOT NULL,
  cyov_unpd_amt NUMERIC(15) NOT NULL,
  thmm_ocrn_unpd_amt NUMERIC(15) NOT NULL,
  thmm_rtrvl_amt NUMERIC(15) NOT NULL,
  rtrvl_rt NUMERIC(5,2) NOT NULL,
  unpd_nocs NUMERIC(10) NOT NULL,
  susp_cnvr_nocs NUMERIC(10) NOT NULL,
  exoftrmn_cnvr_nocs NUMERIC(10) NOT NULL,
  bddt_cnvr_amt NUMERIC(15) NOT NULL,
  agg_dtm TIMESTAMP NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_col_unpd_rtrvl_mm_s IS '미납회수월통계';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.std_ym IS '기준년월';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.unpd_elps_sctn_ty_cd IS '미납경과구간유형코드';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.cust_ty_cd IS '고객유형코드';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.cyov_unpd_amt IS '이월미납금액';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.thmm_ocrn_unpd_amt IS '당월발생미납금액';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.thmm_rtrvl_amt IS '당월회수금액';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.rtrvl_rt IS '회수율';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.unpd_nocs IS '미납건수';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.susp_cnvr_nocs IS '이용정지전환건수';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.exoftrmn_cnvr_nocs IS '직권해지전환건수';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.bddt_cnvr_amt IS '대손전환금액';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.agg_dtm IS '집계일시';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_col_unpd_rtrvl_mm_s.lst_rgtr_id IS '최종등록자ID';

