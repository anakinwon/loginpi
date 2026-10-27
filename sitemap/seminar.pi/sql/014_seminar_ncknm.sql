-- 014_seminar_ncknm.sql — 세미나별 참가자 별명(룸 안에서 언제든 수정, 마스터 2026-10-28)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-28) — 테이블 1개(smn_ncknm) 신규만. DA 사후 리뷰 대상
-- 선행 : 004(smn_mst)·baseline(sys_user). 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod
-- 신규 표준단어 : 별명 NCKNM(Nickname, 합성어라 '_' 없이 한 단어)
-- 왜 sys_user.dsp_nm 이 아닌가 : Pi 로그인마다 upsert 가 dsp_nm 을 Pi 사용자명으로 덮어써(packages/pi-db users.ts) 바꾼 이름이 되돌아간다.
--   그래서 세미나별로 따로 둔다 — 입장권 발급(api/media/ticket)이 별명이 있으면 그것을 표시명으로 싣는다(늦게 들어온 사람·재접속도 같은 이름)
BEGIN;

CREATE TABLE IF NOT EXISTS smn_ncknm (
  smn_id        UUID          NOT NULL,                                   -- 세미나ID → smn_mst
  usr_id        UUID          NOT NULL,                                   -- 사용자ID → sys_user
  ncknm         VARCHAR(30)   NOT NULL,                                   -- 별명(룸 표시명)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_ncknm PRIMARY KEY (smn_id, usr_id),
  CONSTRAINT smn_ncknm_smn_mst_fkey FOREIGN KEY (smn_id) REFERENCES smn_mst (smn_id),
  CONSTRAINT smn_ncknm_sys_user_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_ncknm_ncknm_check CHECK (length(btrim(ncknm)) > 0),
  CONSTRAINT smn_ncknm_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE smn_ncknm IS '세미나별 참가자 별명 — 1행 = 세미나 × 사용자. 입장권 표시명으로 쓴다';

SELECT fn_grant_svc_only('TABLE', 'smn_ncknm');

COMMIT;
