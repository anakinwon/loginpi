-- 059_std_cd_val_nm_uq.sql : 공통코드 코드상세 코드값명 상호 배타(관계형 데이터 모델링 노트 4장 p142 코드 인스턴스 설계 원칙, 마스터 지시 2026-10-20)
-- DA-APPROVED: 마스터 지시 2026-10-20 공통코드 3종(구분·종류·유형)·코드기본 : 코드상세 = 1:N — 인덱스 1개 추가(구조 변경 없음)
--  같은 코드기본 안 활성 코드상세의 코드값명 중복 불가(논리 삭제 행 제외). 이름 3종 제한은 앱 검사(src/lib/std-code-rule.ts)
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_std_cd_val_cd_nm_actv ON std_cd_val (cd_id, cd_val_nm) WHERE del_yn = 'N';

COMMIT;
