-- ============================================================
-- 174_ops_checklist_lean_legal.sql — 법무 린 노선: 외부 법무 컨설팅 항목 제거
-- 근거: 2026-07-09 마스터 지시 — 외부 법무 자문은 Pi 공식 요구 아님(이중 확인,
--       TROUBLESHOOT A-2 R-08 정본). 자체 컴플라이언스(동의 UI·연령 게이트·
--       LBS 동의·사업자등록·미기입값)는 유지, "컨설팅" 성격 2건만 논리삭제.
-- 적용: staging + 운영 (멱등)
-- ============================================================

UPDATE public.ops_checklist
SET del_yn   = 'Y',
    del_dtm  = CURRENT_TIMESTAMP,
    note_txt = COALESCE(note_txt || ' | ', '') || '2026-07-09 법무 린 노선으로 제거 — 외부 법무 컨설팅은 Pi 공식 요구 아님. VASP는 에스크로 규모 확대 시 스팟 자문(R-08), 약관 검수는 자체 문서 체계로 충분(v1.1 완결)',
    modr_id  = 'ADMIN',
    mod_dtm  = CURRENT_TIMESTAMP
WHERE item_key IN ('C_LAW_REVIEW', 'C_VASP')
  AND del_yn = 'N';
