# 운영DB 신설 절차 (메인넷)

> 신규 운영(Mainnet) Supabase에 **스키마 + 참조 시드**를 한 번에 구성. 사용자 데이터 없음(베타→GA clean start).
> 연결 설정: `docs/INFRA_DB_TIERS.md` Step 2 · 배포: `docs/DEPLOY_STRATEGY.md`.

## 방법 A — 마이그레이션 번들 (권장·시드 포함)

`sql/*.sql` 142개를 순서대로 연결해 신규 DB에 1회 적용. **스키마 + 참조 데이터(i18n·테마·요금제·카테고리 등)**가 함께 들어간다.

### 1. Supabase 운영 프로젝트 생성 (마스터)
- Supabase 대시보드 → New Project = **운영DB**(메인넷용). 리전·비번 설정.
- `pg_trgm` 등 확장은 sql 안에서 `CREATE EXTENSION` 처리됨.

### 2. 번들 생성 (로컬, 의존성 0)
```bash
node scripts/build-prod-db-bundle.mjs
# → sql/_prod_db_bundle.sql (약 505KB, git 미커밋)
```

### 3. 적용 (택1)
- **psql (권장 — 대용량·오류중단)**:
  ```bash
  psql "<운영DB 연결문자열>" -v ON_ERROR_STOP=1 -f sql/_prod_db_bundle.sql
  ```
  (Supabase: Project Settings → Database → Connection string. `ON_ERROR_STOP=1`로 첫 오류 시 중단)
- **Supabase SQL Editor**: 505KB라 한 번에 부담 → 구간별(예: 001~050 / 051~100 / 101~131) 분할 붙여넣기.

### 4. 검증
```sql
-- 핵심 테이블 존재
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('sys_user','pi_pymnt','bean_wlt','mps_shop','i18n_message');
-- 사용자 데이터 0 (clean start)
SELECT count(*) FROM sys_user;          -- 0 이어야
SELECT count(*) FROM pi_pymnt;          -- 0 이어야
-- 참조 시드 존재
SELECT count(*) FROM i18n_message;      -- > 0
```

> ⚠️ **순서 주의**: 같은 번호 파일(019·122 등)은 (번호,파일명) 결정론적 정렬. 대부분 독립 기능이라 무해하나, 오류 시 해당 구간 로그 확인.
> ⚠️ **데이터정리 마이그레이션**(예: 128 1인1계정)은 빈 DB에서 대상 0건 → no-op(안전).

## 방법 B — 스키마 덤프 (정확한 구조 복제·시드 별도)
현재(검증된) DB 스키마를 그대로 복제. 마이그레이션 순서 리스크 없음. 단 참조 시드는 별도.
```bash
# 현재 DB → 스키마만
pg_dump "<현재DB 연결문자열>" --schema-only --no-owner --no-privileges -f schema.sql
psql "<운영DB 연결문자열>" -v ON_ERROR_STOP=1 -f schema.sql
# 참조 시드만 별도 이관(예: i18n_message·msg_theme·bean_fee_plan·prod_ctgr 등 — 사용자 테이블 제외)
pg_dump "<현재DB>" --data-only -t i18n_message -t msg_theme -t bean_fee_plan -f seed.sql
psql "<운영DB>" -f seed.sql
```

## 적용 후 연결 (운영 WAS)
신규 Vercel 운영 프로젝트 env에:
```
NEXT_PUBLIC_SUPABASE_URL  = <운영DB url>
SUPABASE_SERVICE_ROLE_KEY = <운영DB service_role>
```
→ `docs/INFRA_DB_TIERS.md` Step 2의 메인넷 Pi 변수와 함께.

## 체크
- [ ] 핵심 테이블 전부 존재(pg_tables)
- [ ] sys_user·pi_pymnt·bean_txn 등 사용자 데이터 = 0
- [ ] i18n_message·테마·요금제 참조 시드 존재
- [ ] pg_trgm GIN 인덱스(검색) 적용
- [ ] 운영 WAS env가 운영DB를 가리킴
