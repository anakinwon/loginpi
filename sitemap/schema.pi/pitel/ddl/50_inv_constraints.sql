-- Pi통신 과금 데이터 표준화 — 수납(INV) PK·인덱스 DDL (PostgreSQL 17)
-- 생성 : subagent_physical_modeler 2026-11-07 · 정본 model/physical/INV.json
-- 실행 : 데이터 적재 뒤(D14) psql -v ON_ERROR_STOP=1 -f 50_inv_constraints.sql → ANALYZE
-- 재실행 안전 : 유일 인덱스·인덱스 IF NOT EXISTS, PK 는 제약 존재 검사 후 추가
-- 일반 테이블 = 유일 인덱스 pk_<테이블> → PRIMARY KEY USING INDEX / 파티션 테이블 = ADD CONSTRAINT PRIMARY KEY (파티션 키 포함)

-- INV-001 수납기본
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rcv_m'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rcv_m ADD CONSTRAINT pk_ptl_inv_rcv_m PRIMARY KEY (rcv_no, rcv_dt);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_m_01 ON ptl_inv_rcv_m (bill_acnt_no, rcv_dt); -- 청구계정별 수납 이력(상담·미납 판단) — 조인 FK + 기간 조건
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_m_02 ON ptl_inv_rcv_m (rcv_dt, rcv_chnl_ty_cd); -- 수납일자·채널 일마감·수납일집계 생성 — 파티션 안 일자 범위
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_m_03 ON ptl_inv_rcv_m (pay_mthd_no) WHERE pay_mthd_no IS NOT NULL; -- 납부방법 → 수납 조인(자동이체·카드 수납 추적), NULL 30%(S5)
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_m_04 ON ptl_inv_rcv_m (rcv_agt_inst_no, rcv_dt) WHERE rcv_agt_inst_no IS NOT NULL; -- 대행기관 수납 대사(STL) — 기관·일자별 건수·금액 집계
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_m_05 ON ptl_inv_rcv_m (bill_acnt_no) WHERE rcv_stts_ty_cd IN ('01','03'); -- 배분 배치 대상(배분대기·일부배분)만 — 상태 98% 배분완료(S3)라 상태 단독 인덱스 대신 부분 인덱스
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_m_06 ON ptl_inv_rcv_m (aprv_no) WHERE aprv_no IS NOT NULL; -- 카드·간편결제 승인번호로 수납 역조회(고객 문의·카드사 대사)

-- INV-002 수납배분상세
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rcv_allc_d'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rcv_allc_d ADD CONSTRAINT pk_ptl_inv_rcv_allc_d PRIMARY KEY (rcv_allc_no, bill_ym);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_allc_d_01 ON ptl_inv_rcv_allc_d (bill_no, chrg_itm_cd); -- 청구서·요금항목별 수납액 합계 — 미납 확정(COL 미납상세 항목 단위)의 핵심 경로, 청구년월로 파티션 프루닝
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_allc_d_02 ON ptl_inv_rcv_allc_d (rcv_no); -- 수납 → 배분 조인(수납취소 역배분·수납 상세) — 파티션 키 없는 조회라 전 파티션 로컬 인덱스 탐색
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_allc_d_03 ON ptl_inv_rcv_allc_d (bill_acnt_no, bill_ym); -- 청구계정+청구년월 수납 조회(반정규화 칼럼)
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_allc_d_04 ON ptl_inv_rcv_allc_d (prpay_no) WHERE prpay_no IS NOT NULL; -- 선납 차감 배분 추적

-- INV-003 납부방법기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_pay_mthd_m ON ptl_inv_pay_mthd_m (pay_mthd_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_pay_mthd_m'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_pay_mthd_m ADD CONSTRAINT pk_ptl_inv_pay_mthd_m PRIMARY KEY USING INDEX pk_ptl_inv_pay_mthd_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_pay_mthd_m_01 ON ptl_inv_pay_mthd_m (bill_acnt_no, aplcn_end_dt); -- 청구계정의 현재 납부방법(적용종료일자 99991231) 조회 — 청구·출금 배치 조인
CREATE INDEX IF NOT EXISTS x_ptl_inv_pay_mthd_m_02 ON ptl_inv_pay_mthd_m (pyr_no); -- 납부자 → 납부방법 조인(CUS 납부자 상담)

-- INV-004 자동이체신청내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_atrf_aply_l ON ptl_inv_atrf_aply_l (atrf_aply_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_atrf_aply_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_atrf_aply_l ADD CONSTRAINT pk_ptl_inv_atrf_aply_l PRIMARY KEY USING INDEX pk_ptl_inv_atrf_aply_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_atrf_aply_l_01 ON ptl_inv_atrf_aply_l (pay_mthd_no); -- 납부방법 → 자동이체 신청 조인
CREATE INDEX IF NOT EXISTS x_ptl_inv_atrf_aply_l_02 ON ptl_inv_atrf_aply_l (bill_acnt_no, atrf_aply_dtm); -- 청구계정별 자동이체 신청 이력
CREATE INDEX IF NOT EXISTS x_ptl_inv_atrf_aply_l_03 ON ptl_inv_atrf_aply_l (atrf_aply_dtm) WHERE prcs_rslt_ty_cd IS NULL; -- 금결원 CMS 신청 결과 미처리 건 배치

-- INV-005 자동이체출금요청내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_atrf_wdrw_req_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_atrf_wdrw_req_l ADD CONSTRAINT pk_ptl_inv_atrf_wdrw_req_l PRIMARY KEY (wdrw_req_no, bill_ym);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_atrf_wdrw_req_l_01 ON ptl_inv_atrf_wdrw_req_l (bill_no); -- 청구서 → 출금요청 조인(수납 반영·미납 판단)
CREATE INDEX IF NOT EXISTS x_ptl_inv_atrf_wdrw_req_l_02 ON ptl_inv_atrf_wdrw_req_l (bill_acnt_no, bill_ym); -- 청구계정+청구년월 출금 이력(상담)
CREATE INDEX IF NOT EXISTS x_ptl_inv_atrf_wdrw_req_l_03 ON ptl_inv_atrf_wdrw_req_l (wdrw_schd_dt, bank_cd); -- 출금예정일자·은행별 출금 요청 파일 생성 배치
CREATE INDEX IF NOT EXISTS x_ptl_inv_atrf_wdrw_req_l_04 ON ptl_inv_atrf_wdrw_req_l (rcv_no) WHERE rcv_no IS NOT NULL; -- 수납 → 출금요청 역추적(수납취소·재출금)
CREATE INDEX IF NOT EXISTS x_ptl_inv_atrf_wdrw_req_l_05 ON ptl_inv_atrf_wdrw_req_l (pay_mthd_no, bill_ym); -- 납부방법 → 출금요청 조인(자동이체 해지·변경 시 진행 중 출금 확인, 납부방법별 월 출금 이력) — 리뷰 추가(05 물리 INV 관문 R1)

-- INV-006 가상계좌기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_vacct_m ON ptl_inv_vacct_m (vacct_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_vacct_m'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_vacct_m ADD CONSTRAINT pk_ptl_inv_vacct_m PRIMARY KEY USING INDEX pk_ptl_inv_vacct_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_vacct_m_01 ON ptl_inv_vacct_m (acct_no, bank_cd); -- 은행 입금 통지(계좌번호) → 가상계좌 매칭 — 회수 후 재사용 번호(S8)라 유일 아님
CREATE INDEX IF NOT EXISTS x_ptl_inv_vacct_m_02 ON ptl_inv_vacct_m (bill_acnt_no); -- 청구계정의 가상계좌 조회

-- INV-007 과오납기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_ovpay_m ON ptl_inv_ovpay_m (ovpay_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_ovpay_m'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_ovpay_m ADD CONSTRAINT pk_ptl_inv_ovpay_m PRIMARY KEY USING INDEX pk_ptl_inv_ovpay_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_ovpay_m_01 ON ptl_inv_ovpay_m (bill_acnt_no); -- 청구계정별 과오납 조회·다음 달 대체
CREATE INDEX IF NOT EXISTS x_ptl_inv_ovpay_m_02 ON ptl_inv_ovpay_m (ovpay_ocrn_dtm) WHERE ovpay_bal > 0; -- 잔액 남은 과오납(환불·대체·소멸시효 배치)만
CREATE INDEX IF NOT EXISTS x_ptl_inv_ovpay_m_03 ON ptl_inv_ovpay_m (rcv_no) WHERE rcv_no IS NOT NULL; -- 수납 → 과오납 조인

-- INV-008 환불내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_rfnd_l ON ptl_inv_rfnd_l (rfnd_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rfnd_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rfnd_l ADD CONSTRAINT pk_ptl_inv_rfnd_l PRIMARY KEY USING INDEX pk_ptl_inv_rfnd_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_rfnd_l_01 ON ptl_inv_rfnd_l (bill_acnt_no, rfnd_dtm); -- 청구계정별 환불 이력
CREATE INDEX IF NOT EXISTS x_ptl_inv_rfnd_l_02 ON ptl_inv_rfnd_l (ovpay_no) WHERE ovpay_no IS NOT NULL; -- 과오납 → 환불 조인
CREATE INDEX IF NOT EXISTS x_ptl_inv_rfnd_l_03 ON ptl_inv_rfnd_l (prpay_no) WHERE prpay_no IS NOT NULL; -- 선납 → 환불 조인

-- INV-009 선납기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_prpay_m ON ptl_inv_prpay_m (prpay_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_prpay_m'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_prpay_m ADD CONSTRAINT pk_ptl_inv_prpay_m PRIMARY KEY USING INDEX pk_ptl_inv_prpay_m;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_prpay_m_01 ON ptl_inv_prpay_m (bill_acnt_no); -- 청구계정별 선납 조회 — 청구 시 선납 차감 대상 탐색
CREATE INDEX IF NOT EXISTS x_ptl_inv_prpay_m_02 ON ptl_inv_prpay_m (rcv_no) WHERE rcv_no IS NOT NULL; -- 수납 → 선납 조인
CREATE INDEX IF NOT EXISTS x_ptl_inv_prpay_m_03 ON ptl_inv_prpay_m (ovpay_no) WHERE ovpay_no IS NOT NULL; -- 과오납 → 선납 전환 조인

-- INV-010 은행코드
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_bank_c ON ptl_inv_bank_c (bank_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_bank_c'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_bank_c ADD CONSTRAINT pk_ptl_inv_bank_c PRIMARY KEY USING INDEX pk_ptl_inv_bank_c;
  END IF;
END $$;

-- INV-011 카드사코드
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_card_co_c ON ptl_inv_card_co_c (card_co_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_card_co_c'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_card_co_c ADD CONSTRAINT pk_ptl_inv_card_co_c PRIMARY KEY USING INDEX pk_ptl_inv_card_co_c;
  END IF;
END $$;

-- INV-012 납부방법이력
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_pay_mthd_h'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_pay_mthd_h ADD CONSTRAINT pk_ptl_inv_pay_mthd_h PRIMARY KEY (pay_mthd_no, vld_bgng_dtm);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_pay_mthd_h_01 ON ptl_inv_pay_mthd_h (pay_mthd_no, vld_end_dtm); -- 납부방법의 현재 이력(유효종료일시 9999-12-31) — 파티션 키 없는 조회 보조

-- INV-013 자동이체출금결과내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_atrf_wdrw_rslt_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_atrf_wdrw_rslt_l ADD CONSTRAINT pk_ptl_inv_atrf_wdrw_rslt_l PRIMARY KEY (wdrw_req_no, wdrw_rslt_seq, bill_ym);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_atrf_wdrw_rslt_l_01 ON ptl_inv_atrf_wdrw_rslt_l (wdrw_rslt_dtm) WHERE re_wdrw_trgt_yn = 'Y'; -- 재출금 대상 배치 — 재출금대상여부 Y 소수(S3)라 부분 인덱스
CREATE INDEX IF NOT EXISTS x_ptl_inv_atrf_wdrw_rslt_l_02 ON ptl_inv_atrf_wdrw_rslt_l (wdrw_rslt_ty_cd, wdrw_rslt_dtm) WHERE wdrw_rslt_ty_cd <> '01'; -- 출금 실패 사유별 통계·모니터링(정상 제외)

-- INV-014 카드자동납부승인내역
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_card_atmt_pay_aprv_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_card_atmt_pay_aprv_l ADD CONSTRAINT pk_ptl_inv_card_atmt_pay_aprv_l PRIMARY KEY (card_atmt_pay_aprv_no, bill_ym);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_card_atmt_pay_aprv_l_01 ON ptl_inv_card_atmt_pay_aprv_l (bill_no); -- 청구서 → 카드 승인 조인
CREATE INDEX IF NOT EXISTS x_ptl_inv_card_atmt_pay_aprv_l_02 ON ptl_inv_card_atmt_pay_aprv_l (pay_mthd_no, bill_ym); -- 납부방법별 월 승인 이력(재승인·거절 상담)
CREATE INDEX IF NOT EXISTS x_ptl_inv_card_atmt_pay_aprv_l_03 ON ptl_inv_card_atmt_pay_aprv_l (card_co_cd, card_aprv_req_dtm); -- 카드사별 승인·매입 대사 파일
CREATE INDEX IF NOT EXISTS x_ptl_inv_card_atmt_pay_aprv_l_04 ON ptl_inv_card_atmt_pay_aprv_l (aprv_no) WHERE aprv_no IS NOT NULL; -- 카드 승인번호 조회
CREATE INDEX IF NOT EXISTS x_ptl_inv_card_atmt_pay_aprv_l_05 ON ptl_inv_card_atmt_pay_aprv_l (rcv_no) WHERE rcv_no IS NOT NULL; -- 수납 → 카드 승인 역추적(수납취소 시 승인취소) — 형제 내역(출금요청·지로·입금)과 같은 경로, 리뷰 추가(R2)

-- INV-015 지로수납내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_giro_rcv_l ON ptl_inv_giro_rcv_l (giro_rcv_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_giro_rcv_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_giro_rcv_l ADD CONSTRAINT pk_ptl_inv_giro_rcv_l PRIMARY KEY USING INDEX pk_ptl_inv_giro_rcv_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_giro_rcv_l_01 ON ptl_inv_giro_rcv_l (bill_no); -- 청구서 → 지로 수납 조인
CREATE INDEX IF NOT EXISTS x_ptl_inv_giro_rcv_l_02 ON ptl_inv_giro_rcv_l (giro_rcv_dtm); -- 지로 수납 일자별 반영·대사
CREATE INDEX IF NOT EXISTS x_ptl_inv_giro_rcv_l_03 ON ptl_inv_giro_rcv_l (rcv_no) WHERE rcv_no IS NOT NULL; -- 수납 → 지로 원천 역추적

-- INV-016 가상계좌입금내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_vacct_dpst_l ON ptl_inv_vacct_dpst_l (vacct_dpst_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_vacct_dpst_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_vacct_dpst_l ADD CONSTRAINT pk_ptl_inv_vacct_dpst_l PRIMARY KEY USING INDEX pk_ptl_inv_vacct_dpst_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_vacct_dpst_l_01 ON ptl_inv_vacct_dpst_l (vacct_no, dpst_dtm); -- 가상계좌별 입금 이력
CREATE INDEX IF NOT EXISTS x_ptl_inv_vacct_dpst_l_02 ON ptl_inv_vacct_dpst_l (bank_cd, bank_trd_no); -- 은행 거래번호 중복 통지 검사·대사 — 형식 함정(S12) 데이터라 유일 아님
CREATE INDEX IF NOT EXISTS x_ptl_inv_vacct_dpst_l_03 ON ptl_inv_vacct_dpst_l (rcv_no) WHERE rcv_no IS NOT NULL; -- 수납 → 입금 원천 역추적

-- INV-017 수납취소내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_rcv_cncl_l ON ptl_inv_rcv_cncl_l (rcv_cncl_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rcv_cncl_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rcv_cncl_l ADD CONSTRAINT pk_ptl_inv_rcv_cncl_l PRIMARY KEY USING INDEX pk_ptl_inv_rcv_cncl_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_cncl_l_01 ON ptl_inv_rcv_cncl_l (rcv_no); -- 수납 → 취소 조인(역배분)

-- INV-018 미확인입금내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_unidntf_dpst_l ON ptl_inv_unidntf_dpst_l (unidntf_dpst_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_unidntf_dpst_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_unidntf_dpst_l ADD CONSTRAINT pk_ptl_inv_unidntf_dpst_l PRIMARY KEY USING INDEX pk_ptl_inv_unidntf_dpst_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_unidntf_dpst_l_01 ON ptl_inv_unidntf_dpst_l (dpst_dtm) WHERE unidntf_dpst_stts_ty_cd = '01'; -- 미확인 상태 입금만 — 귀속 처리 작업 목록
CREATE INDEX IF NOT EXISTS x_ptl_inv_unidntf_dpst_l_02 ON ptl_inv_unidntf_dpst_l (bank_cd, bank_trd_no); -- 은행 거래번호 조회·중복 통지 검사
CREATE INDEX IF NOT EXISTS x_ptl_inv_unidntf_dpst_l_03 ON ptl_inv_unidntf_dpst_l (rcv_no) WHERE rcv_no IS NOT NULL; -- 수납 → 미확인입금 귀속 원천 역추적 — 형제 내역과 같은 경로, 리뷰 추가(R3)

-- INV-019 과오납이력
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_ovpay_h ON ptl_inv_ovpay_h (ovpay_no, vld_bgng_dtm);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_ovpay_h'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_ovpay_h ADD CONSTRAINT pk_ptl_inv_ovpay_h PRIMARY KEY USING INDEX pk_ptl_inv_ovpay_h;
  END IF;
END $$;

-- INV-020 환불계좌상세
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_rfnd_acct_d ON ptl_inv_rfnd_acct_d (bill_acnt_no, rfnd_acct_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rfnd_acct_d'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rfnd_acct_d ADD CONSTRAINT pk_ptl_inv_rfnd_acct_d PRIMARY KEY USING INDEX pk_ptl_inv_rfnd_acct_d;
  END IF;
END $$;

-- INV-021 선납사용내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_prpay_use_l ON ptl_inv_prpay_use_l (prpay_no, prpay_use_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_prpay_use_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_prpay_use_l ADD CONSTRAINT pk_ptl_inv_prpay_use_l PRIMARY KEY USING INDEX pk_ptl_inv_prpay_use_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_prpay_use_l_01 ON ptl_inv_prpay_use_l (bill_no) WHERE bill_no IS NOT NULL; -- 청구서 → 선납 차감 조인

-- INV-022 수납대행기관기본
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_rcv_agt_inst_m ON ptl_inv_rcv_agt_inst_m (rcv_agt_inst_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rcv_agt_inst_m'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rcv_agt_inst_m ADD CONSTRAINT pk_ptl_inv_rcv_agt_inst_m PRIMARY KEY USING INDEX pk_ptl_inv_rcv_agt_inst_m;
  END IF;
END $$;

-- INV-023 수납채널코드
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_rcv_chnl_c ON ptl_inv_rcv_chnl_c (rcv_chnl_ty_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rcv_chnl_c'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rcv_chnl_c ADD CONSTRAINT pk_ptl_inv_rcv_chnl_c PRIMARY KEY USING INDEX pk_ptl_inv_rcv_chnl_c;
  END IF;
END $$;

-- INV-024 수납배분우선순위코드
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_rcv_allc_prrt_c ON ptl_inv_rcv_allc_prrt_c (rcv_allc_prrt);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rcv_allc_prrt_c'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rcv_allc_prrt_c ADD CONSTRAINT pk_ptl_inv_rcv_allc_prrt_c PRIMARY KEY USING INDEX pk_ptl_inv_rcv_allc_prrt_c;
  END IF;
END $$;

-- INV-025 수납대사내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_rcv_rcncl_l ON ptl_inv_rcv_rcncl_l (rcv_rcncl_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rcv_rcncl_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rcv_rcncl_l ADD CONSTRAINT pk_ptl_inv_rcv_rcncl_l PRIMARY KEY USING INDEX pk_ptl_inv_rcv_rcncl_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_rcncl_l_01 ON ptl_inv_rcv_rcncl_l (rcv_rcncl_std_dt, rcv_agt_inst_no); -- 기준일자·기관별 대사 결과 조회(STL)

-- INV-026 수납대행수수료내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_rcv_agt_fee_l ON ptl_inv_rcv_agt_fee_l (rcv_agt_fee_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rcv_agt_fee_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rcv_agt_fee_l ADD CONSTRAINT pk_ptl_inv_rcv_agt_fee_l PRIMARY KEY USING INDEX pk_ptl_inv_rcv_agt_fee_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_agt_fee_l_01 ON ptl_inv_rcv_agt_fee_l (rcv_agt_inst_no, stlm_ym); -- 기관·정산년월 수수료 조회(STL)

-- INV-027 영수증발행내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_rcipt_pblcn_l ON ptl_inv_rcipt_pblcn_l (rcipt_pblcn_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rcipt_pblcn_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rcipt_pblcn_l ADD CONSTRAINT pk_ptl_inv_rcipt_pblcn_l PRIMARY KEY USING INDEX pk_ptl_inv_rcipt_pblcn_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcipt_pblcn_l_01 ON ptl_inv_rcipt_pblcn_l (rcv_no); -- 수납 → 영수증 조인

-- INV-028 현금영수증발행내역
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_cash_rcipt_pblcn_l ON ptl_inv_cash_rcipt_pblcn_l (cash_rcipt_pblcn_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_cash_rcipt_pblcn_l'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_cash_rcipt_pblcn_l ADD CONSTRAINT pk_ptl_inv_cash_rcipt_pblcn_l PRIMARY KEY USING INDEX pk_ptl_inv_cash_rcipt_pblcn_l;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_cash_rcipt_pblcn_l_01 ON ptl_inv_cash_rcipt_pblcn_l (rcv_no); -- 수납 → 현금영수증 조인
CREATE INDEX IF NOT EXISTS x_ptl_inv_cash_rcipt_pblcn_l_02 ON ptl_inv_cash_rcipt_pblcn_l (cash_rcipt_pblcn_dtm) WHERE nts_trnm_dtm IS NULL; -- 국세청 미전송 건 전송 배치

-- INV-029 수납일집계
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_rcv_dd_t ON ptl_inv_rcv_dd_t (rcv_chnl_ty_cd, rcv_dt, pay_mthd_ty_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rcv_dd_t'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rcv_dd_t ADD CONSTRAINT pk_ptl_inv_rcv_dd_t PRIMARY KEY USING INDEX pk_ptl_inv_rcv_dd_t;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS x_ptl_inv_rcv_dd_t_01 ON ptl_inv_rcv_dd_t (rcv_dt); -- 일자 범위 전 채널 집계 조회 — PK 선두가 채널이라 보조

-- INV-030 수납월통계
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_inv_rcv_mm_s ON ptl_inv_rcv_mm_s (rcv_chnl_ty_cd, rcv_ym, pay_mthd_ty_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ptl_inv_rcv_mm_s'::regclass AND contype = 'p') THEN
    ALTER TABLE ptl_inv_rcv_mm_s ADD CONSTRAINT pk_ptl_inv_rcv_mm_s PRIMARY KEY USING INDEX pk_ptl_inv_rcv_mm_s;
  END IF;
END $$;

