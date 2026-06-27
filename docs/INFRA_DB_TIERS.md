# 인프라 DB 환경 분리 설정 가이드 (Staging / 운영)

> 코드 라우터: `src/lib/db-env.ts` + `src/lib/supabase-admin.ts` (구현 완료, 하위호환).
> 정본 그림: `docs/Infrastructure.pptx`. 본 문서는 **마스터 실행 절차**.

## 목표 모델 (2026-06-27 확정)

| # | 항목 | WAS(Vercel) | tier | DB | Pi |
|---|---|---|---|---|---|
| 1 | **Staging WAS + 개발DB** | **현재 loginpi.vercel.app 유지** | staging | 개발DB(=현재 Supabase) | Testnet |
| 2 | **운영 WAS + 운영DB** | **신규 생성** | prod(자동) | 운영DB(신규 Supabase) | Mainnet |
| 3 | **Staging 스위치** | 현재 프로젝트 | staging | 개발DB ⟷ 운영DB(읽기전용) | — |

## 코드 동작 (이미 반영됨 — 손댈 것 없음)

- **tier 자동 판정**: `VERCEL_ENV`(production→prod / preview→staging / development→dev). `APP_TIER`로 덮어쓰기 가능.
- **하위호환**: tier별 DB env가 없으면 **현행 운영 자격증명으로 폴백** → 지금과 100% 동일. 아무 것도 안 깨짐.

---

## 실행 절차 (순서대로)

### Step 1 — 운영DB 신설 (Supabase)
1. 새 Supabase 프로젝트 생성 = **운영DB**(메인넷용, 깨끗한 시작).
2. 스키마는 `sql/*.sql` 마이그레이션을 순서대로 재적용(또는 `supabase db push`).
3. URL·service_role 키 확보.

### Step 2 — 운영 WAS 신설 (Vercel, 신규 프로젝트)
신규 Vercel 프로젝트(같은 repo 연결)의 **Production** 환경변수:
```
NEXT_PUBLIC_SUPABASE_URL       = <운영DB url>
SUPABASE_SERVICE_ROLE_KEY      = <운영DB service_role>
NEXT_PUBLIC_PI_SANDBOX         = false
PI_API_KEY                     = <메인넷 API Key>          # E-5
PI_WALLET_PRIVATE_SEED         = <메인넷 지갑 시드>        # E-6
PI_SESSION_SECRET / AUTH_SECRET / CRON_SECRET = <신규 생성>
... (기타 기존 시크릿)
```
- `VERCEL_ENV=production` → **tier=prod 자동**. 별도 APP_TIER 불필요.
- 신규 도메인 연결(E-4). 메인넷 Developer Portal 프로젝트(E-3)와 URL 일치.

### Step 3 — 현재 앱을 Staging으로 (현재 Vercel 프로젝트)
현재 `loginpi.vercel.app` 프로젝트에 **딱 한 줄 추가**:
```
APP_TIER = staging
```
- `STAGING_SUPABASE_*` 미설정 → **현재 DB로 폴백 = 그게 곧 "개발DB"**. DB·코드 변경 0.
- Pi testnet(`NEXT_PUBLIC_PI_SANDBOX` 기존값) 유지. 재배포하면 staging으로 인식.
- (원하면 개발DB를 현재와 분리하고 싶을 때만 `STAGING_SUPABASE_URL/SERVICE_ROLE_KEY` 별도 지정.)

### Step 4 — 스위치 설정 (Staging이 운영DB를 읽기전용으로)
현재(staging) 프로젝트에:
```
PROD_RO_SUPABASE_URL = <운영DB url 또는 Read Replica 엔드포인트>
PROD_RO_SUPABASE_KEY = <읽기전용 자격증명>      # ⚠️ 아래 경고
STAGING_DB_TARGET    = staging                 # 평소(개발DB). 운영 읽기 필요 시 prod-ro 로 변경 후 재배포
```

> 🔴 **읽기전용 자격증명 경고 (가장 중요)**
> Supabase **service_role 키는 전권(쓰기 포함)**이라, 운영 service_role을 `PROD_RO_SUPABASE_KEY`에 넣으면 **staging이 운영DB에 쓰기 가능** = 사고. **절대 금지.**
> 진짜 읽기전용은 둘 중 하나로:
> 1. **Supabase Read Replica**(Pro) — 물리적으로 읽기전용. `PROD_RO_SUPABASE_URL`=리플리카 엔드포인트.
> 2. **읽기전용 Postgres 롤** — 운영DB에서 `GRANT SELECT`만 받은 롤. (Supabase JS service_role 대신 직접 PG 접속 경로 필요.)
>
> 🛡️ **코드 안전장치**: `STAGING_DB_TARGET=prod-ro`인데 `PROD_RO_*`가 비어 있으면, db-env가 **자동으로 개발DB로 폴백**해 운영 쓰기 사고를 막는다(`src/lib/db-env.ts`).

---

## 스위치 사용법 (Phase 1 — 재배포 방식)
- 평소: `STAGING_DB_TARGET=staging`(또는 미설정) → staging이 **개발DB**(RW).
- 운영 데이터로 검증 필요 시: `STAGING_DB_TARGET=prod-ro`로 변경 → 재배포 → staging이 **운영DB 읽기전용**.
- 끝나면 다시 `staging`으로.

## Phase 2 (후속) — Edge Config 무재배포 스위칭
현재 `getSupabaseAdmin()`은 **sync 싱글톤**이라 무재배포(Edge Config) 스위칭은 async 리팩터가 필요 → 메인넷 안정화 후 별도 진행. 그때 `STAGING_DB_TARGET`을 Edge Config 키로 옮기면 재배포 없이 초 단위 토글 가능.

---

## 검증 체크
- Staging WAS: `APP_TIER=staging` 적용 후 로그인·결제(testnet) 정상.
- Prod WAS: 신규 도메인 접속 → Pi mainnet 로그인·결제(P0, 실기기).
- 스위치: `prod-ro` 전환 시 staging에서 운영 데이터 **조회만** 되고 쓰기는 실패(읽기전용 검증).
- ⛔ 운영DB에 staging이 쓰기 성공하면 = 읽기전용 자격증명이 잘못된 것. 즉시 교정.

**근거**: docs/Infrastructure.pptx(슬라이드 3·4) · 코드 `src/lib/db-env.ts`
