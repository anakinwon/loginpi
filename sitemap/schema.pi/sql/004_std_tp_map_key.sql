-- 004_std_tp_map_key.sql : 타입매핑 유일 키 정정 — (DBMS, 물리타입) → (DBMS, 논리타입)
-- 근거 : DA# STD_DATATYPE 원본은 DBMS별 논리타입(CD_NO = DA_CODE 0101 하위)마다 물리타입 1건이며, 같은 물리타입이 여러 논리타입에 쓰임(예 : TIBERO NUMBER = 0011·0014·0015). 002 의 (dbms_cd, phy_tp_nm) 유일 인덱스로는 적재 불가
-- 원본의 물리타입 NULL 행(해당 DBMS 미지원)은 적재하지 않으므로 lgc_tp_cd 필수로 전환(현재 0행)
BEGIN;
DROP INDEX IF EXISTS ux_std_tp_map_dbms_phy_actv;
ALTER TABLE std_tp_map ALTER COLUMN lgc_tp_cd SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_tp_map_dbms_lgc_actv ON std_tp_map (dbms_cd, lgc_tp_cd) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_std_tp_map_dbms_phy ON std_tp_map (dbms_cd, phy_tp_nm);
COMMIT;
