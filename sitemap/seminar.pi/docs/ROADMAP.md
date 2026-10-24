# ROADMAP: seminar.pi

> 작성일 2026-10-24 · 요구사항 `PRD.md` · 공통 단계 정본 [TODO 목록](../../multitenant_create_TODO-List.md)

## 진행률 요약

| Phase | 이름 | 상태 |
|---|---|---|
| 0 | 선결(결정·환경·포털·DB) | **진행중** |
| 1 | MVP(로그인 + 고유 기능 1개 + 결제 1개) | 대기 — PRD v1.0 확정 후 |
| M | 자체 화상 엔진 M0~M5([PRD_01](PRD_01_MEDIA_ENGINE.md) 5절) | **M0 준비** — 단계별 통과 기준, 건너뛰기 금지 |
| 2 | 수익 | 대기 |
| 3 | 등재(A-1~A-7·실기기) | 대기 |

## Phase 0 — 선결

- [x] 설정 한 세트 생성 — `node scripts/tenant-env.mjs new seminar.pi --port 3003` (2026-10-24)
- [ ] PRD v1.0 확정(4절 로그인·5절 기능·8절 수익)
- [ ] Pi Developer Portal testnet 앱 등록 · API 키 · 도메인 검증 (ENV_GUIDE 3.2)
- [ ] pi-nonprod Exposed schemas `seminar_dev`·`seminar_stg` + `db-migrate.mjs --app seminar --tier dev`
- [ ] Vercel 프로젝트(Root Directory `sitemap/seminar.pi`, 운영 브랜치 `prod/seminar`)

**완료 기준** : PRD v1.0 · Pi 앱 ID · 비운영 DB · 스테이징 URL

## Phase M — 자체 화상 엔진 (기준점 = PRD 10절, 정본 = PRD_01)

| 단계 | 참고 | 핵심 산출 | 통과 기준 | 상태 |
|---|---|---|---|---|
| M0 실기기 관문 | — | 최소 앱 + `/lab/camera`(R-P6 가드), 기기 2대 직접 연결 | iOS·Android Pi Browser 영상 송수신·자동재생 | **화면 완료 · 실기기 시험 대기** |
| M1 최소 SFU | Galène | Go 설치 · `media/` 모듈 · WebSocket 시그널링 · 1→2 전달 | LAN·LTE 영상 표시 | 대기 |
| M2 안정화 | Galène | 패킷 캐시·NACK · PLI 조절 · TURN · `tc netem` | 3% 손실 회복 | 대기 |
| M3 구조 다듬기 | mediasoup | Router·Transport·Producer·Consumer 재구성 · API 문서 · 단위 테스트 | 회귀 0 | 대기 |
| M4 품질 맞추기 | LiveKit | simulcast · 대역폭 추정 · 청중 30 · 나란히 측정 | PRD_01 4절 목표 | 대기 |
| M5 서비스화 | — | 입장권=Pi 결제 · 방 관리 · 모니터링 · 녹화 | PRD F-04·05·07 · 실기기 결제·입장 | 대기 |

### M0 할 일

- [x] (서비스) seminar.pi 최소 Next 앱 골격(화면·i18n ko/en·env, @pi/* 는 M1·M5) · `pnpm build` 통과 (2026-10-24)
- [x] (서비스) `/lab/camera` 시험 화면 — 카메라·마이크 미리보기·전후면 전환, 기기 2대 직접 연결(Supabase Realtime broadcast, id 작은 쪽 offer), 결과 복사. 운영 빌드는 `LAB_ENABLED=1` 일 때만(R-P6) (2026-10-24)
- [ ] (마스터) Vercel env : `LAB_ENABLED=1`, `NEXT_PUBLIC_LAB_SUPABASE_URL`·`NEXT_PUBLIC_LAB_SUPABASE_PUBLISHABLE_KEY`(pi-nonprod — ENV_GUIDE 3.4)
- [ ] (마스터) Vercel 프로젝트 생성(Root `sitemap/seminar.pi`) — 스테이징 URL 확보 (HTTPS 필요)
- [ ] (마스터) Pi Browser iOS·Android 실기기 시험 → 결과 TROUBLESHOOT 기록
- [ ] (마스터) 호스팅 결정 — M1 외부 시험 전까지

## Phase 1 — MVP

- [ ] 앱 골격(sitemap.pi 복제 지점 — TODO 3단계) · `pnpm build` 통과
- [ ] 모니터링 연결(TODO 7단계)
- [ ] Pi Browser 실기기 로그인·결제
