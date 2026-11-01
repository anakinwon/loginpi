-- 077_sys_lnk_tkn.sql : 사이트 연결 토큰(dbms.pi ↔ schema.pi, BUILD_CONTRACT §2.1 결정 D1) — 분류체계 단위 토큰 slk_<base64url 32바이트>, 발급 = 설정 화면(접속 관리 권한 SYS·DA), 원문은 발급 응답 1번만
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — 신규 1테이블(sys_ 접두, 시스템 컬럼 4개 맨 끝, del_yn·del_dtm 논리삭제 = 폐기, service_role 전용), 약어 LNK(연결)·TKN(토큰)·PFX(접두)·LST(최종)·USE(사용) — mdl_db_agt(sql/039) 토큰 선례 그대로
-- 해시 = SHA-256(hex 64자)만 저장, 만료 필수. 사용자 대조 없음(PRD_28 §1.1-1 사이트 간 사용자 대조 금지) — 토큰을 가진 서버는 그 분류체계의 이름 붙인 조회만(서버 /api/link/v1/*)
BEGIN;

CREATE TABLE IF NOT EXISTS sys_lnk_tkn (
  tkn_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 토큰ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID(토큰 범위)
  tkn_nm            VARCHAR(100) NOT NULL,                                 -- 토큰명(용도 표시)
  tkn_hash          CHAR(64)     NOT NULL,                                 -- 토큰해시(SHA-256)
  tkn_pfx           VARCHAR(12)  NOT NULL,                                 -- 토큰접두(화면 식별용 앞 8자)
  exp_dtm           TIMESTAMPTZ  NOT NULL,                                 -- 만료일시
  lst_use_dtm       TIMESTAMPTZ,                                           -- 최종사용일시
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부(폐기)
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT pk_sys_lnk_tkn PRIMARY KEY (tkn_id),
  CONSTRAINT sys_lnk_tkn_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT sys_lnk_tkn_hash_check CHECK (tkn_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sys_lnk_tkn_del_yn_check CHECK (del_yn IN ('Y','N') AND ((del_yn = 'Y') = (del_dtm IS NOT NULL)))
);
CREATE UNIQUE INDEX IF NOT EXISTS x_sys_lnk_tkn_01 ON sys_lnk_tkn (tkn_hash);
CREATE INDEX IF NOT EXISTS x_sys_lnk_tkn_02 ON sys_lnk_tkn (area_id, reg_dtm DESC) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('sys_lnk_tkn'), fn_grant_svc_only('TABLE', 'sys_lnk_tkn');
COMMENT ON TABLE sys_lnk_tkn IS '사이트 연결 토큰(dbms.pi 등 서버 간) — 분류체계 단위, 해시만 저장, 만료 필수, 폐기 = 논리 삭제';
COMMENT ON COLUMN sys_lnk_tkn.tkn_id IS '토큰ID';
COMMENT ON COLUMN sys_lnk_tkn.area_id IS '분류체계ID(이 토큰이 읽을 수 있는 범위)';
COMMENT ON COLUMN sys_lnk_tkn.tkn_nm IS '토큰명(용도 표시)';
COMMENT ON COLUMN sys_lnk_tkn.tkn_hash IS '토큰해시(SHA-256 hex, 원문은 저장 안 함)';
COMMENT ON COLUMN sys_lnk_tkn.tkn_pfx IS '토큰접두(slk_ 포함 앞 8자, 화면 식별용)';
COMMENT ON COLUMN sys_lnk_tkn.exp_dtm IS '만료일시';
COMMENT ON COLUMN sys_lnk_tkn.lst_use_dtm IS '최종사용일시(1분 단위 갱신)';
COMMENT ON COLUMN sys_lnk_tkn.del_yn IS '삭제여부(Y = 폐기, 즉시 무효)';
COMMENT ON COLUMN sys_lnk_tkn.del_dtm IS '삭제일시';
COMMENT ON INDEX x_sys_lnk_tkn_01 IS '토큰 해시 유일(인증 조회)';
COMMENT ON INDEX x_sys_lnk_tkn_02 IS '분류체계별 활성 토큰 목록';

COMMIT;

NOTIFY pgrst, 'reload schema';
