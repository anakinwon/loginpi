-- r3 개명 프렐류드 — 원본 000·001 적용 직후 실행해 sys_user 7컬럼을 마스터 확정명으로 RENAME(구현 단계 배포와 동일 결과, FK 자동 추종)
-- 실제 packages/pi-db/sql/000_baseline.sql·001 은 수정하지 않는다(00_input §3-2). 10_leader_reinspection-decision §2·§7 기준
ALTER TABLE sys_user RENAME COLUMN id                TO usr_id;
ALTER TABLE sys_user RENAME COLUMN role              TO role_cd;
ALTER TABLE sys_user RENAME COLUMN pi_username       TO pi_usr_nm;
ALTER TABLE sys_user RENAME COLUMN pi_wallet_address TO pi_wlt_adr_txt;
ALTER TABLE sys_user RENAME COLUMN display_name      TO dsp_nm;
ALTER TABLE sys_user RENAME COLUMN last_login_dtm    TO lst_lgn_dtm;
ALTER TABLE sys_user RENAME COLUMN rejoin_dtm        TO rjn_dtm;
ALTER TABLE sys_user RENAME CONSTRAINT sys_user_role_check TO sys_user_role_cd_check;
ALTER INDEX ux_sys_user_pi_username_actv RENAME TO ux_sys_user_pi_usr_nm_actv;
