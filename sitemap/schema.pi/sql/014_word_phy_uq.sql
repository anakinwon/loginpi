-- 014_word_phy_uq.sql : 표준단어 물리명(영문 약어 명) 유일 — 이음동의어 절대 금지(2026-10-16 마스터 지시)
-- 근거 : 표준단어 지침서(backup/10) 3.3 이음동의어 불허, 영문 명이 같으면 영문 약어 명을 달리 정의. 적용 전 활성 중복 0건 확인(2026-10-16)
-- 동음이의어(같은 논리명)는 기존 ux_std_dic_area_log_nm_actv 가 차단, 기존 단어의 이음동의어 표기 등록 차단은 서버 규칙(src/lib/change.ts wordNameError)
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_dic_area_phy_nm_actv ON std_dic (area_id, dic_phy_nm) WHERE del_yn = 'N';
COMMIT;
