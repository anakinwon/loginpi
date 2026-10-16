-- 003_std_flow.sql : schema.pi 표준 변경 절차 — 승인 요청(std_apv_req), 감사 이력(std_audit_log)
-- 적용 : 002_std_dict.sql 다음, 재적용 가능
-- 근거 : PRD v0.2 D9(신청 → 승인, 승인분만 확정), FR-15·FR-16, M2(변경 전후 값은 감사 이력)
-- 신규 표준단어 등재 후보 : req·tgt·act·bfr·aftr·rjct·rsn [확인중 : schema.pi 표준단어 등재]
BEGIN;

-- 승인 요청 : 편집자 신청(신규·수정·삭제) → 분류체계 관리자 승인·반려
CREATE TABLE IF NOT EXISTS std_apv_req (
  apv_req_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 승인요청ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  tgt_tp_cd         VARCHAR(10)  NOT NULL,                                 -- 대상유형코드 : DIC / DOM / TERM
  tgt_id            UUID,                                                  -- 대상ID(신규 요청은 승인 시 생성되므로 NULL)
  act_cd            VARCHAR(10)  NOT NULL,                                 -- 요청동작코드 : INS / UPD / DEL
  aftr_val          JSONB,                                                 -- 요청내용(변경 후 값)
  base_ver_no       INT,                                                   -- 기준버전번호(수정·삭제 요청 시 대상 ver_no, 승인 시 충돌 검사)
  req_usr_id        UUID         NOT NULL,                                 -- 요청자ID
  apv_sts_cd        VARCHAR(10)  NOT NULL DEFAULT 'REQ',                   -- 승인상태코드 : REQ(대기) / APV(승인) / RJCT(반려) / CNCL(취소)
  apv_usr_id        UUID,                                                  -- 처리자ID
  apv_dtm           TIMESTAMPTZ,                                           -- 처리일시
  rjct_rsn_txt      TEXT,                                                  -- 반려사유
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_apv_req_pkey PRIMARY KEY (apv_req_id),
  CONSTRAINT std_apv_req_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_apv_req_sys_user_id_fkey FOREIGN KEY (req_usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT std_apv_req_apv_sys_user_id_fkey FOREIGN KEY (apv_usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT std_apv_req_tgt_tp_cd_check CHECK (tgt_tp_cd IN ('DIC','DOM','TERM')),
  CONSTRAINT std_apv_req_act_cd_check CHECK (act_cd IN ('INS','UPD','DEL')),
  CONSTRAINT std_apv_req_tgt_id_check CHECK ((act_cd = 'INS') = (tgt_id IS NULL)),
  CONSTRAINT std_apv_req_apv_sts_cd_check CHECK (apv_sts_cd IN ('REQ','APV','RJCT','CNCL')),
  CONSTRAINT std_apv_req_rjct_check CHECK (apv_sts_cd <> 'RJCT' OR rjct_rsn_txt IS NOT NULL),
  CONSTRAINT std_apv_req_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE INDEX IF NOT EXISTS idx_std_apv_req_area_sts ON std_apv_req (area_id, apv_sts_cd);
-- 같은 대상에 대기 중 요청은 1건(수정·삭제 경합 방지)
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_apv_req_tgt_wait ON std_apv_req (tgt_tp_cd, tgt_id)
  WHERE apv_sts_cd = 'REQ' AND tgt_id IS NOT NULL AND del_yn = 'N';

-- 감사 이력 : 표준 데이터 등록·수정·삭제의 변경 전후 값(append-only, 정본 §4-3 예외 : 물리 삭제 허용·UPDATE 없음)
CREATE TABLE IF NOT EXISTS std_audit_log (
  log_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 로그ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  tgt_tp_cd         VARCHAR(10)  NOT NULL,                                 -- 대상유형코드 : AREA / MBR / DIC / DOM / DOM_GRP / TERM / ABBR / TP
  tgt_id            TEXT         NOT NULL,                                 -- 대상ID(UUID 또는 코드 PK)
  act_cd            VARCHAR(10)  NOT NULL,                                 -- 동작코드 : INS / UPD / DEL
  bfr_val           JSONB,                                                 -- 변경전값
  aftr_val          JSONB,                                                 -- 변경후값
  apv_req_id        UUID,                                                  -- 승인요청ID(승인 경유 변경)
  usr_id            UUID,                                                  -- 수행자ID
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_audit_log_pkey PRIMARY KEY (log_id),
  CONSTRAINT std_audit_log_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_audit_log_std_apv_req_id_fkey FOREIGN KEY (apv_req_id) REFERENCES std_apv_req (apv_req_id),
  CONSTRAINT std_audit_log_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT std_audit_log_act_cd_check CHECK (act_cd IN ('INS','UPD','DEL'))
);
CREATE INDEX IF NOT EXISTS idx_std_audit_log_area_reg_dtm ON std_audit_log (area_id, reg_dtm DESC);
CREATE INDEX IF NOT EXISTS idx_std_audit_log_tgt ON std_audit_log (tgt_tp_cd, tgt_id);

SELECT fn_add_mod_dtm_trg('std_apv_req'), fn_grant_svc_only('TABLE', 'std_apv_req');
SELECT fn_grant_svc_only('TABLE', 'std_audit_log');

COMMIT;
