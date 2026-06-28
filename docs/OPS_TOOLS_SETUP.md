# 운영 도구 설정 — 배포 컨트롤 / Staging DB 스위치

> 관리자 화면 `/admin/deploy`·`/admin/db-switch` (MASTER 전용) 활성화 가이드.
> 코드: `src/lib/ops-deploy.ts`·API `src/app/api/admin/{deploy,db-switch}` · 배포전략 `docs/DEPLOY_STRATEGY.md`.

## 개요
| 화면 | 기능 | 필요 권한 |
|---|---|---|
| `/admin/deploy` | 🧪 Stage(loginpi·master) 재배포 / 🚀 운영(cafepi·production) **승격+배포**(ff-only) | MASTER |
| `/admin/db-switch` | Staging WAS의 Stage DB(RW) ⇄ 운영DB(읽기전용) 전환 | MASTER · staging tier 한정 |

- 토큰 미설정 시 각 버튼은 **"미구성"으로 비활성**(graceful) — 지금 배포돼도 위험 없음.
- MASTER 부여 완료: **anakin2**(dev·prod 양쪽, 2026-06-28). 추가 부여는 `/admin/links` 또는 `sys_user.role`.

## 환경변수 — **loginpi(staging) 프로젝트**에 설정
> db-switch는 staging에서만 동작하므로 loginpi에 설정. 설정 후 **loginpi 재배포** 필요.
> (운영 배포 버튼을 cafepi admin에서도 쓰려면 GITHUB_DEPLOY_TOKEN·GITHUB_REPO를 cafepi에도 동일 설정)

| env | 발급처 | 용도 |
|---|---|---|
| `VERCEL_STAGING_DEPLOY_HOOK` | loginpi → Settings → Git → **Deploy Hooks** → branch `master` 생성 → URL | Stage 재배포 + db-switch 재배포 |
| `GITHUB_DEPLOY_TOKEN` | GitHub → Settings → Developer settings → **Fine-grained PAT** → repo `anakinwon/loginpi` → **Contents: Read and write** | 운영 승격(production ref ff) |
| `GITHUB_REPO` | `anakinwon/loginpi` (기본값이라 생략 가능) | 대상 저장소 |
| `VERCEL_API_TOKEN` | Vercel → Account Settings → **Tokens** (해당 팀 스코프) | db-switch env 변경 |
| `VERCEL_STAGING_PROJECT_ID` | loginpi → Settings → General → **Project ID** | env 변경 대상 |
| `VERCEL_TEAM_ID` | (팀 계정이면) Team Settings → Team ID | API 스코프 (개인 계정이면 생략) |
| `PROD_RO_SUPABASE_URL` | `https://ajdwlcqoljkjamostutc.supabase.co` | 운영DB 읽기전용 모드 |
| `PROD_RO_SUPABASE_KEY` | 아래 "운영DB 읽기전용" 절차로 발급 | 운영DB 읽기전용 모드 |
| `VERCEL_PROD_DEPLOY_HOOK` (선택) | cafepi → Deploy Hooks → branch `production` | 승격 후 보조 트리거 |

## 운영DB 읽기전용(PROD_RO) — 2단계

### ① 읽기전용 롤 생성 (운영DB) — `sql/136` (이미 적용·검증 완료)
`readonly_ro` 롤: `BYPASSRLS`(RLS 우회로 전체 행 읽기) + **SELECT만**(쓰기·DDL 전면 차단) + `authenticator` 멤버십(PostgREST가 SET ROLE). 검증: 읽기 성공·`UPDATE` 시 `permission denied`.

### ② 읽기전용 JWT 발급 → `PROD_RO_SUPABASE_KEY`
`role=readonly_ro` 클레임 JWT를 **프로젝트 JWT secret**(운영 Supabase → Settings → API → **JWT Settings → JWT Secret**)으로 HS256 서명. 로컬에서(시크릿 채팅 금지):

```js
// node mint-ro-jwt.js   → 출력값이 PROD_RO_SUPABASE_KEY
const crypto = require('crypto')
const secret = 'PASTE_PROJECT_JWT_SECRET' // 운영 Supabase JWT Secret
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const head = b64({ alg: 'HS256', typ: 'JWT' })
const body = b64({ role: 'readonly_ro', iss: 'supabase', iat: now, exp: now + 60 * 60 * 24 * 3650 }) // 10년
const sig = crypto.createHmac('sha256', secret).update(head + '.' + body).digest('base64url')
console.log(head + '.' + body + '.' + sig)
```

> ⚠️ 신형 API 키 체계(`sb_publishable_`/`sb_secret_`)를 쓰는 프로젝트라면, 이 커스텀-role JWT가
> 동작하려면 **레거시 JWT(HS256) 인증이 활성**이어야 합니다. JWT Secret이 노출돼 있으면 보통 동작.
> 설정 후 db-switch에서 "🔒 운영DB(읽기전용)"로 전환 → staging이 운영 실데이터를 읽기전용으로 미리보기.

## 동작·안전 모델
- **운영 승격 = fast-forward만**(`force:false`): production이 master 조상일 때만 성공. 갈라지면 GitHub 422 → 거부. WIP/미검증 코드의 운영 유출 차단.
- **db-switch는 tier=staging에서만**: 운영 WAS(cafepi)는 절대 영향 없음(코드 가드 + UI 차단).
- **운영DB 모드는 읽기전용 강제**: `PROD_RO_*` 없으면 버튼 비활성. 키가 `readonly_ro`라 쓰기 시도해도 DB가 거부 → 운영 원장 오염 불가.
- **graceful degrade**: 토큰 미설정 시 기능 비활성.

## 보안
- `GITHUB_DEPLOY_TOKEN`(repo push)·`VERCEL_API_TOKEN`(배포·env 변경)·`PROD_RO_SUPABASE_KEY`는 **강력한 서버 전용 시크릿**. 최소 권한(fine-grained PAT는 해당 repo만)으로 발급.
- 모든 운영 도구 API는 **MASTER 전용**(`role==='MASTER'`) 게이트.
- 키/토큰은 채팅·git 금지. Vercel env 입력칸에만 직접.
