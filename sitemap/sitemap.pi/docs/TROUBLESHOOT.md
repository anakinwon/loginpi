# TROUBLESHOOT: sitemap.pi

> 장애·결함의 원인과 결과를 남겨 같은 문제를 재발시키지 않는다(R-P0). 공통 사례 = [BUILD_DEFECTS](../../../docs/BUILD_DEFECTS.md)
> 기록 원칙 : 증상 → 원인(코드·설정 위치) → 조치(커밋) → 재발 방지. 추측 금지, 미확정은 `[확인중 : 채널]`

| 날짜 | 증상 | 원인 | 조치 | 재발 방지 |
|---|---|---|---|---|
| 2026-11-03 | 운영 승격(`67d9dc5e`) 뒤 PyCafé™ 외 모든 사이트 상세 '조회에 실패했습니다', 메인 버블 반짝임·위성(이펙트) 소실 | 새 코드가 `site_mst.ship_cd` 를 조회하는데 sql/020 이 진짜 운영 DB 에 없음. 운영 마이그레이션 키가 비운영 프로젝트(pi-nonprod)를 가리켜 엉뚱한 DB 에 적용 | `78851e54` 되돌림(앱 코드 = 직전 운영 `cf200d2b`) + 재승격 | `db-migrate.mjs` 운영 가드 2종, DB 먼저 적용, 칼럼 없음 폴백 — 아래 상세 |

---

## 2026-11-03 · TS-01 운영 키가 비운영 프로젝트를 가리켜 운영 DB 미적용 상태로 코드 배포

### 증상

- sitemap.pi 운영 승격(`67d9dc5e` 워프 우주선 5종) 직후, PyCafé™ 를 뺀 모든 사이트 상세가 '조회에 실패했습니다'로 열리지 않음
- 메인 버블 홈의 반짝임·위성 등 이펙트가 전부 사라짐 — 버블 API 실패로 화면이 데모 데이터로 폴백(데모에는 이펙트 없음)
- PyCafé™ 만 열린 이유 `[확인중 : 운영 로그]`

### 원인

1. **직접 원인 — 코드가 운영 DB 에 없는 칼럼을 조회.** `67d9dc5e` 가 `site_mst.ship_cd`·`ship_pay_dtm`·`ship_pymnt_id` 를 `select` 에 추가(`src/app/api/sites/[domain]/route.ts`·`api/bubbles/route.ts`·`api/me/sites/[id]/route.ts`·`api/payments/prepare|approve/route.ts`). 이 칼럼을 만드는 `sql/020_sitemap_site_ship.sql` 이 운영 앱이 실제로 읽는 DB·스키마(`[확인중 : Vercel sitemaps Production env SUPABASE_URL ref·SUPABASE_SCHEMA]` — 정황상 pi-nonprod `sitemap_stg` 또는 별도 프로젝트, 이펙트 칼럼 O·우주선 칼럼 X)에 적용되지 않아 해당 조회가 전부 실패
2. **근본 원인 — 운영 마이그레이션 키가 비운영 프로젝트를 가리킴.** `sitemap/sitemap.pi/.env.local` 의 `SITEMAP_PROD_DATABASE_URL` 이 pi-nonprod(ref `whexrb…`, `STAGING_SUPABASE_URL` 과 같은 프로젝트)의 접속 문자열이었다. 운영은 앱마다 Supabase 프로젝트가 따로 있다(`docs/ENV_GUIDE.md` 2절). 이 키로 운영 적용을 돌려 pi-nonprod 의 `public` 스키마에 `schema_migrations` 생성 · 000~016·019·021 수동 등록 · 017(fee_tp_cd CHECK 에 SHIP 포함 패치)·018·020 적용 — 운영 앱이 읽는 스키마는 그대로(public 은 운영 화면과 칼럼 상태가 달라 운영 아님 : 운영에 보이던 이펙트 칼럼이 public 에 없었음)
3. **검증 부재.** 운영 DB 접속 전 '접속 문자열의 프로젝트 ref 가 비운영 프로젝트와 같은지'를 보지 않았고, 운영 DB 스키마(칼럼 존재)를 대조하지 않은 채 코드를 승격했다
4. **코드 쪽 폴백 부재.** 신규 칼럼 조회가 실패하면 기존 칼럼으로 다시 조회하는 경로가 없어 칼럼 1개 누락이 상세·버블 전체 실패로 번졌다(같은 앱의 sql/018 조회수 합산은 '미적용이면 기존 합산 폴백'을 두었었다 — `docs/BUILD_DEFECTS.md` 2.2)

### 조치

- `78851e54` — `67d9dc5e` 되돌림. 앱 코드가 직전 운영(`cf200d2b`)과 같아져 sitemap 재승격으로 복구
- pi-nonprod `public` 에 남은 schema_migrations·017/018/020 적용 흔적 정리 여부 `[확인중 : 마스터]`
- 우주선 기능 재배포는 운영 DB 에 sql/020 적용·칼럼 확인 뒤 `[확인중 : 마스터]`

### 재발 방지

| # | 장치·규칙 | 내용 |
|---|---|---|
| 1 | `scripts/db-migrate.mjs` 운영 가드 ① ref 대조 | `--tier prod` 일 때 접속 문자열의 Supabase ref(`postgres.<ref>`·`db.<ref>.supabase.co`)가 비운영 ref 와 같으면 **접속 전 중단**(dry-run 포함). 비운영 ref = 앱이 비운영 스키마(`SUPABASE_SCHEMA=<앱>_dev·stg`)로 돌 때의 `STAGING_`·`DEV_`·`NEXT_PUBLIC_`·`SUPABASE_URL`·`*_DEV/STG_DATABASE_URL` + env `NONPROD_SUPABASE_REFS`(쉼표). 출력은 ref 앞 6자만. 자체 점검 `node scripts/db-migrate.mjs --self-test` |
| 2 | 운영 가드 ② 첫 적용 확인 | 운영 대상 스키마의 앱 테이블 수(`n/전체`)·schema_migrations 유무를 출력하고, schema_migrations 가 없으면(= 000 부터 전부 적용) `--yes` 없이는 중단. 앱 테이블이 이미 있으면 수동 적용 운영 DB 경고(적용된 파일을 schema_migrations 에 먼저 등록) |
| 3 | 운영 반영 전 운영 DB 스키마 대조 | 승격 전 `node scripts/db-migrate.mjs --app sitemap --tier prod --dry-run` 으로 대조 결과·적용 예정 파일 확인. 새 칼럼을 조회하는 코드는 그 칼럼이 운영 DB 에 있는 것을 확인한 뒤 승격 |
| 4 | DB 먼저 적용 원칙 | 순서 = 운영 DB 에 sql 적용 → 칼럼·RPC 확인 → 코드 승격. 역순 금지 |
| 5 | 칼럼 없음 폴백 | 새 칼럼을 공개 조회(상세·버블)에 섞을 때는 칼럼 없음 오류 시 기존 칼럼으로 다시 조회하거나 기능을 끄는 경로를 둔다(sql/018 조회수 폴백과 같은 방식) |
