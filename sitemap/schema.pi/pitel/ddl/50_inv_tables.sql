-- Pi통신 과금 데이터 표준화 — 수납(INV) 테이블 DDL (PostgreSQL 17)
-- 생성 : subagent_physical_modeler 2026-11-07 · 정본 model/physical/INV.json
-- 실행 : SET search_path 로 대상 스키마 지정 후 psql -v ON_ERROR_STOP=1 -f 50_inv_tables.sql
-- 규칙 : PK·인덱스 없음(D14 — 적재 뒤 50_inv_constraints.sql), FK 제약 없음(D6), 시스템 칼럼 4개는 맨 끝(D7)
-- 재실행 안전 : CREATE TABLE IF NOT EXISTS · 파티션 IF NOT EXISTS

-- INV-001 수납기본 · 예상 100,000,000행 · 월 RANGE(rcv_dt)
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_m (
  rcv_no VARCHAR(20) NOT NULL,
  rcv_dt CHAR(8) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  pay_mthd_no VARCHAR(20),
  rcv_chnl_ty_cd VARCHAR(10) NOT NULL,
  bank_cd VARCHAR(10),
  card_co_cd VARCHAR(10),
  rcv_agt_inst_no VARCHAR(20),
  dpstr_nm VARCHAR(100) NOT NULL,
  rcv_dtm TIMESTAMP NOT NULL,
  rcv_stts_ty_cd VARCHAR(10) NOT NULL,
  rcv_amt NUMERIC(15) NOT NULL,
  unallc_amt NUMERIC(15) NOT NULL,
  aprv_no VARCHAR(20),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (rcv_dt);
DO $$
DECLARE d DATE := DATE '2010-01-01';
BEGIN
  WHILE d < DATE '2028-01-01' LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_inv_rcv_m FOR VALUES FROM (%L) TO (%L)',
      'ptl_inv_rcv_m_p' || to_char(d, 'YYYYMM'), to_char(d, 'YYYYMMDD'), to_char(d + interval '1 month', 'YYYYMMDD'));
    d := d + interval '1 month';
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_m_pdflt PARTITION OF ptl_inv_rcv_m DEFAULT;
COMMENT ON TABLE ptl_inv_rcv_m IS '수납기본';
COMMENT ON COLUMN ptl_inv_rcv_m.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_rcv_m.rcv_dt IS '수납일자';
COMMENT ON COLUMN ptl_inv_rcv_m.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_inv_rcv_m.pay_mthd_no IS '납부방법번호';
COMMENT ON COLUMN ptl_inv_rcv_m.rcv_chnl_ty_cd IS '수납채널유형코드';
COMMENT ON COLUMN ptl_inv_rcv_m.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_rcv_m.card_co_cd IS '카드사코드';
COMMENT ON COLUMN ptl_inv_rcv_m.rcv_agt_inst_no IS '수납대행기관번호';
COMMENT ON COLUMN ptl_inv_rcv_m.dpstr_nm IS '입금자명';
COMMENT ON COLUMN ptl_inv_rcv_m.rcv_dtm IS '수납일시';
COMMENT ON COLUMN ptl_inv_rcv_m.rcv_stts_ty_cd IS '수납상태유형코드';
COMMENT ON COLUMN ptl_inv_rcv_m.rcv_amt IS '수납금액';
COMMENT ON COLUMN ptl_inv_rcv_m.unallc_amt IS '미배분금액';
COMMENT ON COLUMN ptl_inv_rcv_m.aprv_no IS '승인번호';
COMMENT ON COLUMN ptl_inv_rcv_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rcv_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rcv_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rcv_m.lst_rgtr_id IS '최종등록자ID';

-- INV-002 수납배분상세 · 예상 120,000,000행 · 월 RANGE(bill_ym)
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_allc_d (
  rcv_allc_no VARCHAR(20) NOT NULL,
  bill_ym CHAR(6) NOT NULL,
  rcv_no VARCHAR(20) NOT NULL,
  bill_no VARCHAR(20) NOT NULL,
  chrg_itm_cd VARCHAR(10) NOT NULL,
  rcv_allc_prrt NUMERIC(5) NOT NULL,
  prpay_no VARCHAR(20),
  bill_acnt_no VARCHAR(20) NOT NULL,
  allc_smry_nm VARCHAR(100) NOT NULL,
  rcv_allc_dtm TIMESTAMP NOT NULL,
  rcv_allc_stts_ty_cd VARCHAR(10) NOT NULL,
  allc_amt NUMERIC(15) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d DATE := DATE '2010-01-01';
BEGIN
  WHILE d < DATE '2028-01-01' LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_inv_rcv_allc_d FOR VALUES FROM (%L) TO (%L)',
      'ptl_inv_rcv_allc_d_p' || to_char(d, 'YYYYMM'), to_char(d, 'YYYYMM'), to_char(d + interval '1 month', 'YYYYMM'));
    d := d + interval '1 month';
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_allc_d_pdflt PARTITION OF ptl_inv_rcv_allc_d DEFAULT;
COMMENT ON TABLE ptl_inv_rcv_allc_d IS '수납배분상세';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.rcv_allc_no IS '수납배분번호';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.chrg_itm_cd IS '요금항목코드';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.rcv_allc_prrt IS '수납배분우선순위';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.prpay_no IS '선납번호';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.allc_smry_nm IS '배분적요명';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.rcv_allc_dtm IS '수납배분일시';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.rcv_allc_stts_ty_cd IS '수납배분상태유형코드';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.allc_amt IS '배분금액';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rcv_allc_d.lst_rgtr_id IS '최종등록자ID';

-- INV-003 납부방법기본 · 예상 10,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_pay_mthd_m (
  pay_mthd_no VARCHAR(20) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  pyr_no VARCHAR(20) NOT NULL,
  bank_cd VARCHAR(10),
  card_co_cd VARCHAR(10),
  pay_mthd_nm VARCHAR(100) NOT NULL,
  pay_mthd_reg_dtm TIMESTAMP NOT NULL,
  pay_mthd_stts_ty_cd VARCHAR(10) NOT NULL,
  pay_mthd_ty_cd VARCHAR(10) NOT NULL,
  acct_no_encpt_vl VARCHAR(256),
  dpsown_nm VARCHAR(100),
  card_no_encpt_vl VARCHAR(256),
  trsf_dsgn_dd CHAR(2),
  aplcn_bgng_dt CHAR(8) NOT NULL,
  aplcn_end_dt CHAR(8) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_pay_mthd_m IS '납부방법기본';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.pay_mthd_no IS '납부방법번호';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.pyr_no IS '납부자번호';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.card_co_cd IS '카드사코드';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.pay_mthd_nm IS '납부방법명';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.pay_mthd_reg_dtm IS '납부방법등록일시';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.pay_mthd_stts_ty_cd IS '납부방법상태유형코드';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.pay_mthd_ty_cd IS '납부방법유형코드';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.acct_no_encpt_vl IS '계좌번호암호화값';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.dpsown_nm IS '예금주명';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.card_no_encpt_vl IS '카드번호암호화값';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.trsf_dsgn_dd IS '이체지정일';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_pay_mthd_m.lst_rgtr_id IS '최종등록자ID';

-- INV-004 자동이체신청내역 · 예상 10,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_atrf_aply_l (
  atrf_aply_no VARCHAR(20) NOT NULL,
  pay_mthd_no VARCHAR(20) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  bank_cd VARCHAR(10) NOT NULL,
  aplcnt_nm VARCHAR(100) NOT NULL,
  atrf_aply_dtm TIMESTAMP NOT NULL,
  atrf_aply_stts_ty_cd VARCHAR(10) NOT NULL,
  atrf_aply_se_cd VARCHAR(10) NOT NULL,
  acct_no_encpt_vl VARCHAR(256) NOT NULL,
  dpsown_nm VARCHAR(100) NOT NULL,
  wdrw_agre_evdc_ty_cd VARCHAR(10) NOT NULL,
  prcs_rslt_ty_cd VARCHAR(10),
  prcs_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_atrf_aply_l IS '자동이체신청내역';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.atrf_aply_no IS '자동이체신청번호';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.pay_mthd_no IS '납부방법번호';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.aplcnt_nm IS '신청인명';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.atrf_aply_dtm IS '자동이체신청일시';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.atrf_aply_stts_ty_cd IS '자동이체신청상태유형코드';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.atrf_aply_se_cd IS '자동이체신청구분코드';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.acct_no_encpt_vl IS '계좌번호암호화값';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.dpsown_nm IS '예금주명';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.wdrw_agre_evdc_ty_cd IS '출금동의증빙유형코드';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.prcs_rslt_ty_cd IS '처리결과유형코드';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.prcs_dtm IS '처리일시';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_atrf_aply_l.lst_rgtr_id IS '최종등록자ID';

-- INV-005 자동이체출금요청내역 · 예상 30,000,000행 · 연 RANGE(bill_ym)
CREATE TABLE IF NOT EXISTS ptl_inv_atrf_wdrw_req_l (
  wdrw_req_no VARCHAR(20) NOT NULL,
  bill_ym CHAR(6) NOT NULL,
  pay_mthd_no VARCHAR(20) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  bill_no VARCHAR(20) NOT NULL,
  bank_cd VARCHAR(10) NOT NULL,
  rcv_no VARCHAR(20),
  wdrw_req_file_nm VARCHAR(200) NOT NULL,
  wdrw_req_dtm TIMESTAMP NOT NULL,
  wdrw_req_stts_ty_cd VARCHAR(10) NOT NULL,
  wdrw_req_amt NUMERIC(15) NOT NULL,
  wdrw_schd_dt CHAR(8) NOT NULL,
  wdrw_tms NUMERIC(3) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d DATE := DATE '2010-01-01';
BEGIN
  WHILE d < DATE '2028-01-01' LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_inv_atrf_wdrw_req_l FOR VALUES FROM (%L) TO (%L)',
      'ptl_inv_atrf_wdrw_req_l_p' || to_char(d, 'YYYY'), to_char(d, 'YYYYMM'), to_char(d + interval '1 year', 'YYYYMM'));
    d := d + interval '1 year';
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_inv_atrf_wdrw_req_l_pdflt PARTITION OF ptl_inv_atrf_wdrw_req_l DEFAULT;
COMMENT ON TABLE ptl_inv_atrf_wdrw_req_l IS '자동이체출금요청내역';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.wdrw_req_no IS '출금요청번호';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.pay_mthd_no IS '납부방법번호';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.wdrw_req_file_nm IS '출금요청파일명';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.wdrw_req_dtm IS '출금요청일시';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.wdrw_req_stts_ty_cd IS '출금요청상태유형코드';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.wdrw_req_amt IS '출금요청금액';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.wdrw_schd_dt IS '출금예정일자';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.wdrw_tms IS '출금회차';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_req_l.lst_rgtr_id IS '최종등록자ID';

-- INV-006 가상계좌기본 · 예상 3,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_vacct_m (
  vacct_no VARCHAR(20) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  bank_cd VARCHAR(10) NOT NULL,
  rcv_agt_inst_no VARCHAR(20),
  vacct_nm VARCHAR(100) NOT NULL,
  vacct_issu_dtm TIMESTAMP NOT NULL,
  vacct_stts_ty_cd VARCHAR(10) NOT NULL,
  acct_no VARCHAR(20) NOT NULL,
  dpst_std_ty_cd VARCHAR(10) NOT NULL,
  vld_end_dtm TIMESTAMP NOT NULL,
  rtrvl_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_vacct_m IS '가상계좌기본';
COMMENT ON COLUMN ptl_inv_vacct_m.vacct_no IS '가상계좌번호';
COMMENT ON COLUMN ptl_inv_vacct_m.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_inv_vacct_m.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_vacct_m.rcv_agt_inst_no IS '수납대행기관번호';
COMMENT ON COLUMN ptl_inv_vacct_m.vacct_nm IS '가상계좌명';
COMMENT ON COLUMN ptl_inv_vacct_m.vacct_issu_dtm IS '가상계좌발급일시';
COMMENT ON COLUMN ptl_inv_vacct_m.vacct_stts_ty_cd IS '가상계좌상태유형코드';
COMMENT ON COLUMN ptl_inv_vacct_m.acct_no IS '계좌번호';
COMMENT ON COLUMN ptl_inv_vacct_m.dpst_std_ty_cd IS '입금기준유형코드';
COMMENT ON COLUMN ptl_inv_vacct_m.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_inv_vacct_m.rtrvl_dtm IS '회수일시';
COMMENT ON COLUMN ptl_inv_vacct_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_vacct_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_vacct_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_vacct_m.lst_rgtr_id IS '최종등록자ID';

-- INV-007 과오납기본 · 예상 3,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_ovpay_m (
  ovpay_no VARCHAR(20) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  rcv_no VARCHAR(20),
  ovpay_cn_nm VARCHAR(100) NOT NULL,
  ovpay_ocrn_dtm TIMESTAMP NOT NULL,
  ovpay_stts_ty_cd VARCHAR(10) NOT NULL,
  ovpay_ty_cd VARCHAR(10) NOT NULL,
  ovpay_amt NUMERIC(15) NOT NULL,
  ovpay_bal NUMERIC(15) NOT NULL,
  prcs_mthd_ty_cd VARCHAR(10),
  extsh_prscr_dt CHAR(8),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_ovpay_m IS '과오납기본';
COMMENT ON COLUMN ptl_inv_ovpay_m.ovpay_no IS '과오납번호';
COMMENT ON COLUMN ptl_inv_ovpay_m.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_inv_ovpay_m.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_ovpay_m.ovpay_cn_nm IS '과오납내용명';
COMMENT ON COLUMN ptl_inv_ovpay_m.ovpay_ocrn_dtm IS '과오납발생일시';
COMMENT ON COLUMN ptl_inv_ovpay_m.ovpay_stts_ty_cd IS '과오납상태유형코드';
COMMENT ON COLUMN ptl_inv_ovpay_m.ovpay_ty_cd IS '과오납유형코드';
COMMENT ON COLUMN ptl_inv_ovpay_m.ovpay_amt IS '과오납금액';
COMMENT ON COLUMN ptl_inv_ovpay_m.ovpay_bal IS '과오납잔액';
COMMENT ON COLUMN ptl_inv_ovpay_m.prcs_mthd_ty_cd IS '처리방법유형코드';
COMMENT ON COLUMN ptl_inv_ovpay_m.extsh_prscr_dt IS '소멸시효일자';
COMMENT ON COLUMN ptl_inv_ovpay_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_ovpay_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_ovpay_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_ovpay_m.lst_rgtr_id IS '최종등록자ID';

-- INV-008 환불내역 · 예상 2,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_rfnd_l (
  rfnd_no VARCHAR(20) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  ovpay_no VARCHAR(20),
  prpay_no VARCHAR(20),
  bank_cd VARCHAR(10),
  rfnd_acct_seq NUMERIC(5),
  rfnd_rcpn_nm VARCHAR(100) NOT NULL,
  rfnd_dtm TIMESTAMP NOT NULL,
  rfnd_stts_ty_cd VARCHAR(10) NOT NULL,
  rfnd_amt NUMERIC(15) NOT NULL,
  rfnd_mthd_ty_cd VARCHAR(10) NOT NULL,
  acct_no_encpt_vl VARCHAR(256),
  rfnd_req_dt CHAR(8),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_rfnd_l IS '환불내역';
COMMENT ON COLUMN ptl_inv_rfnd_l.rfnd_no IS '환불번호';
COMMENT ON COLUMN ptl_inv_rfnd_l.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_inv_rfnd_l.ovpay_no IS '과오납번호';
COMMENT ON COLUMN ptl_inv_rfnd_l.prpay_no IS '선납번호';
COMMENT ON COLUMN ptl_inv_rfnd_l.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_rfnd_l.rfnd_acct_seq IS '환불계좌순번';
COMMENT ON COLUMN ptl_inv_rfnd_l.rfnd_rcpn_nm IS '환불수령인명';
COMMENT ON COLUMN ptl_inv_rfnd_l.rfnd_dtm IS '환불일시';
COMMENT ON COLUMN ptl_inv_rfnd_l.rfnd_stts_ty_cd IS '환불상태유형코드';
COMMENT ON COLUMN ptl_inv_rfnd_l.rfnd_amt IS '환불금액';
COMMENT ON COLUMN ptl_inv_rfnd_l.rfnd_mthd_ty_cd IS '환불방법유형코드';
COMMENT ON COLUMN ptl_inv_rfnd_l.acct_no_encpt_vl IS '계좌번호암호화값';
COMMENT ON COLUMN ptl_inv_rfnd_l.rfnd_req_dt IS '환불요청일자';
COMMENT ON COLUMN ptl_inv_rfnd_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rfnd_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rfnd_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rfnd_l.lst_rgtr_id IS '최종등록자ID';

-- INV-009 선납기본 · 예상 2,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_prpay_m (
  prpay_no VARCHAR(20) NOT NULL,
  bill_acnt_no VARCHAR(20) NOT NULL,
  rcv_no VARCHAR(20),
  ovpay_no VARCHAR(20),
  prpay_dpstr_nm VARCHAR(100) NOT NULL,
  prpay_dtm TIMESTAMP NOT NULL,
  prpay_stts_ty_cd VARCHAR(10) NOT NULL,
  prpay_ty_cd VARCHAR(10) NOT NULL,
  prpay_amt NUMERIC(15) NOT NULL,
  prpay_bal NUMERIC(15) NOT NULL,
  exhst_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_prpay_m IS '선납기본';
COMMENT ON COLUMN ptl_inv_prpay_m.prpay_no IS '선납번호';
COMMENT ON COLUMN ptl_inv_prpay_m.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_inv_prpay_m.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_prpay_m.ovpay_no IS '과오납번호';
COMMENT ON COLUMN ptl_inv_prpay_m.prpay_dpstr_nm IS '선납입금자명';
COMMENT ON COLUMN ptl_inv_prpay_m.prpay_dtm IS '선납일시';
COMMENT ON COLUMN ptl_inv_prpay_m.prpay_stts_ty_cd IS '선납상태유형코드';
COMMENT ON COLUMN ptl_inv_prpay_m.prpay_ty_cd IS '선납유형코드';
COMMENT ON COLUMN ptl_inv_prpay_m.prpay_amt IS '선납금액';
COMMENT ON COLUMN ptl_inv_prpay_m.prpay_bal IS '선납잔액';
COMMENT ON COLUMN ptl_inv_prpay_m.exhst_dtm IS '소진일시';
COMMENT ON COLUMN ptl_inv_prpay_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_prpay_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_prpay_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_prpay_m.lst_rgtr_id IS '최종등록자ID';

-- INV-010 은행코드 · 예상 10,000행
CREATE TABLE IF NOT EXISTS ptl_inv_bank_c (
  bank_cd VARCHAR(10) NOT NULL,
  mrgr_bank_cd VARCHAR(10),
  bank_nm VARCHAR(100) NOT NULL,
  bank_reg_dtm TIMESTAMP NOT NULL,
  bank_stts_ty_cd VARCHAR(10) NOT NULL,
  fnnc_inst_ty_cd VARCHAR(10) NOT NULL,
  bank_eng_nm VARCHAR(100),
  atrf_psbl_yn CHAR(1) NOT NULL,
  vacct_psbl_yn CHAR(1) NOT NULL,
  aplcn_bgng_dt CHAR(8) NOT NULL,
  aplcn_end_dt CHAR(8) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_bank_c IS '은행코드';
COMMENT ON COLUMN ptl_inv_bank_c.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_bank_c.mrgr_bank_cd IS '합병은행코드';
COMMENT ON COLUMN ptl_inv_bank_c.bank_nm IS '은행명';
COMMENT ON COLUMN ptl_inv_bank_c.bank_reg_dtm IS '은행등록일시';
COMMENT ON COLUMN ptl_inv_bank_c.bank_stts_ty_cd IS '은행상태유형코드';
COMMENT ON COLUMN ptl_inv_bank_c.fnnc_inst_ty_cd IS '금융기관유형코드';
COMMENT ON COLUMN ptl_inv_bank_c.bank_eng_nm IS '은행영문명';
COMMENT ON COLUMN ptl_inv_bank_c.atrf_psbl_yn IS '자동이체가능여부';
COMMENT ON COLUMN ptl_inv_bank_c.vacct_psbl_yn IS '가상계좌가능여부';
COMMENT ON COLUMN ptl_inv_bank_c.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_inv_bank_c.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_inv_bank_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_bank_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_bank_c.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_bank_c.lst_rgtr_id IS '최종등록자ID';

-- INV-011 카드사코드 · 예상 10,000행
CREATE TABLE IF NOT EXISTS ptl_inv_card_co_c (
  card_co_cd VARCHAR(10) NOT NULL,
  rcv_agt_inst_no VARCHAR(20),
  card_co_nm VARCHAR(100) NOT NULL,
  card_co_eng_nm VARCHAR(100),
  card_co_reg_dtm TIMESTAMP NOT NULL,
  card_co_stts_ty_cd VARCHAR(10) NOT NULL,
  atmt_pay_psbl_yn CHAR(1) NOT NULL,
  mrch_no VARCHAR(20),
  aplcn_bgng_dt CHAR(8) NOT NULL,
  aplcn_end_dt CHAR(8) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_card_co_c IS '카드사코드';
COMMENT ON COLUMN ptl_inv_card_co_c.card_co_cd IS '카드사코드';
COMMENT ON COLUMN ptl_inv_card_co_c.rcv_agt_inst_no IS '수납대행기관번호';
COMMENT ON COLUMN ptl_inv_card_co_c.card_co_nm IS '카드사명';
COMMENT ON COLUMN ptl_inv_card_co_c.card_co_eng_nm IS '카드사영문명';
COMMENT ON COLUMN ptl_inv_card_co_c.card_co_reg_dtm IS '카드사등록일시';
COMMENT ON COLUMN ptl_inv_card_co_c.card_co_stts_ty_cd IS '카드사상태유형코드';
COMMENT ON COLUMN ptl_inv_card_co_c.atmt_pay_psbl_yn IS '자동납부가능여부';
COMMENT ON COLUMN ptl_inv_card_co_c.mrch_no IS '가맹점번호';
COMMENT ON COLUMN ptl_inv_card_co_c.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_inv_card_co_c.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_inv_card_co_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_card_co_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_card_co_c.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_card_co_c.lst_rgtr_id IS '최종등록자ID';

-- INV-012 납부방법이력 · 예상 20,000,000행 · 연 RANGE(vld_bgng_dtm)
CREATE TABLE IF NOT EXISTS ptl_inv_pay_mthd_h (
  pay_mthd_no VARCHAR(20) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  bank_cd VARCHAR(10),
  card_co_cd VARCHAR(10),
  vld_end_dtm TIMESTAMP NOT NULL,
  pay_mthd_ty_cd VARCHAR(10) NOT NULL,
  pay_mthd_stts_ty_cd VARCHAR(10) NOT NULL,
  acct_no_encpt_vl VARCHAR(256),
  card_no_encpt_vl VARCHAR(256),
  dpsown_nm VARCHAR(100),
  trsf_dsgn_dd CHAR(2),
  pay_mthd_chg_rsn_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (vld_bgng_dtm);
DO $$
DECLARE d DATE := DATE '2010-01-01';
BEGIN
  WHILE d < DATE '2028-01-01' LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_inv_pay_mthd_h FOR VALUES FROM (%L) TO (%L)',
      'ptl_inv_pay_mthd_h_p' || to_char(d, 'YYYY'), to_char(d, 'YYYY-MM-DD'), to_char(d + interval '1 year', 'YYYY-MM-DD'));
    d := d + interval '1 year';
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_inv_pay_mthd_h_pdflt PARTITION OF ptl_inv_pay_mthd_h DEFAULT;
COMMENT ON TABLE ptl_inv_pay_mthd_h IS '납부방법이력';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.pay_mthd_no IS '납부방법번호';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.card_co_cd IS '카드사코드';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.pay_mthd_ty_cd IS '납부방법유형코드';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.pay_mthd_stts_ty_cd IS '납부방법상태유형코드';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.acct_no_encpt_vl IS '계좌번호암호화값';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.card_no_encpt_vl IS '카드번호암호화값';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.dpsown_nm IS '예금주명';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.trsf_dsgn_dd IS '이체지정일';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.pay_mthd_chg_rsn_ty_cd IS '납부방법변경사유유형코드';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_pay_mthd_h.lst_rgtr_id IS '최종등록자ID';

-- INV-013 자동이체출금결과내역 · 예상 32,000,000행 · 연 RANGE(bill_ym)
CREATE TABLE IF NOT EXISTS ptl_inv_atrf_wdrw_rslt_l (
  wdrw_req_no VARCHAR(20) NOT NULL,
  wdrw_rslt_seq NUMERIC(5) NOT NULL,
  bill_ym CHAR(6) NOT NULL,
  wdrw_rslt_dtm TIMESTAMP NOT NULL,
  wdrw_rslt_ty_cd VARCHAR(10) NOT NULL,
  wdrw_amt NUMERIC(15) NOT NULL,
  wdrw_rslt_file_nm VARCHAR(200),
  re_wdrw_trgt_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d DATE := DATE '2010-01-01';
BEGIN
  WHILE d < DATE '2028-01-01' LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_inv_atrf_wdrw_rslt_l FOR VALUES FROM (%L) TO (%L)',
      'ptl_inv_atrf_wdrw_rslt_l_p' || to_char(d, 'YYYY'), to_char(d, 'YYYYMM'), to_char(d + interval '1 year', 'YYYYMM'));
    d := d + interval '1 year';
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_inv_atrf_wdrw_rslt_l_pdflt PARTITION OF ptl_inv_atrf_wdrw_rslt_l DEFAULT;
COMMENT ON TABLE ptl_inv_atrf_wdrw_rslt_l IS '자동이체출금결과내역';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.wdrw_req_no IS '출금요청번호';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.wdrw_rslt_seq IS '출금결과순번';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.wdrw_rslt_dtm IS '출금결과일시';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.wdrw_rslt_ty_cd IS '출금결과유형코드';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.wdrw_amt IS '출금금액';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.wdrw_rslt_file_nm IS '출금결과파일명';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.re_wdrw_trgt_yn IS '재출금대상여부';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_atrf_wdrw_rslt_l.lst_rgtr_id IS '최종등록자ID';

-- INV-014 카드자동납부승인내역 · 예상 15,000,000행 · 연 RANGE(bill_ym)
CREATE TABLE IF NOT EXISTS ptl_inv_card_atmt_pay_aprv_l (
  card_atmt_pay_aprv_no VARCHAR(20) NOT NULL,
  bill_ym CHAR(6) NOT NULL,
  pay_mthd_no VARCHAR(20) NOT NULL,
  bill_no VARCHAR(20) NOT NULL,
  card_co_cd VARCHAR(10) NOT NULL,
  rcv_no VARCHAR(20),
  card_aprv_req_dtm TIMESTAMP NOT NULL,
  card_aprv_dtm TIMESTAMP,
  card_aprv_amt NUMERIC(15) NOT NULL,
  aprv_no VARCHAR(20),
  card_aprv_stts_ty_cd VARCHAR(10) NOT NULL,
  card_aprv_rfsl_rsn_ty_cd VARCHAR(10),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d DATE := DATE '2010-01-01';
BEGIN
  WHILE d < DATE '2028-01-01' LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_inv_card_atmt_pay_aprv_l FOR VALUES FROM (%L) TO (%L)',
      'ptl_inv_card_atmt_pay_aprv_l_p' || to_char(d, 'YYYY'), to_char(d, 'YYYYMM'), to_char(d + interval '1 year', 'YYYYMM'));
    d := d + interval '1 year';
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_inv_card_atmt_pay_aprv_l_pdflt PARTITION OF ptl_inv_card_atmt_pay_aprv_l DEFAULT;
COMMENT ON TABLE ptl_inv_card_atmt_pay_aprv_l IS '카드자동납부승인내역';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.card_atmt_pay_aprv_no IS '카드자동납부승인번호';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.pay_mthd_no IS '납부방법번호';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.card_co_cd IS '카드사코드';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.card_aprv_req_dtm IS '카드승인요청일시';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.card_aprv_dtm IS '카드승인일시';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.card_aprv_amt IS '카드승인금액';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.aprv_no IS '승인번호';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.card_aprv_stts_ty_cd IS '카드승인상태유형코드';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.card_aprv_rfsl_rsn_ty_cd IS '카드승인거절사유유형코드';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_card_atmt_pay_aprv_l.lst_rgtr_id IS '최종등록자ID';

-- INV-015 지로수납내역 · 예상 8,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_giro_rcv_l (
  giro_rcv_no VARCHAR(20) NOT NULL,
  bill_no VARCHAR(20) NOT NULL,
  rcv_no VARCHAR(20),
  bank_cd VARCHAR(10) NOT NULL,
  rcv_agt_inst_no VARCHAR(20),
  bill_ym CHAR(6) NOT NULL,
  giro_rcv_dtm TIMESTAMP NOT NULL,
  giro_rcv_amt NUMERIC(15) NOT NULL,
  giro_rcv_stts_ty_cd VARCHAR(10) NOT NULL,
  giro_rcv_file_nm VARCHAR(200),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_giro_rcv_l IS '지로수납내역';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.giro_rcv_no IS '지로수납번호';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.rcv_agt_inst_no IS '수납대행기관번호';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.giro_rcv_dtm IS '지로수납일시';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.giro_rcv_amt IS '지로수납금액';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.giro_rcv_stts_ty_cd IS '지로수납상태유형코드';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.giro_rcv_file_nm IS '지로수납파일명';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_giro_rcv_l.lst_rgtr_id IS '최종등록자ID';

-- INV-016 가상계좌입금내역 · 예상 5,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_vacct_dpst_l (
  vacct_dpst_no VARCHAR(20) NOT NULL,
  vacct_no VARCHAR(20) NOT NULL,
  rcv_no VARCHAR(20),
  bank_cd VARCHAR(10) NOT NULL,
  dpst_dtm TIMESTAMP NOT NULL,
  dpst_amt NUMERIC(15) NOT NULL,
  dpstr_nm VARCHAR(100),
  bank_trd_no VARCHAR(20) NOT NULL,
  vacct_dpst_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_vacct_dpst_l IS '가상계좌입금내역';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.vacct_dpst_no IS '가상계좌입금번호';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.vacct_no IS '가상계좌번호';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.dpst_dtm IS '입금일시';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.dpst_amt IS '입금금액';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.dpstr_nm IS '입금자명';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.bank_trd_no IS '은행거래번호';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.vacct_dpst_stts_ty_cd IS '가상계좌입금상태유형코드';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_vacct_dpst_l.lst_rgtr_id IS '최종등록자ID';

-- INV-017 수납취소내역 · 예상 1,200,000행
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_cncl_l (
  rcv_cncl_no VARCHAR(20) NOT NULL,
  rcv_no VARCHAR(20) NOT NULL,
  rcv_cncl_dtm TIMESTAMP NOT NULL,
  rcv_cncl_amt NUMERIC(15) NOT NULL,
  rcv_cncl_rsn_ty_cd VARCHAR(10) NOT NULL,
  rcv_cncl_stts_ty_cd VARCHAR(10) NOT NULL,
  rcv_cncl_req_dt CHAR(8),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_rcv_cncl_l IS '수납취소내역';
COMMENT ON COLUMN ptl_inv_rcv_cncl_l.rcv_cncl_no IS '수납취소번호';
COMMENT ON COLUMN ptl_inv_rcv_cncl_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_rcv_cncl_l.rcv_cncl_dtm IS '수납취소일시';
COMMENT ON COLUMN ptl_inv_rcv_cncl_l.rcv_cncl_amt IS '수납취소금액';
COMMENT ON COLUMN ptl_inv_rcv_cncl_l.rcv_cncl_rsn_ty_cd IS '수납취소사유유형코드';
COMMENT ON COLUMN ptl_inv_rcv_cncl_l.rcv_cncl_stts_ty_cd IS '수납취소상태유형코드';
COMMENT ON COLUMN ptl_inv_rcv_cncl_l.rcv_cncl_req_dt IS '수납취소요청일자';
COMMENT ON COLUMN ptl_inv_rcv_cncl_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rcv_cncl_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rcv_cncl_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rcv_cncl_l.lst_rgtr_id IS '최종등록자ID';

-- INV-018 미확인입금내역 · 예상 500,000행
CREATE TABLE IF NOT EXISTS ptl_inv_unidntf_dpst_l (
  unidntf_dpst_no VARCHAR(20) NOT NULL,
  bank_cd VARCHAR(10) NOT NULL,
  rcv_no VARCHAR(20),
  dpst_dtm TIMESTAMP NOT NULL,
  dpst_amt NUMERIC(15) NOT NULL,
  dpstr_nm VARCHAR(100),
  bank_trd_no VARCHAR(20) NOT NULL,
  unidntf_rsn_ty_cd VARCHAR(10) NOT NULL,
  unidntf_dpst_stts_ty_cd VARCHAR(10) NOT NULL,
  unidntf_dpst_idntf_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_unidntf_dpst_l IS '미확인입금내역';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.unidntf_dpst_no IS '미확인입금번호';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.dpst_dtm IS '입금일시';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.dpst_amt IS '입금금액';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.dpstr_nm IS '입금자명';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.bank_trd_no IS '은행거래번호';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.unidntf_rsn_ty_cd IS '미확인사유유형코드';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.unidntf_dpst_stts_ty_cd IS '미확인입금상태유형코드';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.unidntf_dpst_idntf_dtm IS '미확인입금확인일시';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_unidntf_dpst_l.lst_rgtr_id IS '최종등록자ID';

-- INV-019 과오납이력 · 예상 6,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_ovpay_h (
  ovpay_no VARCHAR(20) NOT NULL,
  vld_bgng_dtm TIMESTAMP NOT NULL,
  vld_end_dtm TIMESTAMP NOT NULL,
  ovpay_stts_ty_cd VARCHAR(10) NOT NULL,
  ovpay_chg_amt NUMERIC(15) NOT NULL,
  ovpay_bal NUMERIC(15) NOT NULL,
  prcs_mthd_ty_cd VARCHAR(10),
  ovpay_chg_rsn_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_ovpay_h IS '과오납이력';
COMMENT ON COLUMN ptl_inv_ovpay_h.ovpay_no IS '과오납번호';
COMMENT ON COLUMN ptl_inv_ovpay_h.vld_bgng_dtm IS '유효시작일시';
COMMENT ON COLUMN ptl_inv_ovpay_h.vld_end_dtm IS '유효종료일시';
COMMENT ON COLUMN ptl_inv_ovpay_h.ovpay_stts_ty_cd IS '과오납상태유형코드';
COMMENT ON COLUMN ptl_inv_ovpay_h.ovpay_chg_amt IS '과오납변경금액';
COMMENT ON COLUMN ptl_inv_ovpay_h.ovpay_bal IS '과오납잔액';
COMMENT ON COLUMN ptl_inv_ovpay_h.prcs_mthd_ty_cd IS '처리방법유형코드';
COMMENT ON COLUMN ptl_inv_ovpay_h.ovpay_chg_rsn_ty_cd IS '과오납변경사유유형코드';
COMMENT ON COLUMN ptl_inv_ovpay_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_ovpay_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_ovpay_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_ovpay_h.lst_rgtr_id IS '최종등록자ID';

-- INV-020 환불계좌상세 · 예상 3,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_rfnd_acct_d (
  bill_acnt_no VARCHAR(20) NOT NULL,
  rfnd_acct_seq NUMERIC(5) NOT NULL,
  bank_cd VARCHAR(10) NOT NULL,
  acct_no_encpt_vl VARCHAR(256) NOT NULL,
  dpsown_nm VARCHAR(100) NOT NULL,
  rfnd_acct_reg_dtm TIMESTAMP NOT NULL,
  rfnd_acct_stts_ty_cd VARCHAR(10) NOT NULL,
  acct_rlnm_idntf_yn CHAR(1) NOT NULL,
  rprs_rfnd_acct_yn CHAR(1) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_rfnd_acct_d IS '환불계좌상세';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.rfnd_acct_seq IS '환불계좌순번';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.bank_cd IS '은행코드';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.acct_no_encpt_vl IS '계좌번호암호화값';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.dpsown_nm IS '예금주명';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.rfnd_acct_reg_dtm IS '환불계좌등록일시';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.rfnd_acct_stts_ty_cd IS '환불계좌상태유형코드';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.acct_rlnm_idntf_yn IS '계좌실명확인여부';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.rprs_rfnd_acct_yn IS '대표환불계좌여부';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rfnd_acct_d.lst_rgtr_id IS '최종등록자ID';

-- INV-021 선납사용내역 · 예상 8,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_prpay_use_l (
  prpay_no VARCHAR(20) NOT NULL,
  prpay_use_seq NUMERIC(5) NOT NULL,
  bill_no VARCHAR(20),
  bill_ym CHAR(6),
  prpay_use_dtm TIMESTAMP NOT NULL,
  prpay_use_amt NUMERIC(15) NOT NULL,
  prpay_use_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_prpay_use_l IS '선납사용내역';
COMMENT ON COLUMN ptl_inv_prpay_use_l.prpay_no IS '선납번호';
COMMENT ON COLUMN ptl_inv_prpay_use_l.prpay_use_seq IS '선납사용순번';
COMMENT ON COLUMN ptl_inv_prpay_use_l.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_inv_prpay_use_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_inv_prpay_use_l.prpay_use_dtm IS '선납사용일시';
COMMENT ON COLUMN ptl_inv_prpay_use_l.prpay_use_amt IS '선납사용금액';
COMMENT ON COLUMN ptl_inv_prpay_use_l.prpay_use_ty_cd IS '선납사용유형코드';
COMMENT ON COLUMN ptl_inv_prpay_use_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_prpay_use_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_prpay_use_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_prpay_use_l.lst_rgtr_id IS '최종등록자ID';

-- INV-022 수납대행기관기본 · 예상 10,000행
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_agt_inst_m (
  rcv_agt_inst_no VARCHAR(20) NOT NULL,
  rcv_agt_inst_nm VARCHAR(100) NOT NULL,
  rcv_agt_inst_reg_dtm TIMESTAMP NOT NULL,
  rcv_agt_inst_stts_ty_cd VARCHAR(10) NOT NULL,
  rcv_agt_inst_ty_cd VARCHAR(10) NOT NULL,
  brno VARCHAR(20),
  rprs_telno VARCHAR(20),
  aplcn_bgng_dt CHAR(8) NOT NULL,
  aplcn_end_dt CHAR(8) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_rcv_agt_inst_m IS '수납대행기관기본';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.rcv_agt_inst_no IS '수납대행기관번호';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.rcv_agt_inst_nm IS '수납대행기관명';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.rcv_agt_inst_reg_dtm IS '수납대행기관등록일시';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.rcv_agt_inst_stts_ty_cd IS '수납대행기관상태유형코드';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.rcv_agt_inst_ty_cd IS '수납대행기관유형코드';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.brno IS '사업자등록번호';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.rprs_telno IS '대표전화번호';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rcv_agt_inst_m.lst_rgtr_id IS '최종등록자ID';

-- INV-023 수납채널코드 · 예상 50행
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_chnl_c (
  rcv_chnl_ty_cd VARCHAR(10) NOT NULL,
  rcv_agt_inst_no VARCHAR(20),
  rcv_chnl_nm VARCHAR(100) NOT NULL,
  rcv_chnl_stts_ty_cd VARCHAR(10) NOT NULL,
  rcv_rflt_dcnt NUMERIC(5) NOT NULL,
  aplcn_bgng_dt CHAR(8) NOT NULL,
  aplcn_end_dt CHAR(8) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_rcv_chnl_c IS '수납채널코드';
COMMENT ON COLUMN ptl_inv_rcv_chnl_c.rcv_chnl_ty_cd IS '수납채널유형코드';
COMMENT ON COLUMN ptl_inv_rcv_chnl_c.rcv_agt_inst_no IS '수납대행기관번호';
COMMENT ON COLUMN ptl_inv_rcv_chnl_c.rcv_chnl_nm IS '수납채널명';
COMMENT ON COLUMN ptl_inv_rcv_chnl_c.rcv_chnl_stts_ty_cd IS '수납채널상태유형코드';
COMMENT ON COLUMN ptl_inv_rcv_chnl_c.rcv_rflt_dcnt IS '수납반영일수';
COMMENT ON COLUMN ptl_inv_rcv_chnl_c.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_inv_rcv_chnl_c.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_inv_rcv_chnl_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rcv_chnl_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rcv_chnl_c.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rcv_chnl_c.lst_rgtr_id IS '최종등록자ID';

-- INV-024 수납배분우선순위코드 · 예상 200행
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_allc_prrt_c (
  rcv_allc_prrt NUMERIC(5) NOT NULL,
  chrg_itm_clsf_cd VARCHAR(10) NOT NULL,
  rcv_allc_prrt_nm VARCHAR(100) NOT NULL,
  rcv_allc_prrt_cn VARCHAR(200),
  aplcn_bgng_dt CHAR(8) NOT NULL,
  aplcn_end_dt CHAR(8) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_rcv_allc_prrt_c IS '수납배분우선순위코드';
COMMENT ON COLUMN ptl_inv_rcv_allc_prrt_c.rcv_allc_prrt IS '수납배분우선순위';
COMMENT ON COLUMN ptl_inv_rcv_allc_prrt_c.chrg_itm_clsf_cd IS '요금항목분류코드';
COMMENT ON COLUMN ptl_inv_rcv_allc_prrt_c.rcv_allc_prrt_nm IS '수납배분우선순위명';
COMMENT ON COLUMN ptl_inv_rcv_allc_prrt_c.rcv_allc_prrt_cn IS '수납배분우선순위내용';
COMMENT ON COLUMN ptl_inv_rcv_allc_prrt_c.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_inv_rcv_allc_prrt_c.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_inv_rcv_allc_prrt_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rcv_allc_prrt_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rcv_allc_prrt_c.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rcv_allc_prrt_c.lst_rgtr_id IS '최종등록자ID';

-- INV-025 수납대사내역 [STL] · 예상 300,000행
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_rcncl_l (
  rcv_rcncl_no VARCHAR(20) NOT NULL,
  rcv_agt_inst_no VARCHAR(20) NOT NULL,
  rcv_chnl_ty_cd VARCHAR(10) NOT NULL,
  rcv_rcncl_std_dt CHAR(8) NOT NULL,
  rcv_rcncl_dtm TIMESTAMP NOT NULL,
  inst_rcv_nocs NUMERIC(10) NOT NULL,
  inst_rcv_amt NUMERIC(15) NOT NULL,
  rcv_nocs NUMERIC(10) NOT NULL,
  rcv_amt NUMERIC(15) NOT NULL,
  rcv_rcncl_rslt_ty_cd VARCHAR(10) NOT NULL,
  rcv_rcncl_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_rcv_rcncl_l IS '수납대사내역';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.rcv_rcncl_no IS '수납대사번호';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.rcv_agt_inst_no IS '수납대행기관번호';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.rcv_chnl_ty_cd IS '수납채널유형코드';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.rcv_rcncl_std_dt IS '수납대사기준일자';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.rcv_rcncl_dtm IS '수납대사일시';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.inst_rcv_nocs IS '기관수납건수';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.inst_rcv_amt IS '기관수납금액';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.rcv_nocs IS '수납건수';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.rcv_amt IS '수납금액';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.rcv_rcncl_rslt_ty_cd IS '수납대사결과유형코드';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.rcv_rcncl_stts_ty_cd IS '수납대사상태유형코드';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rcv_rcncl_l.lst_rgtr_id IS '최종등록자ID';

-- INV-026 수납대행수수료내역 [STL] · 예상 10,000행
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_agt_fee_l (
  rcv_agt_fee_no VARCHAR(20) NOT NULL,
  rcv_agt_inst_no VARCHAR(20) NOT NULL,
  rcv_rcncl_no VARCHAR(20),
  stlm_ym CHAR(6) NOT NULL,
  fee_asmt_dtm TIMESTAMP NOT NULL,
  fee_trgt_nocs NUMERIC(10) NOT NULL,
  fee_trgt_amt NUMERIC(15) NOT NULL,
  fee_rt NUMERIC(5,2),
  fee_amt NUMERIC(15) NOT NULL,
  vat_amt NUMERIC(15) NOT NULL,
  rcv_agt_fee_stts_ty_cd VARCHAR(10) NOT NULL,
  give_schd_dt CHAR(8),
  elctr_txinv_aprv_no VARCHAR(30),
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_rcv_agt_fee_l IS '수납대행수수료내역';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.rcv_agt_fee_no IS '수납대행수수료번호';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.rcv_agt_inst_no IS '수납대행기관번호';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.rcv_rcncl_no IS '수납대사번호';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.stlm_ym IS '정산년월';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.fee_asmt_dtm IS '수수료산정일시';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.fee_trgt_nocs IS '수수료대상건수';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.fee_trgt_amt IS '수수료대상금액';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.fee_rt IS '수수료율';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.fee_amt IS '수수료금액';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.vat_amt IS '부가가치세금액';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.rcv_agt_fee_stts_ty_cd IS '수납대행수수료상태유형코드';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.give_schd_dt IS '지급예정일자';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.elctr_txinv_aprv_no IS '전자세금계산서승인번호';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rcv_agt_fee_l.lst_rgtr_id IS '최종등록자ID';

-- INV-027 영수증발행내역 · 예상 5,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_rcipt_pblcn_l (
  rcipt_pblcn_no VARCHAR(20) NOT NULL,
  rcv_no VARCHAR(20) NOT NULL,
  rcipt_pblcn_dtm TIMESTAMP NOT NULL,
  rcipt_pblcn_ty_cd VARCHAR(10) NOT NULL,
  rcipt_pblcn_amt NUMERIC(15) NOT NULL,
  rcipt_pblcn_tms NUMERIC(3) NOT NULL,
  rcipt_pblcn_stts_ty_cd VARCHAR(10) NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_rcipt_pblcn_l IS '영수증발행내역';
COMMENT ON COLUMN ptl_inv_rcipt_pblcn_l.rcipt_pblcn_no IS '영수증발행번호';
COMMENT ON COLUMN ptl_inv_rcipt_pblcn_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_rcipt_pblcn_l.rcipt_pblcn_dtm IS '영수증발행일시';
COMMENT ON COLUMN ptl_inv_rcipt_pblcn_l.rcipt_pblcn_ty_cd IS '영수증발행유형코드';
COMMENT ON COLUMN ptl_inv_rcipt_pblcn_l.rcipt_pblcn_amt IS '영수증발행금액';
COMMENT ON COLUMN ptl_inv_rcipt_pblcn_l.rcipt_pblcn_tms IS '영수증발행회차';
COMMENT ON COLUMN ptl_inv_rcipt_pblcn_l.rcipt_pblcn_stts_ty_cd IS '영수증발행상태유형코드';
COMMENT ON COLUMN ptl_inv_rcipt_pblcn_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rcipt_pblcn_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rcipt_pblcn_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rcipt_pblcn_l.lst_rgtr_id IS '최종등록자ID';

-- INV-028 현금영수증발행내역 · 예상 3,000,000행
CREATE TABLE IF NOT EXISTS ptl_inv_cash_rcipt_pblcn_l (
  cash_rcipt_pblcn_no VARCHAR(20) NOT NULL,
  rcv_no VARCHAR(20) NOT NULL,
  cash_rcipt_pblcn_dtm TIMESTAMP NOT NULL,
  cash_rcipt_aprv_no VARCHAR(20),
  cash_rcipt_trd_se_cd VARCHAR(10) NOT NULL,
  cash_rcipt_idfc_no_encpt_vl VARCHAR(256) NOT NULL,
  cash_rcipt_pblcn_amt NUMERIC(15) NOT NULL,
  cash_rcipt_pblcn_stts_ty_cd VARCHAR(10) NOT NULL,
  nts_trnm_dtm TIMESTAMP,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_cash_rcipt_pblcn_l IS '현금영수증발행내역';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.cash_rcipt_pblcn_no IS '현금영수증발행번호';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.rcv_no IS '수납번호';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.cash_rcipt_pblcn_dtm IS '현금영수증발행일시';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.cash_rcipt_aprv_no IS '현금영수증승인번호';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.cash_rcipt_trd_se_cd IS '현금영수증거래구분코드';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.cash_rcipt_idfc_no_encpt_vl IS '현금영수증식별번호암호화값';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.cash_rcipt_pblcn_amt IS '현금영수증발행금액';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.cash_rcipt_pblcn_stts_ty_cd IS '현금영수증발행상태유형코드';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.nts_trnm_dtm IS '국세청전송일시';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_cash_rcipt_pblcn_l.lst_rgtr_id IS '최종등록자ID';

-- INV-029 수납일집계 · 예상 500,000행
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_dd_t (
  rcv_chnl_ty_cd VARCHAR(10) NOT NULL,
  rcv_dt CHAR(8) NOT NULL,
  pay_mthd_ty_cd VARCHAR(10) NOT NULL,
  rcv_nocs NUMERIC(10) NOT NULL,
  rcv_amt NUMERIC(15) NOT NULL,
  rcv_cncl_nocs NUMERIC(10) NOT NULL,
  rcv_cncl_amt NUMERIC(15) NOT NULL,
  agg_dtm TIMESTAMP NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_rcv_dd_t IS '수납일집계';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.rcv_chnl_ty_cd IS '수납채널유형코드';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.rcv_dt IS '수납일자';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.pay_mthd_ty_cd IS '납부방법유형코드';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.rcv_nocs IS '수납건수';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.rcv_amt IS '수납금액';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.rcv_cncl_nocs IS '수납취소건수';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.rcv_cncl_amt IS '수납취소금액';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.agg_dtm IS '집계일시';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rcv_dd_t.lst_rgtr_id IS '최종등록자ID';

-- INV-030 수납월통계 · 예상 16,000행
CREATE TABLE IF NOT EXISTS ptl_inv_rcv_mm_s (
  rcv_chnl_ty_cd VARCHAR(10) NOT NULL,
  rcv_ym CHAR(6) NOT NULL,
  pay_mthd_ty_cd VARCHAR(10) NOT NULL,
  rcv_bill_acnt_nocs NUMERIC(10) NOT NULL,
  rcv_nocs NUMERIC(10) NOT NULL,
  rcv_amt NUMERIC(15) NOT NULL,
  ovpay_ocrn_amt NUMERIC(15) NOT NULL,
  rfnd_amt NUMERIC(15) NOT NULL,
  agg_dtm TIMESTAMP NOT NULL,
  lst_mddtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_inv_rcv_mm_s IS '수납월통계';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.rcv_chnl_ty_cd IS '수납채널유형코드';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.rcv_ym IS '수납년월';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.pay_mthd_ty_cd IS '납부방법유형코드';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.rcv_bill_acnt_nocs IS '수납청구계정건수';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.rcv_nocs IS '수납건수';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.rcv_amt IS '수납금액';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.ovpay_ocrn_amt IS '과오납발생금액';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.rfnd_amt IS '환불금액';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.agg_dtm IS '집계일시';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_inv_rcv_mm_s.lst_rgtr_id IS '최종등록자ID';

