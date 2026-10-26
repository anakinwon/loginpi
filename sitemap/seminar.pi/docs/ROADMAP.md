# ROADMAP: seminar.pi

> 작성일 2026-10-24 · 요구사항 `PRD.md` · 공통 단계 정본 [TODO 목록](../../multitenant_create_TODO-List.md)

## 진행률 요약

| Phase | 이름 | 상태 |
|---|---|---|
| 0 | 선결(결정·환경·포털·DB) | **진행중** |
| 1 | MVP(로그인 + 고유 기능 1개 + 결제 1개) | 대기 — PRD v1.0 확정 후 |
| M | 자체 화상 엔진 M0~M5([PRD_01](PRD_01_MEDIA_ENGINE.md) 5절) | **M0 Android 통과(iOS 대기) → M1 착수 가능** — 단계별 통과 기준, 건너뛰기 금지 |
| 2 | 수익 | 대기 |
| 3 | 등재(A-1~A-7·실기기) | 대기 |

## Phase 0 — 선결

- [x] 설정 한 세트 생성 — `node scripts/tenant-env.mjs new seminar.pi --port 3003` (2026-10-24)
- [x] PRD v1.0 확정(4절 로그인·5절 기능·8절 수익) — 2026-10-26 아소카 결정(마스터 위임), PRD 11절 D-1~D-10 · 세미나 모델 sql/004
- [x] Pi Developer Portal testnet 앱 등록 · API 키 · 도메인 검증 (ENV_GUIDE 3.2) — 검증 키 `/validation-key.txt` 배포·검증 완료(2026-10-25)
- [x] DB — 마스터가 seminar 전용 Supabase 프로젝트 1개(`SUPABASE_SCHEMA=public`)로 결정 → `db-migrate.mjs --app seminar --tier prod --db-url <Session pooler>` 로 baseline·pi_pymnt·`sql/001`(Google 연동) 적용(2026-10-25). ⚠ `.env.local` 의 `SEMINAR_*_DATABASE_URL` 은 Direct 호스트(IPv6 전용)라 이 PC 에서 ENOTFOUND — Session pooler(`aws-0-ap-northeast-2`) 사용
- [x] 로그인 3경로 이식(sitemap.pi 동일, LOGIN_PLAYBOOK) — Pi SDK·Pi Sign-In(OAuth)·Google+연동 코드, `pnpm build` 통과(2026-10-25)
- [x] 실기기 로그인 3경로 — Pi Browser 로그인·Google 로그인·Pi 계정 연동 성공(마스터 2026-10-25, `seminar0532.pinet.com`)
- [x] Vercel 프로젝트 `seminar`(Root `sitemap/seminar.pi`) — master push 배포 success(2026-10-25). 운영 브랜치 `prod/seminar` 분리는 [TBD : 마스터]

**완료 기준** : PRD v1.0 · Pi 앱 ID · 비운영 DB · 스테이징 URL

## Phase M — 자체 화상 엔진 (기준점 = PRD 10절, 정본 = PRD_01)

| 단계 | 참고 | 핵심 산출 | 통과 기준 | 상태 |
|---|---|---|---|---|
| M0 실기기 관문 | — | 최소 앱 + `/lab/camera`(R-P6 가드), 기기 2대 직접 연결 | iOS·Android Pi Browser 영상 송수신·자동재생 | **Android 통과(2026-10-25)** — Android 2대 로그인·화면 연결 성공(마스터). **iOS 미시험** — M1 완료 판정 전 iOS 1대 이상 시험 필수 |
| M1 최소 SFU | Galène | Go 설치 · `media/` 모듈 · WebSocket 시그널링 · 1→2 전달 | LAN·LTE 영상 표시 | **LAN 통과(2026-10-25)** — Pi Browser 발표자 1 → 청중 2 영상 성공(마스터, 같은 와이파이·PC 엔진+cloudflared 터널). **LTE 대기**(VM C-5 필요). 구현 M1~M5 병합 `028c06b7`(단위시험 통과, M2~M5 실측 대기) |
| M2 안정화 | Galène | 패킷 캐시·NACK · PLI 조절 · TURN · `tc netem` | 3% 손실 회복 | **로컬 하네스 통과(2026-10-26)** — 프로세스 내 손실 모의 T2·T3·T6·T7 각 5회 20/20(`media/docs/M2_TURN_NETEM.md` 5절), 재전송 억제 하한 1.2RTT 수정, TURN 자격 증명 API(`a786ccfd`, 화면 연결 전). **실네트워크 대기**(LTE·netem·실기기) |
| M3 구조 다듬기 | mediasoup | Router·Transport·Producer·Consumer 재구성 · API 문서 · 단위 테스트 | 회귀 0 | **진행(2026-10-26)** — ①②③⑤ 구현·④⑥⑦ 부분(`media/docs/M3_STATUS.md`), 의존 관문 시험 **PASS**(마스터 11간선 승인 2026-10-26), SIGNAL_API 코드 정합 9건. 동작 변경(④⑥)은 M2 실기기 뒤 |
| M4 품질 맞추기 | LiveKit | simulcast · 대역폭 추정 · 청중 30 · 나란히 측정 | PRD_01 4절 목표 | 대기 |
| M5 서비스화 | — | 입장권=Pi 결제 · 방 관리 · 모니터링 · 녹화 | PRD F-04·05·07 · 실기기 결제·입장 | 대기 |

### M0 할 일

- [x] (서비스) seminar.pi 최소 Next 앱 골격(화면·i18n ko/en·env, @pi/* 는 M1·M5) · `pnpm build` 통과 (2026-10-24)
- [x] (서비스) `/lab/camera` 시험 화면 — 카메라·마이크 미리보기·전후면 전환, 기기 2대 직접 연결(Supabase Realtime broadcast, id 작은 쪽 offer), 결과 복사. 운영 빌드는 `LAB_ENABLED=1` 일 때만(R-P6) (2026-10-24)
- [x] (마스터) Vercel env : `LAB_ENABLED=1`, `NEXT_PUBLIC_LAB_SUPABASE_URL`·`NEXT_PUBLIC_LAB_SUPABASE_PUBLISHABLE_KEY`(pi-nonprod — ENV_GUIDE 3.4)
- [x] (마스터) Vercel 프로젝트 생성(Root `sitemap/seminar.pi`) (2026-10-25)
- [x] (마스터) Pi Browser 실기기 시험 — Android 2대 로그인·화면 연결 성공(2026-10-25)
- [ ] (마스터) Pi Browser iOS 실기기 시험 — iOS ↔ Android 화면 연결(카메라 권한·영상 자동재생이 iOS WebView 에서 다를 수 있음)
- [ ] (마스터) 호스팅 결정 — M1 외부 시험 전까지

## Phase 1 — MVP

- [ ] 앱 골격(sitemap.pi 복제 지점 — TODO 3단계) · `pnpm build` 통과
- [ ] 모니터링 연결(TODO 7단계)
- [ ] Pi Browser 실기기 로그인·결제
