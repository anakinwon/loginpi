-- 132_mainnet_checklist_progress.sql
-- 메인넷 출시 체크리스트(mainnet_checklist, sql/129) 진척 현행화 (2026-06-28)
-- 반영: Py 개명 실행 완료 · Pi 직접확인(C-A~C-D) 답변 수령 · 운영 Vercel WAS 신설
-- DML(UPDATE)만 — item_key 기준 멱등. 정본: docs/MAINNET_READINESS_CHECKLIST.md

-- ── 완료(DONE) ─────────────────────────────────────────────
-- E-2 상표 결정: 라이선스 대신 Py 개명 채택·실행
UPDATE public.mainnet_checklist SET status_cd='DONE',
  note_txt='PyCafé™/PyShop™/PyTranslate™ 등 Py 계열 개명 실행 완료(2026-06-27). C-A 공식답변("Pi 접두 Not recommended") 반영. 코드값(PICAFE 등)·Pi 플랫폼 토큰은 원형 유지.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='E-2';

-- C-A 상표 질의: 공식답변 수령
UPDATE public.mainnet_checklist SET status_cd='DONE',
  note_txt='공식답변: "Picafe/Pishop은 Pi를 prefix로 사용 → Not recommended". 라이선스 경로 대신 Py 개명으로 대응(E-2).',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='C-A';

-- C-B 로그인 경로: 답변 수령
UPDATE public.mainnet_checklist SET status_cd='DONE',
  note_txt='답변 수령: Pi Auth 주력, Google은 비-PiBrowser 웹·계정연동 보조 허용. 완전 제거 불요.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='C-B';

-- C-C 외부앱(Telegram): 답변 수령
UPDATE public.mainnet_checklist SET status_cd='DONE',
  note_txt='답변 수령: Pi Browser 푸시 부재 대응으로 Telegram 주문알림 necessity 인정 범위 확인. 완료.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='C-C';

-- C-D 데이터 수집항목 매핑: 작성 완료
UPDATE public.mainnet_checklist SET status_cd='DONE',
  note_txt='수집항목 매핑 완료 — 실명·전화·주소·위치는 O2O 서비스 활성 시 선택 옵션(강제 아님).',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='C-D';

-- ── 진행 중(DOING) ─────────────────────────────────────────
-- E-4 앱 URL 확보: 운영 Vercel URL 확보, 메인넷 포털 검증은 E-3 후
UPDATE public.mainnet_checklist SET status_cd='DOING',
  note_txt='운영 URL 확보: cafepi.vercel.app(신규 Vercel 운영 프로젝트, production 브랜치 게이팅). 메인넷 Dev Portal validation-key.txt 도메인검증은 E-3(메인넷 포털 생성) 후. 커스텀 도메인은 후속.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='E-4';

-- E-7 Vercel env+cron: 운영 프로젝트 등록 완료(현재 shadow), 메인넷 값은 컷오버
UPDATE public.mainnet_checklist SET status_cd='DOING',
  note_txt='운영 Vercel 프로젝트 env(NEXT_PUBLIC_APP_URL 도메인별·AUTH_SECRET·CRON_SECRET 등)+Cron 등록 완료. 현재 shadow=Testnet/sandbox. 메인넷 값(PI_API_KEY·PI_WALLET_PRIVATE_SEED·SANDBOX=false·운영DB)은 컷오버 시 스왑.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='E-7';
