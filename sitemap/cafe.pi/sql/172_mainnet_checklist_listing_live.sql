-- 172_mainnet_checklist_listing_live.sql
-- 메인넷 출시 체크리스트(mainnet_checklist) 진척 현행화 (2026-07-09)
-- 반영: 절제 오버레이 운영(cafepi) 적용 완료 — NEXT_PUBLIC_LISTING_MODE=true 설정+재배포 후
--   운영 실화면 검증(ko·en·es: 절제문 적용·"Token Economy"/"Bean 경제"/"발행" 계열 0건).
--   검증 이력: 로컬 ON(ko·en 8/8, fr·es·ja en폴백 3/3)·OFF 회귀·staging(loginpi) 무영향 확인.
-- DML(UPDATE)만 — item_key 기준 멱등. 정본: docs/MAINNET_READINESS_CHECKLIST.md (2026-07-09판)

-- E-7 Vercel env: LISTING_MODE 완료 반영 → 잔여는 메인넷 Pi 키/지갑/rotate만
UPDATE public.mainnet_checklist SET status_cd='DOING',
  note_txt='운영 env·Cron·운영DB 컷오버 + NEXT_PUBLIC_PI_SANDBOX=false 확정(2026-07-02) + fee_mode=PI(2026-06-30) + NEXT_PUBLIC_LISTING_MODE=true 적용·운영 실화면 검증 완료(2026-07-09, ko·en·es 절제문 확인). 잔여(메인넷 스왑): PI_API_KEY(메인넷)·PI_WALLET_PRIVATE_SEED(등록지갑 일치)·시크릿 rotate.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='E-7';

-- 검증:
--   SELECT item_key, status_cd, left(note_txt, 80) FROM public.mainnet_checklist
--    WHERE del_yn='N' AND item_key='E-7';
