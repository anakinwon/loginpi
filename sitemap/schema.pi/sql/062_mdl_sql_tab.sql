-- 062_mdl_sql_tab.sql : SQL 편집기 편집 탭(마스터 지시 2026-10-20 "편집 탭을 요금제별 계정별 3·5·8·10개까지, 변경 시 1분마다·실행 시 자동 저장")
-- DA-APPROVED: 마스터 지시 2026-10-20 — 신규 1테이블, 약어 SQL·TAB(탭)·SORT(정렬)·SEQ(순서)·TXT(내용) 표준단어 [확인중 : da-standards]
-- 탭 = 분류체계 × 사용자(본인 것만), 접속과 무관. 상한(요금제별)은 앱이 강제(src/lib/sql-tab-rule.ts). 저장 충돌 = 마지막 저장 우선(버전 없음)
-- 활성 탭 이름은 사용자 안에서 유일, 닫기 = 논리 삭제(같은 이름 다시 열기 가능). 개인 편집 내용이라 감사 이력 없음
BEGIN;

CREATE TABLE IF NOT EXISTS mdl_sql_tab (
  sql_tab_id        UUID         NOT NULL DEFAULT gen_random_uuid(),       -- SQL탭ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  usr_id            UUID         NOT NULL,                                 -- 사용자ID(탭 소유자)
  tab_nm            VARCHAR(50)  NOT NULL,                                 -- 탭명
  sort_seq          INT          NOT NULL DEFAULT 0,                       -- 정렬순서
  sql_txt           TEXT         NOT NULL DEFAULT '',                      -- SQL내용(500,000자까지)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT mdl_sql_tab_pkey PRIMARY KEY (sql_tab_id),
  CONSTRAINT mdl_sql_tab_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT mdl_sql_tab_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT mdl_sql_tab_tab_nm_check CHECK (char_length(btrim(tab_nm)) > 0),
  CONSTRAINT mdl_sql_tab_sql_txt_check CHECK (char_length(sql_txt) <= 500000),
  CONSTRAINT mdl_sql_tab_del_yn_check CHECK (del_yn IN ('Y','N'))
);
CREATE INDEX IF NOT EXISTS ix_mdl_sql_tab_area_usr ON mdl_sql_tab (area_id, usr_id, sort_seq) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS ux_mdl_sql_tab_nm_actv ON mdl_sql_tab (area_id, usr_id, tab_nm) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('mdl_sql_tab'), fn_grant_svc_only('TABLE', 'mdl_sql_tab');
COMMENT ON TABLE mdl_sql_tab IS 'SQL 편집기 편집 탭 — 분류체계 × 사용자, 요금제별 상한(앱), 닫기 = 논리 삭제';
COMMENT ON COLUMN mdl_sql_tab.sql_tab_id IS 'SQL탭ID';
COMMENT ON COLUMN mdl_sql_tab.area_id IS '분류체계ID';
COMMENT ON COLUMN mdl_sql_tab.usr_id IS '사용자ID(탭 소유자, 본인만 조회·수정)';
COMMENT ON COLUMN mdl_sql_tab.tab_nm IS '탭명(사용자 안 활성 탭 유일, 기본 sql-NNN)';
COMMENT ON COLUMN mdl_sql_tab.sort_seq IS '정렬순서';
COMMENT ON COLUMN mdl_sql_tab.sql_txt IS 'SQL내용(편집 중 원문, 500,000자까지)';
COMMENT ON COLUMN mdl_sql_tab.del_yn IS '삭제여부(탭 닫기 = Y)';
COMMENT ON COLUMN mdl_sql_tab.del_dtm IS '삭제일시';
COMMENT ON COLUMN mdl_sql_tab.regr_id IS '등록자ID';
COMMENT ON COLUMN mdl_sql_tab.reg_dtm IS '등록일시';
COMMENT ON COLUMN mdl_sql_tab.modr_id IS '변경자ID';
COMMENT ON COLUMN mdl_sql_tab.mod_dtm IS '변경일시(마지막 저장 시각)';

COMMIT;

NOTIFY pgrst, 'reload schema';
