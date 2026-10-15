# 00_input — sitemap.pi 1차 데이터 모델 (DA팀 잡 20261010_sitemap-data-model)

- 요청일 : 2026-10-10 / 요청자 : 마스터
- 요청 원문 : "이제 우리는 목업이 완성되었다. DB설계를 진행할 차례야. 지금까지의 요구사항을 기반으로 데이터 모델 스킬을 사용해서 1차 모델을 완성해"
  - DA(leader) : 모델 전체 승인관리
  - 데이터베이스표준담당자(standards) : 데이터베이스 표준 생성 → DA가 항상 최종 승인
  - 데이터 모델러(modeler) : 표준을 준수하여 데이터 모델링 진행 → DA가 항상 최종 승인
  - 데이터 품질 담당자(quality) : 데이터 모델이 표준을 준수했는지 검토 → DA가 항상 최종 승인
- 최종 산출물 : `sitemap/sitemap.pi/data-model/sitemaps-data-model.md`
- 작업 디렉토리(이 잡 전용) : `docs/da/_workspace/20261010_sitemap-data-model/` — 다른 잡 디렉토리·`_workspace/` 직속 파일은 건드리지 않는다
- 실행 모드 : 팀 도구 비활성 → 서브 에이전트 모드(Workflow) 폴백, 파일 기반 전달

## 1. 범위

- 작업 유형 : 신규 설계(1차 모델) — 논리·물리 모델 + DDL 초안. **migration 팀원 미소집**(운영 DB에 sitemap 스키마 미적용 상태, 이행 대상 데이터 없음)
- ⛔ DB 적용·`sql/` 신규 파일 생성 금지 — DDL 초안은 작업 디렉토리에만 둔다(운영 적용·sql 확정은 마스터 승인 후 별도 턴)
- ⛔ 기존 `sitemap/sitemap.pi/sql/001_sitemap_phase1.sql` 수정 금지 — 1차 모델은 001 을 As-Is 로 보고 델타(추가·변경)를 제안

## 2. 정본·참조 자료 (반드시 읽을 것)

| 구분 | 경로 |
|---|---|
| DA 표준 정본 | `docs/da/데이터표준규칙.md`, `docs/da/품질점검기준서.md`, `docs/da/README.md`, `docs/da/references/` |
| 요구사항 정본 | `sitemap/sitemap.pi/docs/PRD.md`(특히 §2 사이트 구분, §3 상품·요금·프로모션, §3-4 요금제 5단계·버블, §4 노출·정렬, §5 상태 흐름, §7 데이터 모델 초안), `sitemap/sitemap.pi/docs/ROADMAP.md`, `sitemap/sitemap.pi/docs/OPS_SETUP.md` |
| 앱 규칙 | `sitemap/sitemap.pi/CLAUDE.md`(핵심가치 ③ 광고 라벨·Pi 직접 가격·Bean/토큰 어휘 금지·외부 이동 A-6), 루트 `CLAUDE.md`(DB 명명·FK 정책·논리삭제·pg_trgm 검색 표준) |
| 상위 플랜 | `docs/PRD_28_PI_MULTISITE.md`(사이트별 별도 DB, 공용 패키지) |
| As-Is DDL | `sitemap/sitemap.pi/sql/001_sitemap_phase1.sql`(site_mst·site_rpt·stat_site_dly·fn_inc_stat_site_dly·fn_sel_stat_site_chg) |
| 공용 baseline | `packages/pi-db/sql/000_baseline.sql`(sys_user 등 — 승계 대상, 재정의 금지). ⚠ **pi_pymnt 는 baseline 에 없다**(판정 5 — 의도적 제외, @pi/payments 확정 시 `packages/pi-db/sql/010_pi_pymnt.sql` 로 별도 추가 = sitemap Phase 2 착수 조건). 결제 참조 컬럼은 FK 대상만 정하고 키 타입은 [TBD] (정정 2026-10-10, modeler 지적) |
| 코드(목업) | `sitemap/sitemap.pi/src/lib/site.ts`(PLAN_CD·PLAN_AREA·PLAN_COLOR·PLAN_SPARKLE·BubbleItem), `src/app/api/**`(bubbles·sites·me·admin·reports·stat·upload·auth), `sitemap/sites.json`(레지스트리 19개), `src/data/sample-sites.json`(데모 샘플 — DB 미시드) |

## 3. 문서에 아직 반영되지 않은 오늘(2026-10-10) 마스터 결정 — 모델에 반영 필수

1. **요금제 5단계 유지, 버블 크기 비율 변경** — 면적 가중치 VIP 21.16 · PRM2 9.27 · PRM1 6.76 · BSC2 4.15 · BSC1 2.43 · NONE 0.7 (구 "면적 ×2 등비" 폐기). 크기·색은 화면 상수(코드)이며 DB 저장 여부는 모델러 판단(요금제 코드 마스터에 둘지 여부).
2. **표 보기 레벨 표시** — VIP=LV5 … BSC1=LV1, NONE(무료)=없음. 요금제 정렬 순서(ordr)로 산출.
3. **부가서비스 "반짝임"(SPARKLE)** — 요금제와 별도로 **추가요금을 내고 선택**하는 부가서비스. 버블에 요금제 보색의 반짝임 효과. 현재 목업은 샘플만(간주 플래그), **실구매(결제·기간·상태) 모델이 필요** — 부가서비스는 향후 종류가 늘 수 있음(상품 코드화).
4. **연결 주소 재지정** — `.pi` 도메인은 일반 브라우저에서 열리지 않으므로 사이트별 "이동 URL"을 도메인과 별도로 보관(목업은 `sites.json` url, 예 cafe.pi → https://cafepi.vercel.app/). 외부 이동은 클릭 + 이동 안내 + 새 창(A-6).
5. **버블 표시 = 회사 로고 + 회사명** — 로고(site_img_url)·회사명(site_nm). 광고·자사·등급 배지와 증감률은 툴팁·aria-label 로만 표시(마스터 결정, 광고 라벨 정책 완화는 화면 한정 — 데이터는 광고 여부 판정 가능해야 함).
6. **자사 사이트(own_site_yn)** — 요금제는 관리자 배정(결제 없음), 자사 사이트는 요금제·부가서비스 구매 금지 규칙 유지.
7. **가상 샘플 91개는 DB에 넣지 않는다** — 데모 전용(env SITEMAP_SHOW_SAMPLES).
8. **DB 구성** — sitemap 전용 Supabase 프로젝트(운영 public 스키마), 개발·스테이징은 pi-nonprod 의 `sitemap_dev`·`sitemap_stg` 스키마. RLS 비활성 + service_role. 스테이징 Vercel(sitemapst.vercel.app)에 Supabase 연동 env 가 이미 존재하나 스키마 미생성.

## 3-1. 마스터 확정 (2026-10-10, 00_requirements §15 마스터 확인 필요 항목 중 4건)

| REQ | 확정 내용 |
|---|---|
| REQ-35 | **회사명 = `site_nm`** — 별도 회사명 속성 두지 않음 |
| REQ-36 | **이동 URL = 등록자 입력 + 관리자 심사** — 등록·수정 시 심사 대상(피싱 URL 방지), 관리자 전용 아님 |
| REQ-55 | **반짝임(SPARKLE)은 유료 요금제(VIP·PRM2·PRM1·BSC2·BSC1) 사이트만 구매 가능** — NONE(무료) 구매 불가. 가격·기간·재고는 여전히 [확인중 : 마스터] |
| REQ-14 | **계정 제재(정지)는 sitemap 측 별도 엔터티** — 공용 baseline `sys_user` 확장 금지 |

§15 의 나머지(REQ-45/46 멤버십↔요금제 매핑, REQ-71·73·81, REQ-32, 등록 상한 불일치)는 [확인중 : 마스터] 유지. REQ-69 는 §2 정정으로 해소.

## 3-2. 재점검 지시 (2026-10-10 2차 — sys_user.id·role 구멍)

- **점검 범위 정정** : §2 표의 "승계 대상, 재정의 금지"는 **수정하지 않는다는 뜻이지 점검 제외가 아니다.** 1차 점검이 baseline·001 기존 컬럼을 빼고 신규만 검사해 `sys_user.id`(단독 도메인)·`sys_user.role`(도메인 없음)이 통과했다 — 이 문구를 쓴 main 의 입력서가 직접 원인(정본 §10 #22). **점검 범위 = 모델에 등장하는 전 객체(000 sys_user·001·02 전부).** 위반은 수정 여부와 무관하게 전부 목록화하고, 고치지 않을 것은 `grandfathered(사유·추적처)` 로 표기.
- **마스터 확정** : ① 단일 표준단어로 표준용어 금지(정본 §1-3 v2.4) ② `sys_user.id → usr_id`(정본 §9 USR) ③ `sys_user.role → role_cd`(값 ADMIN/USER 고정 코드 — 식별자·이름 아님).
- **마스터 확정 (2차, 09 재점검 후)** : ④ sys_user 미확정 5건도 이번에 함께 개명 — `pi_username→pi_usr_nm`, `pi_wallet_address→pi_wlt_adr_txt`, `display_name→dsp_nm`, `last_login_dtm→lst_lgn_dtm`, `rejoin_dtm→rjn_dtm`(standards 권장안, sitemap DB 대상·cafe.pi DB 미변경) ⑤ 세션 필드명 `userId`·`role` 유지 — DB 컬럼만 개명하고 `@pi/db` 조회 계층에서 매핑 ⑥ 함수 인자 표준용어 규칙은 신규 함수만 — 기존 `fn_grant_svc_only`(p_kind·p_obj)·`fn_sel_stat_site_chg`(p_days)는 grandfathered.
- **적용 범위** : 모델 문서·DDL 초안·ERD 는 개명 반영. 실제 `packages/pi-db/sql/000_baseline.sql`·`@pi/auth`·`@pi/db`·sitemap 코드(sys_user 조회 11곳)는 **구현 단계에서 같은 배포로** 변경(모델 문서에 변경표·동반 변경 항목으로 기록). cafe.pi 자체 DB 는 이번 범위 아님(정본 §10 잔여 위반 로드맵).

## 4. 산출물 규약 (파일명 `{NN}_{팀원}_{산출물}.{ext}`)

| NN | 파일 | 작성 |
|---|---|---|
| 00 | `00_requirements.md` — 데이터 요구사항 목록(REQ-번호) | 요구 수집 |
| 01 | `01_standards_dictionary.md` — 표준단어·표준도메인·표준용어(신규 등재안 포함) | standards |
| 01 | `01_leader_standards-approval_r{n}.md` | leader |
| 02 | `02_modeler_model.md`(개념·논리·물리), `02_modeler_ddl.sql`(DDL 초안, 001 대비 델타) | modeler |
| 02 | `02_leader_model-approval_r{n}.md` | leader |
| 03 | `03_quality_gate_r{n}.md`(P1/P2/P3) | quality |
| 03 | `03_leader_quality-approval.md` | leader |
| 04 | 최종 `sitemap/sitemap.pi/data-model/sitemaps-data-model.md` + `04_leader_final-approval_r{n}.md` | modeler 편집 → leader 승인 |
