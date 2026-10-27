# ROADMAP: seminar.pi

> 작성일 2026-10-24 · 갱신 2026-10-27 · 요구사항 `PRD.md` · 공통 단계 정본 [TODO 목록](../../multitenant_create_TODO-List.md) · 화면용 요약 = `src/data/progress.ts`(`/progress`, 이 문서와 같이 갱신)

## 진행률 요약

| Phase | 이름 | 상태 |
|---|---|---|
| 0 | 선결(결정·환경·포털·DB) | **완료(조건부, 2026-10-26)** — PRD v1.0 ✓ · Pi 앱 ✓ · 비운영 DB·스테이징 URL 은 **대체 충족** : 비운영 스키마는 만들었으나 앱 tier 는 `public` 하나(PRD 7절), 스테이징 = master 배포 `seminarz.vercel.app` 하나(운영 브랜치 분리 [확인중 : 마스터]) [확인중 : 마스터]. 운영 호스팅 [확인중 : 마스터] |
| 1 | MVP(로그인 + 고유 기능 1개 + 결제 1개) | **진행 — 구현·브라우저 QA 통과, 실기기 대기** : 로그인 실기기 ✓ · 화면 5종(S1~S5)·화상 룸·Pi 결제 입장 구현(브라우저 QA 2차 7/7, 2026-10-27) · **Pi Browser 실기기 결제·입장 미검증** |
| M | 자체 화상 엔진 M0~M5([PRD_01](PRD_01_MEDIA_ENGINE.md) 5절) | **M0 Android ✓(iOS 대기) · M1 LAN ✓ · M2 로컬 하네스 ✓ · M3~M5 진행** — 실네트워크(LTE·netem)·청중 30·실기기 대기. 단계별 통과 기준, 건너뛰기 금지 |
| 2 | 수익 | 대기 — R1 입장료는 구현(정산 F-06·수수료율 PRD 9절 #3 대기) |
| 3 | 등재(A-1~A-7·실기기) | 대기 |

## 지금 막힌 것 — 마스터 확인 순서 (2026-10-27)

| # | 할 일 | 어디서 | 왜 |
|---|---|---|---|
| 1 | 집 PC 엔진을 **`9d8eea86` 빌드**로 교체 | `media/docs/HOME_NODE_GUIDE.md` 4.7 | 2026-10-27 실기기 시험에서 같은 집 PC 발표자가 잠깐 접속 뒤 `ICE_FAILED` 로 끊기고 청중 영상이 없었음 → 엔진이 LAN 주소도 host 후보로 알리도록 수정(Append) — 유력 원인 [확인중 : 실기기 재시험] |
| 2 | 엔진 `MEDIA_ALLOWED_ORIGINS` 에 `https://seminarz.vercel.app` | 같은 가이드 B-1 | Pi 포털 래퍼가 실제 앱을 이 주소에서 불러옴 [확인중 : Pi Browser Origin 실측] |
| 3 | Pi Browser 실기기 점검 10항목(Android 2대 + 가능하면 iOS) | [NIGHT_REPORT](NIGHT_REPORT_2026-10-27.md) 1절 | Phase 1·M5 통과 조건 — 인증·결제·페이지 변경은 실기기 전 완료로 보지 않음 |
| 4 | 위임 결정 검토(PRD 11절 D-1~D-19) · 확인 질문(PRD 9절) | PRD | 바꿀 결정만 지시 |

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
| M0 실기기 관문 | — | 최소 앱 + `/lab/camera`(R-P6 가드), 기기 2대 직접 연결 | iOS·Android Pi Browser 영상 송수신·자동재생 | **Android 통과(2026-10-25)** — Android 2대 로그인·화면 연결 성공(마스터). **iOS 미시험** — M1 완료 판정 전 iOS 1대 이상 시험 필수 |
| M1 최소 SFU | Galène | Go 설치 · `media/` 모듈 · WebSocket 시그널링 · 1→2 전달 | LAN·LTE 영상 표시 | **LAN 통과(2026-10-25)** — Pi Browser 발표자 1 → 청중 2 영상 성공(마스터, 같은 와이파이·PC 엔진+cloudflared 터널). **LTE 대기**(VM C-5 필요). 구현 M1~M5 병합 `028c06b7`(단위시험 통과, M2~M5 실측 대기). **2026-10-27 집 PC 엔진 실기기** : 같은 집 PC 발표자 `ICE_FAILED` 끊김·청중 영상 없음 → LAN host 후보 Append 수정(`9d8eea86`, 회귀 시험 추가) — 엔진 교체 후 재시험 [확인중 : 실기기 재시험] |
| M2 안정화 | Galène | 패킷 캐시·NACK · PLI 조절 · TURN · `tc netem` | 3% 손실 회복 | **로컬 하네스 통과(2026-10-26)** — 프로세스 내 손실 모의 T2·T3·T6·T7 각 5회 20/20(`media/docs/M2_TURN_NETEM.md` 5절), 재전송 억제 하한 1.2RTT 수정, TURN 자격 증명 API(`a786ccfd`) → **화면 연결**(룸 입장 때 입장권과 병렬 발급, `a7affafb`. 실제 TURN 사용은 Cloudflare·coturn env 설정 시 — 없으면 STUN 만). **실네트워크 대기**(LTE·netem·실기기) |
| M3 구조 다듬기 | mediasoup | Router·Transport·Producer·Consumer 재구성 · API 문서 · 단위 테스트 | 회귀 0 | **진행(2026-10-26)** — ①②③⑤ 구현·④⑥⑦ 부분(`media/docs/M3_STATUS.md`), 의존 관문 시험 **PASS**(마스터 11간선 승인 2026-10-26), SIGNAL_API 코드 정합 9건. 동작 변경(④⑥)은 M2 실기기 뒤. SIGNAL_API v1.2(사회·레이아웃·발언자, `8dbabb3b`) |
| M4 품질 맞추기 | LiveKit | simulcast · 대역폭 추정 · 청중 30 · 나란히 측정 | PRD_01 4절 목표 | **진행(2026-10-27)** — 연결 품질 알림(`ntf score`)·타일 크기별 화질(setLayer)·청중 화질 상한 배포(`515446e3`). 청중 30·나란히 측정 대기 |
| M5 서비스화 | — | 입장권=Pi 결제 · 방 관리 · 모니터링 · 녹화 | PRD F-04·05·07 · 실기기 결제·입장 | **진행(2026-10-27)** — 목록·상세·개최·Pi 결제 입장·입장권 등록 확인·상태 전이(LIVE·ENDED) 배포(`515446e3`~`e04839d2`), 브라우저 QA 2차 7/7. **실기기 결제·입장 대기**, 녹화·모니터링 대기 |
| (화면) 룸 S3·S4 | Google Meet 패턴 + LiveKit·Jitsi 소스 분석 | 대기실·무대·하단 바 → 채팅·손들기·반응·무대 초대·화면공유·세미나 종료 → 사회(v1.2) | 실기기 입장·송수신·소리 | **진행** — [UI 설계서 v1.0](ui-design/ui-design.md)(`c16bc230`, 마스터 결정 8건 13절) → M1~M2 화면(`a7affafb`) → v1.1·v1.2(`8eed64d2`·`74e2c7cd`), 브라우저 QA ✓. **실기기 대기**(iOS 자동재생 포함) |

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
