-- 010_pi_pymnt.sql — Pi U2A 결제 원장 (@pi/db 공용 baseline, 사이트 앱 공통)
-- DA-APPROVED: 마스터 지시 2026-10-11 — 승인 전 요금 결제. cafe pi_pymnt(payment_id·amount·status·metadata) 를 DA 표준명(pymnt_id·pi_amt·pymnt_sts_cd·meta_val)으로 개명 승계. pi_uid 는 sys_user 와 동일 표기. DA 사후 리뷰 대상 (2026-10-11)
-- 선행 : 000_baseline.sql(sys_user·fn_grant_svc_only). 적용 : node scripts/db-migrate.mjs --app <site> --tier <tier> (pi-db 폴더가 사이트 SQL 보다 먼저 적용됨)
-- 설계 :
--  · 1행 = Pi Platform 결제 1건(identifier = pymnt_id). approve 시 APPROVED 로 생성, complete 시 COMPLETED + tx_id, 취소는 CANCELED
--  · 금액 단위는 Pi 소수(NUMERIC(18,7)) — Soroban 단위(10^7)와 혼용 금지. 서버가 요금표로 정가를 재검증한 뒤에만 기록
--  · meta_val = SDK metadata 원문(type·site_id·plan_cd …). pymnt_tp_cd 는 meta.type 사본(조회·인덱스용)
--  · 물리 DELETE 금지(del_yn). 환불·A2U 는 별도 행(후속)
BEGIN;

CREATE TABLE IF NOT EXISTS pi_pymnt (
  pymnt_id      TEXT          NOT NULL,                                    -- 결제ID (Pi Platform payment identifier)
  usr_id        UUID          NOT NULL,                                    -- 결제자 사용자ID → sys_user.usr_id
  pi_uid        TEXT,                                                      -- 결제 시점 Pi uid (앱 scoped, 참고용)
  pi_amt        NUMERIC(18,7) NOT NULL,                                    -- 결제금액(Pi)
  memo_txt      TEXT,                                                      -- 결제 메모(SDK memo)
  meta_val      JSONB         NOT NULL DEFAULT '{}'::jsonb,                -- SDK metadata 원문
  pymnt_tp_cd   VARCHAR(20)   NOT NULL,                                    -- 결제유형코드 (= meta.type, 예: SITE_REG)
  pymnt_sts_cd  VARCHAR(20)   NOT NULL DEFAULT 'APPROVED',                 -- 결제상태코드: APPROVED → COMPLETED | CANCELED
  tx_id         TEXT,                                                      -- 블록체인 거래ID (complete 시)
  apv_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 승인일시(서버 approve)
  cmpl_dtm      TIMESTAMPTZ,                                               -- 완료일시
  cncl_dtm      TIMESTAMPTZ,                                               -- 취소일시
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                        -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 변경일시
  CONSTRAINT pi_pymnt_pkey PRIMARY KEY (pymnt_id),
  CONSTRAINT pi_pymnt_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT pi_pymnt_pi_amt_check CHECK (pi_amt > 0),
  CONSTRAINT pi_pymnt_pymnt_sts_cd_check CHECK (pymnt_sts_cd IN ('APPROVED', 'COMPLETED', 'CANCELED')),
  CONSTRAINT pi_pymnt_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  pi_pymnt IS 'Pi U2A 결제 원장 — 1행 = Pi Platform 결제 1건. 서버 approve 로 생성(APPROVED), complete 로 COMPLETED';
COMMENT ON COLUMN pi_pymnt.pi_amt IS '결제금액 — Pi 소수 단위(NUMERIC(18,7)). Soroban 10^7 단위와 혼용 금지';
COMMENT ON COLUMN pi_pymnt.meta_val IS 'Pi SDK metadata 원문(JSON) — type·site_id·plan_cd 등. 도메인 처리 분기는 pymnt_tp_cd';

CREATE INDEX IF NOT EXISTS idx_pi_pymnt_usr_id ON pi_pymnt (usr_id);
CREATE INDEX IF NOT EXISTS idx_pi_pymnt_pymnt_tp_cd_sts ON pi_pymnt (pymnt_tp_cd, pymnt_sts_cd);

CREATE OR REPLACE FUNCTION fn_upd_pi_pymnt_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_pi_pymnt_mod_dtm ON pi_pymnt;
CREATE TRIGGER trg_pi_pymnt_mod_dtm
  BEFORE UPDATE ON pi_pymnt
  FOR EACH ROW EXECUTE FUNCTION fn_upd_pi_pymnt_mod_dtm();

SELECT fn_grant_svc_only('TABLE', 'pi_pymnt');

COMMIT;
