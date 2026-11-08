-- 20_cus_constraints.sql — CUS(고객) PK·인덱스 (적재 뒤 실행, D14) · PostgreSQL 17
-- 생성 : subagent_physical_modeler 2026-11-07 · 원본 model/physical/CUS.json
-- 재실행 안전 : PK 는 존재 확인 DO 블록, 인덱스는 IF NOT EXISTS. FK 는 만들지 않음(D6)
-- 실행 뒤 ANALYZE 는 적재 스크립트가 수행

-- ptl_cus_cust_m (고객기본)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_cust_m ON ptl_cus_cust_m (cust_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_m' AND conrelid = 'ptl_cus_cust_m'::regclass) THEN
    ALTER TABLE ptl_cus_cust_m ADD CONSTRAINT pk_ptl_cus_cust_m PRIMARY KEY USING INDEX pk_ptl_cus_cust_m;
  END IF;
END $$;
-- 상담·매장 화면 고객명 검색(동명이인 다수 S8 — 생년월일·연락처로 2차 확인)
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_m_01 ON ptl_cus_cust_m (cust_nm);

-- ptl_cus_indv_cust_d (개인고객상세)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_indv_cust_d ON ptl_cus_indv_cust_d (cust_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_indv_cust_d' AND conrelid = 'ptl_cus_indv_cust_d'::regclass) THEN
    ALTER TABLE ptl_cus_indv_cust_d ADD CONSTRAINT pk_ptl_cus_indv_cust_d PRIMARY KEY USING INDEX pk_ptl_cus_indv_cust_d;
  END IF;
END $$;
-- 가입 시 명의자 기존 고객 여부·명의도용 점검(암호화 실명번호 동등 조회)
CREATE INDEX IF NOT EXISTS x_ptl_cus_indv_cust_d_01 ON ptl_cus_indv_cust_d (rlnm_idntf_no_encpt_vl);

-- ptl_cus_corp_cust_d (법인고객상세)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_corp_cust_d ON ptl_cus_corp_cust_d (cust_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_corp_cust_d' AND conrelid = 'ptl_cus_corp_cust_d'::regclass) THEN
    ALTER TABLE ptl_cus_corp_cust_d ADD CONSTRAINT pk_ptl_cus_corp_cust_d PRIMARY KEY USING INDEX pk_ptl_cus_corp_cust_d;
  END IF;
END $$;
-- 법인 가입·세금계산서 발행 시 사업자등록번호로 법인 고객 조회
CREATE INDEX IF NOT EXISTS x_ptl_cus_corp_cust_d_01 ON ptl_cus_corp_cust_d (brno);

-- ptl_cus_bill_acnt_m (청구계정기본)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_bill_acnt_m ON ptl_cus_bill_acnt_m (bill_acnt_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_bill_acnt_m' AND conrelid = 'ptl_cus_bill_acnt_m'::regclass) THEN
    ALTER TABLE ptl_cus_bill_acnt_m ADD CONSTRAINT pk_ptl_cus_bill_acnt_m PRIMARY KEY USING INDEX pk_ptl_cus_bill_acnt_m;
  END IF;
END $$;
-- 고객→청구계정 조인(FK), 청구지주소 복합 FK(고객번호+청구지주소순번)의 선두 칼럼 겸용
CREATE INDEX IF NOT EXISTS x_ptl_cus_bill_acnt_m_01 ON ptl_cus_bill_acnt_m (cust_no);
-- 납부자→청구계정 조인(FK) — 자동이체 납부자 기준 청구계정 일괄 조회
CREATE INDEX IF NOT EXISTS x_ptl_cus_bill_acnt_m_02 ON ptl_cus_bill_acnt_m (pyr_no);

-- ptl_cus_pyr_m (납부자기본)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_pyr_m ON ptl_cus_pyr_m (pyr_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_pyr_m' AND conrelid = 'ptl_cus_pyr_m'::regclass) THEN
    ALTER TABLE ptl_cus_pyr_m ADD CONSTRAINT pk_ptl_cus_pyr_m PRIMARY KEY USING INDEX pk_ptl_cus_pyr_m;
  END IF;
END $$;
-- 고객→납부자 조인(FK) — 명의자 본인 납부자 조회
CREATE INDEX IF NOT EXISTS x_ptl_cus_pyr_m_01 ON ptl_cus_pyr_m (cust_no);

-- ptl_cus_cust_cntc_d (고객연락처상세)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_cust_cntc_d ON ptl_cus_cust_cntc_d (cust_no, cntc_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_cntc_d' AND conrelid = 'ptl_cus_cust_cntc_d'::regclass) THEN
    ALTER TABLE ptl_cus_cust_cntc_d ADD CONSTRAINT pk_ptl_cus_cust_cntc_d PRIMARY KEY USING INDEX pk_ptl_cus_cust_cntc_d;
  END IF;
END $$;
-- 연락처(전화번호·이메일)로 고객 역조회 — 고객센터 인입 번호 식별
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_cntc_d_01 ON ptl_cus_cust_cntc_d (cntc_cn);

-- ptl_cus_cust_addr_d (고객주소상세)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_cust_addr_d ON ptl_cus_cust_addr_d (cust_no, addr_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_addr_d' AND conrelid = 'ptl_cus_cust_addr_d'::regclass) THEN
    ALTER TABLE ptl_cus_cust_addr_d ADD CONSTRAINT pk_ptl_cus_cust_addr_d PRIMARY KEY USING INDEX pk_ptl_cus_cust_addr_d;
  END IF;
END $$;

-- ptl_cus_cust_agre_l (고객동의내역)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_cust_agre_l ON ptl_cus_cust_agre_l (cust_agre_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_agre_l' AND conrelid = 'ptl_cus_cust_agre_l'::regclass) THEN
    ALTER TABLE ptl_cus_cust_agre_l ADD CONSTRAINT pk_ptl_cus_cust_agre_l PRIMARY KEY USING INDEX pk_ptl_cus_cust_agre_l;
  END IF;
END $$;
-- 고객별 동의 현황(마케팅·제3자 제공) 조회 — 발송 대상 판정 시 고객번호+항목 동등 조회(FK)
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_agre_l_01 ON ptl_cus_cust_agre_l (cust_no, agre_itm_ty_cd);

-- ptl_cus_cust_grd_h (고객등급이력)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_grd_h' AND conrelid = 'ptl_cus_cust_grd_h'::regclass) THEN
    ALTER TABLE ptl_cus_cust_grd_h ADD CONSTRAINT pk_ptl_cus_cust_grd_h PRIMARY KEY (cust_no, grd_aplcn_bgng_dtm);
  END IF;
END $$;

-- ptl_cus_rgn_c (지역코드)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_rgn_c ON ptl_cus_rgn_c (rgn_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_rgn_c' AND conrelid = 'ptl_cus_rgn_c'::regclass) THEN
    ALTER TABLE ptl_cus_rgn_c ADD CONSTRAINT pk_ptl_cus_rgn_c PRIMARY KEY USING INDEX pk_ptl_cus_rgn_c;
  END IF;
END $$;
-- 상위지역코드 계층 전개(시도→시군구→읍면동) 재귀 조회(자기 참조 FK)
CREATE INDEX IF NOT EXISTS x_ptl_cus_rgn_c_01 ON ptl_cus_rgn_c (up_rgn_cd);

-- ptl_cus_cust_h (고객이력)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_h' AND conrelid = 'ptl_cus_cust_h'::regclass) THEN
    ALTER TABLE ptl_cus_cust_h ADD CONSTRAINT pk_ptl_cus_cust_h PRIMARY KEY (cust_no, vld_bgng_dtm);
  END IF;
END $$;

-- ptl_cus_rlnm_crtf_l (실명인증내역)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_rlnm_crtf_l ON ptl_cus_rlnm_crtf_l (rlnm_crtf_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_rlnm_crtf_l' AND conrelid = 'ptl_cus_rlnm_crtf_l'::regclass) THEN
    ALTER TABLE ptl_cus_rlnm_crtf_l ADD CONSTRAINT pk_ptl_cus_rlnm_crtf_l PRIMARY KEY USING INDEX pk_ptl_cus_rlnm_crtf_l;
  END IF;
END $$;
-- 고객별 실명인증 이력 최신순 조회(FK)
CREATE INDEX IF NOT EXISTS x_ptl_cus_rlnm_crtf_l_01 ON ptl_cus_rlnm_crtf_l (cust_no, rlnm_crtf_dtm);
-- 가입신청서→실명인증 결과 조인(ORD FK) — 개통 전 인증 확인
CREATE INDEX IF NOT EXISTS x_ptl_cus_rlnm_crtf_l_02 ON ptl_cus_rlnm_crtf_l (sbsc_aply_no);
-- 대리점별 기간 인증 실적·명의도용 의심 점검(PRM FK + 기간 범위)
CREATE INDEX IF NOT EXISTS x_ptl_cus_rlnm_crtf_l_03 ON ptl_cus_rlnm_crtf_l (prtnr_no, rlnm_crtf_dtm);

-- ptl_cus_lglrp_d (법정대리인상세)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_lglrp_d ON ptl_cus_lglrp_d (cust_no, lglrp_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_lglrp_d' AND conrelid = 'ptl_cus_lglrp_d'::regclass) THEN
    ALTER TABLE ptl_cus_lglrp_d ADD CONSTRAINT pk_ptl_cus_lglrp_d PRIMARY KEY USING INDEX pk_ptl_cus_lglrp_d;
  END IF;
END $$;
-- 법정대리인 고객 쪽에서 피대리 미성년 고객 역조회(역할명 FK)
CREATE INDEX IF NOT EXISTS x_ptl_cus_lglrp_d_01 ON ptl_cus_lglrp_d (lglrp_cust_no);

-- ptl_cus_corp_pic_d (법인담당자상세)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_corp_pic_d ON ptl_cus_corp_pic_d (cust_no, pic_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_corp_pic_d' AND conrelid = 'ptl_cus_corp_pic_d'::regclass) THEN
    ALTER TABLE ptl_cus_corp_pic_d ADD CONSTRAINT pk_ptl_cus_corp_pic_d PRIMARY KEY USING INDEX pk_ptl_cus_corp_pic_d;
  END IF;
END $$;

-- ptl_cus_corp_bplc_d (법인사업장상세)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_corp_bplc_d ON ptl_cus_corp_bplc_d (cust_no, bplc_seq);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_corp_bplc_d' AND conrelid = 'ptl_cus_corp_bplc_d'::regclass) THEN
    ALTER TABLE ptl_cus_corp_bplc_d ADD CONSTRAINT pk_ptl_cus_corp_bplc_d PRIMARY KEY USING INDEX pk_ptl_cus_corp_bplc_d;
  END IF;
END $$;

-- ptl_cus_cust_r (고객관계)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_cust_r ON ptl_cus_cust_r (cust_no, rel_cust_no, cust_rel_ty_cd);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_r' AND conrelid = 'ptl_cus_cust_r'::regclass) THEN
    ALTER TABLE ptl_cus_cust_r ADD CONSTRAINT pk_ptl_cus_cust_r PRIMARY KEY USING INDEX pk_ptl_cus_cust_r;
  END IF;
END $$;
-- 관계고객 쪽 역방향 조회(가족결합·대납 상대방) — PK 선두가 고객번호라 역방향 별도 필요(FK)
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_r_01 ON ptl_cus_cust_r (rel_cust_no);

-- ptl_cus_bill_acnt_h (청구계정이력)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_bill_acnt_h' AND conrelid = 'ptl_cus_bill_acnt_h'::regclass) THEN
    ALTER TABLE ptl_cus_bill_acnt_h ADD CONSTRAINT pk_ptl_cus_bill_acnt_h PRIMARY KEY (bill_acnt_no, vld_bgng_dtm);
  END IF;
END $$;

-- ptl_cus_invc_rcpt_mthd_h (청구서수령방법이력)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_invc_rcpt_mthd_h ON ptl_cus_invc_rcpt_mthd_h (bill_acnt_no, vld_bgng_dtm);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_invc_rcpt_mthd_h' AND conrelid = 'ptl_cus_invc_rcpt_mthd_h'::regclass) THEN
    ALTER TABLE ptl_cus_invc_rcpt_mthd_h ADD CONSTRAINT pk_ptl_cus_invc_rcpt_mthd_h PRIMARY KEY USING INDEX pk_ptl_cus_invc_rcpt_mthd_h;
  END IF;
END $$;

-- ptl_cus_pyr_h (납부자이력)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_pyr_h ON ptl_cus_pyr_h (pyr_no, vld_bgng_dtm);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_pyr_h' AND conrelid = 'ptl_cus_pyr_h'::regclass) THEN
    ALTER TABLE ptl_cus_pyr_h ADD CONSTRAINT pk_ptl_cus_pyr_h PRIMARY KEY USING INDEX pk_ptl_cus_pyr_h;
  END IF;
END $$;

-- ptl_cus_cust_cntc_h (고객연락처이력)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_cntc_h' AND conrelid = 'ptl_cus_cust_cntc_h'::regclass) THEN
    ALTER TABLE ptl_cus_cust_cntc_h ADD CONSTRAINT pk_ptl_cus_cust_cntc_h PRIMARY KEY (cust_no, cntc_seq, vld_bgng_dtm);
  END IF;
END $$;

-- ptl_cus_cust_addr_h (고객주소이력)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_addr_h' AND conrelid = 'ptl_cus_cust_addr_h'::regclass) THEN
    ALTER TABLE ptl_cus_cust_addr_h ADD CONSTRAINT pk_ptl_cus_cust_addr_h PRIMARY KEY (cust_no, addr_seq, vld_bgng_dtm);
  END IF;
END $$;

-- ptl_cus_agre_itm_c (동의항목코드)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_agre_itm_c ON ptl_cus_agre_itm_c (agre_itm_ty_cd, agre_itm_ver_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_agre_itm_c' AND conrelid = 'ptl_cus_agre_itm_c'::regclass) THEN
    ALTER TABLE ptl_cus_agre_itm_c ADD CONSTRAINT pk_ptl_cus_agre_itm_c PRIMARY KEY USING INDEX pk_ptl_cus_agre_itm_c;
  END IF;
END $$;

-- ptl_cus_cust_agre_h (고객동의이력)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_agre_h' AND conrelid = 'ptl_cus_cust_agre_h'::regclass) THEN
    ALTER TABLE ptl_cus_cust_agre_h ADD CONSTRAINT pk_ptl_cus_cust_agre_h PRIMARY KEY (cust_agre_no, vld_bgng_dtm);
  END IF;
END $$;

-- ptl_cus_mkt_rcptn_deny_l (마케팅수신거부내역)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_mkt_rcptn_deny_l ON ptl_cus_mkt_rcptn_deny_l (rcptn_deny_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_mkt_rcptn_deny_l' AND conrelid = 'ptl_cus_mkt_rcptn_deny_l'::regclass) THEN
    ALTER TABLE ptl_cus_mkt_rcptn_deny_l ADD CONSTRAINT pk_ptl_cus_mkt_rcptn_deny_l PRIMARY KEY USING INDEX pk_ptl_cus_mkt_rcptn_deny_l;
  END IF;
END $$;
-- 고객→수신거부 조인(FK)
CREATE INDEX IF NOT EXISTS x_ptl_cus_mkt_rcptn_deny_l_01 ON ptl_cus_mkt_rcptn_deny_l (cust_no);
-- 광고 발송 직전 수신거부 번호 대조(정보통신망법 제50조) — 번호 동등 조회
CREATE INDEX IF NOT EXISTS x_ptl_cus_mkt_rcptn_deny_l_02 ON ptl_cus_mkt_rcptn_deny_l (rcptn_deny_telno);

-- ptl_cus_zip_m (우편번호기본)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_zip_m ON ptl_cus_zip_m (zip);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_zip_m' AND conrelid = 'ptl_cus_zip_m'::regclass) THEN
    ALTER TABLE ptl_cus_zip_m ADD CONSTRAINT pk_ptl_cus_zip_m PRIMARY KEY USING INDEX pk_ptl_cus_zip_m;
  END IF;
END $$;

-- ptl_cus_cust_mbsp_m (고객멤버십기본)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_cust_mbsp_m ON ptl_cus_cust_mbsp_m (mbsp_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_mbsp_m' AND conrelid = 'ptl_cus_cust_mbsp_m'::regclass) THEN
    ALTER TABLE ptl_cus_cust_mbsp_m ADD CONSTRAINT pk_ptl_cus_cust_mbsp_m PRIMARY KEY USING INDEX pk_ptl_cus_cust_mbsp_m;
  END IF;
END $$;
-- 고객→멤버십 조인(FK) — 재가입 시 과거 멤버십 포함 조회
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_mbsp_m_01 ON ptl_cus_cust_mbsp_m (cust_no);
-- 제휴처 결제·적립 시 멤버십 카드번호로 멤버십 조회
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_mbsp_m_02 ON ptl_cus_cust_mbsp_m (mbsp_card_no);

-- ptl_cus_mbsp_point_l (멤버십포인트내역)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_mbsp_point_l' AND conrelid = 'ptl_cus_mbsp_point_l'::regclass) THEN
    ALTER TABLE ptl_cus_mbsp_point_l ADD CONSTRAINT pk_ptl_cus_mbsp_point_l PRIMARY KEY (mbsp_no, point_trd_seq, point_trd_dtm);
  END IF;
END $$;
-- 제휴사별 기간 포인트 정산 대사(PRM FK + 거래일시 범위 — 파티션 프루닝)
CREATE INDEX IF NOT EXISTS x_ptl_cus_mbsp_point_l_01 ON ptl_cus_mbsp_point_l (prtnr_no, point_trd_dtm);

-- ptl_cus_cust_cnsl_l (고객상담내역)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_cnsl_l' AND conrelid = 'ptl_cus_cust_cnsl_l'::regclass) THEN
    ALTER TABLE ptl_cus_cust_cnsl_l ADD CONSTRAINT pk_ptl_cus_cust_cnsl_l PRIMARY KEY (cnsl_no, cnsl_dtm);
  END IF;
END $$;
-- 고객별 상담 이력 최신순 조회(FK) — 상담 화면 기본 경로
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_cnsl_l_01 ON ptl_cus_cust_cnsl_l (cust_no, cnsl_dtm);
-- 회선(서비스관리번호)별 상담 이력 조회(ORD FK)
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_cnsl_l_02 ON ptl_cus_cust_cnsl_l (svc_mgmt_no, cnsl_dtm);

-- ptl_cus_cust_cvlcpt_l (고객민원내역)
CREATE UNIQUE INDEX IF NOT EXISTS pk_ptl_cus_cust_cvlcpt_l ON ptl_cus_cust_cvlcpt_l (cvlcpt_no);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_cvlcpt_l' AND conrelid = 'ptl_cus_cust_cvlcpt_l'::regclass) THEN
    ALTER TABLE ptl_cus_cust_cvlcpt_l ADD CONSTRAINT pk_ptl_cus_cust_cvlcpt_l PRIMARY KEY USING INDEX pk_ptl_cus_cust_cvlcpt_l;
  END IF;
END $$;
-- 고객별 민원 이력 조회(FK)
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_cvlcpt_l_01 ON ptl_cus_cust_cvlcpt_l (cust_no, cvlcpt_acpt_dtm);
-- 상담→민원 전환 건 조인(FK + 반정규화 상담일시)
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_cvlcpt_l_02 ON ptl_cus_cust_cvlcpt_l (cnsl_no, cnsl_dtm);
-- 미처리 민원 처리기한 관리(처리완료일시 NULL 인 행만 — 부분 인덱스, 상태값 저선택도 S3 회피)
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_cvlcpt_l_03 ON ptl_cus_cust_cvlcpt_l (prcs_tmlmt_dt) WHERE prcs_cmptn_dtm IS NULL;
-- 회선(서비스관리번호)별 민원 이력 조회(ORD FK) — 고객상담내역 X_02 와 같은 접근 경로(리뷰 05_physical_CUS R1 추가)
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_cvlcpt_l_04 ON ptl_cus_cust_cvlcpt_l (svc_mgmt_no, cvlcpt_acpt_dtm);

-- ptl_cus_cust_mm_s (고객월통계)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_ptl_cus_cust_mm_s' AND conrelid = 'ptl_cus_cust_mm_s'::regclass) THEN
    ALTER TABLE ptl_cus_cust_mm_s ADD CONSTRAINT pk_ptl_cus_cust_mm_s PRIMARY KEY (cust_no, std_ym);
  END IF;
END $$;
-- 월별(파티션) 지역별 고객 집계 — 월 파티션 안 지역코드 조회
CREATE INDEX IF NOT EXISTS x_ptl_cus_cust_mm_s_01 ON ptl_cus_cust_mm_s (rgn_cd);

