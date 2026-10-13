# 통합 SSO 구축 여부 의견서 — 19개 .pi MSA (2026-10-13)

> 요청 : 마스터 2026-10-13 "sitemap.pi 중심 19개 .pi 서비스를 MSA(별도 DB·웹서버)로 구축 — 통합 SSO 구축이 좋은지 의견, 전문 자료 5개 이상 병렬 조사". 산출 : 워크플로(외부 조사 6주제 59개 출처 + 코드베이스 수집 + 3렌즈 채점 + 종합). 3렌즈 채점(30점 만점) : A 26 · B 13 · C 7 · D 6. **마스터 확정(2026-10-13, 조사 결과 수용)** — 대전제 : ① 외부(Google) 계정 1개 + Pi 계정 1개가 사람을 따라 늘 동일하게 쫓아다님 ② 각 사이트의 사용자 UUID 는 별도 존재 ③ 통합(중앙 디렉터리·허브 계정 뷰)은 의미 없음 ④ SSO 도 사용하지 않음. → A안 채택. ROADMAP_MULTISITE M5 는 폐기 대상(반영은 후속 커밋).

## ① 결론 (한 문단)

**강력추천 : A안 — 통합 SSO(허브 IdP·세션 공유)는 구축하지 않는다. Pi Network를 IdP로 두고 19개 앱은 각각 독립 세션을 쓰되, 인증 "코드"만 `@pi/auth`로 공유한다("코드 SSO O, 데이터·세션 SSO X").** 이유는 비용이 아니라 구조다. (1) Pi가 이미 표준 IdP다 — `accounts.pinet.com`은 공식 문서상 "standard, spec-compliant OAuth 2.0 server"이고 Pi Browser 안에서는 `Pi.authenticate()`가 최초 동의 후 무입력 1탭이라 사용자 체감상 SSO는 이미 달성돼 있다. (2) Pi Browser는 Set-Cookie를 저장하지 않고 19개 origin이 전부 `.pi` TLD 직하라, 어떤 IdP(자체·SaaS)를 세워도 "한 번 로그인 → 자동 로그인"이 원리상 성립하지 않는다(Auth0 SSO 문서: 사일런트 SSO는 IdP 도메인 쿠키 유무로 결정). (3) Pi Sign-In이 implicit 전용·client_secret 없음·Redirect URI는 "그 앱의 verified domain"만 허용이라 허브가 다른 앱을 대신하는 confidential client가 될 수 없고, 사이트당 Client ID 1개는 어떤 SSO로도 없앨 수 없는 Pi 규칙이다. (4) Pi uid는 "two apps cannot correlate the same person"이 설계 의도(OIDC pairwise sub와 동일)이며 Developer Terms §4는 "transfers or shares user IDs, usernames, UIDs, or your access token"을 금지한다 — 허브 SSO는 이 금지의 정면이고, 등재 레드라인 A-4·A-6·C-1-C(로그인 중 Pi Browser 밖 이탈 금지)와도 충돌한다. 3개 렌즈 채점 합계 A 26 / B 13 / C 7 / D 6으로 격차가 크고 렌즈 간 순위가 뒤집히지 않는다. 저장소 정본(`docs/PRD_28_PI_MULTISITE.md:25,130` "자체 SSO 신설 금지", `docs/ROADMAP_MULTISITE.md:55,76` 허브 SSO 조건부 M5 보류)과 같은 방향이며, **M5는 "보류 → 폐기(재검토 트리거 명문화)"로 격상을 강력추천**한다.

## ② 선택지 비교표

| 기준 | A. SSO 없음 (Pi=IdP + @pi/auth) | B. 경량 연합 (A + 핸드오프 토큰) | C. 자체 중앙 IdP (OIDC Provider) | D. SaaS IdP (Auth0/Clerk/WorkOS) |
|---|---|---|---|---|
| 보안·표준 | Token-Mediating Backend(Pi 토큰은 서버 `/v2/me` 검증 후 폐기, 브라우저엔 앱별 HMAC만) — pi-sign-in.md "자체 세션을 만들라" 지시와 일치. 앱별 시크릿 = RFC 9700 §2.3 audience 분리 | fragment bearer 전달 = RFC 9700 §2.1.2 SHOULD NOT·draft-ietf-oauth-browser-based-apps [확인중 : rfc-editor.org RFC 번호] §7.2 히스토리/3rd-party 노출. PKCE·DPoP·refresh rotation 전부 적용 불가. Teleport식 state 쿠키 전제가 Pi Browser에서 붕괴 | 서명키 1개가 19앱 공통분모(Azure AD 2021 키 삭제 → 14h 전사 장애). Better Auth provider "may not be suitable for production", Auth.js는 RP 전용 | Okta 지원시스템 세션 탈취가 고객사 침투 입구(Cloudflare 2023). Pi Sign-In implicit·secret 없음이라 Pi를 upstream 커넥터로 못 붙임 |
| 비용·운영(1인) | 사이트당 Portal 앱·도메인 검증·Client ID·Redirect URI 등록 1회(Pi 규칙상 불가피). 서버·라이선스 0 | A 비용 + 19벌 핸드셰이크·JWKS 회전·state 선저장 init 페이지·콜백 하드닝 | A 비용 + Keycloak $50~300/월·업그레이드·백업·HA·온콜 또는 미성숙 플러그인. QCon SF 2025 "IdP 먼저 중앙화 → 릴리스 당일 전체 다운" | A 비용 + Zitadel Pro $100/월·Clerk $25+$0.02/MAU·WorkOS SSO $125/커넥션. 효익 없이 과금 |
| UX·전환율 | Pi Browser: 리다이렉트 0·탭 1번/사이트·결제 직결(최단). 일반 브라우저: 사이트마다 동의 1클릭(유일한 감점) | Pi Browser 이득 0(결제엔 앱별 authenticate 필수) + init 왕복으로 경로 오히려 증가. 일반 브라우저는 런처 경유 시에만 클릭 1개 절감 | 일반 브라우저만 동의 19→1 실효. Pi Browser는 리다이렉트 2회+탭 2회로 악화 | C와 동일 + 제3자 도메인 로그인 화면(A-4 "third-party accounts prohibited" 해석 리스크) |
| Pi 제약·약관·등재 | §4 가장 방어적(교차 저장 0). A-4/A-6/C-1-C 무접촉 | username을 origin 간 이전 = §4 문언 정면. 사이트 간 리다이렉트 = A-6·C-1-C | 19앱 username·토큰을 한 DB가 수집 = §4+§3 외부전송. auth.pi 리다이렉트 = A-6·C-1-C 정면 | §4 전송 표면 최대(제3자 테넌트 저장) + A-4·A-6 상시 발생 |
| 장애 영향(blast radius) | 앱 1개로 격리. 로그인 가용성은 Pi에만 종속(결제 때문에 어차피 불가피) | sitemap.pi 발급기가 앱 간 이동 공통 경로 → 부분 장애점(Stytch 2025 유형) | sitemap.pi/auth.pi 장애 = 18앱 로그인 장애. 글로벌 로그아웃은 back-channel 19벌 필요 | 벤더 장애·약관·가격 변경이 19앱 전체로 전파 |
| 3렌즈 합계(30점) | **26** (9/9/8) | 13 (4/4/5) | 7 (2/2/3) | 6 (1/3/2) |

## ③ 권장 아키텍처 구체안 (이 프로젝트 코드 기준)

**강력추천 : "Pi 연합 로그인 + 앱별 독립 세션 + 공용 패키지" — 현행 구조를 19벌 복제하되 아래 보강 2건만 추가.**

1. **`@pi/auth` 공용 패키지 = 유일한 공유 층** (`docs/PRD_28_PI_MULTISITE.md:76` "코드만 공유, 데이터 비공유"). 흐름: `if (!window.Pi)` 가드 → `authenticate()` 무조건 시도 → 실패 시에만 Pi Sign-In OAuth 폴백(UA 분기 금지, `CLAUDE.md` 철칙) → 서버 `/api/auth/pi`가 `api.minepi.com/v2/me` 재검증 → 앱별 HMAC 세션 토큰을 쿠키+JSON 이중 반환 → `piFetch`(`X-Pi-Token`)·클라이언트 게이트(`redirect` 금지). 근거: `packages/pi-auth/src/session.ts:9-12,51-70`, `packages/pi-auth/src/pi-oauth.ts:7-16,25-56`.
2. **`PI_SESSION_SECRET`은 사이트·환경마다 다른 값, 절대 공유 금지**(`docs/ROADMAP_MULTISITE.md:31` 사이트별 비밀값 4종). HMAC 대칭키라 시크릿 분리가 곧 audience 분리(RFC 9700 §2.3)다. 공유하는 순간 IETF OAuth WG(2020-01) 경고 "한 곳 침해 = 전 앱 토큰 위조"가 재현된다. **운영 점검 1건**: `sitemap/sitemap.pi/src/lib/api.ts:171-174`의 `SITEMAP_VERIFY_SECRET → PI_SESSION_SECRET` 폴백은 운영 env에 별도 값 등록으로 사문화할 것(`docs/OPS_SETUP.md:40`).
3. **사용자 식별**: `pi_uid`는 앱별 컬럼(scoped, 권한 철회 시 재발급 — SDK_reference), 사람의 불변 키는 `pi_username`(`packages/pi-db/sql/000_baseline.sql:90-127`, `users.ts:87-` `upsertPiUser` uid→username 재바인딩). 각 앱 DB는 **자기 앱이 authenticate한 uid+username만** 보관하고 사이트 간 대조·복제·동기화 배치는 만들지 않는다(`PRD_28:25` §1.1-1). sitemap.pi의 `rebindByUsername:false`(`sitemap/sitemap.pi/src/lib/auth.ts:49`)는 타 앱 토큰의 username 재사용 차단이므로 유지.
4. **핸드오프 토큰 흐름 = 만들지 않는다.** sitemap.pi는 IdP가 아니라 디렉터리·런처(`PRD_28:133`). 사이트 간에 넘기는 것은 토큰이 아니라 **목적지 URL뿐**(클릭+안내+새 창, A-6 현행 방식). Pi Browser에서는 체감 차이가 탭 1번이므로 사용자 효용 손실이 없다.
5. **즉시 보강 2건 (강력추천)**
   - (a) **즉시 폐기**: `getSessionUser()`가 현재 `exp`/`tokenValidUntil`만 검증 → 제재·로그아웃 시 즉시 무효화 불가(RFC 9700 §4.14 "보안 이벤트 시 폐기"). `sys_user`에 `token_ver` 1컬럼(또는 `del_yn`/`role` 재확인)을 세션 검증 시 대조. 사용자 행 조회가 이미 있으므로 전역 denylist·Redis 불필요 — ponytail: 1컬럼 비교, 초 단위 전파 요구가 실제로 생기면 그때 back-channel.
   - (b) **Pi Sign-In 콜백 하드닝**(implicit 전용은 클라이언트가 못 바꾸므로 보상): 프래그먼트 읽은 직후 `history.replaceState`로 소거, state localStorage+10분·성공 시만 소거(현행 유지), `Referrer-Policy: no-referrer`, 콜백 페이지 서드파티 스크립트 0, Pi access token을 query·로그·Referer에 남기지 않음(RFC 9700 §4.3.2 MUST NOT). 세션 수명은 현행 `min(Pi valid_until, 7일)` 유지하되 24h 단축은 [확인중 : 마스터 — UX 트레이드오프 판단].
6. **Developer Terms 준수 방법**: 교차 저장·전송 0이 §4에 가장 방어적이며, §4 "your App" 단수 해석 회신(`PRD_28:186` §11 #4)이 부정이어도 **로그인 구조는 바뀌지 않는다**(데이터 통합만 사이트별로 후퇴). 질의문에 "우리 설계는 사이트 간 uid·username 교차 보관 0"을 명시해 질의 범위를 좁힐 것. §4 원문은 `socialchain.app/developer_terms`(2023-01-09)에서 확보됨.
7. **등재 심사 리스크**: A안은 A-4(Pi 인증만)·A-6(외부 리다이렉트 지양)·C-1-C(로그인 중 Pi Browser 이탈 금지) 무접촉(`docs/MAINNET_READINESS_CHECKLIST.md:72-73,160-168`). Google은 sitemap.pi 단일 예외로 Pi Browser에서는 숨김 유지(`PRD_28:26` §1.1-2).

**추천 (차선, A의 변형)**: 향후 "통합 계정 뷰"가 꼭 필요해지면 SSO가 아니라 **사용자 주도 링크** — 사용자가 sitemap.pi에서 각 사이트에 다시 Pi 인증(동의)하고 그 결과를 명시 동의 하에 연결. 이는 §4의 "transfer/share"가 아니라 사용자 본인의 공유다. §11 #4 회신 후에만.

## ④ 단계별 도입 로드맵

| 단계 | 시점 | 할 일 | 근거 |
|---|---|---|---|
| **지금** | 즉시 | ① A안 확정, `ROADMAP_MULTISITE.md` M5 "보류 → 폐기(재검토 트리거 3건 명문화)" ② `getSessionUser()` `token_ver` 재확인 ③ 콜백 하드닝(프래그먼트 소거·no-referrer·3rd-party 0) ④ `SITEMAP_VERIFY_SECRET` 운영 별도값 확인 ⑤ `LOGIN_PLAYBOOK.md:152` FAQ에 이번 근거(uid pairwise 문장·implicit-only·redirect 호스트 규칙·BCP BFF 쿠키 전제) URL 포함 추가 ⑥ Pi 서포트 질의 2건 발송(§11 #4 Section 4 해석 / `*.vercel.app` Redirect URI) — `ROADMAP_MULTISITE.md:94`에 적혔으나 미발송 상태로 보임 | PRD_28 §1.1-1·§7, RFC 9700 §4.14 |
| **19개 확장 시** | 사이트 추가마다 | 사이트당 SOP: Portal 앱 생성(Testnet/Mainnet 2개) → 도메인 검증(validation-key.txt) → Pi Sign-In 활성·Client ID → Redirect URI(운영 HTTPS + localhost) 등록 → env 4종(`PI_SESSION_SECRET`·`PI_API_KEY`·DB 키·`NEXT_PUBLIC_PI_OAUTH_CLIENT_ID`) 주입 → `@pi/auth` import → Pi Browser 실기기 로그인·결제 검증. 일반 브라우저용 https 도메인은 `.pi`와 분리(`.pi`는 Pi Browser 자체 DNS 전용). 스테이징은 일반 브라우저 OAuth 경로 검증 불가 전제 | ROADMAP_MULTISITE:31, pi-sign-in.md Redirect URI 규칙 |
| **중앙 IdP 승격 조건** | 아래 중 **둘 이상** 충족 시에만 재채점 | ① Pi Sign-In이 Authorization Code+PKCE(또는 refresh token·멀티 도메인 Redirect URI) 출시 ② Pi 서포트가 §4 "동일 운영자 다중 앱 공유 허용"을 서면 회신 ③ cafe.pi 메인넷 승인으로 A-6 심사 선례 확보 ④ 제재·로그아웃을 19앱에 초 단위 전파해야 하는 운영 요구 실발생. 충족돼도 **일반 브라우저 전용 보조 SSO**로 한정하고 Pi Browser 경로는 `Pi.authenticate()` 직결 유지 | pi-sign-in.md "coming in a future release", PRD_28 §11 #4 |

설계 격리: `@pi/auth` 콜백 모듈 한 곳만 바꾸면 19앱이 동시에 code flow로 승급하도록 Pi Sign-In 콜백을 추상화해 둔다(지금은 implicit 기준).

## ⑤ 반대 의견·리스크 / 결론이 뒤집히는 조건

**반대 의견(검토 후 기각)**
- "일반 브라우저에서 사이트마다 동의 클릭이 반복돼 이탈이 생긴다" → 사실이나 19개 `.pi`의 주 진입점은 Pi Browser이고(일반 브라우저는 PiNet/별도 https 도메인 경유), 그 비용을 없애려면 §4·A-6 위반 구조가 필요. `accounts.pinet.com` 세션 재사용으로 비밀번호 입력은 없음. 실측치는 [확인중].
- "Pi Developer Portal 19앱 등록이 번거롭다" → Redirect URI 호스트 규칙상 어떤 SSO로도 제거 불가. 1회성 운영비이며 B/C/D도 이 비용을 그대로 지불한다.
- "MSA 표준은 중앙 인증 아닌가" → microservices.io Access Token 패턴은 "진입점 1회 인증 + 각 서비스 독립 검증"이지 중앙 세션 공유가 아니다. 공유 게이트웨이·내부망이 없는 Vercel 개별 배포에서는 앱별 자체 검증(현행)이 표준 권고.

**결론이 뒤집히는 조건**
1. Pi Sign-In이 Authorization Code+PKCE·refresh token·멀티 호스트 Redirect URI를 출시 → B(경량 연합)의 표준 위반 축이 사라져 재채점(그래도 §4·A-6 축은 남음).
2. Pi가 §4를 "동일 운영자 다중 앱 간 공유 허용"으로 공식 회신 → 데이터 통합(허브 뷰)이 열리나 로그인 구조는 A 유지.
3. Pi Browser가 Set-Cookie를 저장하기 시작 → IdP 세션이 성립해 C 재검토 가능. 현재 근거 없음.
4. 사이트 수가 수십 개를 넘어 Portal 등록·도메인 검증이 측정 가능한 병목이 될 때.

**남은 쟁점 (확인중 4건)**
- [확인중 : Pi 서포트 / legal-compliance-advisor] Developer Terms §4 "your App" 단수 해석(`PRD_28:186` §11 #4) — 미발송 추정
- [확인중 : Pi Developer Portal 실등록] `*.vercel.app` 스테이징 Redirect URI 등록 가능 여부 — 문서상 "검증 도메인 외 호스트 거부"로 불가 추정
- [확인중 : 실기기·데스크톱 실측] Pi Browser 앱별 `authenticate()` 동의 화면 반복 횟수 / `accounts.pinet.com` 세션 재사용 시 동의 화면 생략 여부
- [확인중 : 마스터] 자체 호스팅 여부(`sitemap/sitemap.pi/docs/ROADMAP.md:22`) 및 세션 수명 7일→24h 단축 의사

## ⑥ 근거 출처 (외부 — URL·발행일·확인일 2026-10-13)

1. Pi Sign-in 공식 가이드 — https://github.com/pi-apps/pi-platform-docs/blob/master/pi-sign-in.md (2026-06-28 Pi2Day 출시 기능, 커밋일 미표기): implicit-only·refresh 없음·Redirect URI는 verified domain·uid "two apps cannot correlate the same person"·code flow "future release"
2. Pi Platform API `/v2/me` UserDTO — https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md (최종 커밋 2024-08-28): uid "app-specific", `credentials.valid_until`
3. Pi Developer Terms of Use §4 — https://socialchain.app/developer_terms (Last Updated 2023-01-09): "transfers or shares user IDs, usernames, UIDs, or your access token" 금지, 예외는 "service provider … your App"
4. Mainnet Listing Requirements — https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/mainnetListingRequirements/ (일자 미표기): "Use Only Pi Authentication", "Avoid Redirection to External Sites"
5. RFC 9700 OAuth 2.0 Security BCP — https://www.rfc-editor.org/rfc/rfc9700.html (2025-01): §2.1.2 implicit SHOULD NOT, §2.3 audience 제한, §4.3.2 query 토큰 MUST NOT, §4.14 보안 이벤트 시 폐기
6. draft-ietf-oauth-browser-based-apps [확인중 : rfc-editor.org RFC 번호] / draft-ietf-oauth-browser-based-apps-27 — https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps (2026-07-06): BFF는 HttpOnly 쿠키+confidential client 전제, §8.5 localStorage XSS, §7.2.3 프래그먼트 노출
7. RFC 8252 OAuth for Native Apps — https://www.rfc-editor.org/rfc/rfc8252.html (2017-10): §8.12 임베디드 WebView는 인증 상태 비공유
8. OpenID Connect Core 1.0 §8·§17.3 — https://openid.net/specs/openid-connect-core-1_0.html (errata set 2, 2023-12-15): pairwise sub, PPID 권고
9. Auth0 Single Sign-On 문서 — https://auth0.com/docs/authenticate/single-sign-on (상시 갱신): SSO는 IdP 도메인 쿠키로 성립; Auth0 ITP 문서 https://support.auth0.com/center/s/article/troubleshoot-auth0-token-renewal-issues-in-safari-with-itp-enabled (2026-05-26)
10. Vercel KB — https://vercel.com/kb/guide/can-i-set-a-cookie-from-my-vercel-project-subdomain-to-vercel-app (일자 미표기): vercel.app은 Public Suffix List
11. 장애 사례 — Stytch SAML SSO 포스트모템 https://status.stytch.com/cmgzdn6k903jgjzg6u94ljjdh (2025-10-21), 1Password SSO https://status.1password.com/incidents/jncn9pjy74m5 (2025-08-07), Azure AD 키 로테이션 RCA https://learn.microsoft.com/en-us/answers/a/317011 (2021-03-16), Cloudflare/Okta https://blog.cloudflare.com/how-cloudflare-mitigated-yet-another-okta-compromise/ (2023-10-20), IETF OAuth WG jwks 공유키 스레드 https://mailarchive.ietf.org/arch/msg/oauth/6qjzupOy3wsGKXMdPxewIu4ws2Y/ (2020-01-08)
12. Teleport 도메인 간 세션 이전 — https://goteleport.com/blog/web-session-sharing-transfer (2021-05-04): fragment 핸드오프도 state 쿠키 전제
13. Better Auth OAuth Provider — https://better-auth.com/docs/plugins/oauth-provider (v1.6~1.8): 전신 deprecated 예정, "may not be suitable for production use"

**프로젝트 정본 근거**: `CLAUDE.md`(Pi Browser Set-Cookie 미저장·redirect 금지·uid scoped·UA 판정 금지), `docs/PRD_28_PI_MULTISITE.md:25,26,76,130,133,186`, `docs/ROADMAP_MULTISITE.md:31,55,76,94,107`, `docs/LOGIN_PLAYBOOK.md:97,149-152`, `docs/MAINNET_READINESS_CHECKLIST.md:72-73,160-168`, `packages/pi-auth/src/session.ts:9-12,51-70`, `packages/pi-auth/src/pi-oauth.ts:7-16,25-56`, `packages/pi-db/src/users.ts:87-`, `sitemap/sitemap.pi/src/lib/api.ts:171-174`, `sitemap/sitemap.pi/src/lib/auth.ts:49`

**정본 불일치 1건 (재검토 필요)**: `docs/PRD_27_PI_FACTORY.md` §2.6의 "단일 법인·단일 DB 내부 처리라 §4 transfer 불성립" 논리는 DB 19개 분리(MSA) 전제에서는 더 이상 성립하지 않으므로, A안 확정 시 PRD_27 §2.6을 "사이트별 DB·교차 조회 0" 기준으로 정합화해야 한다.

---

## 부록 A — 3렌즈 채점 근거

### 렌즈 1 — A 9 / B 4 / C 2 / D 3

렌즈: 운영 비용 · 1인 운영 현실성 · 장애 blast radius (0~10, 높을수록 유리)

#### A. SSO 없음 (Pi = IdP, 앱별 독립 세션 + @pi/auth 공용 패키지 + pi_username 교차 키) — 9점
- 운영 비용: 사이트당 증분은 Pi Developer Portal 앱 등록·도메인 검증·Pi Sign-In Client ID·Redirect URI 등록 1회뿐이며, 이 비용은 Pi 규칙(Redirect URI 호스트 = 그 앱의 verified domain만, pi-sign-in.md)상 어떤 SSO로도 없앨 수 없다. 서버·라이선스·MAU 과금 0.
- 1인 운영 현실성: 코드베이스가 이미 이 형태다 — `packages/pi-auth/src/session.ts`(앱별 HMAC 시크릿, 7일 캡), `packages/pi-db/src/users.ts` `upsertPiUser`(uid→username 재바인딩), `ROADMAP_MULTISITE.md:31` 사이트별 비밀값 4종. 추가 구축 0, 검증 경로(Pi Browser 실기기)도 확보됨. Pi 자체가 1차 인증을 맡으므로 Didit(2026-03)이 최적으로 제시한 "중앙 1차 인증 + 서비스별 데이터" 하이브리드가 이미 성립.
- blast radius: 앱 단위로 격리. 한 앱의 HMAC 키 유출·장애가 다른 18개에 번지지 않는다(IETF OAuth WG 2020-01 "per-application key sets", microservices.io Access Token 패턴 = 각 서비스 독립 검증). 로그인 가용성은 Pi Network에만 종속되며 이는 결제 때문에 어차피 피할 수 없는 의존.
- 감점 1: 19곳 시크릿·Client ID 관리는 수작업(사이트당 env 4종)이고, 즉시 폐기(제재·로그아웃)는 `getSessionUser()`에서 사용자 행(`del_yn`/`token_ver`) 재확인을 추가해야 BCP(RFC 9700 §4.14) 요구를 충족한다 — 다만 사용자 행 조회가 이미 있어 1컬럼 추가로 해결 가능.

#### B. 경량 연합 (A + sitemap.pi 핸드오프 토큰, 앱별 키·JWKS 검증) — 4점
- 운영 비용: A의 전 비용에 더해 sitemap.pi 발급기 + 19개 앱의 공개키(JWKS) 배포·회전 + 쿠키 없는 Pi Browser용 state 선저장 JS init 페이지 + Referrer-Policy·외부 리소스 0 콜백 페이지(RFC 9700 §4.2.4)를 19벌 유지해야 한다. seg6(2025-12) 사례는 쿠키 없는 cross-origin 세션 전달이 결국 "모든 앱이 핸드셰이크 구현 + 앱별 비밀 + 매 로드 재동기화"로 귀결됨을 보여준다.
- 1인 운영 현실성: 얻는 효용이 "Pi Browser에서 탭 1번/사이트 생략"뿐인데(Pi.authenticate는 최초 동의 후 무입력, SDK_reference), 그 대가로 RFC 9700 §2.1.2 SHOULD NOT(fragment bearer)·Section 4 "transfers or shares user IDs, usernames... access token"·등재 A-6(외부 리다이렉트)·C-1-C(로그인 중 Pi Browser 이탈 금지) 4중 심사 표면을 1인이 떠안는다. Teleport(2021)의 교과서적 fragment 핸드오프도 대상 도메인 state **쿠키**가 전제라 Pi Browser에서는 그대로 쓸 수 없다.
- blast radius: 로그인 자체는 A 경로로 폴백 가능해 전면 장애는 아니지만, sitemap.pi 발급기가 19개 앱 간 이동의 공통 경로가 되어 Stytch(2025-10) 유형("핵심 인증은 정상인데 SSO 계층만 실패")의 부분 장애점이 생긴다. 키는 앱별이라 위조 전파는 막히나(IETF 스레드 권고 충족), 핸드오프 토큰 수명 ≤60초·1회 사용·aud 검사를 19곳에서 빠짐없이 지켜야 하며 한 곳이 누락되면 그 앱이 재생 공격 입구가 된다.
- 결론: 기술적으로 방어 가능한 유일한 "SSO 비슷한 것"이지만 효용 대비 운영·심사 비용이 크다. Pi가 code+PKCE/refresh를 출시하거나 Section 4 공식 회신 전에는 A 대비 열위.

#### C. 중앙 IdP (sitemap.pi/auth.pi를 OIDC Provider — Better Auth provider / Zitadel·Ory 셀프호스팅) — 2점
- 운영 비용: Keycloak 자체 호스팅 $50~300/월 + 업그레이드·백업·HA·시크릿 회전·온콜(Skycloak 2026-09, pkgpulse 2026-03), Ory는 admin UI 없음. Next.js 자체 구현 경로는 Better Auth OAuth Provider 하나뿐인데 전신 oidcProvider는 deprecated 예정, 비버전 문서에 "may not be suitable for production use" 경고. Auth.js(NextAuth v5)는 RP 전용이라 IdP가 될 수 없다. 거기에 각 앱은 여전히 Pi 앱·Client ID 등록이 필요하므로(Pi Sign-In 규칙) A의 비용이 사라지지 않고 **더해진다**.
- 1인 운영 현실성: 가장 나쁘다. QCon SF 2025 사례는 전담팀이 9개월 들여 IdP 이관 후 릴리스 당일 포털 전체 다운. 벤더 자료 공통 결론 "직접 만들면 2~3개월 예상이 6~12개월, 보안 패치·키 관리 부담 영구". 그리고 근본적으로 Pi Browser는 Set-Cookie를 저장하지 않아 IdP 세션이 남지 않으므로(Auth0 SSO 문서: SSO 쿠키 유무로 로그인 화면 생략 결정) **비용을 내고도 '한 번 로그인' 효익을 얻지 못한다**. Pi → 자체 IdP → 앱 2단 리다이렉트는 A-6·C-1-C 정면 위반.
- blast radius: 최악. 서명키 1개·IdP 1개가 19개 앱 로그인의 공통 분모 — Azure AD(2021-03) 키 자동 삭제 1건으로 전 서비스 14시간 로그인 불가, 1Password(2025-07) IdP가 끌어안은 DNS 의존성 장애로 전 리전 SSO 실패. 글로벌 로그아웃·제재 전파도 back-channel을 IdP+19앱 전부가 구현해야 성립(OneUptime 2026-08). sitemap.pi 장애 = 18개 앱 로그인 장애.

#### D. SaaS IdP (Auth0/Clerk/WorkOS) 중앙화 — 3점
- 운영 비용: 호스팅·패치는 벤더가 맡아 C보다 낫다. 그러나 Zitadel Pro $100/월, Clerk $25/월+$0.02/MAU(셀프호스트 불가), WorkOS SSO 커넥션 $125/월, Auth0 Free 25k MAU — Clerk 무료 구간은 자료 간 상충(10k vs 50k)이라 재확인 필요. 그리고 Supabase Third-Party Auth 1급 지원은 Clerk·Firebase·Auth0·Cognito·WorkOS 5종뿐이며 loginpi는 Supabase Auth가 아닌 자체 HMAC 세션이라 통합 경로 자체가 없다. A의 Pi 포털 등록 비용은 역시 사라지지 않는다.
- 1인 운영 현실성: 운영은 가볍지만 효익이 없다. 상용 SSO의 '사일런트 로그인'도 IdP 도메인 쿠키·숨은 iframe에 의존하며(Auth0 prompt=none·Kinde 문서), Safari ITP로 서로 다른 등록 도메인 간은 이미 깨져 Auth0 스스로 "커스텀 서브도메인 또는 refresh token rotation" 두 해법만 제시(Auth0 ITP 2026-05). 19개 `.pi`는 TLD 직하라 공통 상위 도메인이 없고 Pi Browser는 쿠키 자체가 없다. 또한 Pi 외 로그인 경로·외부 리다이렉트(A-4/A-6) 등재 레드라인에 걸린다.
- blast radius: 벤더 단일 장애·침해가 19개 앱 전체에 전파. Okta 지원 시스템 세션 토큰 탈취가 고객사 침투 입구가 된 Cloudflare(2023-10) 사례, Stytch AWS 연쇄 장애(2025-10). 벤더 가격·약관 변경 리스크도 1인 운영자가 통제 불가.

#### 종합
A ≫ B > D ≈ C. 이 렌즈에서 B·C·D는 모두 "Pi 포털 사이트별 등록 비용은 그대로 두고 위에 운영 비용·장애점을 추가"하는 구조이며, Pi Browser 쿠키 부재 때문에 핵심 효익(단일 로그인)을 어느 쪽도 실현하지 못한다. 권고: A 채택, ROADMAP_MULTISITE 허브 SSO를 보류→폐기로 격상, 재검토 트리거는 ① Pi Sign-In authorization code+PKCE/refresh 출시 ② Section 4 공식 회신(PRD_28 §11 #4) ③ 제재·로그아웃 초 단위 전파 요구 실발생. 지금 당장의 보완은 `getSessionUser()`에 `token_ver`/`del_yn` 재확인 1컬럼, 콜백 fragment 즉시 소거, `SITEMAP_VERIFY_SECRET`→`PI_SESSION_SECRET` 폴백 운영 금지 확인(`sitemap/sitemap.pi/src/lib/api.ts:171-174`).

### 렌즈 2 — A 9 / B 4 / C 2 / D 1

렌즈: 보안·Pi 제약(쿠키 없음·uid scope·Developer Terms §4·등재 심사 A-4/A-6/C-1-C). 채점은 "이 환경에서 표준·약관·심사를 동시에 통과하는가"가 기준이며, 사용자 편의·비용은 가중치 0.

■ A. SSO 없음(Pi=IdP, 앱별 독립 세션, @pi/auth 공용 패키지, pi_username 교차 키) — 9/10
근거:
- Pi가 이미 표준 IdP다. pi-sign-in.md: "accounts.pinet.com is a standard, spec-compliant OAuth 2.0 server"; Pi Browser에서는 Pi.authenticate()가 첫 동의 후 무입력 1탭(SDK_reference README). draft-ietf-oauth-browser-based-apps [확인중 : rfc-editor.org RFC 번호] §7.3이 말하는 "IdP의 single sign-on sessions를 리다이렉트로 활용"하는 연합 SSO가 추가 구축 없이 성립한다.
- Pi uid의 pairwise 설계와 정합. pi-sign-in.md: "two apps cannot correlate the same person" = OIDC Core §8 pairwise sub·§17.3 PPID 권고. 앱별 sys_user + pi_uid per site + pi_username만 전역 키(codebase users.ts upsertPiUser 철칙, sql/162 UNIQUE)는 이 설계를 그대로 따른다.
- Developer Terms §4(socialchain.app/developer_terms, 2023-01-09) "transfers or shares user IDs, usernames, UIDs, or your access token" 금지에 대해 가장 방어적 — 사이트 간 교차 저장·전송 0(PRD_28 §1.1-1). 등재 A-4(Pi 인증만)·A-6(외부 리다이렉트 지양)·C-1-C(로그인 중 Pi Browser 이탈 금지) 모두 무접촉.
- 공유 시크릿 없음. 앱별 PI_SESSION_SECRET(ROADMAP_MULTISITE:31, .env.example:11) = RFC 9700 §2.3 audience 제한을 키 분리로 구현. IETF OAuth WG 스레드(2020-01, Hardt/Jones "per-application key sets")·Azure AD 2021-03 공유키 14시간 장애·Stytch 2025-10·1Password 2025-07 사례가 경고한 "SSO 계층 단일 장애점"이 존재하지 않는다(사이트 장애 blast radius = 1 앱).
- 세션 구조는 BCP 분류상 Token-Mediating Backend(Pi access token은 서버 /v2/me 검증 후 폐기, 브라우저엔 자체 HMAC 토큰만) — pi-sign-in.md의 "identity를 1회 읽고 자체 세션을 만들라" 지시와 일치.
감점 -1(환경 고유, A가 아니어도 피할 수 없는 항목):
- localStorage 토큰은 XSS 1건에 유출(draft-ietf-oauth-browser-based-apps [확인중 : rfc-editor.org RFC 번호] §8.5, OWASP HTML5). 쿠키 없는 Pi Browser에서는 선택이 아닌 전제 — 보상은 수명 단축·CSP·서드파티 스크립트 0.
- 즉시 폐기 미비: getSessionUser()가 exp/tokenValidUntil만 보므로 제재·로그아웃 시 즉시 무효화가 안 됨(RFC 9700 §4.14 "보안 이벤트 시 폐기"). sys_user 행에 token_ver 1컬럼 재확인으로 충족 가능 — 전역 denylist·Redis 불필요.
- Pi Sign-In이 implicit 전용(RFC 9700 §2.1.2 SHOULD NOT)인 점은 클라이언트가 못 바꿈. 콜백에서 프래그먼트 즉시 소거·state 일회성·Referrer-Policy: no-referrer로 보상.
- §4 "your App" 단수 해석은 미회신(PRD_28 §11 #4) — 단, A는 교차 저장이 0이라 회신이 부정이어도 로그인 구조가 바뀌지 않는다.

■ B. 경량 연합(A + sitemap.pi가 짧은 수명 핸드오프 토큰을 fragment로 발급, 앱별 키·JWKS 검증) — 4/10
근거(A의 장점을 전부 승계하되 핸드오프 1기능이 세 축과 동시에 충돌):
- 표준 충돌: RFC 9700 §2.1.2 fragment 토큰 SHOULD NOT(유출·재생, sender-constraining 불가), §4.3.2 query MUST NOT·fragment도 히스토리 잔존; draft-ietf-oauth-browser-based-apps [확인중 : rfc-editor.org RFC 번호] §7.2.3.2~4 히스토리·3rd-party 스크립트 노출. PKCE·DPoP·refresh rotation 등 표준 완화책을 하나도 적용할 수 없다(Pi Sign-In code flow 부재와 무관하게 핸드오프 자체가 bearer-by-fragment).
- 쿠키 전제 붕괴: 교과서 구현(Teleport 2021-05)은 대상 도메인의 state 쿠키로 로그인 CSRF를 막는데 Pi Browser는 Set-Cookie 미저장 → state를 대상 origin localStorage에 JS init 페이지로 심는 추가 리다이렉트가 필요. seg6(2025-12)도 URL 토큰·postMessage+localStorage를 전부 기각하고 Service Worker 헤더 주입까지 갔다.
- 약관 충돌: 핸드오프 토큰 payload가 사이트 A(sitemap.pi 앱)에서 검증한 pi_username을 사이트 B origin으로 넘김 = §4 "transfers or shares ... usernames" 문언 정면, PRD_28 §1.1-1·§7 위반. JWKS로 공유 시크릿을 피해도 "식별자 이전"이라는 §4 표면은 그대로다.
- 심사 충돌: sitemap.pi → 타 origin 리다이렉트가 로그인 플로우에 들어감 = A-6, Pi Browser 내 C-1-C. ROADMAP_MULTISITE가 M5 보류로 둔 바로 그 안.
- 효용이 0에 수렴: Pi Browser에서 아낄 수 있는 것은 "탭 1번/사이트"뿐(SDK authenticate 무입력). 일반 브라우저는 accounts.pinet.com 세션 재사용으로 이미 재프롬프트 생략.
- 유일하게 방어 가능한 변형은 "토큰이 아니라 목적지 URL만 넘기는 디렉터리"인데 그건 A다. B 점수 4는 "앱별 키·JWKS·수명≤60초·1회 사용·aud 제한"을 전부 갖춘 최선 구현 기준이며, 그래도 §4·A-6가 남아 과반 미달.

■ C. 중앙 IdP(sitemap.pi 또는 auth.pi를 OIDC Provider — Better Auth oauth-provider / Zitadel·Ory 셀프호스팅) — 2/10
근거:
- Pi Browser에서 구조적으로 '단일 로그인'이 성립하지 않음. Auth0 SSO 문서·Kinde: 사일런트 SSO는 IdP 도메인 쿠키 유무로 결정, checkSession iframe도 쿠키 필요. Set-Cookie 미저장 환경의 동작은 문서화조차 없다 → 19개 앱이 각각 IdP를 거쳐도 매번 인증 UI, 즉 Pi → 자체 IdP → 앱 2단 리다이렉트만 추가.
- Pi Sign-In 규칙이 허브를 막음: implicit 전용·client_secret 없음(pi-sign-in.md) → 허브가 다른 앱을 대신하는 confidential client가 될 수 없고, redirect_uri는 "그 앱의 verified domain"만 허용 → 사이트당 Client ID·도메인 검증은 어떤 IdP를 세워도 없어지지 않는다(LOGIN_PLAYBOOK:150). .pi TLD 직하 19 origin이라 상위 도메인 쿠키도 원천 불가(Vercel KB PSL, Supabase #5742).
- §4 최대 리스크 구조: 19앱의 username·토큰을 한 DB가 수집·보관·재발급 = "transfers or shares usernames/UIDs/access token" + §3 외부 전송 해석. PRD_28 §7 "자체 SSO 신설 금지"·§1.1-1 위반.
- 심사: 별도 origin(auth.pi)으로의 로그인 리다이렉트 = A-6·C-1-C 정면. Pi Sign-In은 Pi 공식 경로지만 자체 IdP는 아니다(A-4 "Use Only Pi Authentication").
- 단일 장애점·공유키: Stytch(SSO 계층만 1h32m 실패, 핵심 API 정상)·1Password(SSO가 끌어안은 DNS 의존성)·Azure AD(서명키 1개 → 전 서비스 14h)·Cloudflare/Okta(IdP 세션 토큰 1개가 침투 입구). QCon SF 2025: MSA 첫 단추로 IdP 중앙화 → 릴리스 당일 전체 다운. 1인 운영에서 복구 불능 리스크.
- 성숙도·비용: Auth.js v5는 RP 전용(IdP 불가); Better Auth oauth-provider는 전신 deprecated 예정·"may not be suitable for production"; Keycloak 셀프호스팅 $50~300/월 + 업그레이드·백업·HA·온콜(pkgpulse 2026-03, Skycloak 2026-09); Ory는 admin UI 없음. 비용을 내고도 핵심 효익(단일 로그인)을 Pi Browser에서 못 얻는다.
- 2점은 "일반 브라우저 한정·Pi Sign-In code flow 출시 후"라는 조건부 미래 가치를 인정한 것. 재검토 트리거: ① Pi Sign-In Authorization Code+PKCE/refresh 출시 ② §4 공식 해석 회신(PRD_28 §11 #4) ③ cafe.pi 메인넷 승인으로 A-6 선례 확보 — 둘 이상 충족 전 착수 금지.

■ D. SaaS IdP(Auth0/Clerk/WorkOS) 중앙화 — 1/10
근거(C의 모든 결함 + 3가지 추가):
- A-4 문언 직격: "Other login methods, such as email or third-party accounts, are prohibited". 로그인 화면이 제3자 SaaS 도메인(*.auth0.com 등)이면 "Pi 외 로그인 경로"로 읽히고, A-6 외부 리다이렉트는 케이스 심사가 아니라 상시 발생.
- §4 전송 표면 최대: 19앱 username·토큰이 제3자 SaaS 테넌트에 저장. "service provider who helps you build, run, or operate your App" 예외로 방어하려 해도 'your App' 단수 해석이 미회신인 상태에서 19앱 공용 테넌트는 가장 넓은 해석 리스크. Cloudflare/Okta 2023-10 사례처럼 SaaS IdP 지원 시스템 침해가 곧 전 앱 침투 입구.
- 기술 부정합: 상용 IdP의 upstream social connection은 Authorization Code(client_secret) 전제인데 Pi Sign-In은 implicit·client_secret 없음 → Pi를 업스트림 IdP로 꽂는 것 자체가 표준 커넥터로 불가(커스텀 커넥터 필요). Supabase Third-Party Auth도 Clerk·Firebase·Auth0·Cognito·WorkOS 5종만 1급이고 비대칭 JWT+OIDC Discovery 요구, 19 Supabase 프로젝트 공유 여부 미문서. Safari ITP·서드파티 쿠키 차단으로 사일런트 SSO는 top-level 리다이렉트로 퇴화(Auth0 ITP 문서 2026-05).
- Pi Browser 쿠키 부재로 SaaS가 전제하는 세션 모델 자체가 작동 안 함 — 비용(Zitadel Pro $100/월, Clerk $25+$0.02/MAU, WorkOS SSO 커넥션 $125/월)만 지불하고 효익 0. 결제는 어차피 Pi Browser SDK 전용(payments 스코프 미제공)이라 SaaS 세션으로 핵심 가치 2(결제)에 기여 없음.
- 1점은 "일반 브라우저 전용 보조 SSO로, 등재 심사 선례·§4 회신 이후"라는 극히 좁은 미래 조건만 인정.

■ 종합
권고 A. 통합 SSO는 "인증 서버"가 아니라 "인증 라이브러리(@pi/auth)" 공유로 이미 달성됐고, 데이터·세션·시크릿은 앱별 분리를 유지한다(코드 SSO O, 데이터 SSO X). sitemap.pi는 IdP가 아니라 디렉터리·런처로 한정(토큰이 아닌 목적지 URL만 전달). A에 즉시 보강할 2건: ① getSessionUser()에 token_ver(또는 del_yn/role) 재확인으로 즉시 폐기 ② Pi Sign-In 콜백 하드닝(프래그먼트 즉시 소거·Referrer-Policy: no-referrer·콜백 페이지 서드파티 스크립트 0). ROADMAP_MULTISITE의 허브 SSO는 보류→폐기로 격상 가능하며, 재검토 트리거는 C 항목의 3건으로 명문화.

### 렌즈 3 — A 8 / B 5 / C 3 / D 2

렌즈: 사용자 경험·전환율(Pi Browser 경로 / 일반 브라우저 경로)·점진 도입 가능성. 0~10점. 보안·법무는 전환율(등재 탈락 = 전환 0)에 영향을 주는 한도 내에서만 반영.

■ 채점 전제 (출처)
1) Pi Browser에서는 Pi 자체가 이미 SSO 세션이다. window.Pi.authenticate()는 최초 1회 동의 후 무입력 1탭(SDK_reference README "첫 authenticate 때만 동의 다이얼로그"), 쿠키가 없어 어떤 IdP 쿠키 세션도 성립하지 않는다(Auth0 SSO 문서 "SSO 쿠키 유무로 로그인 화면 생략 결정"; RFC 8252 §8.12 내장 UA는 인증 상태 비공유). 따라서 Pi Browser에서 SSO가 줄일 수 있는 마찰의 상한은 "사이트당 탭 1번"이다.
2) 일반 브라우저에서는 Pi Sign-In이 사이트마다 동의 클릭(+미로그인 시 QR)을 요구한다(pi-sign-in.md "사용자는 Pi Browser 안에서 인증하고 사이트는 일반 브라우저에서 실행"; OurCryptoTalk "매번 명시 동의"). 여기가 SSO가 실제로 체감 개선을 줄 수 있는 유일한 경로다.
3) 전환율의 최대 변수는 메인넷 등재다. A-4 "Use Only Pi Authentication", A-6 "Avoid Redirection to External Sites", C-1-C "로그인 포함 핵심 플로우에서 Pi Browser 밖 이탈 금지"(MAINNET_READINESS_CHECKLIST, 모더레이터 답변). 등재 탈락이면 Pi Browser 경로 전환율은 0이다.
4) 결제는 어느 안이든 각 앱의 Pi.authenticate() 세션이 필요하다(pi-sign-in.md "payments scope 미제공"; PaymentDTO.user_uid는 앱별 uid). 즉 SSO로 세션을 넘겨받아도 결제 직전 앱별 authenticate()가 한 번은 돈다 — 전환 퍼널 끝단의 마찰은 네 안 모두 동일.

■ A. SSO 없음 (Pi=IdP, 앱별 세션 + @pi/auth + pi_username) — 8점
- Pi Browser UX: 최적. 리다이렉트 0, 탭 1번/사이트, 결제까지 같은 세션으로 직결. 전제 4)에 따라 다른 어떤 안도 이보다 짧은 경로를 만들 수 없다. A-4/A-6/C-1-C 충돌 0 → 등재 전환율 리스크 최소. cafe.pi에서 실기기 검증 완료된 경로(CLAUDE.md 2026-07-08).
- 일반 브라우저 UX: 사이트마다 Pi Sign-In 동의 1클릭(+QR). accounts.pinet.com 세션이 살아 있으면 비밀번호 입력은 없으나 동의 화면은 반복된다 — 이것이 A의 유일한 감점 요인(-2). 다만 19개 .pi는 Pi Browser 전용 진입점이고 일반 브라우저용 https 도메인은 별도라(.pi 위키 "Pi Browser 자체 DNS"), 일반 브라우저 트래픽 비중 자체가 낮다.
- 점진 도입: 현 상태 그대로. 코드베이스 수집 ⑩ "인증 코드 SSO는 이미 달성" — @pi/auth·@pi/db·@pi/guard 패키지 import 1줄, 사이트당 증분은 Portal 앱·Client ID·Redirect URI 등록뿐(ROADMAP_MULTISITE:31). 이 등록 비용은 Pi 규칙(redirect_uri 호스트 = 그 앱의 verified domain)이라 어떤 SSO로도 없앨 수 없다.
- 감점 사유 요약: 일반 브라우저 동의 반복(-1.5), 실기기 동의 화면 횟수 미실측 [확인중](-0.5).

■ B. 경량 연합 (A + sitemap.pi 핸드오프 토큰, 앱별 키·JWKS) — 5점
- Pi Browser UX: 이득 0에 가깝다. 핸드오프 토큰으로 대상 앱 세션을 만들어도 결제엔 그 앱의 authenticate()가 필요(전제 4) → 결국 탭 1번은 그대로. 반면 쿠키가 없어 state를 대상 origin localStorage에 선저장하는 JS init 페이지 왕복이 추가된다(Teleport 패턴은 쿠키 전제; RFC 9700 §4.1.3) → 실제 체감 경로는 A보다 길어진다. 사이트 간 리다이렉트는 C-1-C/A-6 심사 표면 → 등재 리스크로 전환율이 오히려 하락할 수 있다.
- 일반 브라우저 UX: sitemap.pi(런처)에서 출발하는 흐름에서만 동의 클릭 절감. 직접 진입(북마크·검색)은 여전히 Pi Sign-In. 부분 이득(+1~2).
- 점진 도입: A 위에 얹는 형태라 구조적으로는 점진적이나, 19개 앱 전부가 핸드셰이크를 구현해야 효과가 난다(seg6 "모든 앱이 핸드셰이크 구현 필요"). pi_username을 origin 간에 넘기는 순간 Developer Terms §4 "transfers or shares usernames" 문언에 걸려 PRD_28 §11 #4 회신 전 착수 금지 상태 — 즉 지금은 도입 자체가 불가(ROADMAP_MULTISITE M5 보류).
- 결론: 얻는 UX는 "런처 경유 일반 브라우저에서 클릭 1개", 잃을 수 있는 것은 등재. 전환율 기대값으로는 A보다 낮다.

■ C. 중앙 IdP (sitemap.pi/auth.pi를 OIDC Provider, Better Auth / Zitadel·Ory 셀프호스팅) — 3점
- Pi Browser UX: A보다 명확히 나쁘다. 앱 → IdP 리다이렉트 → IdP에 쿠키 세션 없음(Set-Cookie 미저장) → IdP에서 Pi.authenticate() 1탭 → 앱으로 code 리다이렉트 → 결제 때 앱 자체 authenticate() 또 1회(IdP가 받은 uid는 IdP 앱의 uid라 결제 불가). 즉 리다이렉트 2회 + 탭 2회. 게다가 별도 origin으로의 로그인 리다이렉트는 A-6/C-1-C 정면 충돌 → 19개 앱 전부 등재 탈락 가능 → Pi Browser 전환율 0 시나리오.
- 일반 브라우저 UX: 유일하게 진짜 SSO가 성립하는 지점. IdP 도메인에 1st-party 쿠키 → 이후 18개 앱은 top-level 리다이렉트로 사일런트 로그인(Auth0 prompt=none; ITP는 top-level 리다이렉트엔 영향 없음). 동의 클릭 19→1. 이 가치만으로 +3.
- 점진 도입: 최악. Auth.js는 RP 전용이라 IdP 불가, Better Auth OAuth Provider는 "may not be suitable for production use", Keycloak/Zitadel 셀프호스팅은 1인 운영에 업그레이드·백업·HA·온콜 부담(pkgpulse 2026-03). QCon SF 2025 사례처럼 "인증 중앙화를 첫 단추"로 두는 전환이 가장 큰 폭발 반경(릴리스 당일 전체 다운). Stytch·1Password·Azure AD 포스트모템이 보여주듯 SSO 계층 장애 = 19개 앱 동시 로그인 불가 → 가용성 측면 전환율 하락.
- 결론: 일반 브라우저 SSO 가치는 실재하지만 Pi Browser 경로(핵심 가치 1·2)의 UX 악화와 등재 리스크, 점진 도입 불가가 이를 상쇄하고 남는다.

■ D. SaaS IdP (Auth0/Clerk/WorkOS) 중앙화 — 2점
- Pi Browser UX: C와 동일한 쿠키 문제에 더해, SaaS Universal Login 페이지는 제3자 도메인(auth0.com 등)이라 A-6 "external sites"에 가장 명백히 해당하고, "third-party accounts ... prohibited"(A-4) 해석 리스크까지 겹친다. Pi Sign-In이 implicit 전용·client_secret 없음이라 Auth0/Clerk의 커스텀 소셜 커넥션(authorization code 전제)에 Pi를 upstream IdP로 붙이는 것조차 현재 불가 → Pi Browser에서는 SaaS 세션과 Pi 세션 2중 운영이 강제된다. Pi Browser WebView에서 SaaS 로그인 페이지 동작은 어느 벤더도 문서화하지 않음(Auth0 SSO 문서 "쿠키 없는 환경 미문서화").
- 일반 브라우저 UX: C와 같은 사일런트 SSO 가치(+3), 가장 매끈한 로그인 UI. 단 Safari ITP 회피에 커스텀 도메인 필요(Auth0 ITP 문서), 19개 별도 도메인이면 커스텀 도메인 비용·설정이 19배.
- 점진 도입: SaaS라 서버 구축은 빠르지만, 도입하는 순간 Pi Browser 경로는 여전히 Pi.authenticate() 직결이어야 하므로 "일반 브라우저 전용 보조 SSO"로만 쓸 수 있고, 인증 체계가 2개가 된다 — 사용자에게는 같은 사이트에서 환경에 따라 다른 로그인 화면이 보이는 일관성 저하. 비용(Clerk $25+$0.02/MAU, Zitadel Pro $100/월)을 내고도 핵심 효익(Pi Browser 단일 로그인)을 못 얻는다(central-auth-nextjs 조사 결론). Clerk 무료 구간(10k vs 50k) 등 가격 정보 상충으로 채택 시 재확인 필요.

■ 종합
- Pi Browser 경로(핵심 가치 1·2 — 로그인·결제)에서는 A가 최단 경로이고 B·C·D는 전부 경로를 늘리거나 등재 리스크로 전환율을 0으로 만들 수 있다. 전제 4)(결제는 앱별 authenticate 필수) 때문에 SSO가 결제 퍼널을 단축하지 못한다.
- 일반 브라우저 경로에서만 C·D가 "동의 19→1"의 실질 UX 이득을 주지만, .pi 서비스의 주 진입점이 Pi Browser이고 Pi Sign-In 자체가 "향후 code+PKCE·추가 scope"를 예고한 초기 버전(Pi2Day 블로그)이라 지금 중앙 IdP를 세우면 Pi 로드맵과 이중 투자가 된다.
- 점진성: A(0 변경) > B(A 위에 추가, 단 §4 회신 전 금지) > D(SaaS 빠르나 2중 체계) > C(빅뱅 이관).
- 권고: A 채택. 재검토 트리거 — ① Pi Sign-In authorization code+PKCE/refresh 출시, ② Developer Terms §4 공식 회신(PRD_28 §11 #4), ③ cafe.pi 메인넷 승인으로 A-6 선례 확보. 둘 이상 충족 시 "일반 브라우저 전용 보조 SSO"로 B 또는 C를 재채점. A의 일반 브라우저 감점(-1.5)은 accounts.pinet.com 세션 재사용 실측값으로 재평가 가능 [확인중 : 실기기·데스크톱 동의 화면 횟수].

## 부록 B — 조사 출처 전체(59)

- Stytch 인시던트 포스트모템 — SAML SSO requests failing (AWS us-east-1 장애 연쇄) — https://status.stytch.com/cmgzdn6k903jgjzg6u94ljjdh (2025-10-20 (포스트모템 2025-10-21))
- 1Password 인시던트 리포트 — Intermittent SSO unavailability due to downstream outage — https://status.1password.com/incidents/jncn9pjy74m5 (2025-07-14 (리포트 2025-08-07))
- Microsoft Azure AD 인증 장애 공지·예비 RCA — 자동 키 로테이션이 'retain' 키를 삭제 — https://learn.microsoft.com/en-us/answers/a/317011 (2021-03-15 ~ 2021-03-16)
- Cloudflare 블로그 — How Cloudflare mitigated yet another Okta compromise — https://blog.cloudflare.com/how-cloudflare-mitigated-yet-another-okta-compromise/ (2023-10-20)
- IETF OAuth WG 메일 스레드 — Cryptographic hygiene and the limits of jwks_uri (AWS Identity A. Backman 제기, D. Hardt·M. Jones 답변) — https://mailarchive.ietf.org/arch/msg/oauth/6qjzupOy3wsGKXMdPxewIu4ws2Y/ (2020-01-08 ~ 2020-01-10)
- QCon SF 2025 세션 — Monolith Down: Cleaning Up After the Great Identity Migration Disaster (Sonya Natanzon) — https://qconsf.com/track/nov2025/navigating-major-architecture-migrations (2025-11-18)
- seg6 — the frontend auth middleware: cross-origin iframes without third-party cookies — https://seg6.space/posts/the-frontend-auth-middleware/ (2025-12-25)
- Auth0 Docs — Single Sign-On — https://auth0.com/docs/authenticate/single-sign-on (상시 갱신 문서(2026-10 확인))
- microservices.io — Pattern: Access Token (Chris Richardson) — https://microservices.io/patterns/security/access-token.html (미기재(사이트 ©2026))
- Pi Sign-in — Developer Integration Guide (pi-apps/pi-platform-docs, 공식) — https://github.com/pi-apps/pi-platform-docs/blob/master/pi-sign-in.md (발행일 미표기 — 2026-06-28 Pi2Day 출시와 함께 추가, 2026-10-13 확인)
- Client SDK reference — Pi.authenticate / UserDTO (pi-apps/pi-platform-docs, 공식) — https://github.com/pi-apps/pi-platform-docs/blob/master/SDK_reference.md (발행일 미표기, 2026-10-13 확인 (platform_API.md 동일 저장소))
- Mainnet Listing Requirements (Pi Developer Guide, 공식 커뮤니티 가이드) — https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/mainnetListingRequirements/ (발행일 미표기, 2026-10-13 확인 (pi-sdk-docs/getting-started/MainnetListing 동일 내용))
- Pi Network Developer Terms of Use (SocialChain, 공식 — minepi.com/developers 푸터 링크) — https://socialchain.app/developer_terms (Last Update 2023-01-09, 2026-10-13 확인)
- Pi2Day 2026: Advancing Utility and External Access (Pi Network 공식 블로그) — https://minepi.com/blog/pi2day2026/ (2026-06-28)
- Pi Sign-in Launches as OAuth Login for Third-Party Apps (Our Crypto Talk, 2차 보도) — https://ourcryptotalk.com/news/pi-sign-in-oauth-login-third-party-apps (2026-06-30)
- Pi Network oAuth Client Pi Sign-In Developer Portal (r/PiNetwork 커뮤니티 — 다중 앱 사례) — https://www.reddit.com/r/PiNetwork/comments/1vex1p9/pi_network_oauth_client_pi_signin_developer_portal/ (2026-08-04 (댓글 본문은 exa 검색 하이라이트로만 확인, 직접 열람 403))
- .pi 도메인 접근성 — Pi Browser & Pi Wallet (Pi 커뮤니티 위키) + pi Domain Reservation (공식 블로그) — https://pinetwork.atlassian.net/wiki/spaces/WIKI/pages/582713345/Pi+Browser+Pi+Wallet (위키 발행일 미표기 / 블로그 2025-03-21 (https://minepi.com/blog/pi-domain-reservation/))
- Pi Platform Docs — pi-sign-in.md (Pi Sign-In 공식 문서, GitHub pi-apps/pi-platform-docs) — https://github.com/pi-apps/pi-platform-docs/blob/master/pi-sign-in.md (발행일 미표기 (2026-06 Pi2Day 출시 기능, 2026-10-13 조회))
- Pi Platform Docs — platform_API.md (/v2/me UserDTO) — https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md (발행일 미표기 (2026-10-13 조회))
- Pi Network Developer Terms of Use (socialchain.app, minepi.com/developers 푸터 공식 링크) — https://socialchain.app/developer_terms (Last Update: 2023-01-09)
- Supabase Docs — Third-Party Auth Overview — https://supabase.com/docs/guides/auth/third-party/overview (발행일 미표기 (2026-10-13 조회))
- Supabase Docs — Auth Hooks — https://supabase.com/docs/guides/auth/auth-hooks (발행일 미표기 (2026-10-13 조회))
- GitHub Discussion supabase/supabase #5742 — Share session across subdomains / multiple apps — https://github.com/supabase/supabase/discussions/5742 (2022-03-01 개설, 주요 답변 2022-11-03(Supabase Auth 메인테이너)~2025-07-12)
- Vercel KB — Can I set a cookie from my Vercel project subdomain to vercel.app? — https://vercel.com/kb/guide/can-i-set-a-cookie-from-my-vercel-project-subdomain-to-vercel-app (발행일 미표기 (2026-10-13 조회))
- Better Auth Docs — OAuth Provider plugin (OAuth 2.1 + OIDC) / OIDC Provider plugin — https://better-auth.com/docs/plugins/oauth-provider (v1.6~1.8 문서 (2026-10-13 조회))
- Skycloak — Top Auth0 Alternatives in 2026: Open Source and Managed Options (관리형 Keycloak 판매사 블로그, 이해관계 고지됨) — https://skycloak.io/blog/auth0-alternatives-open-source-managed/ (2026-03-17 (갱신 2026-09-07))
- ZITADEL Pricing (공식) — https://zitadel.com/pricing (2026-10-13 조회)
- pkgpulse — Logto vs Ory vs Keycloak: open-source identity providers 2026 — https://www.pkgpulse.com/guides/logto-vs-ory-vs-keycloak-open-source-identity-providers-2026 (2026-03-09 (데이터 접근 2026-08-24))
- agentdeals — Auth & Identity Comparison 2026 (관리형 SaaS 무료 구간) — https://agentdeals.dev/auth-comparison-2026 (2026 (2026-08-21 기준 표기))
- Auth0 Docs — Configure Silent Authentication (prompt=none) — https://auth0.com/docs/authenticate/login/configure-silent-authentication (발행일 미표기 (2026-10-13 조회))
- Pi Platform Docs — Pi Sign-In (pi-apps/pi-platform-docs/pi-sign-in.md) — https://github.com/pi-apps/pi-platform-docs/blob/master/pi-sign-in.md (2026-06-28 (Pi2Day 출시, 리포지토리 문서 — 개별 갱신일 미표기))
- Pi Platform Docs — Platform API GET /v2/me (UserDTO) — https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md (리포지토리 문서 (갱신일 미표기))
- Pi Network Developer Terms of Use — Section 4 (Your Responsibilities; Use Restrictions) — https://socialchain.app/developer_terms (2023-01-09 (last updated))
- RFC 9700 — Best Current Practice for OAuth 2.0 Security (BCP 240) — https://www.rfc-editor.org/rfc/rfc9700.html (2025-01)
- Teleport Blog — Secure Session Transfer Between Web Apps on Different Domains — https://goteleport.com/blog/web-session-sharing-transfer (2021-05-04)
- OneUptime — How to Handle OIDC Logout Across App and Identity-Provider Sessions — https://oneuptime.com/blog/post/2026-08-10-oidc-app-provider-session-logout/markdown (2026-08-10)
- Auth0 Blog — Authentication Provider Best Practices: Centralized Login — https://auth0.com/blog/authentication-provider-best-practices-centralized-login.md (2017-12-12)
- Didit — Microservices Identity Architecture: Centralized vs Decentralized Models — https://didit.me/blog/microservices-identity-architecture-centralized-vs-decentralized-models-with-didit/ (2026-03-06 (updated 2026-05-21))
- Kinde Docs — User authentication across multiple applications — https://docs.kinde.com/authenticate/manage-authentication/user-auth-applications/ (미표기 (현행 문서))
- Google Identity — OpenID Connect (sub claim) — https://developers.google.com/identity/openid-connect/openid-connect (현행 문서 (갱신일 미표기))
- (프로젝트 내부) PRD_27 §2.6 Developer Terms 판정 · ROADMAP_MULTISITE 허브 SSO 보류 — docs/PRD_27_PI_FACTORY.md · docs/ROADMAP_MULTISITE.md (2026-07-19 (판정) · 2026-10-11 (ROADMAP))
- RFC 9700 — Best Current Practice for OAuth 2.0 Security (BCP 240) — https://www.rfc-editor.org/rfc/rfc9700.html (2025-01)
- draft-ietf-oauth-browser-based-apps [확인중 : rfc-editor.org RFC 번호] — OAuth 2.0 for Browser-Based Applications (BCP 212) — https://www.rfc-editor.org/rfc/rfc10017.html (2026-08 (draft-27은 2026-07-06))
- RFC 8252 — OAuth 2.0 for Native Apps (BCP 212) — https://www.rfc-editor.org/rfc/rfc8252.html (2017-10)
- Pi Platform Docs — pi-sign-in.md (공식, pi-apps/pi-platform-docs) — https://github.com/pi-apps/pi-platform-docs/blob/master/pi-sign-in.md (2026-06-28 출시 (문서는 2026-10-13 조회 기준))
- Pi Platform Docs — platform_API.md (GET /v2/me, UserDTO) — https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md (2026-10-13 조회)
- Pi Network Developer Terms of Use — Section 4 Use Restrictions (minepi.com/developers 푸터 공식 링크) — https://socialchain.app/developer_terms (Last Updated 2023-01-09)
- OWASP HTML5 Security Cheat Sheet — Local Storage — https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html (상시 갱신(페이지에 일자 미표기))
- Auth0 Support — Troubleshoot token renewal issues in Safari with ITP enabled — https://support.auth0.com/center/s/article/troubleshoot-auth0-token-renewal-issues-in-safari-with-itp-enabled (Last Updated 2026-05-26)
- OurCryptoTalk — Pi Sign-In: OAuth login for third-party apps (2차 자료) — https://ourcryptotalk.com/news/pi-sign-in-oauth-login-third-party-apps (2026-06-30)
- OAuth 2.0 for Browser-Based Applications (draft-ietf-oauth-browser-based-apps-27 → draft-ietf-oauth-browser-based-apps [확인중 : rfc-editor.org RFC 번호], BCP) — https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps (2026-07-06 (draft-27, 이후 draft-ietf-oauth-browser-based-apps [확인중 : rfc-editor.org RFC 번호]로 발행 표기))
- RFC 9700: OAuth 2.0 Security Best Current Practice (BCP 240) — https://www.rfc-editor.org/rfc/rfc9700.html (2025-01)
- OpenID Connect Core 1.0 incorporating errata set 2 — §8 Subject Identifier Types, §17.3 Correlation — https://openid.net/specs/openid-connect-core-1_0.html (2023-12-15)
- Pi Platform Docs — pi-sign-in.md (Pi Sign-in 공식 가이드, pi-apps/pi-platform-docs) — https://github.com/pi-apps/pi-platform-docs/blob/master/pi-sign-in.md (2026-06 (Pi2Day 2026-06-28 공개 — 2차 출처 기준, 커밋일 API 응답 실패로 미확인))
- Pi Platform Docs — platform_API.md (GET /v2/me, UserDTO) — https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md (2024-08-28 (최종 커밋))
- RFC 8252: OAuth 2.0 for Native Apps (BCP 212) — https://www.rfc-editor.org/rfc/rfc8252.html (2017-10)
- Auth0 Blog — Things Developers Get Wrong About the Backend for Frontend Pattern — https://auth0.com/blog/things-developers-get-wrong-about-the-backend-for-frontend-pattern/ (2026-04-24)
- Curity — The Phantom Token Approach — https://curity.io/resources/learn/phantom-token-pattern/ (2020-03-27)
- Microsoft Azure Architecture Center — API gateways in microservices — https://learn.microsoft.com/en-us/azure/architecture/microservices/design/gateway (2025-02-01 (갱신 2026-01-24))
