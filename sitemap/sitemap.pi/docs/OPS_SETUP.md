# OPS_SETUP — sitemap.pi 운영 준비 체크리스트

> 작성 2026-10-09 · 대상 Phase 1(무료 디렉터리) · 근거 `../../../docs/PRD_28_PI_MULTISITE.md` §5·§6, `PRD.md`, DDL `../sql/001_sitemap_phase1.sql`
> env 목록·설명은 `../.env.example`이 정본. 체크 항목은 환경(dev·stg·prod)마다 반복한다.

## 1. Supabase

- [ ] **운영** : sitemap 전용 프로젝트 생성(cafe.pi DB와 분리, 리전 Seoul) → 스키마 `public`
- [ ] **개발·스테이징** : 공유 `pi-nonprod` 프로젝트 사용 → 스키마 `sitemap_dev`·`sitemap_stg`(마이그레이션이 생성)
- [ ] 비운영 스키마를 **Project Settings → Data API → Exposed schemas**에 추가(`sitemap_dev`, `sitemap_stg`) — 누락 시 API가 `PGRST106`(앱은 503 `DB_UNAVAILABLE`)
- [ ] 키 확보 : Project URL → `NEXT_PUBLIC_SUPABASE_URL`, service_role → `SUPABASE_SERVICE_ROLE_KEY`(서버 전용), 비운영은 `SUPABASE_SCHEMA=sitemap_dev|sitemap_stg`
- [ ] 비운영 tier(Vercel Preview = staging, `APP_TIER=dev`)는 **`STAGING_SUPABASE_*` / `DEV_SUPABASE_*` 필수** — 운영 자격증명으로 폴백하지 않으므로 미설정 시 전 API 503 `DB_UNAVAILABLE`(KISA 2026-10-09, 운영 DB 오염 방지)
- [ ] 마이그레이션용 접속 문자열 : Connect → Session pooler(5432) → `SITEMAP_<TIER>_DATABASE_URL`(로컬 `.env.local`에만, Vercel 등록 금지)
- [ ] anon 키는 앱에서 쓰지 않는다(RLS 비활성 + `fn_grant_svc_only`로 anon·authenticated 권한 회수)

## 2. Storage 버킷 `site-img` (이미지 업로드)

- [ ] Storage → New bucket → 이름 `site-img`, **Public bucket ON**(공개 URL로 표시), 파일 크기 제한 2MB, 허용 MIME `image/png, image/jpeg, image/webp, image/gif`
- [ ] 비운영은 `pi-nonprod` 프로젝트에 버킷 1개를 dev·stg가 공유(경로 `<userId>/<UUID>.<ext>`라 충돌 없음)
- [ ] 버킷이 없으면 업로드 API가 503 `IMG_BUCKET_MISSING`을 반환한다 — 등록·심사는 이미지 없이도 동작
- [ ] 반려·철회 사이트 이미지 정리는 Phase 1 범위 밖(파일 잔존) — 용량 증가 시 정리 배치 추가

## 3. DB 마이그레이션

```bash
node scripts/db-migrate.mjs --app sitemap --tier dev --dry-run   # 적용 예정 확인
node scripts/db-migrate.mjs --app sitemap --tier dev             # baseline → 001 순서 적용
```

- [ ] dev → stg → prod 순서로 적용, 각 단계 후 `001` 하단 검증 쿼리 실행(APPROVED 19, 요금제 VIP 2·P2 3·P1 4·B2 5·B1 5 — 샘플 91개는 DB에 없음)
- [ ] 이력은 대상 스키마 `schema_migrations`(파일키+SHA-256). 적용된 파일은 수정하지 말고 새 `NNN_*.sql`로 분리
- [ ] 적용 후 API가 `PGRST205`(테이블 없음)면 SQL Editor에서 `NOTIFY pgrst, 'reload schema';`

## 4. 관리자·자사 사이트 귀속

- [ ] `ADMIN_PI_USERNAMES`에 운영자 Pi 사용자명 등록 → 그 계정으로 Pi Browser 로그인 시 `role=ADMIN` 승격(강등은 DB 수동)
- [ ] **(운영 필수)** `ADMIN_PI_UIDS`에 운영자의 **이 앱 기준** `pi_uid` 등록(testnet·mainnet 앱별 값) — 사용자명+uid 모두 일치해야 승격. uid 는 첫 로그인 후 `sys_user.pi_uid`에서 확인. 운영 tier(`APP_TIER=prod` 또는 `VERCEL_ENV=production`)에서 `ADMIN_PI_USERNAMES`만 있고 uid 가 없으면 빌드 env 검증 실패 + 런타임 승격 생략(KISA 2026-10-09 재점검)
- [ ] 이 앱은 username 재바인딩을 하지 않는다(`rebindByUsername:false`) — sandbox 플립·포털 앱 교체로 uid가 바뀐 기존 사용자는 403 `AUTH_PI_ACCOUNT_CONFLICT` → 본인 확인 후 DB에서 `pi_uid` 수동 갱신
- [ ] **도메인 소유 확인(수동)** : 심사 화면의 토큰을 등록자가 `https://<도메인>/sitemap-verify.txt`에 게시했는지 관리자가 Pi Browser로 열어 일치 확인 → 확인 체크박스 선택 후 승인(외부 등록은 체크 없으면 API 400 `OWNERSHIP_NOT_VERIFIED`). 불일치·미게시는 `OWNERSHIP`(도메인 소유 확인 불가)로 반려 — 같은 등록자는 그 도메인을 다시 제출할 수 없다(409 `DOMAIN_REJECTED_OWNERSHIP`, 실소유자의 별도 등록은 가능)
- [ ] `SITEMAP_VERIFY_SECRET`(32자 이상, 환경별, `PI_SESSION_SECRET`과 다른 값) 등록 — 토큰 = HMAC(키, `sitemap-verify:<site_id>:<도메인>`) 앞 16자. 미설정 시 세션 키 폴백(용도 혼용 — 운영 금지). 키 변경 시 기존 토큰 전부 무효
- [ ] 첫 관리자 로그인 후 자사 시드 19건 소유 귀속(001 주석) : `UPDATE site_mst SET ownr_usr_id = '<admin id>', modr_id = 'ADMIN' WHERE own_site_yn = 'Y' AND ownr_usr_id IS NULL;`
- [ ] 리스크 플래그 4건(gifticon·omok·yoda·fondation)은 **마스터 지시(2026-10-09)로 APPROVED 노출 중** — PENDING으로 내리지 말 것. 단 sitemap.pi 등재 제출 전 재검토 필수(PRD_28 §8 예외 주석)

## 5. Pi Developer Portal

- [ ] sitemap 앱 2개 등록(testnet = 스테이징 URL, mainnet = `https://sitemap.pi`) — cafe.pi와 별도 앱이라 `pi_uid`가 다르다(사람 키는 `pi_username`)
- [ ] 앱 URL·도메인 검증 : 앱별 키를 `PI_DOMAIN_VALIDATION_KEY`에 넣고 `/validation-key.txt` 응답 확인
- [ ] API 키 → `PI_API_KEY`(Phase 2 결제부터 사용)
- [ ] 스테이징은 `NEXT_PUBLIC_PI_SANDBOX=true`

## 6. Vercel (독립 웹서버 기본안)

- [ ] 새 프로젝트 : 같은 저장소, **Root Directory `sitemap/sitemap.pi`**, Framework Next.js, 리전 `icn1`(vercel.json)
- [ ] Install 명령은 기본(pnpm 워크스페이스 자동 인식), Build `next build --turbopack`(package.json)
- [ ] 운영 브랜치 `prod/sitemap` — 승격은 `node scripts/promote-to-prod.mjs --app sitemap --yes`(ff-only)
- [ ] env : Production / Preview 각각 `.env.example` 항목 등록(마이그레이션 URL 제외), `PI_SESSION_SECRET`은 환경별 다른 값
- [ ] Ignored Build Step : 이 프로젝트는 `sitemap/sitemap.pi/**`·`packages/**` 변경 시만 빌드, cafe 프로젝트는 `sitemap/**` 제외(PRD_28 §6)
- [ ] 커스텀 도메인 `sitemap.pi` 연결
- [ ] 승격 후 GitHub commit status에서 이 프로젝트 `Vercel – <project>: success` 개별 확인(배포 검증 철칙)

## 7. 출시 전 검증 (Phase 1 완료 기준 — ROADMAP)

- [ ] Pi Browser 실기기 : 로그인 → 내 사이트 등록(이미지 포함) → 관리자 승인 → 홈·카테고리·검색 노출 → 상세 조회수 증가 → "사이트 방문" 이동 안내 후 이동 → 신고 → 관리자 인용(정지) 확인
- [ ] 일반 브라우저에서 같은 흐름(쿠키 경로) — Pi Browser만 401이면 `fetch` 잔존 여부 점검(`piFetch` 사용)
- [ ] 공개 API 응답에 `pvt_cntc_txt`가 없는지 확인(`/api/sites`, `/api/sites/<domain>`)
- [ ] 보안 점검(kisa-web-security-auditor) : 업로드·신고·검색 입력
- [ ] `pnpm --filter @site/sitemap build` 통과
