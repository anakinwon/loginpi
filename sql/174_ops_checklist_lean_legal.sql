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

-- ------------------------------------------------------------
-- 2차 (2026-07-09 마스터 확정 — 책임 3분리 프레임): C_BIZ_REG·C_LAW_FILL 트리거형(NA) 전환
--   P2P 개인·O2O 매장주=각자 책임. 플랫폼 자체분만: 통신판매업=공정위 고시 면제(50회/간이과세),
--   사업자등록=수익 실현 시 20일 내. 트리거 도달 시 status_cd='TODO'로 되돌려 재활성화.
-- ------------------------------------------------------------
UPDATE public.ops_checklist SET
  title='[트리거·현재 해당없음] 사업자등록+통신판매업 신고 — 수익 실현(환금·규모화) 또는 연 거래 50회 도달 시 TODO 전환',
  note_txt='2026-07-09 확정: 플랫폼 자체분만 해당(P2P 개인·O2O 매장주는 각자 책임). 통신판매업=공정위 고시 면제(50회 미만/간이과세자)·사업자등록=영리 실현 시 20일 내(비용 0). LBS 간이신고(정부24 무료)도 등록 시 동시 처리',
  status_cd='NA', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP
WHERE item_key='C_BIZ_REG';

UPDATE public.ops_checklist SET
  title='[트리거·현재 해당없음] 약관 미기입값 — 사업자번호·위치책임자는 사업자등록 시 기입',
  note_txt='2026-07-09 확정: 사업자번호·위치정보관리책임자=C_BIZ_REG 트리거 종속(등록 전엔 기입할 값 없음). 무비용 기입(작성일 등)은 자체 처리',
  status_cd='NA', modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP
WHERE item_key='C_LAW_FILL';
