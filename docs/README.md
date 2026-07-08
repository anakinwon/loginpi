# docs/ 인덱스 (2026-07-08 정리)

> 문서 탐색 진입점. 상세 최신 상태는 `PRD.md` 헤더와 `ROADMAP.md`가 정본.

## 🧭 핵심 문서 (항상 최신 유지)

| 문서 | 역할 |
|---|---|
| `PRD.md` | 마스터 PRD **라이트버전** — 개요·핵심가치·기능현황 요약 (구현 상세 원문: `archive/PRD_FULL_v12.8_2026-07-08.md`) |
| `ROADMAP.md` | 개발 마일스톤 정본 (Phase 단위) |
| `TROUBLESHOOT.md` | 운영 리스크 레지스터 + 사고·근본수정 기록 정본 |
| `MAINNET_READINESS_CHECKLIST.md` | 메인넷 전환 준비 체크리스트 |
| `DEPLOY_STRATEGY.md` / `DEPLOY_NOTICE.md` | 2단계 배포(staging→운영) 전략 |
| `UPGRADE_STRATEGY.md` | 패키지 업그레이드 전략 |

## 📋 기능별 PRD (번호순)

| PRD | 주제 |
|---|---|
| `PRD_0_INT.md` | AI인큐베이터 플랫폼 컨셉 |
| `PRD_1_PROMPT.md` | 프롬프트 |
| `PRD_2_SECURITY.md` | 보안 (KISA 21개 항목) |
| `PRD_3_MUL_LAN.md` | 다국어 (189 locale) |
| `PRD_4_CHAT.md` / `PRD_7_CHAT2.md` | PyChat™ 카페 채팅 |
| `PRD_5_USERS.md` | 사용자 |
| `PRD_6_CHART.md` | 차트/대시보드 |
| `PRD_8_MPS.md` | PyShop™ 마켓플레이스 |
| `PRD_9_VOICE_CHAT.md` | PyVoice™ 음성채팅 |
| `PRD_10_GPS.md` | 위치기반서비스(LBS) |
| `PRD_11_EVENT.md` | 이벤트 미션 |
| `PRD_12_TOKEN*.md` | BEAN 토큰 발행 기획(+백서·법무자문) — 앱 코드 미포함 |
| `PRD_13_MSG.md` | 텔레그램 알림·릴레이 |
| `PRD_14_SUBSC.md` / `_REDESIGN.md` | 구독 (REDESIGN이 현행 설계) |
| `PRD_15_FEE.md` | 요금 표준 마스터(`bean_fee_plan`) |
| `PRD_16_TOKEN_MNG.md` | Bean 경제 관리 |
| `PRD_17_CAFE_THEMA.md` | 카페 테마 v2 |
| `PRD_18_PERFORM.md` | 성능 |
| `PRD_19_CATEGORY.md` | 상품 카테고리 |
| `PRD_20_FEEDBACK.md` | 이용후기+Bean 보상 |
| `PRD_21_DATA_ANAL.md` | 데이터 분석 |
| `PRD_22_MONITOR.md` | 시스템 모니터링 |
| `PRD_23_FUNC_TUNING.md` | 메인넷 기능 절제/부각 |
| `PRD_24_FEES_STRATAGE.md` | 이중 요금제(Bean/Pi) 모드 스위치 |
| `PRD_26_OPEN_PROMO_FEE.md` | 오픈기념 무료 프로모(OneKey) |

## 📂 하위 디렉토리

- `da/` — 데이터 아키텍처 표준 정본 (`데이터표준규칙.md`·`품질점검기준서.md`)
- `law/` — 법무·약관·컴플라이언스
- `contracts/` — 계약 관련
- `Fees/` — 요금 산정 원자료
- `GAOPEN/` — 그랜드오픈 행사
- `frameworks/` — 프레임워크 자료
- `troubleshoot/` — 성능 진단 등 시점성 리포트 모음
- `archive/` — 완료된 일회성 점검 결과 + `PRD_FULL_v12.8_2026-07-08.md`(구 PRD.md 전문 — Phase 0~22 구현 상세·디렉토리 구조·전체 변경이력) 보관
- `dist/` — 백서 PDF 산출물 / `.pptx-build/` — PPTX 빌드 도구

## 🖥️ 발표·매뉴얼 (pptx)

`Cafe.pi설명서.pptx`, `Cafe.pi_쉬운_사용자매뉴얼(.._세로).pptx`, `제품제안서.pptx`, `제품설명서_202060615.pptx`, `Infrastructure.pptx`, `보안취약점점검결과표.pptx`

## 기타 정책·기술 문서

`공개_라이선스_정책.md`(오픈코어 3계층) · `SECURITY_DDOS_POLICY.md` · `INFRA_DB_TIERS.md` · `PROD_DB_SETUP.md` · `OPS_TOOLS_SETUP.md` · `FEE_MODE_ADMIN_DESIGN.md` · `DESIGN_FEEDBACK_SYSTEM.md` · `PI_등재_기술부록.md`(+EN) · `PI_MODERATOR_INQUIRY_GIFTING.md` · `PI_SUPPORT_GDOCI7_INQUIRY.md`
