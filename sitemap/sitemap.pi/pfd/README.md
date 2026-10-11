# pfd — sitemap.pi 프로세스 다이어그램

> 작성 2026-10-11 · 도구 **Mermaid 11.15**(cdnjs, SRI 고정) + Playwright(정적 export) · 소스가 정본, SVG/PNG 는 산출물

## 보기

| 방법 | 명령 | 비고 |
|---|---|---|
| 뷰어(항상 최신) | `node sitemap/sitemap.pi/pfd/serve.mjs` → http://localhost:3005 | index.html 이 `.mmd` 를 fetch 하므로 file:// 직접 열기는 안 됨 |
| 정적 이미지 | `png/*.png`(2배 해상도) · `svg/*.svg`(벡터, 문서 삽입용) | export 시점 고정 — `.mmd` 수정 후 재생성 필요 |
| VS Code | `.mmd` 열고 Mermaid 미리보기 확장 | 편집용 |

## 목록

| # | 파일 | 내용 | 종류 |
|---|---|---|---|
| 01 | `01-progress-overview.mmd` | Phase 0·1·후속 진행 현황(완료/부분/미착수/차단 색 구분) | flowchart |
| 02 | `02-session-2026-10-11.mmd` | 2026-10-11 작업 세션 — 요청 8건 → 커밋 11건, 막힌 지점과 해소 | flowchart |
| 03 | `03-login-architecture.mmd` | 로그인 통합 아키텍처 — Pi SDK / Pi Sign-In / Google 3경로 → `getSessionUser` 1세션 | flowchart |
| 04 | `04-link-sequence.mmd` | Pi 계정 ↔ Google 연동 시퀀스(코드 발급 → 입력 → 세션 재발급) | sequenceDiagram |
| 05 | `05-session-resolution.mmd` | 세션 판정 — 서버 `getSessionUser` · 클라이언트 `useAppUser` 분기 | flowchart |
| 06 | `06-multisite-roadmap.mmd` | 멀티사이트 Site Kit M0~M5 + PRD_28 §8 웨이브 게이트 | flowchart |

`png/00-overview-page.png` 는 뷰어 전체 페이지 캡처.

## 재생성 (SVG·PNG)

1. `node sitemap/sitemap.pi/pfd/serve.mjs`
2. Claude Code 에서 Playwright MCP 로 `http://localhost:3005` 열고 각 `#dNN .diagram svg` 를 `browser_take_screenshot`(scale device) → `png/`, `browser_evaluate` 로 `svg.outerHTML` → `svg/`
   (수동이면 브라우저에서 열고 SVG 를 "다른 이름으로 저장")
3. 커밋은 `.mmd` + 산출물 함께(추적성)

## 규칙

- 라벨은 한국어, 코드 식별자·커밋 해시는 원문. 브랜드 표기 규칙(PyCafé™ 등) 적용
- 상태 색 : 완료 `#dcfce7` / 부분 `#fef9c3` / 미착수 `#f1f5f9` / 차단·이슈 `#fee2e2` / 게이트·웨이브 `#e0e7ff`
- 다이어그램은 **문서의 요약**이다 — 수치·판정이 바뀌면 원문(ROADMAP·PLAYBOOK)을 먼저 고치고 여기 반영

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-11 | 최초 작성 — 6종 + 뷰어 + 정적 서버, Mermaid 11.15.0 SRI 고정 |
