# 운영DB 신설 절차 (메인넷)

> 신규 운영(Mainnet) Supabase에 **스키마 + 참조 시드**를 구성. 사용자 데이터 없음(베타→GA clean start).
> 연결 설정: `docs/INFRA_DB_TIERS.md` Step 2 · 배포: `docs/DEPLOY_STRATEGY.md`.

---

## ⚠️ 중요 — git 마이그레이션 통짜 재생은 불가 (2026-06-27 확인)

빈 DB에 `sql/*.sql` 142개를 그대로 재생(replay)하면 **깨진다**. 현재 운영DB는 "git replay 결과물"이 아니라 **초기 손작업 + 부분 git의 합성물**이기 때문:

1. **genesis 누락** — `sql/003`이 `payments`·`link_codes`를 `ALTER TABLE ... RENAME`으로 개명하는데, 그 **원본 테이블 생성 SQL이 142개 어디에도 없다**(개발 초기 Supabase 대시보드에서 직접 생성, git 미기록). `sql/001`은 `users`만 생성. → 빈 DB에서 `relation "public.payments" does not exist`.
2. **인라인 부분 UNIQUE 문법오류** — `sql/044`가 `CREATE TABLE (... UNIQUE(...) WHERE del_yn='N')`(PostgreSQL 위반)을 썼었음(현재는 수정, 단 과거 손수정 흔적). → `syntax error at or near "WHERE"`.

→ 결론: **돈을 다루는 메인넷 DB는 결함 입증된 이력 재생이 아니라, 검증된 현재 스키마를 그대로 복제(pg_dump)한다.** (대기업 새 리전 DB 부트스트랩 표준)

---

## ⭐ 방법 B — 스키마 복제 (pg_dump) · 권장·정식 채택

현재(검증된) DB 스키마를 그대로 복제 → 마이그레이션 순서·genesis 리스크 0. 참조 시드는 **현재 DB 데이터에서 명시 allowlist만** 별도 이관.

### 0. 사전 — 운영DB 준비
- Supabase 대시보드 → New Project = **운영DB**(메인넷용). 리전·비번 설정.
- 확장 활성화: 운영DB SQL Editor에서 `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (검색용 GIN, pg_dump가 public 스키마만 뜨면 확장은 누락될 수 있음). `gen_random_uuid`(pgcrypto)는 Supabase 기본 제공.
- **pg_dump 버전**: 현재 DB에서 `SELECT version();` 확인 후 **동일 major 버전 pg_dump** 사용. 없으면 `npx supabase db dump` 사용.

### 1. 스키마 덤프 (현재DB → 구조만)
```bash
pg_dump "<현재DB 연결문자열>" \
  --schema-only --schema=public --no-owner --no-privileges \
  --no-publications --no-subscriptions \
  -f prod_schema.sql
```
> ⚠️ 연결문자열(DB 비번 포함)은 **터미널에서만**. 채팅·git 금지.

### 2. 스키마 적용 (운영DB)
```bash
psql "<운영DB 연결문자열>" -v ON_ERROR_STOP=1 -f prod_schema.sql
```
(또는 `prod_schema.sql`을 운영DB SQL Editor에 붙여넣기)

### 3. 참조 시드 데이터만 이관 (사용자 데이터 제외)
**원칙: 명백한 설정·룩업 테이블만 복제. 의심되면 제외(빠뜨려도 복구 쉬움, 사용자 데이터 오염은 치명).**

```bash
pg_dump "<현재DB 연결문자열>" --data-only --schema=public --no-owner \
  -t i18n_locale -t i18n_message -t i18n_cntry_mst \
  -t bean_fee_plan -t bean_supply_config -t bean_tip_cfg \
  -t msg_subscr_plan -t msg_theme -t msg_stkr_pack -t msg_theme_stkr \
  -t mps_ctgr -t mps_dist_cfg \
  -t fbck_ctgr_item \
  -t evt_event -t evt_mission \
  -t brd_ctgr \
  -t ui_theme \
  -t mainnet_checklist -t ops_checklist \
  -f prod_seed.sql
psql "<운영DB 연결문자열>" -v ON_ERROR_STOP=1 -f prod_seed.sql
```

**복제(참조)** = 설정/룩업/정의: i18n 3종 · Bean 요금·공급·팁 설정 · 구독요금제 · 카페테마·스티커팩 · 상품/유통 카테고리 · 후기 평가항목 · 이벤트·미션 **정의** · 게시판 카테고리 · 관리자 UI테마 · 체크리스트.
**제외(사용자/런타임, 0건 유지)** = `sys_user`·`pi_pymnt`·`auth_link_cd`·`bean_wlt`·`bean_txn`·`bean_token_wallet`·`bean_campaign*`·`bean_subscr`·`mps_shop`·`mps_item*`·`mps_order*`·`mps_txn_hist`·`mps_seller_bond`·`fbck_mst`·`fbck_img`·`msg_msg`·`msg_room*`·`msg_call*`·`evt_user_mission`·`evt_action_log`·`evt_exclude`·`usr_loc_hist`·`sys_user_*`·`sys_metric_*`·`stat_*`·`rpt_report`·`*_log` 등.

> `i18n_message`는 ko 외 번역의 **정본이 DB**(런타임 편집) → 반드시 현재 DB 데이터를 떠야 정확. 마이그레이션 시드로 대체 금지.

### 4. 검증
```sql
-- 핵심 테이블 존재
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('sys_user','pi_pymnt','bean_wlt','mps_shop','i18n_message');
-- 사용자 데이터 0 (clean start)
SELECT count(*) FROM sys_user;   -- 0
SELECT count(*) FROM pi_pymnt;   -- 0
SELECT count(*) FROM mps_order;  -- 0
-- 참조 시드 존재
SELECT count(*) FROM i18n_message;  -- > 0
SELECT count(*) FROM mps_ctgr;      -- > 0
SELECT count(*) FROM msg_theme;     -- > 0
-- pg_trgm GIN 인덱스(검색) 적용 확인
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexdef ILIKE '%gin_trgm_ops%' LIMIT 5;
```

---

## 방법 A — git 마이그레이션 재생 (참고용 · genesis 보강 필요)

`sql/*.sql`을 순서대로 적용. **위 ⚠️대로 genesis 누락·과거 손수정 때문에 그대로는 실패.** 굳이 git-only로 가려면 누락된 `payments`·`link_codes` 원본 생성 SQL을 `000_genesis.sql`로 복원해야 하며, 이후에도 숨은 갭이 더 나올 수 있다. 러너(`scripts/apply-sql-bundle.mjs`)는 파일별 적용·`_sql_migration_log` 추적으로 실패 지점을 정확히 알려주나, **메인넷 부트스트랩에는 방법 B 권장.**

---

## 적용 후 연결 (운영 WAS)
신규 Vercel 운영 프로젝트 env:
```
NEXT_PUBLIC_SUPABASE_URL  = <운영DB url>
SUPABASE_SERVICE_ROLE_KEY = <운영DB service_role>
```
→ `docs/INFRA_DB_TIERS.md` Step 2의 메인넷 Pi 변수와 함께.

## 체크
- [ ] `CREATE EXTENSION pg_trgm` 선적용
- [ ] 스키마(`prod_schema.sql`) 적용 — 핵심 테이블 전부 존재(pg_tables)
- [ ] 참조 시드(`prod_seed.sql`) 적용 — i18n·테마·카테고리·요금제 존재
- [ ] `sys_user`·`pi_pymnt`·`bean_txn`·`mps_order` 등 사용자 데이터 = 0
- [ ] pg_trgm GIN 인덱스(검색) 적용
- [ ] 운영 WAS env가 운영DB를 가리킴
