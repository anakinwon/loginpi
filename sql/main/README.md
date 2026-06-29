# sql/main/ — 운영DB 적용 전용 SQL

운영DB(**Product_CafePi · `ajdwlcqoljkjamostutc`**)에 직접 적용하는 SQL을 **자체 번호(`sql1`, `sql2`…)**로 보관한다.
staging/dev 마이그레이션(루트 `sql/NNN_*.sql`)과 **물리적으로 분리**해 "어느 DB에 돌리는 SQL인지" 혼선을 막는 것이 목적이다.

## 규칙

- **이 폴더 = 운영DB 전용.** staging/dev는 루트 `sql/NNN_*.sql`을 쓴다.
- 넘버링은 자체 순서 `sql1`, `sql2`, … (루트의 3자리 `NNN`과 시각적으로 구분).
- 대부분 루트 SQL과 **내용 동일·멱등**(예: `sql1` = `sql/137`). 분리 목적은 *적용 추적·혼선 방지*이지 다른 로직이 아니다.

## 실행 방법

1. 운영 Supabase 프로젝트(`ajdwlcqoljkjamostutc`) → **SQL Editor**.
   - SQL Editor는 **owner 권한**이라 운영DB 읽기전용(`readonly_ro` 롤 · `SUPABASE_READONLY_MODE` 앱 가드)과 **무관하게 적용**된다.
   - (읽기전용은 staging이 운영을 *미리보기*할 때 쓰는 `PROD_RO_SUPABASE_KEY` 경로에만 강제된다.)
2. **번호순**으로 실행: `sql1` → `sql2` → …
3. 각 파일 하단 검증 쿼리로 확인. 모두 **멱등**이라 재실행 안전.

## ⚠️ 원칙 (ops_checklist `ENV_SQL_GATE`)

- **staging(dev) 선적용·검증 → 운영 적용.** 운영 선적용 금지.
- 타이밍: staging은 즉시, 운영은 메인넷 컷오버/운영 검증 시점.

## 대응표

| 운영 (sql/main) | staging (sql/) | 내용 |
|---|---|---|
| `sql1` | `sql/137` | `ops_checklist` 섹션0 운영DB 컷오버 진척 현행화 |
| `sql2` | `sql/138` | `mainnet_checklist` E-4·E-7 운영DB 컷오버 진척 현행화 |
| `sql3` | (운영 전용) | `ops_checklist` `ENV_PI_KEYS` drift 교정(DONE→DOING). staging은 이미 DOING이라 대상 아님 |
| `sql4` | `sql/139` | `ops_checklist` `E_ENV_PROD` drift 교정(DONE→DOING). staging은 `sql/139`로 TODO→DOING |

> drift 교정(`sql3`·`sql4`)은 양쪽 DB를 따로 운영하며 생긴 수동 토글 차이를 정렬한 것이다.
> 2026-06-29 전체 45항목 대조로 staging↔운영 완전 일치 확인.
