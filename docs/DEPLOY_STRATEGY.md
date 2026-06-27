# 배포 전략 — Staging / 운영 2-프로젝트 모델

> 코드 tier 라우팅: `src/lib/db-env.ts`. DB 환경변수 설정: `docs/INFRA_DB_TIERS.md`.
> 본 문서는 **Vercel 프로젝트 구조 + 브랜치 승격 + 컷오버 절차**.

## 핵심 원칙

⛔ **운영(메인넷)은 `master` 자동배포 금지.** 멀티세션이 master에 자유롭게 push하므로, 운영이 master 자동배포면 WIP 커밋이 메인넷에 바로 나가 핵심가치(로그인·결제)를 깬다. → **운영은 `production` 브랜치로 게이팅**.

## 프로젝트 구조 (2개)

| | **프로젝트 A (현재)** | **프로젝트 B (신규)** |
|---|---|---|
| 역할 | **Staging WAS** | **운영 WAS** |
| Vercel 프로젝트 | loginpi (기존) | 신규 생성 |
| Production Branch | `master` | **`production`** |
| 배포 | master push → **자동** | production 머지 → **게이팅** |
| tier | staging (`APP_TIER=staging` ✅ 적용됨) | prod (VERCEL_ENV=production 자동) |
| DB | 개발DB(현재 폴백) | 운영DB(신규 Supabase) |
| Pi | Testnet | **Mainnet** |
| 도메인 | **loginpi.vercel.app** | **cafepi.vercel.app**(+ 향후 커스텀 E-4) |
| 배너 | 🧪 STAGING 노출 | 없음(운영) |

> 같은 GitHub repo를 두 Vercel 프로젝트에 연결한다(Vercel은 repo 다중 연결 지원). 각자 다른 Production Branch를 본다.

## 🩺 현재 상태 자가진단 — 프로젝트 1개? 2개?

`cafepi`·`loginpi`가 **별도 프로젝트 2개**인지 **한 프로젝트에 도메인 별칭 2개**인지부터 확정해야 한다(분리 절차가 갈림).

- **진단법 A (배너)**: `loginpi`에 `APP_TIER=staging`이 적용돼 🧪 배너가 뜬다. 이 상태에서 **`cafepi.vercel.app`에도 🧪 STAGING 배너가 뜨면 → 같은 프로젝트(별칭 2개)**. 안 뜨면 → 별도 프로젝트 2개.
- **진단법 B (대시보드)**: Vercel 프로젝트 목록에서 두 도메인이 **같은 프로젝트의 Domains** 아래 있으면 1개, 서로 다른 프로젝트면 2개.

| 진단 결과 | Phase 1에서 할 일 |
|---|---|
| **별도 2개** | 재설정만 — `cafepi` 프로젝트의 Production Branch를 `production`으로 변경. 생성 불필요. |
| **1개 + 별칭** | 분리 필요 — 신규 프로젝트 생성 후 `cafepi.vercel.app` 도메인을 그쪽으로 이전. |

## 🪜 단계별 전환 로드맵 (현재 "둘 다 동일" → 2단계 분리)

**Phase 1 — 파이프라인 분리 (지금·안전·무중단)**
> `production` 브랜치는 현재 `master`와 동일 커밋(`c508cea`)이라, 게이트를 걸어도 cafepi가 서빙하는 내용은 안 바뀐다.
1. 자가진단으로 토폴로지 확정.
2. `cafepi`(운영) 프로젝트: **Settings → Git → Production Branch = `production`** (master 아님). [1개+별칭이면: 먼저 신규 프로젝트 생성 → cafepi 도메인 이전]
3. `loginpi`(staging) 프로젝트: Production Branch = `master` 유지 + `APP_TIER=staging`(적용됨).
4. **검증**: `master`에 빈 커밋 push → loginpi만 재배포, cafepi 불변. `production` 머지 → cafepi 재배포. ✅ WIP가 운영에 새지 않음.

**Phase 2 — 환경 마커 분리 (tier)**
- loginpi: tier=staging → 🧪 배너 노출(완료). cafepi: tier=prod(`APP_TIER` 미설정) → 배너 없음.
- `src/lib/db-env.ts` 라우팅 확인. 1개+별칭이었다면 분리 후 cafepi에서 `APP_TIER` 제거 필수(안 그러면 운영에 🧪 배너).

**Phase 3 — 데이터/네트워크 컷오버 (운영DB·메인넷 준비 완료 시)**
- cafepi env 스왑: 운영DB(`docs/PROD_DB_SETUP.md`) · `NEXT_PUBLIC_PI_SANDBOX=false` · 메인넷 `PI_API_KEY`/`PI_WALLET_PRIVATE_SEED` · `CRON_SECRET` 활성.
- P0 실기기 재검증 → 등재. (아래 컷오버 시퀀스)

### Pre-cutover env 스캐폴드 (DB 미정 시 — cafepi를 빌드 그린 유지)
> 빌드가 `src/env.ts`(t3-env)로 필수 env를 검증 → SUPABASE 비우면 빌드 실패. 그래서 컷오버 전까지 **개발DB+sandbox**로 "운영 게이팅된 그림자"로 띄운다(메인넷 아님·공지 금지).

| 변수 | Phase 1~2 (그림자) | Phase 3 (컷오버) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` | 개발DB(임시) | **운영DB** |
| `NEXT_PUBLIC_PI_SANDBOX` | `true` | **`false`** |
| `PI_API_KEY`/`PI_WALLET_PRIVATE_SEED` | Testnet/생략 | **메인넷** |
| `CRON_SECRET` | **미설정(cron 휴면)** | **설정(정산 활성)** |
| `AUTH_SECRET`/`PI_SESSION_SECRET`/`GOOGLE_*`/`TELEGRAM_*`/`GEMINI_*`/`CLOUDFLARE_TURN_*` | 지금 설정 | 유지 |
| `APP_TIER` | ⛔ 미설정(prod 자동) | ⛔ 미설정 |

## 🚀 일상 승격(promote) 워크플로우

```
feature/* ─PR─▶ master ─(staging 검증 후)─▶ production
                loginpi 자동배포            cafepi 배포
```

- **개발/머지는 평소처럼 `master`** (staging에 자동 반영 → loginpi에서 테스트).
- **운영 배포는 의도적 승격으로만**: `master` → `production` 머지(=cafepi 배포).
- 승격 명령(작업트리 안 건드림, fast-forward만 — production이 master 조상일 때만 통과 = 안전):
  ```bash
  node scripts/promote-to-prod.mjs        # 미리보기(무엇이 운영에 나갈지)
  node scripts/promote-to-prod.mjs --yes  # 실제 승격(push origin master:production)
  ```
- ⛔ `production`에 **직접 WIP push 금지**. 승격은 검증된 master만.

## 브랜치 · 승격 흐름

```
feature/*  ──(PR)──▶  master  ──(검증 후 머지)──▶  production
   (개발)            (Staging 자동배포)            (운영 게이팅 배포)
                      Testnet·개발DB                Mainnet·운영DB
```

1. **개발**: `feature/*` 작업.
2. **Staging**: `master` push → 프로젝트 A 자동배포(Testnet). 여기서 검증.
3. **운영 승격**: 검증 끝나면 `master` → `production` 브랜치 머지 → 프로젝트 B 배포(Mainnet). P0 실기기 재검증.
4. 멀티세션 "전부 master" 파일럿은 **staging까지만** 적용. 운영은 의도적 머지로만.

## 신규 운영 프로젝트 프로비저닝 (마스터, Vercel 대시보드)

> ⚠️ Vercel 계정 권한 필요 — 아래는 마스터 직접 작업.

1. **Add New → Project** → 같은 repo(loginpi) Import → 프로젝트명 예: `pycafe-prod`
2. **Settings → Git → Production Branch = `production`** (master 아님!)
3. **Settings → Environment Variables (Production)**: 메인넷 전체 세트
   - `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` = **운영DB**
   - `NEXT_PUBLIC_PI_SANDBOX=false` · `PI_API_KEY`(메인넷) · `PI_WALLET_PRIVATE_SEED`(메인넷 지갑)
   - `PI_SESSION_SECRET` · `AUTH_SECRET` · `CRON_SECRET`(신규 생성)
   - 기타 기존 시크릿(`GOOGLE_*`·`TELEGRAM_*`·`GEMINI_*`·`CLOUDFLARE_TURN_*` 등)
   - ⛔ `APP_TIER`는 **설정 안 함**(VERCEL_ENV=production → tier=prod 자동)
   - 상세: `docs/INFRA_DB_TIERS.md` Step 2
4. **Settings → Domains**: 신규 커스텀 도메인 연결(E-4, 'pi' 미포함)
5. `production` 브랜치 생성·푸시 → 첫 배포

## Cron (양쪽 동작 · 각자 DB)

`vercel.json`의 6개 cron은 **두 프로젝트 모두** 자기 Production에서 실행:
- 프로젝트 A: Testnet·개발DB 대상(테스트, 안전)
- 프로젝트 B: Mainnet·운영DB 대상(실거래 — settle 등)
- 양쪽 다 `CRON_SECRET` 필수. (cron 스케줄은 repo 공유라 동일)

## 도메인
- 운영: 신규 커스텀 도메인(메인넷 Developer Portal 등록 URL과 일치, E-3·E-4).
- Staging: loginpi.vercel.app 유지(또는 staging.* 서브도메인).

## 롤백
- Vercel **Instant Rollback**: 프로젝트별 이전 배포를 Production으로 즉시 승격(1분).
- DB는 코드 롤백과 별개 — 보상 마이그레이션(논리삭제 원칙, 물리 DELETE 금지).

## 🚀 컷오버 시퀀스 (메인넷 Go-Live)

1. **운영DB 신설**(Supabase) + 스키마 마이그레이션 적용. **금융 데이터는 clean start**(베타→GA: 테스트 Pi 잔액·거래 초기화, 계정 정체성은 정책에 따라).
2. **프로젝트 B 생성** + 메인넷 env + 커스텀 도메인.
3. `production` 브랜치 생성 → 프로젝트 B 첫 배포.
4. **P0 실기기 검증**(E-8): Pi Browser에서 메인넷 로그인·결제·세션 유지.
5. **U2A 트랜잭션 1건**으로 생태계 연결 확인(E-9).
6. **등재 신청**(E-10).
7. 사용자에게 신규 메인넷 도메인 안내. 프로젝트 A는 staging(Testnet)으로 존속.

## 검증 체크
- [ ] 프로젝트 B: Production Branch = `production` (master 아님 — 가장 중요)
- [ ] 프로젝트 B: tier=prod(배너 없음) · 메인넷 Pi · 운영DB
- [ ] 프로젝트 A: tier=staging(🧪 배너) · Testnet · 개발DB
- [ ] 운영 배포는 production 머지로만(master push로 운영 안 바뀜)
- [ ] 양쪽 CRON_SECRET 설정

**근거**: docs/Infrastructure.pptx · docs/INFRA_DB_TIERS.md · Vercel Custom Environments/Branch 공식
