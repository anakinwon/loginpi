-- 058_mdl_ent_tp4.sql : 엔터티 유형 4종(관계형 데이터 모델링 노트 1.2 '데이터 본질에 따른 엔터티 분류법', 마스터 지시 2026-10-20)
-- DA-APPROVED: 마스터 지시 2026-10-20 엔터티 생성규칙 4종 — mdl_ent.ent_tp_cd 허용값만 변경(구조 변경 없음)
--  BASE 실체(본질 데이터) / REF 기준(업무 기준·참조 : 코드정보·기본 기준 정보, 신규) / ACT 행위(원천 활동 데이터) / PROC 가공(추출·집계, 구 AGG 집계)
--  기존 행 : AGG → PROC 이관, BASE(구 '실체·기준')는 실체로 두고 기준은 사용자가 다시 분류(자동 판정 근거 없음)
BEGIN;

ALTER TABLE mdl_ent DROP CONSTRAINT IF EXISTS mdl_ent_tp_check;
UPDATE mdl_ent SET ent_tp_cd = 'PROC' WHERE ent_tp_cd = 'AGG';
ALTER TABLE mdl_ent ADD CONSTRAINT mdl_ent_tp_check CHECK (ent_tp_cd IN ('BASE','REF','ACT','PROC'));
COMMENT ON COLUMN mdl_ent.ent_tp_cd IS '엔터티유형코드 : BASE 실체 / REF 기준 / ACT 행위 / PROC 가공(노트 1.2, 2026-10-20)';

COMMIT;
