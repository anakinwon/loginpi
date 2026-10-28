# 화상회의 앱 요금제 조사 — 사용량 1~5위 공식 요금 (seminar.pi 요금제 구상용)

> 조사일 : 2026-10-28 · 출처 = 각 회사 **공식 요금 페이지만**(미국 USD 페이지, 블로그·비교 사이트 수치 미사용) · 순위 = [UI 설계서](../ui-design/ui-design.md) 1절 사용량 순위
> 환율 : **1 USD = 1,334.55 KRW**(Google Finance 장중 시세, 2026-10-28 10:26 KST — [출처](https://www.google.com/finance/quote/USD-KRW?hl=en)). 은행 고시·한국은행 매매기준율 아님 [확인중 : 고시 환율]
> 모든 가격은 **세금 별도**(한국 구매 시 부가세 10% 별도 가능) · 사용자 1명당 월 요금 · 원화는 원 단위 반올림

## 1. 한눈에 — 등급별 평균(원화)

| 등급 | 연간 결제 평균 | 월 결제 평균 | 평균에 넣은 요금제 |
|---|---:|---:|---|
| 무료 | 0원 | 0원 | Zoom Basic · Teams(무료) · Google(개인) · Webex Free — GoTo 는 무료 요금제 없음 |
| 기본 유료 | **13,121원** ($9.83) | **17,980원** ($13.47) | Zoom Pro · Teams Essentials · Workspace Starter · Webex Meet · GoTo Professional (월 결제는 Teams 미공개로 4개) |
| 중간 | **20,774원** ($15.57) | **27,622원** ($20.70) | Zoom Business · M365 Business Basic · Workspace Standard · Webex Suite · GoTo Business (월 결제는 4개) |
| 상위 | **30,361원** ($22.75) | — | M365 Business Standard with Copilot · Workspace Plus — **2개뿐**(나머지 3사 상위는 '문의') |
| 기업용 | 문의 | 문의 | 5사 모두 영업 문의 |

- 평균 = 공개 정가(할인 전)의 단순 평균. 프로모션·첫해 할인은 넣지 않았다.
- 상위 등급은 공개 가격이 2개뿐이라 대표성이 낮다 — 참고만.

## 2. 앱별 요금(USD → 원화)

### 1위 Zoom Workplace — [zoom.us/pricing](https://zoom.us/pricing)

| 등급 | 요금제 | 연간 결제 | 월 결제 | 최대 참가자 | 회의 시간 | 녹화·AI |
|---|---|---:|---:|---|---|---|
| 무료 | Basic | 0원 | 0원 | 100 | **40분** | 로컬 녹화, AI 요약 월 3회 |
| 기본 | Pro | $14.16 = 18,897원 | $16.99 = 22,674원 | 100 | 30시간 | 클라우드 10GB, AI 요약 무제한 |
| 중간 | Business | $18.33 = 24,462원 | $21.99 = 29,347원 | 300 | 30시간 | + SSO |
| 상위 | Enterprise | 문의 | 문의 | 500~1,000 | 30시간 | 클라우드 녹화 무제한 |

- 한국 접속 시 원화 가격이 따로 있다(연간 Pro ₩20,955 · Business ₩27,121, VAT 제외) — 단순 환산과 다름.

### 2위 Microsoft Teams — [Teams 비즈니스 비교](https://www.microsoft.com/en-us/microsoft-teams/compare-microsoft-teams-business-options) · [M365 요금](https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-plans-and-pricing)

| 등급 | 요금제 | 연간 결제 | 월 결제 | 최대 참가자 | 회의 시간 | 녹화·AI |
|---|---|---:|---:|---|---|---|
| 무료 | Teams(개인 무료) | 0원 | 0원 | 100 | **60분** | — |
| 기본 | Teams Essentials | $4.00 = 5,338원 | [확인중] 미공개 | 300 | 30시간 | 녹화·대본, 자막 영어만 |
| 중간 | M365 Business Basic | $7.00 = 9,342원 | [확인중] | 300 | 30시간 | Copilot 별도 |
| 상위 | M365 Business Standard with Copilot | $23.50 = 31,362원 | [확인중] | 300 | 30시간 | Copilot·웨비나 포함 |
| 상위+ | M365 Business Premium with Copilot | $32.00 = 42,706원 | [확인중] | [확인중] | [확인중] | + 보안 |

- 공식 페이지는 연간 약정 가격만 공개. Copilot 없는 Standard 가격은 페이지에 없음. Teams Premium 부가 $10.00.

### 3위 Google Meet(Google Workspace) — [workspace.google.com/pricing](https://workspace.google.com/pricing?hl=en)

| 등급 | 요금제 | 연간 약정 | 월 결제(Flexible) | 최대 참가자 | 녹화·AI |
|---|---|---:|---:|---|---|
| 무료 | 개인 Google 계정 | 0원 | 0원 | 100 | 그룹 **60분**, 녹화 없음 |
| 기본 | Business Starter | $7 = 9,342원 | $8.40 = 11,210원 | 100 | 녹화·Gemini 없음 |
| 중간 | Business Standard | $14 = 18,684원 | $16.80 = 22,420원 | 150 | 녹화·Gemini 요약 |
| 상위 | Business Plus | $22 = 29,360원 | $26.40 = 35,232원 | 500 | 녹화·출석 추적 |
| 기업 | Enterprise | 문의 | 문의 | 1,000 | 사내 라이브 |

- 신규 고객 첫 12개월 할인(Starter $6.30·Standard $12.60, 첫 20명) — 평균에는 정가 사용.

### 4위 Cisco Webex — [pricing.webex.com/us/en](https://pricing.webex.com/us/en/)

| 등급 | 요금제 | 연간 결제 | 월 결제 | 최대 참가자 | 회의 시간 | 녹화·AI |
|---|---|---:|---:|---|---|---|
| 무료 | Webex Free | 0원 | 0원 | 100 | **40분** | 로컬 녹화 |
| 기본 | Webex Meet | $12 = 16,015원 | $14.50 = 19,351원 | 200 | 24시간 | 클라우드 10GB, AI Assistant |
| 중간 | Webex Suite(Meet+Call) | $22.50 = 30,027원 | $25 = 33,364원 | 200 | 24시간 | + 업무용 전화번호 |
| 상위 | Enterprise | 문의 | 문의 | 1,000 | [확인중] | 녹화 무제한 |

- 프로모션 : 5개 이상 구매 시 연간 6개월·월간 4개월 무료.

### 5위 GoTo Meeting — [goto.com/pricing/meeting](https://www.goto.com/pricing/meeting)

| 등급 | 요금제 | 연간 결제 | 월 결제 | 최대 참가자 | 녹화·AI |
|---|---|---:|---:|---|---|
| 무료 | 없음(무료 체험만) | — | — | — | — |
| 기본 | Professional | $12 = 16,015원 | $14 = 18,684원 | 150 | 클라우드 녹화·AI 요약 없음 |
| 중간 | Business | $16 = 21,353원 | $19 = 25,356원 | 250 | 클라우드 녹화 무제한, AI 요약·대본 |
| 상위 | Enterprise | 문의 | 문의 | 250 | + 회의실 장비 연결(SIP) |

- 과금 단위 = **주최자(organizer)당**(다른 4사는 사용자당). 회의 시간 제한 표기 없음 [확인중].

## 3. 읽는 법 — seminar.pi 요금제 구상 시 참고점

1. **무료 등급의 공통 제약은 '시간'** — 40분(Zoom·Webex) 또는 60분(Teams·Google). 참가자 상한은 대부분 100명.
2. **유료 첫 등급 평균 약 1.3만 원/월(연간)** — 이 등급부터 시간 제한이 풀리고(24~30시간) 클라우드 녹화가 붙는다.
3. **AI 요약은 중간 등급의 차별점** — Zoom 은 Pro 부터, Google·GoTo 는 중간부터, Microsoft 는 Copilot 상품.
4. **월 결제는 연간보다 약 20% 비쌈** — 5사 공통 패턴.
5. **과금 기준이 다름** — 4사는 사용자당, GoTo 는 주최자당. seminar.pi 는 현재 '참가자 개설비(입장 Pi)' 모델이라 직접 비교 시 기준을 맞출 것.

## 4. 확인 못 한 항목 [확인중]

- Microsoft 전 요금제 월 결제 가격(공식 페이지에 연간만) · Business Premium 회의 참가자·시간 · Enterprise 요금
- Google One 요금제의 Meet 혜택 가격 · Webex Enterprise 회의 시간 · GoTo 회의 시간 제한
- 한국은행·시중은행 고시 환율(위 환율은 장중 시세)

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-28 | 최초 작성 — 사용량 1~5위 공식 요금 페이지 조사, 등급별 원화 평균(마스터 요청) |
