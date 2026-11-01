-- 004_dbms_lnk.sql — schema.pi 연결 등록(분류체계 연결 토큰 봉인 보관) — 계약 docs/BUILD_CONTRACT.md 2.3·D1·D8
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — dbm_ 접두 dbms 소유 테이블 1개, 토큰 원문 미보관(AES-256-GCM 봉인문만), 고객 DB 행 데이터 없음(A3)
-- 선행 : 001_dbms_auth_link.sql(sys_user). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 사용자가 schema.pi 에서 발급받은 slk_ 토큰을 등록 → 서버가 schema.pi GET /area 로 검증 후 area_id·area_nm 과 함께 봉인 저장
--  · tkn_enc_txt = base64(iv 12B | tag 16B | 암호문), 키 = HKDF-SHA256(PI_SESSION_SECRET, 'dbms-link'), AAD = lnk_id
--  · 사용자당 같은 분류체계 활성 연결 1건(재등록 = 기존 행 토큰 교체). 해제 = del_yn='Y'(물리 DELETE 금지)
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_lnk (
  lnk_id        UUID         NOT NULL DEFAULT gen_random_uuid(),           -- 연결ID
  usr_id        UUID         NOT NULL,                                     -- 소유 사용자ID → sys_user.usr_id
  area_id       TEXT         NOT NULL,                                     -- schema.pi 분류체계ID
  area_nm       VARCHAR(200) NOT NULL,                                     -- 분류체계명(등록·재검증 때 갱신)
  tkn_enc_txt   TEXT         NOT NULL,                                     -- 연결 토큰 봉인문(AES-256-GCM)
  del_yn        CHAR(1)      NOT NULL DEFAULT 'N',                         -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 등록자ID
  reg_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 등록일시
  modr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 변경자ID
  mod_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 변경일시
  CONSTRAINT pk_dbm_lnk PRIMARY KEY (lnk_id),
  CONSTRAINT dbm_lnk_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT dbm_lnk_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_lnk IS 'schema.pi 연결 — 사용자별 분류체계 연결 토큰(봉인문) 보관';

-- 사용자 + 분류체계 활성 1건(재등록 판정·목록 조회 겸용)
CREATE UNIQUE INDEX IF NOT EXISTS x_dbm_lnk_01
  ON dbm_lnk (usr_id, area_id) WHERE del_yn = 'N';

SELECT fn_grant_svc_only('TABLE', 'dbm_lnk');

-- mod_dtm 자동 갱신(DA 검토 m1 — 앱 누락 시 정렬 보호)
CREATE OR REPLACE FUNCTION fn_upd_dbm_lnk_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dbm_lnk_mod_dtm ON dbm_lnk;
CREATE TRIGGER trg_dbm_lnk_mod_dtm
  BEFORE UPDATE ON dbm_lnk
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_lnk_mod_dtm();

COMMIT;
