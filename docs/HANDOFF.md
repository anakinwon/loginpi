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
