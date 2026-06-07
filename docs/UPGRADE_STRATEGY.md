# 기술스택 업그레이드 전략

> **기준일**: 2026-06-07 (최종 업데이트: 2026-06-07)
> **기준**: Node.js Active LTS / npm stable 채널 (beta·RC·canary 제외)
> **실행 전 필수**: `pnpm outdated` + `pnpm tsc --noEmit` (기준선 확인)

---

## 버전 선정 원칙

| 분류 | 기준 |
|---|---|
| Node.js | Active LTS 채널 최신 (짝수 버전, 출시 후 6개월 이상 경과) |
| 프레임워크/라이브러리 | npm `latest` 태그 (stable 채널) |
| TypeScript | `^현재_major` stable 최신 유지 (major 업그레이드는 Tier 3) |
| 현재 beta 사용 중 | stable 출시 시 전환 (downgrade 아님) |

---

## ✅ 완료 — Tier 3: Next.js 16 (2026-06-07)

| 항목 | 변경 전 | 변경 후 | 비고 |
|---|---|---|---|
| `next` | `15.5.18` | `16.2.7` | stable |
| `eslint-config-next` | `15.5.18` | `16.2.7` | 동일 major 맞춤 |
| `eslint.config.mjs` | FlatCompat 래퍼 방식 | 네이티브 flat config import | `@eslint/eslintrc` 불필요 제거 |
| `@eslint/eslintrc` | devDependency 존재 | 제거 | flat config 전환으로 불필요 |
| `package.json` | `pnpm.onlyBuiltDependencies` 필드 | 제거 | pnpm 11은 `pnpm-workspace.yaml`만 읽음 |

**주요 결정**:
- `middleware.ts` → `proxy.ts` 이름 변경 **보류**: Next.js 16 proxy는 edge runtime 미지원, next-intl 미들웨어는 edge 런타임 사용
- `react-hooks/set-state-in-effect` 규칙 `warn`으로 다운그레이드: useEffect 내 setLoading 패턴 리팩토링은 별도 이슈

**검증 결과**: `pnpm tsc --noEmit` ✅ / `pnpm lint` ✅ (0 errors) / `pnpm build` ✅

---

## ✅ 완료 — Tier 1 (2026-06-07 실행)

코드 변경 없이 설정·패키지만 업데이트한 안전한 항목들.

| 항목 | 변경 전 | 변경 후 | 비고 |
|---|---|---|---|
| `@types/node` | `^20` (Node 20 EOL) | `^22` (Node 22 Active LTS) | Active LTS 기준 |
| `tsconfig target` | `"ES2017"` | `"ES2022"` | Node 22 LTS 네이티브 지원 기준 |
| `react` / `react-dom` | `19.1.0` | `19.2.7` | minor — pinned 업데이트 |
| `@anthropic-ai/sdk` | `^0.100.1` | `^0.101.0` | minor |
| `lucide-react` | `^1.16.0` | `^1.17.0` | minor |
| `shadcn` (CLI) | `^4.8.2` | `^4.10.0` | minor |
| `@types/react` | `19.2.15` | `19.2.17` | patch |

**검증 결과**: `pnpm tsc --noEmit` 통과 ✅

---

## 🟡 대기 중 — Tier 2 (모니터링)

### next-auth v5 stable 전환 (⭐ 최우선)

**현재 상태**:
```
latest (stable): 4.24.14   ← v4 API, 현재 코드와 호환 불가
beta:            5.0.0-beta.31  ← 현재 사용 중
v5 stable:       미출시
```

**방침**: v5 stable 출시까지 beta.31 유지. v4 다운그레이드는 코드 전면 재작성 필요로 불가.

**전환 시 실행 명령**:
```bash
pnpm info next-auth dist-tags   # 'latest' 태그가 5.x인지 확인
pnpm add next-auth@^5           # stable 채널로 전환
```

**전환 후 확인 파일**:
- `src/auth.ts` — `handlers`, `auth`, `signIn`, `signOut` 내보내기 방식
- `src/app/api/auth/[...nextauth]/route.ts`
- `jwt`, `session` 콜백 시그니처

**검증**: Google 로그인 → 세션 복원 → Pi·Google 계정 연동 전체 플로우.

---

### 기타 Tier 2 패키지 (정기 확인 권장)

```bash
pnpm outdated   # 분기별 1회 실행하여 현황 파악
```

| 패키지 | 현재 | 확인 사항 |
|---|---|---|
| `next-intl` | ^4.13.0 | v5 stable 출시 여부; v5면 routing.ts API 변경 가능성 |
| `@supabase/supabase-js` | ^2.107.0 | v3 stable 출시 여부; v3면 createClient() 변경 |
| `resend` | ^6.12.4 | major 변경 시 emails.send() 확인 |
| `@t3-oss/env-nextjs` | ^0.13.11 | createEnv() API 변경 여부 |

---

## 🔴 미래 계획 — Tier 3 (메이저 업그레이드)

**원칙**: 반드시 별도 feature 브랜치 → 전체 기능 테스트 → main 머지.
`pnpm outdated`에서 major 버전이 달라진 항목을 확인 후 각각 계획 수립.

### ~~Next.js 16.x~~ — ✅ 완료 (2026-06-07, feature/upgrade-nextjs-16)

---

### ~~TypeScript 6.x~~ — ✅ 완료 (2026-06-07, feature/upgrade-nextjs-16)

`pnpm tsc --noEmit` 에러 없음. strict 모드 강화 없음. tsconfig 변경 불필요.

---

### ESLint 10.x (현재 10.4.1 available) — ⛔ 대기

**블로커**: `eslint-config-next@16`이 내부적으로 사용하는 세 플러그인이 ESLint 10을 미지원 (2026-06-07 기준)

| 플러그인 | 설치 버전 | 지원 ESLint 범위 |
|---|---|---|
| `eslint-plugin-react` | `7.37.5` | `^3 ~ ^9` |
| `eslint-plugin-import` | `2.32.0` | `^2 ~ ^9` |
| `eslint-plugin-jsx-a11y` | `6.10.2` | `^3 ~ ^9` |

**전환 조건**: `eslint-config-next`가 위 플러그인의 ESLint 10 호환 버전을 채택한 뒤 진행.

```bash
# 전환 가능 여부 확인 명령
npm view eslint-plugin-react peerDependencies
npm view eslint-plugin-import peerDependencies
```

**확인 사항** (전환 시):
- `eslint.config.mjs` — FlatCompat 이미 제거됨 (Next.js 16 업그레이드 시 처리)
- `eslint-config-prettier` v10 호환성

**검증**: `pnpm lint` 에러 없음.

---

### Node.js 24 LTS (선택적 — Vercel 기본값)

현재 `@types/node ^22` (Node 22 Active LTS) 사용 중. Vercel 기본 런타임이 Node 24인 경우 맞추기 위해:

```bash
pnpm add -D @types/node@^24
```

단, Node 24는 2025-10 LTS 시작으로 아직 검증 기간이 짧음. Node 22 유지도 무방.

---

## 실행 순서 요약

```
[완료] Tier 1 — @types/node ^22, tsconfig ES2022, minor 업데이트
  ↓
[대기] next-auth v5 stable 출시 → 즉시 stable 전환
  ↓
[분기별] pnpm outdated → 범위 내 마이너 업데이트 → tsc + build 검증
  ↓
[별도계획] Next.js 16 / TypeScript 6 / ESLint 10 — 각각 feature 브랜치
```

---

## Node.js LTS 일정표 (참고)

| 버전 | 코드명 | Active LTS | Maintenance | EOL |
|---|---|---|---|---|
| 20 | Iron | 2023.10 ~ 2024.10 | 2024.10 ~ 2026.04 | 2026.04 |
| **22** | **Jod** | **2024.10 ~ 2026.10** | 2026.10 ~ 2027.04 | 2027.04 |
| 24 | (TBD) | 2025.10 ~ 2027.10 | 2027.10 ~ 2028.04 | 2028.04 |

현재 권장: **Node 22** (Active LTS, 1년 이상 검증됨)
