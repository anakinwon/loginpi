# HANDOFF — 다른 PC에서 작업 이어가기

> 작성 2026-10-11 · 작업 PC 교체용 인수인계. 비밀값은 이 문서·저장소에 없다(저장소는 **public**).

## 1. 새 PC 준비

```bash
git clone https://github.com/anakinwon/loginpi.git
cd loginpi
pnpm install            # Node 22 이상(기존 PC v24.20.0) · pnpm 11
pnpm build              # 루트(cafe) 관문
cd sitemap/sitemap.pi && pnpm build
```

- Windows 사용자 환경변수 `WORKSPACE_ROOT` = 클론 상위 폴더(예 `C:/Users/<사용자>/workspace`) — 훅·스크립트가 참조(루트 CLAUDE.md)
- Claude Code 플러그인·스킬·MCP는 PC별 설치 — 메모리 `~/.claude/projects/<프로젝트키>/memory/` 의 설치 기록 참조

## 2. git으로 옮겨지지 않는 것 (직접 옮길 것)

| 항목 | 위치 | 옮기는 방법 |
|---|---|---|
| 루트 env | `.env.local` | 안전한 경로(USB·비밀번호 관리자)로 복사, 또는 Vercel에서 다시 받기 |
| sitemap env | `sitemap/sitemap.pi/.env.local` | 같음. 필요 키 이름은 `sitemap/sitemap.pi/.env.example`. DB 마이그레이션용 `SITEMAP_DEV_DATABASE_URL`(Supabase `sitemap_postgres` → Connect → Session pooler) |
| Vercel 연결 | `.vercel/` | 새 PC에서 `npx vercel login` 후 `npx vercel link` (기존 PC 토큰은 만료) |
| Claude 개인 설정 | `.claude/settings.local.json` | 파일 복사(ultracode 상시 등 개인 설정) |
| Claude 메모리 | `~/.claude/projects/C--Users-anaki-workspace-loginpi/memory/` | 폴더 복사. 새 PC 경로가 다르면 프로젝트키(경로 기반) 폴더명에 맞춰 둘 것 |
| 에이전트 메모리 | `.claude/agent-memory/` | 폴더 복사(선택) |
| 작업 이력·통계 | `work-history/`, `work-statistics/` | 선택 복사 — 대화 전문 포함, **절대 커밋 금지** |

## 3. 현재 상태 (sitemap.pi 데이터 모델·DB)

- **DA 1차 모델 최종 승인** — `sitemap/sitemap.pi/data-model/sitemaps-data-model.md`(1.1), ERD `data-model/erd/`(ERD Editor, VS Code 확장 `dineug.vuerd-vscode`)
- **sys_user 표준 개명 확정** — `usr_id`·`role_cd`(VARCHAR(20))·`pi_usr_nm`·`pi_wlt_adr_txt`·`dsp_nm`·`lst_lgn_dtm`·`rjn_dtm`. 세션·API 필드명은 불변(`@pi/db` `toUserRow` 매핑)
- **DB 적용 완료** — Supabase `sitemap_postgres`(ref `whexrbciwjtzrxeehute`)의 `sitemap_dev`·`sitemap_stg` 스키마에 000→001→002 적용·검증(테이블 5 + `schema_migrations`, 시드 19). 적용 도구 `node scripts/db-migrate.mjs --app sitemap --tier dev|stg`
- **코드 배포** — master 푸시, `Vercel – sitemaps: success`

## 4. 남은 일 (우선순위 순)

1. **스테이징 `/api/sites` 503 `DB_UNAVAILABLE` 해소** — 확인 순서
   - Supabase → Project Settings → Data API → **Exposed schemas**에 `sitemap_stg`·`sitemap_dev` 추가
   - Vercel `sitemaps` **Production**(sitemapst.vercel.app가 Production 배포)에 `APP_TIER=staging`·`STAGING_SUPABASE_URL`·`STAGING_SUPABASE_SERVICE_ROLE_KEY`(Secret key)·`SUPABASE_SCHEMA=sitemap_stg` → 최신 배포 **Redeploy**
   - Vercel 함수 로그 `[db] <code>`로 판별(PGRST106=노출 누락, 줄 없음=env 누락)
2. **Pi Browser 실기기 검증** — 신규 가입·재로그인·관리자 승격·관리자 목록·승인(인증 경로 변경 → 미검증 시 완료 불가)
3. **DB 비밀번호 교체 확인** — 이전 비밀번호가 대화에 노출됨(교체 후 `.env.local` 갱신)
4. 후속 개발 — 신고 RPC 전환(②)·`site_mv_url` 입력(③)·버블 URL 대체(④)·OWNERSHIP 재제출 확장(⑤) — 데이터 모델 §10 체크리스트
5. Phase 2(Part B, 테이블 9) — `010_pi_pymnt.sql` 선행 후 `003_sitemap_phase2.sql`
6. 마스터 결정 대기 — 미결 #18(cafe DB 개명 선행 여부), 정본 개정 제안 P-1~P-7·D-2(데이터 모델 §12)

## 5. 주의

- 적용된 SQL(000·001·002)은 수정 금지 — 변경은 새 `NNN_*.sql`
- SQL Editor에서 파일 단건 실행 금지 — 마이그레이션 도구만(스키마·순서·이력 보장)
- `.gitignore`의 `.env*`·`.vercel` 제외 규칙 유지(2026-10-11 주석 처리 사고를 원복함)

## 6. 2026-10-11 승인 전 결제 — 적대적 검증(53 에이전트) 블로커 6건 **수정 완료**(같은 날 밤, 전용 결제 페이지 `/pay/<siteId>` 와 함께)

3cd69cd4 시점엔 아래 블로커 때문에 결제 금지였다. **현재 코드(다음 커밋)는 6건 모두 반영** — 실기기 결제 테스트 가능 상태(단, Vercel env `PI_API_KEY` 등록 뒤). 표의 "수정" 열이 실제 반영 내용이다.

| 등급 | 결함 | 위치 | 수정 |
|---|---|---|---|
| 블로커 | Pi API approve 를 **서버 검증보다 먼저** 호출 — metadata·소유·정가 검증 실패(400/409)해도 Pi 측은 developer_approved → 사용자 서명·온체인 전송 진행 → complete 시 RPC P0002 → 원장 공백 | `src/app/api/payments/approve/route.ts:26` | 순서 뒤집기: `GET /v2/payments/{id}` 로 선조회 → 검증 → pi_pymnt APPROVED upsert → 그 다음 approve. 검증 실패는 `POST /v2/payments/{id}/cancel` + CANCELED 기록. 헤더 주석 3행("지갑 차감은 complete 전엔 없음") 틀림 — 차감은 서명 시점 |
| 중대 | complete 가 원장·소유자 확인 전에 Pi complete·RPC 실행(소유자 불일치 판정이 DB 갱신 뒤) | `complete/route.ts:29` | Pi complete 전에 `pi_pymnt WHERE pymnt_id AND usr_id=user.id AND sts IN (APPROVED,COMPLETED)` 선조회, RPC 에 p_usr_id 인자 추가 |
| 중대 | 취소 경로 없음 — CANCELED 선언만, onCancel/onError·txid 없는 미완료 결제가 APPROVED 좀비로 남아 재결제 거부 가능 | `site-pay-button.tsx:76`, `pi-auth-root.tsx:11` | `POST /api/payments/cancel`(Pi API cancel + CANCELED·cncl_dtm) 신설, onCancel/onError·txid 없는 복구 경로에서 호출. approve 시 같은 site_id 에 APPROVED 다른 결제 있으면 409 |
| 중대 | approve·RPC 가 사이트 상태(PAYABLE) 미검사 — approve~complete 사이 철회 창 | `approve/route.ts:41`, `sql/004 RPC WHERE` | PAYABLE 을 lib/site.ts 로 올려 approve 재적용, RPC WHERE 에 site_sts_cd IN (DRAFT,PENDING,REJECTED), 철회 잠금을 APPROVED 결제 존재로 확장 |
| 중대 | PC(Google 세션)에서 결제 버튼 — window.Pi 는 일반 브라우저에도 있어 createPayment 가 예외/무응답, 안내 미표시·busy 고착 | `site-pay-button.tsx:29` | `usePiAuth().isInPiBrowser` false 면 호출 없이 piBrowserOnly 표시(UA 아님), createPayment try/catch + 타임아웃 |
| 중대 | 관리자 UI 가 단가 0 요금제도 '미결제' 로 승인 비활성(서버는 통과) | `admin-panel.tsx:257` | /api/fee-plans 로 단가 0 이면 결제 조건 제외 |

전체 결함 목록·탈락 항목: `%TEMP%/claude/.../tasks/wc3inqbms.output`(세션 산출물) 또는 워크플로 저널 `wf_bfab4749-e39/journal.jsonl`.

**반영 내역(2026-10-11 밤)** — approve 순서 뒤집기(`GET /v2/payments/{id}` 선조회 → metadata·direction·user_uid·소유/own_site_yn/PAYABLE/pymnt_id·요금제 일치·이중 APPROVED·정가 검증 → pi_pymnt APPROVED upsert → Pi approve, 거부 경로는 Pi cancel) · complete 원장 선조회 + RPC `p_usr_id`(sql/005, 구 2인자 함수 제거, dev·stg 적용·P0002 자가 점검) · `POST /api/payments/cancel` 신설(onCancel/onError·txid 없는 미완료 복구) · `PAYABLE_STS` 공용 상수 + 철회 잠금을 APPROVED 원장 존재까지 확장 · 결제 버튼 `usePiAuth().isInPiBrowser` 가드 + try/catch + 120초 타임아웃 · 관리자 UI 단가 0 요금제 승인 허용. **결제 UI 는 `/pay/<siteId>` 한 곳**(내 사이트 목록은 링크, 제출 직후 결제 필요하면 자동 이동). 단건 조회 `GET /api/me/sites/<id>` 신설.

팀장 후속 지적(미반영, 실기기 검증 전 검토): ⓐ 같은 사이트 동시 approve 2건이 `hasOtherApprovedPayment`→upsert 사이에 둘 다 통과 가능(두 번째는 RPC P0003 으로 기록만 막힘) — `pi_pymnt` 부분 유니크 인덱스(`(meta_val->>'site_id') WHERE pymnt_sts_cd='APPROVED' AND pymnt_tp_cd='SITE_REG'`) 검토 ⓑ 결제 버튼 120초 타임아웃 뒤 재클릭 시 prepare·createPayment 재실행(Pi SDK 가 pending 있으면 거부) — 문구 보강 정도.

DA 후속(2026-10-11 요금제 기간·할인 표시, sql/006): `fee_plan.use_mon_cnt`(표시용, 개월) ↔ DA 사전 D3·Phase 2 모델 `use_day_cnt`(일수, `docs/da/_workspace/20261010_sitemap-data-model/01_standards_dictionary.md`) 이중화 — Phase 2 fee_plan 통합 때 하나로 합치고 표준단어 `MON` 등재 여부 DA 판정. **prod 적용 전 da-governance-expert 리뷰 필수**. 영구(VIP) 할인은 **마스터 확정(2026-10-11)으로 10년 환산 25% 표시**(PRD §3-1 표 갱신), 프리미엄1은 3년(sql/007), 단가 조정 PRM1 64.8 Pi·PRM2 90 Pi(sql/008), 기간 재확정 PRM1 2년·PRM2 3년·VIP 5년(sql/009, 영구 폐지), 단가 재산정(sql/010) 할인율 10·12·15·18·23% → 16.2·31.68·61.2·88.56·138.6 Pi — 법무 §9 #10 확정 시 문구만 재점검.

⚠ **운영 승격 선행 조건(2026-10-13)**: sitemap 관리 목록이 `site_mst.plan_sort_no`(sql/011 생성 컬럼)를 select·order 하므로 코드 승격 **전에** `node scripts/db-migrate.mjs --app sitemap --tier prod` 로 sql/011 선적용 — 미적용 상태로 승격하면 /api/admin/sites 가 400 으로 관리 목록 전체 장애. dev·stg 는 적용 완료. **✅ 운영 DB 적용 완료 2026-10-13(마스터 수동, 번들 pi-db/010 + 004~011 — schema_migrations 등록 SQL 별도 제공)**. sql/012 는 P2 코드 승격과 한 창에서.

**사용료 전환(2026-10-13, PRD_USAGE_FEE_STATE v0.2c)**: P0~P3 완료·스테이징 반영(0e150859, stg DB sql/012 적용). 남은 단계 P4 sys_cfg 읽기·/api/admin/cfg·설정 UI → P5 크론 site-sts-sweep(CRON_SECRET fail-closed, 운영 등록은 PAID 탭 검토 뒤) → P6 문구 전수 개명 → P7 문서 → P8 실기기(설정 0.05h 전 구간) + prod sql/012 와 승격 한 창. ⚠ 크론 전까지 PAID→IN_USE 는 관리자 "사용 시작" 수동. 빈 버블 안내(/ad) 문구·요금제 콤보(남은 수량) 변경 완료(2026-10-13) — 남은 수량 = PLAN_CAP(site.ts, 5·15·20·30·40) − 점유 상태 실사이트, 0 이면 콤보 미노출, /api/fee-plans items.remaining 동봉. 실기기 미검증. **반짝임 부가서비스(2026-10-13, PRD_USAGE_FEE_STATE §10)**: sql/013·014·015 dev·stg 적용(prod 는 012 와 함께 승격 한 창), **요금 재편 sql/014(마스터 확정 2026-10-13)**: 약정 1·3·6·12·24개월, 사용료 10·25·45·80·130 Pi(할인 0·16.67·25·33.33·45.83%), 반짝임 요금제별 2·5·9·16·26 Pi(fee_plan SPK_<plan>, 2차 확정 sql/015), 합산(prepare REG + metadata.spk)·단독(/pay?kind=spk, SITE_SPK) 결제, 관리자 수정 폼 토글, 로고 300×300(logo-field)·관리자 콘텐츠 수정(action edit)·Storage 버킷 site-img(nonprod 생성, prod 는 scripts/storage-bucket.mjs). Pi Browser 실기기 결제 미검증.

다음 세션 순서: ① Vercel env `PI_API_KEY`(testnet 앱) 등록·Redeploy — **2026-10-12 실측: .env.local 의 키는 401 무효, `PI_WALLET_*` 는 무관(TROUBLESHOOT 2026-10-12)** → **sitemap testnet 앱** 화면에서 재복사 → .env.local 갱신 후 `node scripts/pi-key-probe.mjs --app sitemap` VALID 확인(VALID 는 생존만, 앱 일치는 approve 로그 404 여부로) → 등록 ② Pi Browser(pinet 도메인) → 내 사이트 → "심사비 결제하기" → `/pay/<id>` 에서 결제 1건 → `pi_pymnt` COMPLETED·`site_mst.pymnt_id` 확인 → 관리자 승인 ③ 미결제 신청 승인 시 402 확인, 취소 1건(onCancel → 원장 CANCELED) 확인 ④ 플레이북·ROADMAP 실기기 검증 기록.
