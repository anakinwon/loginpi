# ROADMAP: seminar.pi

> 작성일 2026-10-24 · 갱신 2026-10-28 · 요구사항 `PRD.md` · 공통 단계 정본 [TODO 목록](../../multitenant_create_TODO-List.md) · 화면용 요약 = `src/data/progress.ts`(`/progress`, 이 문서와 같이 갱신)

## 진행률 요약

| Phase | 이름 | 상태 |
|---|---|---|
| 0 | 선결(결정·환경·포털·DB) | **완료(조건부, 2026-10-26)** — PRD v1.0 ✓ · Pi 앱 ✓ · 비운영 DB·스테이징 URL 은 **대체 충족** : 비운영 스키마는 만들었으나 앱 tier 는 `public` 하나(PRD 7절), 스테이징 = master 배포 `seminarz.vercel.app` 하나(운영 브랜치 분리 [확인중 : 마스터]) [확인중 : 마스터]. 운영 호스팅 [확인중 : 마스터] |
| 1 | MVP(로그인 + 고유 기능 1개 + 결제 1개) | **진행 — 구현·브라우저 QA 통과, 실기기 대기** : 로그인 실기기 ✓ · 화면 5종(S1~S5)·화상 룸·Pi 결제 입장 구현(브라우저 QA 2차 7/7, 2026-10-27) · **F-02 개설·F-03 목록·상세·F-04 Pi 입장 결제 완료 판정(마스터 2026-10-29)** · **Pi Browser 실기기 개설·목록·상세·결제 입장 ✓(마스터 2026-10-29)** |
| M | 자체 화상 엔진 M0~M5([PRD_01](PRD_01_MEDIA_ENGINE.md) 5절) | **M0 ✓(Android·iOS) · M1 LAN ✓ · M2 ✓(2026-10-29) · M4 ✓(청중 30 시험 면제, 2026-10-29) · M3(-race 1회만 남음)·M5 진행** — 실네트워크(LTE·netem)·실기기 대기. 단계별 통과 기준, 건너뛰기 금지 |
| X | 회의 부가 기능(v2) — F-U·F-08~F-17 | **진행 — 구현·검토·야간 E2E 6라운드 완료(master `4f322641`, 배포 success), 엔진 교체·키·버킷·실기기 대기**. 엔진 교체·`GEMINI_API_KEY`·`smn-note` 버킷 대기(아래 막힌 것 #6·#7·#9~#11) · [NIGHT_REPORT_2026-10-28](NIGHT_REPORT_2026-10-28.md) |
| 2 | 수익 | **드롭 — F-06 개최자 수익 정산·F-07 다시보기 범위 제외(마스터 2026-10-29)**. R1 입장료(개설비)는 구현 |
| 3 | 등재(A-1~A-7·실기기) | 대기 |

## 지금 막힌 것 — 마스터 확인 순서 (2026-10-29 갱신)

| # | 할 일 | 어디서 | 왜 |
|---|---|---|---|
| 1 | 집 PC 엔진을 **`8ab7e634` 빌드(sha256 `ce249a33a54bb5b54e3b08cef14d0d4d1d155cc761afbb8410d6c402fd56b94f`)**로 교체 — LAN 후보(`9d8eea86`) 포함 | `media/docs/HOME_NODE_GUIDE.md` 4.7 | 2026-10-27 실기기 시험에서 같은 집 PC 발표자가 잠깐 접속 뒤 `ICE_FAILED` 로 끊기고 청중 영상이 없었음 → 엔진이 LAN 주소도 host 후보로 알리도록 수정(Append) — 유력 원인 [확인중 : 실기기 재시험] |
| 2 | 엔진 `MEDIA_ALLOWED_ORIGINS` 에 `https://seminarz.vercel.app` | 같은 가이드 B-1 | Pi 포털 래퍼가 실제 앱을 이 주소에서 불러옴 [확인중 : Pi Browser Origin 실측] |
| 3 | Pi Browser 실기기 점검 10항목(Android 2대 + 가능하면 iOS) · 회의 부가 기능 F-08~F-17 점검표(엔진 무관 F-08·09·15 는 지금 바로) | [NIGHT_REPORT](NIGHT_REPORT_2026-10-27.md) 1절 · [DEVICE_TEST_F08-F17](DEVICE_TEST_F08-F17.md) | Phase 1·M5 통과 조건 — 인증·결제·페이지 변경은 실기기 전 완료로 보지 않음 |
| 4 | 위임 결정 검토(PRD 11절 D-1~D-19, 11.1절 D-20~D-28) · 확인 질문(PRD 9절) | PRD | 바꿀 결정만 지시 |
| 5 | ~~**MediaPipe 모델 파일 커밋**~~ **완료(`9ca1b26c`, 2026-10-27 — build·Vercel success)** — `public/mediapipe/models/selfie_segmenter_landscape.tflite`(`scripts/copy-mediapipe.mjs` 머리 주석의 curl 1줄) | 저장소 | 없으면 `pnpm build` 가 막혀 **Vercel 배포 실패**(이전 배포가 계속 서빙) |
| 6 | 집 PC 엔진을 **`8ab7e634` 빌드(v1.3.2 + 관리 API 무대 역할 조회 + M3 ⑥, sha256 `ce249a33a54bb5b54e3b08cef14d0d4d1d155cc761afbb8410d6c402fd56b94f`)**로 교체(절차 `galapagos-build/8ab7e634/SWAP.md`) + `MEDIA_ADMIN_SECRET` 은 **엔진·Vercel 양쪽에 같은 무작위 32바이트 이상 값, 또는 양쪽 다 뺌**(빼면 음성 자막 무대 관문 D-1·시간 소진 때 엔진 방 강제 종료가 꺼짐, 한쪽만 넣으면 발표자 자막 403·불일치 503 — 가이드 B-1) — `27a18b31`·v1.3.2 단독(`cf2fe499`)·v1.3.1 대체, v1.3(`45541466…`) 설치 금지 | `media/docs/HOME_NODE_GUIDE.md` 4.7·B-1 | `app.send` 중계 — 교체 전엔 자막·녹화·AI 회의록·번역·더빙이 숨겨짐(#1 을 대체) |
| 7 | **설정 완료(마스터 2026-10-29) — 로컬 키 API 200·모델 2종 확인, 운영 반영은 Vercel Redeploy 후** · Vercel `seminar` 환경변수 **`GEMINI_API_KEY`**(기존 발급 키)·필요 시 `SPEECH_MAX_MIN` | Vercel 설정 · [ENV_GUIDE](../../../docs/ENV_GUIDE.md) 3.6 | 미설정 = 외부 AI 기능(자막·회의록·번역·더빙) 숨김 |
| 8 | ~~`sql/008`·`009`·`010` DB 적용~~ **적용 완료(2026-10-27, dev→stg→prod 각 2회 멱등 확인 — 008 기존, 009·010_seminar_ai_use·010_seminar_vc_reserve 야간 시험 r1 통합 때)**, 010 DB 회귀 시험(`vc-reserve.db.test.mjs`) dev 통과. 남은 것 = Storage 비공개 버킷 `smn-note` | 마스터(Supabase 대시보드) | DA 사후 리뷰 : 009·010 함수, 010_seminar_ai_use 신규 표준단어(CHR·TTS) 칼럼 `trans_chr_cnt`·`tts_chr_cnt`. 키(`GEMINI_API_KEY`) 설정 전 선행 조건(010) 충족 |
| 9 | **구현(2026-10-29, `8ca821c7`) — 사용자별 상한 번역 10만·더빙 2만 자(env 조절), 번역 결과 서명 `smn-tr:<언어>` 분리. 기본값 확정(마스터 2026-10-29). 남은 위험 : 다계정 10개·동시 요청 1분치 초과** · **번역·더빙 사용자별 누적 상한 + 서명 용도 분리 결정**(감사 High 1) | NIGHT_REPORT_2026-10-28 ④ A-1 | 계정 몇 개로 세미나 번역·더빙 할당량을 다 써서 전원 기능을 끌 수 있음 — #7 키 설정 전 권장 |
| 10 | **종결(2026-10-29) — 마스터 결정 C : 비운영 스키마 폐지, `public` 만 사용**(PRD 7절 운영 규칙 : 시험 데이터 `[QA-…]`·논리삭제, `sql/` 운영 직접 적용 전 검토). `seminar_dev`·`seminar_stg` 는 `zz_retired_…_20261029` 로 이름만 바꿔 보관. 남은 일(마스터) : Vercel Production `APP_TIER` 비우기(현재 staging 추정)·Preview 의 `SUPABASE_SCHEMA=seminar_stg` 가 있으면 삭제 · 이전 기록 : 원인 확정(2026-10-29) — 로컬 `.env.local` STAGING 이 운영 프로젝트 `public` 을 가리킴 + `seminar_dev`·`seminar_stg` Exposed schemas 미등록·GRANT 부재(유력). 조치(마스터) : Vercel 운영 env 확인 → Exposed schemas·GRANT → `.env.local` 정정 · 배포본이 로컬 STAGING 과 같은 DB 를 읽는 원인 확인 + Exposed schemas(`seminar_dev`·`seminar_stg`) | Vercel env · Supabase API 설정 | 야간 E2E r1 : 시험 세미나가 운영 목록에 노출(논리삭제로 내림) [확인중 : 마스터] |
| 11 | 마스터 결정 묶음 A~F · 처리방침 [확인중 : 마스터] 6종 | NIGHT_REPORT_2026-10-28 ④ | 구현하지 않고 결정 대기 [확인중 : 마스터] |

## Phase 0 — 선결

- [x] 설정 한 세트 생성 — `node scripts/tenant-env.mjs new seminar.pi --port 3003` (2026-10-24)
- [x] PRD v1.0 확정(4절 로그인·5절 기능·8절 수익) — 2026-10-26 아소카 결정(마스터 위임), PRD 11절 D-1~D-11 · 세미나 모델 sql/004(smn_mst·smn_ptc, dev·stg·prod(public) 적용 2026-10-26)
- [x] Pi Developer Portal testnet 앱 등록 · API 키 · 도메인 검증 (ENV_GUIDE 3.2) — 검증 키 `/validation-key.txt` 배포·검증 완료(2026-10-25)
- [x] DB — 마스터가 seminar 전용 Supabase 프로젝트 1개(`SUPABASE_SCHEMA=public`)로 결정 → `db-migrate.mjs --app seminar --tier prod --db-url <Session pooler>` 로 baseline·pi_pymnt·`sql/001`(Google 연동) 적용(2026-10-25). ⚠ `.env.local` 의 `SEMINAR_*_DATABASE_URL` 은 Direct 호스트(IPv6 전용)라 이 PC 에서 ENOTFOUND — Session pooler(`aws-0-ap-northeast-2`) 사용
- [x] 로그인 3경로 이식(sitemap.pi 동일, LOGIN_PLAYBOOK) — Pi SDK·Pi Sign-In(OAuth)·Google+연동 코드, `pnpm build` 통과(2026-10-25)
- [x] 실기기 로그인 3경로 — Pi Browser 로그인·Google 로그인·Pi 계정 연동 성공(마스터 2026-10-25, `seminar0532.pinet.com`)
- [x] Vercel 프로젝트 `seminar`(Root `sitemap/seminar.pi`) — master push 배포 success(2026-10-25). 운영 브랜치 `prod/seminar` 분리는 [확인중 : 마스터]

**완료 기준** : PRD v1.0 · Pi 앱 ID · 비운영 DB · 스테이징 URL

## Phase M — 자체 화상 엔진 (기준점 = PRD 10절, 정본 = PRD_01)

| 단계 | 참고 | 핵심 산출 | 통과 기준 | 상태 |
|---|---|---|---|---|
| M0 실기기 관문 | — | 최소 앱 + `/lab/camera`(R-P6 가드), 기기 2대 직접 연결 | iOS·Android Pi Browser 영상 송수신·자동재생 | **✅ 통과(2026-10-27)** — Android 2대 로그인·화면 연결 성공(2026-10-25, 마스터) + **iOS 1대 시험 완료(2026-10-27, 마스터 보고)**. 나머지 단계(M1~M5·UI)는 추가 실기기 시험 필요 |
| M1 최소 SFU | Galène | Go 설치 · `media/` 모듈 · WebSocket 시그널링 · 1→2 전달 | LAN·LTE 영상 표시 | **LAN 통과(2026-10-25)** — Pi Browser 발표자 1 → 청중 2 영상 성공(마스터, 같은 와이파이·PC 엔진+cloudflared 터널). **LTE 대기**(VM C-5 필요). 구현 M1~M5 병합 `028c06b7`(단위시험 통과, M2~M5 실측 대기). **2026-10-27 집 PC 엔진 실기기** : 같은 집 PC 발표자 `ICE_FAILED` 끊김·청중 영상 없음 → LAN host 후보 Append 수정(`9d8eea86`, 회귀 시험 추가) — 엔진 교체 후 재시험 [확인중 : 실기기 재시험] |
| M2 안정화 | Galène | 패킷 캐시·NACK · PLI 조절 · TURN · `tc netem` | 3% 손실 회복 | **완료(마스터 확인 2026-10-29)** — **로컬 하네스 통과(2026-10-26)** — 프로세스 내 손실 모의 T2·T3·T6·T7 각 5회 20/20(`media/docs/M2_TURN_NETEM.md` 5절), 재전송 억제 하한 1.2RTT 수정, TURN 자격 증명 API(`a786ccfd`) → **화면 연결**(룸 입장 때 입장권과 병렬 발급, `a7affafb`. 실제 TURN 사용은 Cloudflare·coturn env 설정 시 — 없으면 STUN 만). **실네트워크 대기**(LTE·netem·실기기) |
| M3 구조 다듬기 | mediasoup | Router·Transport·Producer·Consumer 재구성 · API 문서 · 단위 테스트 | 회귀 0 | **진행(2026-10-29 갱신)** — ①②③⑤⑥ 구현·④ 서버 쪽 완료(paused 시작은 앱 프로토콜 제안으로 보류)·⑦ `-race` 1회만 남음(CGO 가능 환경). 2026-10-29 : LayerPolicy 비활성 레이어 제외(녹화 멈춤 방지)·미사용 `Room.Consume` 삭제, go test 15패키지 통과·관문 PASS. 이전 : ①②③⑤ 구현·④⑥⑦ 부분(`media/docs/M3_STATUS.md`), 의존 관문 시험 **PASS**(마스터 11간선 승인 2026-10-26), SIGNAL_API 코드 정합 9건. 동작 변경(④⑥)은 M2 실기기 뒤. SIGNAL_API v1.2(사회·레이아웃·발언자, `8dbabb3b`) |
| M4 품질 맞추기 | LiveKit | simulcast · 대역폭 추정 · 청중 30 · 나란히 측정 | PRD_01 4절 목표 | **완료(2026-10-29, 청중 30 시험 면제)** — 연결 품질 알림(`ntf score`)·타일 크기별 화질(setLayer)·청중 화질 상한 배포(`515446e3`). **청중 30·나란히 측정 = 마스터 결정 생략**(테스터 30명 모집 불가 — 통과가 아니라 면제, 실사용에서 품질 알림으로 관찰) |
| M5 서비스화 | — | 입장권=Pi 결제 · 방 관리 · 모니터링 · 녹화 | PRD F-04·05·07 · 실기기 결제·입장 | **진행(2026-10-27)** — 목록·상세·개최·Pi 결제 입장·입장권 등록 확인·상태 전이(LIVE·ENDED) 배포(`515446e3`~`e04839d2`), 브라우저 QA 2차 7/7. **실기기 결제·입장 ✓(마스터 2026-10-29)**, 녹화·모니터링 대기 — F-07 다시보기 드롭(마스터 2026-10-29) |
| (화면) 룸 S3·S4 | Google Meet 패턴 + LiveKit·Jitsi 소스 분석 | 대기실·무대·하단 바 → 채팅·손들기·반응·무대 초대·화면공유·세미나 종료 → 사회(v1.2) | 실기기 입장·송수신·소리 | **완료(마스터 확인 2026-10-29)** — [UI 설계서 v1.0](ui-design/ui-design.md)(`c16bc230`, 마스터 결정 8건 13절) → M1~M2 화면(`a7affafb`) → v1.1·v1.2(`8eed64d2`·`74e2c7cd`), 브라우저 QA ✓. **실기기 대기**(iOS 자동재생 포함) |

### M0 할 일

- [x] (서비스) seminar.pi 최소 Next 앱 골격(화면·i18n ko/en·env, @pi/* 는 M1·M5) · `pnpm build` 통과 (2026-10-24)
- [x] (서비스) `/lab/camera` 시험 화면 — 카메라·마이크 미리보기·전후면 전환, 기기 2대 직접 연결(Supabase Realtime broadcast, id 작은 쪽 offer), 결과 복사. 운영 빌드는 `LAB_ENABLED=1` 일 때만(R-P6) (2026-10-24)
- [x] (마스터) Vercel env : `LAB_ENABLED=1`, `NEXT_PUBLIC_LAB_SUPABASE_URL`·`NEXT_PUBLIC_LAB_SUPABASE_PUBLISHABLE_KEY`(pi-nonprod — ENV_GUIDE 3.4)
- [x] (마스터) Vercel 프로젝트 생성(Root `sitemap/seminar.pi`) (2026-10-25)
- [x] (마스터) Pi Browser 실기기 시험 — Android 2대 로그인·화면 연결 성공(2026-10-25)
- [ ] (마스터) Pi Browser iOS 실기기 시험 — iOS ↔ Android 화면 연결(카메라 권한·영상 자동재생이 iOS WebView 에서 다를 수 있음)
- [ ] (마스터) 호스팅 결정 — 시험 = **집 상시 PC 엔진**(신호 cloudflared 터널 + 영상 UDP 7882, `media/docs/HOME_NODE_GUIDE.md`, 비용 0원) 운영 중. 운영 호스팅(VM 리전·사양)은 [확인중 : 마스터] — 기한 : M1 외부(LTE) 시험 전까지 — 가정용 회선 약관·정전·Pi Node 대역폭 공유 때문에 운영은 VM 권장(가이드 7·8절)

## Phase 1 — MVP

- [x] 앱 골격 · i18n ko/en · env · `pnpm build` 통과 (2026-10-24) — 로그인 3경로는 sitemap.pi 와 같게 이식(2026-10-25)
- [x] Pi Browser 실기기 로그인 3경로 (2026-10-25, Phase 0)
- [ ] 화면 5종 — S1 목록(탭 3·페이지 이동)·S2 상세(무료 입장·Pi 결제 입장)·S3/S4 룸·S5 개최(ADMIN) — 구현·브라우저 QA 2차 7/7 ✓(2026-10-27), **실기기 대기**
- [ ] Pi 입장 결제 — approve/complete/cancel, 서버 금액 재검증, 결제 완료+참가 등록 한 트랜잭션(sql/007)·이중 결제 인덱스(sql/006) — 구현·브라우저 QA ✓(2026-10-27), **실기기 결제 대기**
- [ ] **Pi Browser 실기기 결제·입장** — NIGHT_REPORT 1절 10항목
- [ ] 모니터링 연결(TODO 7단계) — 미착수(`@pi/mon` 미배선)

## Phase X — 회의 부가 기능(v2)

계획 = `.claude/plans/pasted-content-id-66a2-eager-clock.md`(마스터 결정 M-1~M-4, 아소카 결정 D-20~D-28 = PRD 11.1절) · 화면 = UI 설계서 15절 · 근거 = [REA_04_MEET_FEATURES](rea/REA_04_MEET_FEATURES.md) · 상태 표기 : 구현 = master 통합 / 검토 = 독립 코드 검토 결함 반영 / QA = 브라우저 QA(Playwright 가짜 카메라) / 실기기 = Pi Browser

| ID | 기능 | 구현 | 검토 | QA | 실기기 | 커밋(병합) |
|---|---|---|---|---|---|---|
| F-U | 공통 기반(엔진 `app.send` v1.3.1·외부 AI·음성 조각·확장 지점·동의·sql/008) | ✓ | ✓ | ② 외부 AI·음성 조각·동의·DB ✓ 완료(2026-10-29, 키 설정) · ① 엔진 신호 통로 대기 | 대기(엔진 교체 뒤 — DB 적용 완료) | `21844766`·`4e33bbad`·`2b15fb5e`·`89650341`·`c7809352`·`72b5fb53`·`057c12de`·`13e54040` (`0e0390bb`·`c043b76b`·`a7f6ae43`) |
| F-08 | 일정·공유(캘린더 링크·.ics·메일 초대) | ✓ | ✓ | 대기 | 대기 | `67a8d5f9` (`8366a148`) |
| F-09 | 소음 줄이기·조명 보정 | ✓ | ✓ | 대기 | 대기 | `d469aab1`·`92df9468`·`0c4f32d7` (`7a0af415`) |
| F-10 | 실시간 자막 | ✓ | ✓ | 대기 | 대기(엔진·키) | `d469aab1`·`92df9468` (`7a0af415`) |
| F-11 | 설문·Q&A·출석 | ✓ | ✓ | ✓ 완료 판정(마스터 2026-10-29) | ✓ Pi Browser 실기기(마스터 2026-10-29) | `bb07eb80` (`1a74a42d`) |
| F-12 | 배경 효과 | ✓ | ✓ | ✓ 완료 판정(마스터 2026-10-29) | 대기(Pi Browser 실기기 — 모델 파일 `9ca1b26c` 완료) | `290b8517`·`12fe33f5`·`0059f48d`·`c6a7c057` (`df0c31f5`) |
| F-13 | 발표자 로컬 녹화·'녹화 중' 배지 | ✓ | ✓ | ✓ 완료 판정(마스터 2026-10-29) | ✓ 일반 브라우저 mp4(마스터 2026-10-29) · Pi Browser 는 파일 저장 불가 → 녹화 시 '일반 브라우저에서만' 안내 ✓(마스터 결정·실기기 확인 2026-10-29) | `5cfd6d53`·`abab8f4e` (`dd8119f8`) |
| F-14 | AI 회의록 | ✓ | ✓ | 대기 | 대기(엔진·키·DB·버킷) | `62a0d85f`·`31cd5a72` (`dd602fe0`) |
| F-15 | 대면 회의 노트(ADMIN) | ✓ | ✓ | 대기 | 대기(키·DB) | `800d0144` (`0eb83e51`) |
| F-16 | 번역 자막 | ✓ | ✓ | 대기 | 대기(엔진·키) | `4a493a3a` (`1ca342ec`) |
| F-17 | 음성 번역 듣기(더빙) | ✓ | ✓ | 대기 | 대기(엔진·키) | `4bb61455`·`717161a2` (`af8f572b`) |

- [x] 기능 10종 + 공통 기반 구현·독립 검토·master 통합(2026-10-27)
- [x] REA 회귀 비교 — 기존 3장면 화면 회귀 0·오류 0, 룸 첫 화면 JS +66,186 B(배경 엔진은 지연 로드 유지)(REA_04_MEET_FEATURES 6절)
- [x] MediaPipe 모델 파일 커밋 → `pnpm build` 통과 → push → `Vercel – seminar: success` 개별 확인(`9ca1b26c`, 2026-10-27)
- [ ] 엔진 `27a18b31` 빌드 교체(HOME_NODE_GUIDE 4.7)·`MEDIA_ADMIN_SECRET` · ~~sql/008·009·010 적용~~(2026-10-27 완료) → `GEMINI_API_KEY` Vercel 설정 · `smn-note` 버킷
- [x] 야간 시험 r1~r6(2026-10-27 23:06 ~ 10-28 04:51) — 테스터 10명 59건 병합, 라운드마다 build·Vercel success, E2E r5 39/39·r6 38/39(재시험 통과), REA 3장면 회귀 오류 0([NIGHT_REPORT_2026-10-28](NIGHT_REPORT_2026-10-28.md))
- [x] 브라우저 QA(가짜 카메라 3창 — 자막·번역·더빙·설문·Q&A·녹화·배경·회의록·대면 노트·캘린더 링크)
- [ ] Pi Browser 실기기(Android 2대 + iOS) — 실기기 전 판정 최대 CONDITIONAL
- [x] pi-mainnet-listing-auditor·kisa-web-security-auditor 점검(2026-10-28) — 레드라인 0 · KISA High 2·Medium 2·Low 4 중 High 1·2 남음(막힌 것 #9·#6)
