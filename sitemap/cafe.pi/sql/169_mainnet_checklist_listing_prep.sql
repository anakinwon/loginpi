-- 169_mainnet_checklist_listing_prep.sql
-- 메인넷 출시 체크리스트(mainnet_checklist, sql/129) 진척 현행화 (2026-07-08)
-- 반영: WBS 6.4 잔여 진행 — ① 절제 오버레이 구현(NEXT_PUBLIC_LISTING_MODE·messages/listing/*)
--   ② 도메인 검증 라우트 구현(/validation-key.txt·PI_DOMAIN_VALIDATION_KEY env 주입식)
--   ③ 운영 sandbox=false 확정(2026-07-02)·fee_mode=PI 전환(2026-06-30) 진척 노트
--   ④ Pi Sign-In(OAuth) 신설로 A-4(Pi 인증 주 경로) 강화(2026-07-08 실기기 검증 완결)
-- DML(UPDATE)만 — item_key 기준 멱등. 정본: docs/MAINNET_READINESS_CHECKLIST.md (2026-07-08판)

-- E-4 앱 URL + 도메인 검증: 서빙 라우트 구현 완료 → 잔여는 E-3(메인넷 포털 생성) 후 키 env 설정만
UPDATE public.mainnet_checklist SET status_cd='DOING',
  note_txt='운영 URL(cafepi.vercel.app)+운영DB 라이브 확보. /validation-key.txt 서빙 라우트 구현 완료(2026-07-08, PI_DOMAIN_VALIDATION_KEY env 주입식·미설정 시 404). 잔여=E-3 메인넷 Dev Portal 생성 후 발급 키를 Vercel env 설정+재배포. 커스텀 도메인은 후속.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='E-4';

-- E-7 Vercel env+cron: sandbox=false 확정·fee_mode=PI 반영. 메인넷 Pi 키/지갑·rotate·LISTING_MODE 잔여
UPDATE public.mainnet_checklist SET status_cd='DOING',
  note_txt='운영 env·Cron·운영DB 컷오버 완료 + NEXT_PUBLIC_PI_SANDBOX=false 확정(2026-07-02 환경별 고정 철칙) + 운영 fee_mode=PI 전환(2026-06-30, 플랫폼 거래 Pi 통일). 잔여(메인넷 스왑): PI_API_KEY(메인넷)·PI_WALLET_PRIVATE_SEED(등록지갑 일치)·시크릿 rotate·NEXT_PUBLIC_LISTING_MODE=true(절제 오버레이 ON).',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='E-7';

-- B-12 도메인 소유 검증: 기술 준비(서빙 라우트) 완료 → 실행은 메인넷 포털 키 발급 대기
UPDATE public.mainnet_checklist SET status_cd='DOING',
  note_txt='validation-key.txt 배치 방식 확정+구현(2026-07-08): 파일 커밋 대신 /validation-key.txt 라우트가 PI_DOMAIN_VALIDATION_KEY env를 서빙(포털 프로젝트별 키 상이·환경 분리). 미들웨어 matcher가 점 포함 경로 제외라 locale 리다이렉트 없음. 잔여=메인넷 포털 키 발급 후 env 설정.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='B-12';

-- C-B 일반브라우저 로그인: Pi Sign-In(OAuth) 신설로 Pi 인증 주 경로 강화(모더레이터 권장 충족 유지)
UPDATE public.mainnet_checklist SET
  note_txt='모더레이터 답변(2026-06-27): Pi Browser 내 Google 미노출이면 무방 → 코드 충족(google-login-button inPiBrowser null). ➕Pi Sign-In(OAuth) 신설(2026-07-08 실기기 검증 완결)로 일반 브라우저도 Pi 계정 로그인 가능 — Google 의존 축소·A-4 취지 부합. 잔여=최종 메인넷 빌드 육안 재확인 1회.',
  modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP WHERE item_key='C-B';

-- 검증:
--   SELECT item_key, status_cd, left(note_txt, 60) FROM public.mainnet_checklist
--    WHERE del_yn='N' AND item_key IN ('E-4','E-7','B-12','C-B') ORDER BY sort_ord;
