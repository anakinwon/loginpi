-- 40_pay_tables.sql : PAY(청구 — 사용량·요금계산 포함) 테이블 생성 — PK·인덱스 없이(D14 적재 순서), 파티션 포함
-- 실행 : psql -v ON_ERROR_STOP=1 -f 40_pay_tables.sql (search_path 대상 스키마). 재실행 안전(IF NOT EXISTS). 생성기 tools/physical_PAY.js
-- FK 제약 없음(D6 — 설계 정의는 model/physical/PAY.json fks). 시스템 칼럼 4개는 맨 끝(D7)

-- PAY-001 원시사용내역 · 예상 100,000,000행(T4) · 월 RANGE CLCT_DTM
CREATE TABLE IF NOT EXISTS ptl_pay_raw_use_l (
  raw_use_no                   VARCHAR(20)    NOT NULL,
  clct_dtm                     TIMESTAMP      NOT NULL,
  clct_file_no                 VARCHAR(20)    NOT NULL,
  raw_use_nm                   VARCHAR(100)   NOT NULL,
  use_bgng_dtm                 TIMESTAMP      NOT NULL,
  raw_use_prcs_stts_ty_cd      VARCHAR(10)    NOT NULL,
  svc_no                       VARCHAR(20)   ,
  imsi_no                      VARCHAR(20)   ,
  use_svc_ty_cd                VARCHAR(10)    NOT NULL,
  clg_no                       VARCHAR(20)   ,
  cld_no                       VARCHAR(20)   ,
  use_end_dtm                  TIMESTAMP     ,
  use_hr_scnt                  NUMERIC(10)   ,
  data_use_byte_cnt            NUMERIC(18)   ,
  raw_rcrd_cn                  VARCHAR(4000) ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (clct_dtm);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-12-01', INTERVAL '1 month')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_raw_use_l FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_raw_use_l_p' || to_char(d, 'YYYYMM'), to_char(d, 'YYYY-MM-DD'), to_char(d + INTERVAL '1 month', 'YYYY-MM-DD'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_raw_use_l_pdef PARTITION OF ptl_pay_raw_use_l DEFAULT;
COMMENT ON TABLE ptl_pay_raw_use_l IS '원시사용내역';
COMMENT ON COLUMN ptl_pay_raw_use_l.raw_use_no IS '원시사용번호';
COMMENT ON COLUMN ptl_pay_raw_use_l.clct_dtm IS '수집일시';
COMMENT ON COLUMN ptl_pay_raw_use_l.clct_file_no IS '수집파일번호';
COMMENT ON COLUMN ptl_pay_raw_use_l.raw_use_nm IS '원시사용명';
COMMENT ON COLUMN ptl_pay_raw_use_l.use_bgng_dtm IS '사용시작일시';
COMMENT ON COLUMN ptl_pay_raw_use_l.raw_use_prcs_stts_ty_cd IS '원시사용처리상태유형코드';
COMMENT ON COLUMN ptl_pay_raw_use_l.svc_no IS '서비스번호';
COMMENT ON COLUMN ptl_pay_raw_use_l.imsi_no IS 'IMSI번호';
COMMENT ON COLUMN ptl_pay_raw_use_l.use_svc_ty_cd IS '사용서비스유형코드';
COMMENT ON COLUMN ptl_pay_raw_use_l.clg_no IS '발신번호';
COMMENT ON COLUMN ptl_pay_raw_use_l.cld_no IS '착신번호';
COMMENT ON COLUMN ptl_pay_raw_use_l.use_end_dtm IS '사용종료일시';
COMMENT ON COLUMN ptl_pay_raw_use_l.use_hr_scnt IS '사용시간초수';
COMMENT ON COLUMN ptl_pay_raw_use_l.data_use_byte_cnt IS '데이터사용바이트수';
COMMENT ON COLUMN ptl_pay_raw_use_l.raw_rcrd_cn IS '원시레코드내용';
COMMENT ON COLUMN ptl_pay_raw_use_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_raw_use_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_raw_use_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_raw_use_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-002 사용내역 · 예상 150,000,000행(T4) · 월 RANGE BILL_YM
CREATE TABLE IF NOT EXISTS ptl_pay_use_l (
  use_no                       VARCHAR(20)    NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  raw_use_no                   VARCHAR(20)   ,
  svc_mgmt_no                  VARCHAR(20)    NOT NULL,
  chrg_itm_cd                  VARCHAR(10)    NOT NULL,
  use_svc_ty_cd                VARCHAR(10)    NOT NULL,
  use_dtls_nm                  VARCHAR(100)   NOT NULL,
  use_bgng_dtm                 TIMESTAMP      NOT NULL,
  use_rat_stts_ty_cd           VARCHAR(10)    NOT NULL,
  use_end_dtm                  TIMESTAMP     ,
  svc_no                       VARCHAR(20)    NOT NULL,
  cld_no                       VARCHAR(20)   ,
  use_qty                      NUMERIC(18)    NOT NULL,
  use_unit_ty_cd               VARCHAR(10)    NOT NULL,
  rat_qty                      NUMERIC(18)    NOT NULL,
  bscprvd_ddct_qty             NUMERIC(18)    NOT NULL,
  use_amt                      NUMERIC(15)    NOT NULL,
  rat_dtm                      TIMESTAMP      NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-12-01', INTERVAL '1 month')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_use_l FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_use_l_p' || to_char(d, 'YYYYMM'), to_char(d, 'YYYYMM'), to_char(d + INTERVAL '1 month', 'YYYYMM'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_use_l_pdef PARTITION OF ptl_pay_use_l DEFAULT;
COMMENT ON TABLE ptl_pay_use_l IS '사용내역';
COMMENT ON COLUMN ptl_pay_use_l.use_no IS '사용번호';
COMMENT ON COLUMN ptl_pay_use_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_use_l.raw_use_no IS '원시사용번호';
COMMENT ON COLUMN ptl_pay_use_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_pay_use_l.chrg_itm_cd IS '요금항목코드';
COMMENT ON COLUMN ptl_pay_use_l.use_svc_ty_cd IS '사용서비스유형코드';
COMMENT ON COLUMN ptl_pay_use_l.use_dtls_nm IS '사용내역명';
COMMENT ON COLUMN ptl_pay_use_l.use_bgng_dtm IS '사용시작일시';
COMMENT ON COLUMN ptl_pay_use_l.use_rat_stts_ty_cd IS '사용과금상태유형코드';
COMMENT ON COLUMN ptl_pay_use_l.use_end_dtm IS '사용종료일시';
COMMENT ON COLUMN ptl_pay_use_l.svc_no IS '서비스번호';
COMMENT ON COLUMN ptl_pay_use_l.cld_no IS '착신번호';
COMMENT ON COLUMN ptl_pay_use_l.use_qty IS '사용량';
COMMENT ON COLUMN ptl_pay_use_l.use_unit_ty_cd IS '사용단위유형코드';
COMMENT ON COLUMN ptl_pay_use_l.rat_qty IS '과금량';
COMMENT ON COLUMN ptl_pay_use_l.bscprvd_ddct_qty IS '기본제공차감량';
COMMENT ON COLUMN ptl_pay_use_l.use_amt IS '사용금액';
COMMENT ON COLUMN ptl_pay_use_l.rat_dtm IS '과금일시';
COMMENT ON COLUMN ptl_pay_use_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_use_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_use_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_use_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-003 사용량월집계 · 예상 20,000,000행(T3) · 연 RANGE BILL_YM
CREATE TABLE IF NOT EXISTS ptl_pay_use_qty_mm_t (
  svc_mgmt_no                  VARCHAR(20)    NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  use_svc_ty_cd                VARCHAR(10)    NOT NULL,
  use_qty_agg_nm               VARCHAR(100)   NOT NULL,
  agg_dtm                      TIMESTAMP      NOT NULL,
  agg_stts_ty_cd               VARCHAR(10)    NOT NULL,
  use_nocs                     NUMERIC(10)    NOT NULL,
  tot_use_qty                  NUMERIC(18)    NOT NULL,
  tot_rat_qty                  NUMERIC(18)    NOT NULL,
  bscprvd_use_qty              NUMERIC(18)    NOT NULL,
  excs_use_qty                 NUMERIC(18)    NOT NULL,
  use_amt                      NUMERIC(15)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-01-01', INTERVAL '1 year')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_use_qty_mm_t FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_use_qty_mm_t_p' || to_char(d, 'YYYY'), to_char(d, 'YYYYMM'), to_char(d + INTERVAL '1 year', 'YYYYMM'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_use_qty_mm_t_pdef PARTITION OF ptl_pay_use_qty_mm_t DEFAULT;
COMMENT ON TABLE ptl_pay_use_qty_mm_t IS '사용량월집계';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.use_svc_ty_cd IS '사용서비스유형코드';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.use_qty_agg_nm IS '사용량집계명';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.agg_dtm IS '집계일시';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.agg_stts_ty_cd IS '집계상태유형코드';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.use_nocs IS '사용건수';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.tot_use_qty IS '총사용량';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.tot_rat_qty IS '총과금량';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.bscprvd_use_qty IS '기본제공사용량';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.excs_use_qty IS '초과사용량';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.use_amt IS '사용금액';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_use_qty_mm_t.lst_rgtr_id IS '최종등록자ID';

-- PAY-004 요금계산내역 · 예상 100,000,000행(T4) · 월 RANGE BILL_YM
CREATE TABLE IF NOT EXISTS ptl_pay_chrg_calc_l (
  chrg_calc_no                 VARCHAR(20)    NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  bill_job_no                  VARCHAR(20)    NOT NULL,
  bill_acnt_no                 VARCHAR(20)    NOT NULL,
  svc_mgmt_no                  VARCHAR(20)   ,
  sbsc_prod_no                 VARCHAR(20)   ,
  chrg_itm_cd                  VARCHAR(10)    NOT NULL,
  use_svc_ty_cd                VARCHAR(10)   ,
  bill_no                      VARCHAR(20)   ,
  bill_dtl_seq                 NUMERIC(5)    ,
  chrg_calc_nm                 VARCHAR(100)   NOT NULL,
  chrg_calc_dtm                TIMESTAMP      NOT NULL,
  chrg_calc_stts_ty_cd         VARCHAR(10)    NOT NULL,
  chrg_calc_ty_cd              VARCHAR(10)    NOT NULL,
  calc_amt                     NUMERIC(15)    NOT NULL,
  dyprt_yn                     CHAR(1)        NOT NULL,
  aplcn_bgng_dt                CHAR(8)        NOT NULL,
  aplcn_end_dt                 CHAR(8)        NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-12-01', INTERVAL '1 month')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_chrg_calc_l FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_chrg_calc_l_p' || to_char(d, 'YYYYMM'), to_char(d, 'YYYYMM'), to_char(d + INTERVAL '1 month', 'YYYYMM'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_chrg_calc_l_pdef PARTITION OF ptl_pay_chrg_calc_l DEFAULT;
COMMENT ON TABLE ptl_pay_chrg_calc_l IS '요금계산내역';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.chrg_calc_no IS '요금계산번호';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.bill_job_no IS '청구작업번호';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.sbsc_prod_no IS '가입상품번호';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.chrg_itm_cd IS '요금항목코드';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.use_svc_ty_cd IS '사용서비스유형코드';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.bill_dtl_seq IS '청구상세순번';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.chrg_calc_nm IS '요금계산명';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.chrg_calc_dtm IS '요금계산일시';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.chrg_calc_stts_ty_cd IS '요금계산상태유형코드';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.chrg_calc_ty_cd IS '요금계산유형코드';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.calc_amt IS '계산금액';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.dyprt_yn IS '일할여부';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_chrg_calc_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-005 청구주기코드 · 예상 30행(T1)
CREATE TABLE IF NOT EXISTS ptl_pay_bill_cycl_c (
  bill_cycl_cd                 VARCHAR(10)    NOT NULL,
  bill_cycl_nm                 VARCHAR(100)   NOT NULL,
  bill_cycl_reg_dtm            TIMESTAMP      NOT NULL,
  bill_cycl_stts_ty_cd         VARCHAR(10)    NOT NULL,
  use_prd_bgng_dd              CHAR(2)        NOT NULL,
  use_prd_ddln_dd              CHAR(2)        NOT NULL,
  invc_pblcn_dd                CHAR(2)        NOT NULL,
  pay_tmlmt_dd                 CHAR(2)        NOT NULL,
  aplcn_bgng_dt                CHAR(8)        NOT NULL,
  aplcn_end_dt                 CHAR(8)       ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_bill_cycl_c IS '청구주기코드';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.bill_cycl_cd IS '청구주기코드';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.bill_cycl_nm IS '청구주기명';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.bill_cycl_reg_dtm IS '청구주기등록일시';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.bill_cycl_stts_ty_cd IS '청구주기상태유형코드';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.use_prd_bgng_dd IS '사용기간시작일';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.use_prd_ddln_dd IS '사용기간마감일';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.invc_pblcn_dd IS '청구서발행일';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.pay_tmlmt_dd IS '납부기한일';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_bill_cycl_c.lst_rgtr_id IS '최종등록자ID';

-- PAY-006 청구작업기본 · 예상 5,000행(T1)
CREATE TABLE IF NOT EXISTS ptl_pay_bill_job_m (
  bill_job_no                  VARCHAR(20)    NOT NULL,
  bill_cycl_cd                 VARCHAR(10)   ,
  bill_job_nm                  VARCHAR(100)   NOT NULL,
  bill_job_bgng_dtm            TIMESTAMP      NOT NULL,
  bill_job_stts_ty_cd          VARCHAR(10)    NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  bill_job_ty_cd               VARCHAR(10)    NOT NULL,
  trgt_bill_acnt_cnt           NUMERIC(10)    NOT NULL,
  prcs_nocs                    NUMERIC(10)    NOT NULL,
  err_nocs                     NUMERIC(10)    NOT NULL,
  bill_tot_amt                 NUMERIC(15)    NOT NULL,
  bill_job_end_dtm             TIMESTAMP     ,
  bill_ddln_dtm                TIMESTAMP     ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_bill_job_m IS '청구작업기본';
COMMENT ON COLUMN ptl_pay_bill_job_m.bill_job_no IS '청구작업번호';
COMMENT ON COLUMN ptl_pay_bill_job_m.bill_cycl_cd IS '청구주기코드';
COMMENT ON COLUMN ptl_pay_bill_job_m.bill_job_nm IS '청구작업명';
COMMENT ON COLUMN ptl_pay_bill_job_m.bill_job_bgng_dtm IS '청구작업시작일시';
COMMENT ON COLUMN ptl_pay_bill_job_m.bill_job_stts_ty_cd IS '청구작업상태유형코드';
COMMENT ON COLUMN ptl_pay_bill_job_m.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_bill_job_m.bill_job_ty_cd IS '청구작업유형코드';
COMMENT ON COLUMN ptl_pay_bill_job_m.trgt_bill_acnt_cnt IS '대상청구계정수';
COMMENT ON COLUMN ptl_pay_bill_job_m.prcs_nocs IS '처리건수';
COMMENT ON COLUMN ptl_pay_bill_job_m.err_nocs IS '오류건수';
COMMENT ON COLUMN ptl_pay_bill_job_m.bill_tot_amt IS '청구총금액';
COMMENT ON COLUMN ptl_pay_bill_job_m.bill_job_end_dtm IS '청구작업종료일시';
COMMENT ON COLUMN ptl_pay_bill_job_m.bill_ddln_dtm IS '청구마감일시';
COMMENT ON COLUMN ptl_pay_bill_job_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_bill_job_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_bill_job_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_bill_job_m.lst_rgtr_id IS '최종등록자ID';

-- PAY-007 청구기본 · 예상 25,000,000행(T3) · 연 RANGE BILL_YM
CREATE TABLE IF NOT EXISTS ptl_pay_bill_m (
  bill_no                      VARCHAR(20)    NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  bill_acnt_no                 VARCHAR(20)    NOT NULL,
  bill_job_no                  VARCHAR(20)    NOT NULL,
  bill_cycl_cd                 VARCHAR(10)   ,
  orgn_bill_no                 VARCHAR(20)   ,
  invc_nm                      VARCHAR(100)   NOT NULL,
  bill_cfmtn_dtm               TIMESTAMP      NOT NULL,
  bill_stts_ty_cd              VARCHAR(10)    NOT NULL,
  bill_ty_cd                   VARCHAR(10)    NOT NULL,
  invc_pblcn_dt                CHAR(8)        NOT NULL,
  pay_tmlmt_dt                 CHAR(8)        NOT NULL,
  thmm_bill_amt                NUMERIC(15)    NOT NULL,
  dscnt_amt                    NUMERIC(15)    NOT NULL,
  adj_amt                      NUMERIC(15)    NOT NULL,
  vat_amt                      NUMERIC(15)    NOT NULL,
  unpd_cyov_amt                NUMERIC(15)    NOT NULL,
  tot_bill_amt                 NUMERIC(15)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-01-01', INTERVAL '1 year')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_bill_m FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_bill_m_p' || to_char(d, 'YYYY'), to_char(d, 'YYYYMM'), to_char(d + INTERVAL '1 year', 'YYYYMM'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_bill_m_pdef PARTITION OF ptl_pay_bill_m DEFAULT;
COMMENT ON TABLE ptl_pay_bill_m IS '청구기본';
COMMENT ON COLUMN ptl_pay_bill_m.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_pay_bill_m.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_bill_m.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_pay_bill_m.bill_job_no IS '청구작업번호';
COMMENT ON COLUMN ptl_pay_bill_m.bill_cycl_cd IS '청구주기코드';
COMMENT ON COLUMN ptl_pay_bill_m.orgn_bill_no IS '원청구번호';
COMMENT ON COLUMN ptl_pay_bill_m.invc_nm IS '청구서명';
COMMENT ON COLUMN ptl_pay_bill_m.bill_cfmtn_dtm IS '청구확정일시';
COMMENT ON COLUMN ptl_pay_bill_m.bill_stts_ty_cd IS '청구상태유형코드';
COMMENT ON COLUMN ptl_pay_bill_m.bill_ty_cd IS '청구유형코드';
COMMENT ON COLUMN ptl_pay_bill_m.invc_pblcn_dt IS '청구서발행일자';
COMMENT ON COLUMN ptl_pay_bill_m.pay_tmlmt_dt IS '납부기한일자';
COMMENT ON COLUMN ptl_pay_bill_m.thmm_bill_amt IS '당월청구금액';
COMMENT ON COLUMN ptl_pay_bill_m.dscnt_amt IS '할인금액';
COMMENT ON COLUMN ptl_pay_bill_m.adj_amt IS '조정금액';
COMMENT ON COLUMN ptl_pay_bill_m.vat_amt IS '부가가치세금액';
COMMENT ON COLUMN ptl_pay_bill_m.unpd_cyov_amt IS '미납이월금액';
COMMENT ON COLUMN ptl_pay_bill_m.tot_bill_amt IS '총청구금액';
COMMENT ON COLUMN ptl_pay_bill_m.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_bill_m.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_bill_m.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_bill_m.lst_rgtr_id IS '최종등록자ID';

-- PAY-008 청구상세 · 예상 100,000,000행(T4) · 월 RANGE BILL_YM
CREATE TABLE IF NOT EXISTS ptl_pay_bill_d (
  bill_no                      VARCHAR(20)    NOT NULL,
  bill_dtl_seq                 NUMERIC(5)     NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  svc_mgmt_no                  VARCHAR(20)   ,
  chrg_itm_cd                  VARCHAR(10)    NOT NULL,
  bill_dtl_nm                  VARCHAR(100)   NOT NULL,
  bill_dtl_crt_dtm             TIMESTAMP      NOT NULL,
  bill_dtl_stts_ty_cd          VARCHAR(10)    NOT NULL,
  bill_amt                     NUMERIC(15)    NOT NULL,
  splyamt                      NUMERIC(15)    NOT NULL,
  vat_amt                      NUMERIC(15)    NOT NULL,
  txtn_ty_cd                   VARCHAR(10)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-12-01', INTERVAL '1 month')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_bill_d FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_bill_d_p' || to_char(d, 'YYYYMM'), to_char(d, 'YYYYMM'), to_char(d + INTERVAL '1 month', 'YYYYMM'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_bill_d_pdef PARTITION OF ptl_pay_bill_d DEFAULT;
COMMENT ON TABLE ptl_pay_bill_d IS '청구상세';
COMMENT ON COLUMN ptl_pay_bill_d.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_pay_bill_d.bill_dtl_seq IS '청구상세순번';
COMMENT ON COLUMN ptl_pay_bill_d.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_bill_d.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_pay_bill_d.chrg_itm_cd IS '요금항목코드';
COMMENT ON COLUMN ptl_pay_bill_d.bill_dtl_nm IS '청구상세명';
COMMENT ON COLUMN ptl_pay_bill_d.bill_dtl_crt_dtm IS '청구상세생성일시';
COMMENT ON COLUMN ptl_pay_bill_d.bill_dtl_stts_ty_cd IS '청구상세상태유형코드';
COMMENT ON COLUMN ptl_pay_bill_d.bill_amt IS '청구금액';
COMMENT ON COLUMN ptl_pay_bill_d.splyamt IS '공급가액';
COMMENT ON COLUMN ptl_pay_bill_d.vat_amt IS '부가가치세금액';
COMMENT ON COLUMN ptl_pay_bill_d.txtn_ty_cd IS '과세유형코드';
COMMENT ON COLUMN ptl_pay_bill_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_bill_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_bill_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_bill_d.lst_rgtr_id IS '최종등록자ID';

-- PAY-009 청구조정내역 · 예상 5,000,000행(T2)
CREATE TABLE IF NOT EXISTS ptl_pay_bill_adj_l (
  bill_adj_no                  VARCHAR(20)    NOT NULL,
  bill_no                      VARCHAR(20)    NOT NULL,
  bill_dtl_seq                 NUMERIC(5)    ,
  bill_adj_rsn_ty_cd           VARCHAR(10)    NOT NULL,
  bill_adj_nm                  VARCHAR(100)   NOT NULL,
  bill_adj_dtm                 TIMESTAMP      NOT NULL,
  bill_adj_stts_ty_cd          VARCHAR(10)    NOT NULL,
  bill_adj_ty_cd               VARCHAR(10)    NOT NULL,
  adj_amt                      NUMERIC(15)    NOT NULL,
  adj_vat_amt                  NUMERIC(15)    NOT NULL,
  rflt_bill_ym                 CHAR(6)       ,
  adj_aprv_dtm                 TIMESTAMP     ,
  adj_cn                       VARCHAR(4000) ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_bill_adj_l IS '청구조정내역';
COMMENT ON COLUMN ptl_pay_bill_adj_l.bill_adj_no IS '청구조정번호';
COMMENT ON COLUMN ptl_pay_bill_adj_l.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_pay_bill_adj_l.bill_dtl_seq IS '청구상세순번';
COMMENT ON COLUMN ptl_pay_bill_adj_l.bill_adj_rsn_ty_cd IS '청구조정사유유형코드';
COMMENT ON COLUMN ptl_pay_bill_adj_l.bill_adj_nm IS '청구조정명';
COMMENT ON COLUMN ptl_pay_bill_adj_l.bill_adj_dtm IS '청구조정일시';
COMMENT ON COLUMN ptl_pay_bill_adj_l.bill_adj_stts_ty_cd IS '청구조정상태유형코드';
COMMENT ON COLUMN ptl_pay_bill_adj_l.bill_adj_ty_cd IS '청구조정유형코드';
COMMENT ON COLUMN ptl_pay_bill_adj_l.adj_amt IS '조정금액';
COMMENT ON COLUMN ptl_pay_bill_adj_l.adj_vat_amt IS '조정부가가치세금액';
COMMENT ON COLUMN ptl_pay_bill_adj_l.rflt_bill_ym IS '반영청구년월';
COMMENT ON COLUMN ptl_pay_bill_adj_l.adj_aprv_dtm IS '조정승인일시';
COMMENT ON COLUMN ptl_pay_bill_adj_l.adj_cn IS '조정내용';
COMMENT ON COLUMN ptl_pay_bill_adj_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_bill_adj_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_bill_adj_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_bill_adj_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-010 청구세금상세 · 예상 30,000,000행(T3) · 연 RANGE BILL_YM
CREATE TABLE IF NOT EXISTS ptl_pay_bill_tax_d (
  bill_no                      VARCHAR(20)    NOT NULL,
  txtn_ty_cd                   VARCHAR(10)    NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  bill_tax_nm                  VARCHAR(100)   NOT NULL,
  tax_calc_dtm                 TIMESTAMP      NOT NULL,
  bill_tax_stts_ty_cd          VARCHAR(10)    NOT NULL,
  txstd_amt                    NUMERIC(15)    NOT NULL,
  txrt                         NUMERIC(5,2)   NOT NULL,
  txamt                        NUMERIC(15)    NOT NULL,
  txemp_amt                    NUMERIC(15)    NOT NULL,
  txinv_pblcn_yn               CHAR(1)        NOT NULL,
  elctr_txinv_aprv_no          VARCHAR(30)   ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-01-01', INTERVAL '1 year')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_bill_tax_d FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_bill_tax_d_p' || to_char(d, 'YYYY'), to_char(d, 'YYYYMM'), to_char(d + INTERVAL '1 year', 'YYYYMM'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_bill_tax_d_pdef PARTITION OF ptl_pay_bill_tax_d DEFAULT;
COMMENT ON TABLE ptl_pay_bill_tax_d IS '청구세금상세';
COMMENT ON COLUMN ptl_pay_bill_tax_d.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_pay_bill_tax_d.txtn_ty_cd IS '과세유형코드';
COMMENT ON COLUMN ptl_pay_bill_tax_d.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_bill_tax_d.bill_tax_nm IS '청구세금명';
COMMENT ON COLUMN ptl_pay_bill_tax_d.tax_calc_dtm IS '세금계산일시';
COMMENT ON COLUMN ptl_pay_bill_tax_d.bill_tax_stts_ty_cd IS '청구세금상태유형코드';
COMMENT ON COLUMN ptl_pay_bill_tax_d.txstd_amt IS '과세표준금액';
COMMENT ON COLUMN ptl_pay_bill_tax_d.txrt IS '세율';
COMMENT ON COLUMN ptl_pay_bill_tax_d.txamt IS '세액';
COMMENT ON COLUMN ptl_pay_bill_tax_d.txemp_amt IS '면세금액';
COMMENT ON COLUMN ptl_pay_bill_tax_d.txinv_pblcn_yn IS '세금계산서발행여부';
COMMENT ON COLUMN ptl_pay_bill_tax_d.elctr_txinv_aprv_no IS '전자세금계산서승인번호';
COMMENT ON COLUMN ptl_pay_bill_tax_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_bill_tax_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_bill_tax_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_bill_tax_d.lst_rgtr_id IS '최종등록자ID';

-- PAY-011 사용량수집파일내역 · 예상 2,000,000행(T2)
CREATE TABLE IF NOT EXISTS ptl_pay_use_qty_clct_file_l (
  clct_file_no                 VARCHAR(20)    NOT NULL,
  clct_file_nm                 VARCHAR(100)   NOT NULL,
  ntwk_elmt_ty_cd              VARCHAR(10)    NOT NULL,
  file_crt_dtm                 TIMESTAMP      NOT NULL,
  clct_dtm                     TIMESTAMP      NOT NULL,
  clct_file_prcs_stts_ty_cd    VARCHAR(10)    NOT NULL,
  rcrd_nocs                    NUMERIC(10)    NOT NULL,
  nrml_nocs                    NUMERIC(10)    NOT NULL,
  err_nocs                     NUMERIC(10)    NOT NULL,
  dup_nocs                     NUMERIC(10)    NOT NULL,
  prcs_cmptn_dtm               TIMESTAMP     ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_use_qty_clct_file_l IS '사용량수집파일내역';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.clct_file_no IS '수집파일번호';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.clct_file_nm IS '수집파일명';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.ntwk_elmt_ty_cd IS '망요소유형코드';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.file_crt_dtm IS '파일생성일시';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.clct_dtm IS '수집일시';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.clct_file_prcs_stts_ty_cd IS '수집파일처리상태유형코드';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.rcrd_nocs IS '레코드건수';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.nrml_nocs IS '정상건수';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.err_nocs IS '오류건수';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.dup_nocs IS '중복건수';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.prcs_cmptn_dtm IS '처리완료일시';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_use_qty_clct_file_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-012 사용량오류내역 · 예상 3,000,000행(T2)
CREATE TABLE IF NOT EXISTS ptl_pay_use_qty_err_l (
  use_qty_err_no               VARCHAR(20)    NOT NULL,
  raw_use_no                   VARCHAR(20)    NOT NULL,
  use_qty_err_ty_cd            VARCHAR(10)    NOT NULL,
  err_ocrn_dtm                 TIMESTAMP      NOT NULL,
  err_prcs_stts_ty_cd          VARCHAR(10)    NOT NULL,
  re_prcs_nmtm                 NUMERIC(10)    NOT NULL,
  last_re_prcs_dtm             TIMESTAMP     ,
  err_cn                       VARCHAR(4000) ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_use_qty_err_l IS '사용량오류내역';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.use_qty_err_no IS '사용량오류번호';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.raw_use_no IS '원시사용번호';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.use_qty_err_ty_cd IS '사용량오류유형코드';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.err_ocrn_dtm IS '오류발생일시';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.err_prcs_stts_ty_cd IS '오류처리상태유형코드';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.re_prcs_nmtm IS '재처리횟수';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.last_re_prcs_dtm IS '최종재처리일시';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.err_cn IS '오류내용';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_use_qty_err_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-013 사용량일집계 · 예상 100,000,000행(T4) · 월 RANGE USE_DT
CREATE TABLE IF NOT EXISTS ptl_pay_use_qty_dd_t (
  svc_mgmt_no                  VARCHAR(20)    NOT NULL,
  use_dt                       CHAR(8)        NOT NULL,
  use_svc_ty_cd                VARCHAR(10)    NOT NULL,
  agg_dtm                      TIMESTAMP      NOT NULL,
  use_nocs                     NUMERIC(10)    NOT NULL,
  tot_use_qty                  NUMERIC(18)    NOT NULL,
  tot_rat_qty                  NUMERIC(18)    NOT NULL,
  use_amt                      NUMERIC(15)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (use_dt);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-12-01', INTERVAL '1 month')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_use_qty_dd_t FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_use_qty_dd_t_p' || to_char(d, 'YYYYMM'), to_char(d, 'YYYYMMDD'), to_char(d + INTERVAL '1 month', 'YYYYMMDD'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_use_qty_dd_t_pdef PARTITION OF ptl_pay_use_qty_dd_t DEFAULT;
COMMENT ON TABLE ptl_pay_use_qty_dd_t IS '사용량일집계';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.use_dt IS '사용일자';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.use_svc_ty_cd IS '사용서비스유형코드';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.agg_dtm IS '집계일시';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.use_nocs IS '사용건수';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.tot_use_qty IS '총사용량';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.tot_rat_qty IS '총과금량';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.use_amt IS '사용금액';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_use_qty_dd_t.lst_rgtr_id IS '최종등록자ID';

-- PAY-014 기본제공소진내역 · 예상 20,000,000행(T3) · 연 RANGE BILL_YM
CREATE TABLE IF NOT EXISTS ptl_pay_bscprvd_exhst_l (
  svc_mgmt_no                  VARCHAR(20)    NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  use_svc_ty_cd                VARCHAR(10)    NOT NULL,
  sbsc_prod_no                 VARCHAR(20)    NOT NULL,
  bscprvd_qty                  NUMERIC(18)    NOT NULL,
  bscprvd_cyov_qty             NUMERIC(18)    NOT NULL,
  bscprvd_use_qty              NUMERIC(18)    NOT NULL,
  bscprvd_exhst_stts_ty_cd     VARCHAR(10)    NOT NULL,
  exhst_dtm                    TIMESTAMP     ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-01-01', INTERVAL '1 year')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_bscprvd_exhst_l FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_bscprvd_exhst_l_p' || to_char(d, 'YYYY'), to_char(d, 'YYYYMM'), to_char(d + INTERVAL '1 year', 'YYYYMM'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_bscprvd_exhst_l_pdef PARTITION OF ptl_pay_bscprvd_exhst_l DEFAULT;
COMMENT ON TABLE ptl_pay_bscprvd_exhst_l IS '기본제공소진내역';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.use_svc_ty_cd IS '사용서비스유형코드';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.sbsc_prod_no IS '가입상품번호';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.bscprvd_qty IS '기본제공량';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.bscprvd_cyov_qty IS '기본제공이월량';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.bscprvd_use_qty IS '기본제공사용량';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.bscprvd_exhst_stts_ty_cd IS '기본제공소진상태유형코드';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.exhst_dtm IS '소진일시';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_bscprvd_exhst_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-015 요금계산이력 · 예상 15,000,000행(T3)
CREATE TABLE IF NOT EXISTS ptl_pay_chrg_calc_h (
  chrg_calc_no                 VARCHAR(20)    NOT NULL,
  chrg_calc_hist_seq           NUMERIC(10)    NOT NULL,
  bill_job_no                  VARCHAR(20)    NOT NULL,
  chrg_calc_dtm                TIMESTAMP      NOT NULL,
  re_calc_rsn_ty_cd            VARCHAR(10)   ,
  chrg_calc_stts_ty_cd         VARCHAR(10)    NOT NULL,
  calc_amt                     NUMERIC(15)    NOT NULL,
  bfr_calc_amt                 NUMERIC(15)   ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_chrg_calc_h IS '요금계산이력';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.chrg_calc_no IS '요금계산번호';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.chrg_calc_hist_seq IS '요금계산이력순번';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.bill_job_no IS '청구작업번호';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.chrg_calc_dtm IS '요금계산일시';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.re_calc_rsn_ty_cd IS '재계산사유유형코드';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.chrg_calc_stts_ty_cd IS '요금계산상태유형코드';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.calc_amt IS '계산금액';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.bfr_calc_amt IS '이전계산금액';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_chrg_calc_h.lst_rgtr_id IS '최종등록자ID';

-- PAY-016 일할요금상세 · 예상 8,000,000행(T2)
CREATE TABLE IF NOT EXISTS ptl_pay_dyprt_chrg_d (
  chrg_calc_no                 VARCHAR(20)    NOT NULL,
  dyprt_chrg_dtl_seq           NUMERIC(5)     NOT NULL,
  dyprt_rsn_ty_cd              VARCHAR(10)    NOT NULL,
  aplcn_bgng_dt                CHAR(8)        NOT NULL,
  aplcn_end_dt                 CHAR(8)        NOT NULL,
  dyprt_dcnt                   NUMERIC(3)     NOT NULL,
  mm_dcnt                      NUMERIC(3)     NOT NULL,
  mm_fxamt_amt                 NUMERIC(15)    NOT NULL,
  dyprt_amt                    NUMERIC(15)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_dyprt_chrg_d IS '일할요금상세';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.chrg_calc_no IS '요금계산번호';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.dyprt_chrg_dtl_seq IS '일할요금상세순번';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.dyprt_rsn_ty_cd IS '일할사유유형코드';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.dyprt_dcnt IS '일할일수';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.mm_dcnt IS '월일수';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.mm_fxamt_amt IS '월정액금액';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.dyprt_amt IS '일할금액';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_dyprt_chrg_d.lst_rgtr_id IS '최종등록자ID';

-- PAY-017 할인적용내역 · 예상 30,000,000행(T3) · 연 RANGE DSCNT_APLCN_DTM
CREATE TABLE IF NOT EXISTS ptl_pay_dscnt_aplcn_l (
  dscnt_aplcn_no               VARCHAR(20)    NOT NULL,
  dscnt_aplcn_dtm              TIMESTAMP      NOT NULL,
  chrg_calc_no                 VARCHAR(20)    NOT NULL,
  prod_cd                      VARCHAR(20)    NOT NULL,
  sbsc_prod_no                 VARCHAR(20)   ,
  dscnt_aplcn_stts_ty_cd       VARCHAR(10)    NOT NULL,
  dscnt_trgt_amt               NUMERIC(15)    NOT NULL,
  dscnt_rt                     NUMERIC(5,2)  ,
  dscnt_amt                    NUMERIC(15)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (dscnt_aplcn_dtm);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-01-01', INTERVAL '1 year')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_dscnt_aplcn_l FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_dscnt_aplcn_l_p' || to_char(d, 'YYYY'), to_char(d, 'YYYY-MM-DD'), to_char(d + INTERVAL '1 year', 'YYYY-MM-DD'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_dscnt_aplcn_l_pdef PARTITION OF ptl_pay_dscnt_aplcn_l DEFAULT;
COMMENT ON TABLE ptl_pay_dscnt_aplcn_l IS '할인적용내역';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.dscnt_aplcn_no IS '할인적용번호';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.dscnt_aplcn_dtm IS '할인적용일시';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.chrg_calc_no IS '요금계산번호';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.prod_cd IS '상품코드';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.sbsc_prod_no IS '가입상품번호';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.dscnt_aplcn_stts_ty_cd IS '할인적용상태유형코드';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.dscnt_trgt_amt IS '할인대상금액';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.dscnt_rt IS '할인율';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.dscnt_amt IS '할인금액';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_dscnt_aplcn_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-018 결합할인배분내역 · 예상 10,000,000행(T3)
CREATE TABLE IF NOT EXISTS ptl_pay_cmbn_dscnt_allc_l (
  cmbn_dscnt_allc_no           VARCHAR(20)    NOT NULL,
  cmbn_ctrt_no                 VARCHAR(20)    NOT NULL,
  svc_mgmt_no                  VARCHAR(20)    NOT NULL,
  chrg_calc_no                 VARCHAR(20)   ,
  bill_ym                      CHAR(6)        NOT NULL,
  cmbn_dscnt_allc_dtm          TIMESTAMP      NOT NULL,
  cmbn_dscnt_allc_stts_ty_cd   VARCHAR(10)    NOT NULL,
  allc_std_ty_cd               VARCHAR(10)    NOT NULL,
  allc_rt                      NUMERIC(5,2)   NOT NULL,
  allc_amt                     NUMERIC(15)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_cmbn_dscnt_allc_l IS '결합할인배분내역';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.cmbn_dscnt_allc_no IS '결합할인배분번호';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.cmbn_ctrt_no IS '결합계약번호';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.chrg_calc_no IS '요금계산번호';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.cmbn_dscnt_allc_dtm IS '결합할인배분일시';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.cmbn_dscnt_allc_stts_ty_cd IS '결합할인배분상태유형코드';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.allc_std_ty_cd IS '배분기준유형코드';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.allc_rt IS '배분율';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.allc_amt IS '배분금액';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_cmbn_dscnt_allc_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-019 위약금부과내역 · 예상 3,000,000행(T2)
CREATE TABLE IF NOT EXISTS ptl_pay_pnlt_imps_l (
  pnlt_imps_no                 VARCHAR(20)    NOT NULL,
  agrmt_ctrt_no                VARCHAR(20)   ,
  svc_mgmt_no                  VARCHAR(20)    NOT NULL,
  chrg_calc_no                 VARCHAR(20)   ,
  pnlt_ty_cd                   VARCHAR(10)    NOT NULL,
  pnlt_imps_dtm                TIMESTAMP      NOT NULL,
  pnlt_imps_stts_ty_cd         VARCHAR(10)    NOT NULL,
  agrmt_rmnd_dcnt              NUMERIC(5)     NOT NULL,
  rtn_amt                      NUMERIC(15)    NOT NULL,
  imps_amt                     NUMERIC(15)    NOT NULL,
  rdct_amt                     NUMERIC(15)    NOT NULL,
  bill_ym                      CHAR(6)       ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_pnlt_imps_l IS '위약금부과내역';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.pnlt_imps_no IS '위약금부과번호';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.agrmt_ctrt_no IS '약정계약번호';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.chrg_calc_no IS '요금계산번호';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.pnlt_ty_cd IS '위약금유형코드';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.pnlt_imps_dtm IS '위약금부과일시';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.pnlt_imps_stts_ty_cd IS '위약금부과상태유형코드';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.agrmt_rmnd_dcnt IS '약정잔여일수';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.rtn_amt IS '반환금액';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.imps_amt IS '부과금액';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.rdct_amt IS '감면금액';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_pnlt_imps_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-020 단말할부청구상세 · 예상 20,000,000행(T3) · 연 RANGE BILL_YM
CREATE TABLE IF NOT EXISTS ptl_pay_eqp_instl_bill_d (
  eqp_instl_ctrt_no            VARCHAR(20)    NOT NULL,
  instl_tms                    NUMERIC(3)     NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  bill_no                      VARCHAR(20)   ,
  bill_dtl_seq                 NUMERIC(5)    ,
  instl_bill_dtm               TIMESTAMP      NOT NULL,
  instl_bill_stts_ty_cd        VARCHAR(10)    NOT NULL,
  instl_prnc                   NUMERIC(15)    NOT NULL,
  instl_intr_amt               NUMERIC(15)    NOT NULL,
  instl_rmnd_prnc              NUMERIC(15)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-01-01', INTERVAL '1 year')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_eqp_instl_bill_d FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_eqp_instl_bill_d_p' || to_char(d, 'YYYY'), to_char(d, 'YYYYMM'), to_char(d + INTERVAL '1 year', 'YYYYMM'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_eqp_instl_bill_d_pdef PARTITION OF ptl_pay_eqp_instl_bill_d DEFAULT;
COMMENT ON TABLE ptl_pay_eqp_instl_bill_d IS '단말할부청구상세';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.eqp_instl_ctrt_no IS '단말할부계약번호';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.instl_tms IS '할부회차';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.bill_dtl_seq IS '청구상세순번';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.instl_bill_dtm IS '할부청구일시';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.instl_bill_stts_ty_cd IS '할부청구상태유형코드';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.instl_prnc IS '할부원금';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.instl_intr_amt IS '할부이자금액';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.instl_rmnd_prnc IS '할부잔여원금';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_eqp_instl_bill_d.lst_rgtr_id IS '최종등록자ID';

-- PAY-021 로밍사용내역 [STL] · 예상 5,000,000행(T2)
CREATE TABLE IF NOT EXISTS ptl_pay_roam_use_l (
  roam_use_no                  VARCHAR(20)    NOT NULL,
  roam_bzmn_no                 VARCHAR(20)    NOT NULL,
  svc_mgmt_no                  VARCHAR(20)    NOT NULL,
  use_no                       VARCHAR(20)   ,
  tap_file_nm                  VARCHAR(200)   NOT NULL,
  tap_rcptn_dtm                TIMESTAMP      NOT NULL,
  use_bgng_dtm                 TIMESTAMP      NOT NULL,
  roam_use_stts_ty_cd          VARCHAR(10)    NOT NULL,
  roam_drct_se_cd              VARCHAR(10)    NOT NULL,
  use_svc_ty_cd                VARCHAR(10)    NOT NULL,
  use_qty                      NUMERIC(18)    NOT NULL,
  use_unit_ty_cd               VARCHAR(10)    NOT NULL,
  stlm_crncy_cd                VARCHAR(10)    NOT NULL,
  stlm_crncy_amt               NUMERIC(18,4)  NOT NULL,
  aplcn_exrt                   NUMERIC(15,4)  NOT NULL,
  use_amt                      NUMERIC(15)    NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_roam_use_l IS '로밍사용내역';
COMMENT ON COLUMN ptl_pay_roam_use_l.roam_use_no IS '로밍사용번호';
COMMENT ON COLUMN ptl_pay_roam_use_l.roam_bzmn_no IS '로밍사업자번호';
COMMENT ON COLUMN ptl_pay_roam_use_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_pay_roam_use_l.use_no IS '사용번호';
COMMENT ON COLUMN ptl_pay_roam_use_l.tap_file_nm IS 'TAP파일명';
COMMENT ON COLUMN ptl_pay_roam_use_l.tap_rcptn_dtm IS 'TAP수신일시';
COMMENT ON COLUMN ptl_pay_roam_use_l.use_bgng_dtm IS '사용시작일시';
COMMENT ON COLUMN ptl_pay_roam_use_l.roam_use_stts_ty_cd IS '로밍사용상태유형코드';
COMMENT ON COLUMN ptl_pay_roam_use_l.roam_drct_se_cd IS '로밍방향구분코드';
COMMENT ON COLUMN ptl_pay_roam_use_l.use_svc_ty_cd IS '사용서비스유형코드';
COMMENT ON COLUMN ptl_pay_roam_use_l.use_qty IS '사용량';
COMMENT ON COLUMN ptl_pay_roam_use_l.use_unit_ty_cd IS '사용단위유형코드';
COMMENT ON COLUMN ptl_pay_roam_use_l.stlm_crncy_cd IS '정산통화코드';
COMMENT ON COLUMN ptl_pay_roam_use_l.stlm_crncy_amt IS '정산통화금액';
COMMENT ON COLUMN ptl_pay_roam_use_l.aplcn_exrt IS '적용환율';
COMMENT ON COLUMN ptl_pay_roam_use_l.use_amt IS '사용금액';
COMMENT ON COLUMN ptl_pay_roam_use_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_roam_use_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_roam_use_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_roam_use_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_roam_use_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-022 소액결제청구상세 [STL] · 예상 10,000,000행(T3)
CREATE TABLE IF NOT EXISTS ptl_pay_mcpay_bill_d (
  mcpay_no                     VARCHAR(20)    NOT NULL,
  cnts_prvd_co_no              VARCHAR(20)    NOT NULL,
  svc_mgmt_no                  VARCHAR(20)    NOT NULL,
  bill_no                      VARCHAR(20)   ,
  bill_dtl_seq                 NUMERIC(5)    ,
  pymt_prod_nm                 VARCHAR(200)   NOT NULL,
  pymt_dtm                     TIMESTAMP      NOT NULL,
  mcpay_stts_ty_cd             VARCHAR(10)    NOT NULL,
  pymt_amt                     NUMERIC(15)    NOT NULL,
  pymt_cncl_dtm                TIMESTAMP     ,
  bill_ym                      CHAR(6)        NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_mcpay_bill_d IS '소액결제청구상세';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.mcpay_no IS '소액결제번호';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.cnts_prvd_co_no IS '콘텐츠제공사번호';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.bill_dtl_seq IS '청구상세순번';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.pymt_prod_nm IS '결제상품명';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.pymt_dtm IS '결제일시';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.mcpay_stts_ty_cd IS '소액결제상태유형코드';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.pymt_amt IS '결제금액';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.pymt_cncl_dtm IS '결제취소일시';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_mcpay_bill_d.lst_rgtr_id IS '최종등록자ID';

-- PAY-023 콘텐츠이용요금내역 [STL] · 예상 10,000,000행(T3)
CREATE TABLE IF NOT EXISTS ptl_pay_cnts_utlz_chrg_l (
  cnts_utlz_no                 VARCHAR(20)    NOT NULL,
  cnts_prvd_co_no              VARCHAR(20)    NOT NULL,
  svc_mgmt_no                  VARCHAR(20)    NOT NULL,
  use_no                       VARCHAR(20)   ,
  bill_no                      VARCHAR(20)   ,
  bill_dtl_seq                 NUMERIC(5)    ,
  cnts_nm                      VARCHAR(200)   NOT NULL,
  cnts_utlz_dtm                TIMESTAMP      NOT NULL,
  cnts_utlz_stts_ty_cd         VARCHAR(10)    NOT NULL,
  cnts_ty_cd                   VARCHAR(10)    NOT NULL,
  cnts_utlz_amt                NUMERIC(15)    NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_cnts_utlz_chrg_l IS '콘텐츠이용요금내역';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.cnts_utlz_no IS '콘텐츠이용번호';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.cnts_prvd_co_no IS '콘텐츠제공사번호';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.svc_mgmt_no IS '서비스관리번호';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.use_no IS '사용번호';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.bill_dtl_seq IS '청구상세순번';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.cnts_nm IS '콘텐츠명';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.cnts_utlz_dtm IS '콘텐츠이용일시';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.cnts_utlz_stts_ty_cd IS '콘텐츠이용상태유형코드';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.cnts_ty_cd IS '콘텐츠유형코드';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.cnts_utlz_amt IS '콘텐츠이용금액';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_cnts_utlz_chrg_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-024 청구조정사유코드 · 예상 200행(T1)
CREATE TABLE IF NOT EXISTS ptl_pay_bill_adj_rsn_c (
  bill_adj_rsn_ty_cd           VARCHAR(10)    NOT NULL,
  bill_adj_rsn_nm              VARCHAR(100)   NOT NULL,
  bill_adj_rsn_reg_dtm         TIMESTAMP      NOT NULL,
  bill_adj_rsn_stts_ty_cd      VARCHAR(10)    NOT NULL,
  bill_adj_ty_cd               VARCHAR(10)    NOT NULL,
  adj_aprv_need_yn             CHAR(1)        NOT NULL,
  adj_lmt_amt                  NUMERIC(15)   ,
  aplcn_bgng_dt                CHAR(8)        NOT NULL,
  aplcn_end_dt                 CHAR(8)       ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_bill_adj_rsn_c IS '청구조정사유코드';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.bill_adj_rsn_ty_cd IS '청구조정사유유형코드';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.bill_adj_rsn_nm IS '청구조정사유명';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.bill_adj_rsn_reg_dtm IS '청구조정사유등록일시';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.bill_adj_rsn_stts_ty_cd IS '청구조정사유상태유형코드';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.bill_adj_ty_cd IS '청구조정유형코드';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.adj_aprv_need_yn IS '조정승인필요여부';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.adj_lmt_amt IS '조정한도금액';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.aplcn_bgng_dt IS '적용시작일자';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.aplcn_end_dt IS '적용종료일자';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_bill_adj_rsn_c.lst_rgtr_id IS '최종등록자ID';

-- PAY-025 청구마감이력 · 예상 15,000행(T1)
CREATE TABLE IF NOT EXISTS ptl_pay_bill_ddln_h (
  bill_job_no                  VARCHAR(20)    NOT NULL,
  bill_ddln_hist_seq           NUMERIC(5)     NOT NULL,
  bill_ddln_ty_cd              VARCHAR(10)    NOT NULL,
  bill_ddln_dtm                TIMESTAMP      NOT NULL,
  bill_ddln_stts_ty_cd         VARCHAR(10)    NOT NULL,
  ddln_rsn_cn                  VARCHAR(200)  ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_bill_ddln_h IS '청구마감이력';
COMMENT ON COLUMN ptl_pay_bill_ddln_h.bill_job_no IS '청구작업번호';
COMMENT ON COLUMN ptl_pay_bill_ddln_h.bill_ddln_hist_seq IS '청구마감이력순번';
COMMENT ON COLUMN ptl_pay_bill_ddln_h.bill_ddln_ty_cd IS '청구마감유형코드';
COMMENT ON COLUMN ptl_pay_bill_ddln_h.bill_ddln_dtm IS '청구마감일시';
COMMENT ON COLUMN ptl_pay_bill_ddln_h.bill_ddln_stts_ty_cd IS '청구마감상태유형코드';
COMMENT ON COLUMN ptl_pay_bill_ddln_h.ddln_rsn_cn IS '마감사유내용';
COMMENT ON COLUMN ptl_pay_bill_ddln_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_bill_ddln_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_bill_ddln_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_bill_ddln_h.lst_rgtr_id IS '최종등록자ID';

-- PAY-026 청구서발행내역 · 예상 28,000,000행(T3) · 연 RANGE INVC_PBLCN_DTM
CREATE TABLE IF NOT EXISTS ptl_pay_invc_pblcn_l (
  invc_pblcn_no                VARCHAR(20)    NOT NULL,
  invc_pblcn_dtm               TIMESTAMP      NOT NULL,
  bill_no                      VARCHAR(20)    NOT NULL,
  invc_pblcn_mdm_ty_cd         VARCHAR(10)    NOT NULL,
  invc_pblcn_stts_ty_cd        VARCHAR(10)    NOT NULL,
  rcptn_addr_encpt_vl          VARCHAR(256)  ,
  sndng_cmptn_dtm              TIMESTAMP     ,
  rtrn_rsn_ty_cd               VARCHAR(10)   ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (invc_pblcn_dtm);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-01-01', INTERVAL '1 year')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_invc_pblcn_l FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_invc_pblcn_l_p' || to_char(d, 'YYYY'), to_char(d, 'YYYY-MM-DD'), to_char(d + INTERVAL '1 year', 'YYYY-MM-DD'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_invc_pblcn_l_pdef PARTITION OF ptl_pay_invc_pblcn_l DEFAULT;
COMMENT ON TABLE ptl_pay_invc_pblcn_l IS '청구서발행내역';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.invc_pblcn_no IS '청구서발행번호';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.invc_pblcn_dtm IS '청구서발행일시';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.invc_pblcn_mdm_ty_cd IS '청구서발행매체유형코드';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.invc_pblcn_stts_ty_cd IS '청구서발행상태유형코드';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.rcptn_addr_encpt_vl IS '수신주소암호화값';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.sndng_cmptn_dtm IS '발송완료일시';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.rtrn_rsn_ty_cd IS '반송사유유형코드';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_invc_pblcn_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-027 청구서재발행내역 · 예상 2,000,000행(T2)
CREATE TABLE IF NOT EXISTS ptl_pay_invc_re_pblcn_l (
  invc_re_pblcn_no             VARCHAR(20)    NOT NULL,
  bill_no                      VARCHAR(20)    NOT NULL,
  invc_pblcn_no                VARCHAR(20)   ,
  re_pblcn_rsn_ty_cd           VARCHAR(10)    NOT NULL,
  re_pblcn_req_dtm             TIMESTAMP      NOT NULL,
  re_pblcn_stts_ty_cd          VARCHAR(10)    NOT NULL,
  invc_pblcn_mdm_ty_cd         VARCHAR(10)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_invc_re_pblcn_l IS '청구서재발행내역';
COMMENT ON COLUMN ptl_pay_invc_re_pblcn_l.invc_re_pblcn_no IS '청구서재발행번호';
COMMENT ON COLUMN ptl_pay_invc_re_pblcn_l.bill_no IS '청구번호';
COMMENT ON COLUMN ptl_pay_invc_re_pblcn_l.invc_pblcn_no IS '청구서발행번호';
COMMENT ON COLUMN ptl_pay_invc_re_pblcn_l.re_pblcn_rsn_ty_cd IS '재발행사유유형코드';
COMMENT ON COLUMN ptl_pay_invc_re_pblcn_l.re_pblcn_req_dtm IS '재발행요청일시';
COMMENT ON COLUMN ptl_pay_invc_re_pblcn_l.re_pblcn_stts_ty_cd IS '재발행상태유형코드';
COMMENT ON COLUMN ptl_pay_invc_re_pblcn_l.invc_pblcn_mdm_ty_cd IS '청구서발행매체유형코드';
COMMENT ON COLUMN ptl_pay_invc_re_pblcn_l.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_invc_re_pblcn_l.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_invc_re_pblcn_l.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_invc_re_pblcn_l.lst_rgtr_id IS '최종등록자ID';

-- PAY-028 청구계정월집계 · 예상 25,000,000행(T3) · 연 RANGE BILL_YM
CREATE TABLE IF NOT EXISTS ptl_pay_bill_acnt_mm_t (
  bill_acnt_no                 VARCHAR(20)    NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  agg_dtm                      TIMESTAMP      NOT NULL,
  agg_stts_ty_cd               VARCHAR(10)    NOT NULL,
  bill_nocs                    NUMERIC(10)    NOT NULL,
  line_cnt                     NUMERIC(10)    NOT NULL,
  thmm_bill_amt                NUMERIC(15)    NOT NULL,
  dscnt_amt                    NUMERIC(15)    NOT NULL,
  adj_amt                      NUMERIC(15)    NOT NULL,
  vat_amt                      NUMERIC(15)    NOT NULL,
  unpd_cyov_amt                NUMERIC(15)    NOT NULL,
  tot_bill_amt                 NUMERIC(15)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
) PARTITION BY RANGE (bill_ym);
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(DATE '2010-01-01', DATE '2027-01-01', INTERVAL '1 year')::date LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ptl_pay_bill_acnt_mm_t FOR VALUES FROM (%L) TO (%L)',
      'ptl_pay_bill_acnt_mm_t_p' || to_char(d, 'YYYY'), to_char(d, 'YYYYMM'), to_char(d + INTERVAL '1 year', 'YYYYMM'));
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS ptl_pay_bill_acnt_mm_t_pdef PARTITION OF ptl_pay_bill_acnt_mm_t DEFAULT;
COMMENT ON TABLE ptl_pay_bill_acnt_mm_t IS '청구계정월집계';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.bill_acnt_no IS '청구계정번호';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.agg_dtm IS '집계일시';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.agg_stts_ty_cd IS '집계상태유형코드';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.bill_nocs IS '청구건수';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.line_cnt IS '회선수';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.thmm_bill_amt IS '당월청구금액';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.dscnt_amt IS '할인금액';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.adj_amt IS '조정금액';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.vat_amt IS '부가가치세금액';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.unpd_cyov_amt IS '미납이월금액';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.tot_bill_amt IS '총청구금액';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_bill_acnt_mm_t.lst_rgtr_id IS '최종등록자ID';

-- PAY-029 요금항목월통계 · 예상 100,000행(T1)
CREATE TABLE IF NOT EXISTS ptl_pay_chrg_itm_mm_s (
  chrg_itm_cd                  VARCHAR(10)    NOT NULL,
  bill_ym                      CHAR(6)        NOT NULL,
  agg_dtm                      TIMESTAMP      NOT NULL,
  bill_nocs                    NUMERIC(10)    NOT NULL,
  line_cnt                     NUMERIC(10)    NOT NULL,
  bill_amt                     NUMERIC(15)    NOT NULL,
  splyamt                      NUMERIC(15)    NOT NULL,
  vat_amt                      NUMERIC(15)    NOT NULL,
  adj_amt                      NUMERIC(15)    NOT NULL,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_chrg_itm_mm_s IS '요금항목월통계';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.chrg_itm_cd IS '요금항목코드';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.bill_ym IS '청구년월';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.agg_dtm IS '집계일시';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.bill_nocs IS '청구건수';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.line_cnt IS '회선수';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.bill_amt IS '청구금액';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.splyamt IS '공급가액';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.vat_amt IS '부가가치세금액';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.adj_amt IS '조정금액';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_chrg_itm_mm_s.lst_rgtr_id IS '최종등록자ID';

-- PAY-030 청구작업단계이력 · 예상 50,000행(T1)
CREATE TABLE IF NOT EXISTS ptl_pay_bill_job_step_h (
  bill_job_no                  VARCHAR(20)    NOT NULL,
  bill_job_step_seq            NUMERIC(5)     NOT NULL,
  bill_job_step_ty_cd          VARCHAR(10)    NOT NULL,
  step_bgng_dtm                TIMESTAMP      NOT NULL,
  step_end_dtm                 TIMESTAMP     ,
  bill_job_step_stts_ty_cd     VARCHAR(10)    NOT NULL,
  prcs_nocs                    NUMERIC(10)    NOT NULL,
  err_nocs                     NUMERIC(10)    NOT NULL,
  err_cn                       VARCHAR(4000) ,
  lst_mddtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_mdfr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM',
  lst_rgdtm                    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lst_rgtr_id                  VARCHAR(50)    NOT NULL DEFAULT 'SYSTEM'
);
COMMENT ON TABLE ptl_pay_bill_job_step_h IS '청구작업단계이력';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.bill_job_no IS '청구작업번호';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.bill_job_step_seq IS '청구작업단계순번';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.bill_job_step_ty_cd IS '청구작업단계유형코드';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.step_bgng_dtm IS '단계시작일시';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.step_end_dtm IS '단계종료일시';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.bill_job_step_stts_ty_cd IS '청구작업단계상태유형코드';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.prcs_nocs IS '처리건수';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.err_nocs IS '오류건수';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.err_cn IS '오류내용';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.lst_mddtm IS '최종수정일시';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.lst_mdfr_id IS '최종수정자ID';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.lst_rgdtm IS '최종등록일시';
COMMENT ON COLUMN ptl_pay_bill_job_step_h.lst_rgtr_id IS '최종등록자ID';
