# PRD_17_CAFE_THEMA.md — Cafe.pi 카페 테마 체계

> **작성일**: 2026-06-20
> **버전**: v2.1 (테마명 i18n 전환 반영)
> **상태**: 마스터 지시 반영 — 테마 체계 재정의(범용 일상 vs 상업 특화 스포츠 IP) / 신규 테마 카탈로그 확정 대기
> **작성자**: asoká (cafe-theme-strategist 에이전트)
> **정본 위상**: ⭐ Cafe.pi 카페 테마의 단일 설계 정책 문서

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| **v2.1** | 2026-07-08 | **테마명 다국어 체계 전환** — theme_nm(한국어)/theme_nm_en(영어) 2단 표시 구조를 번역키 체계(`themes.<theme_cd>`, 활성 21종 × 66개 언어 × 189개 locale)로 대체. 공용 훅 `useThemeName`(번역키 우선, 폐기 테마는 DB theme_nm 폴백 — 레거시 카페 호환). theme_nm·theme_nm_en 컬럼은 정본 원문·en 큐레이션 소스로 유지. 신규 테마 추가 시 ko.json `themes.<theme_cd>` 등록 + 증분 번역 필수. | asoká |
| **v2.0** | 2026-06-20 | **마스터 지시로 테마 체계 전면 재정의** — 일반카페(범용 일상) / 프리미엄카페(상업 특화 스포츠 IP). 기존 20개 관심사 테마 폐기, 신규 테마 카탈로그(GENERAL 6~8개 + PREMIUM 12~14개) 제시. PI 메인넷 베팅 금지 레드라인 명시. | asoká |
| **v1.0** | 2026-06-20 | 최초 작성 — 카페 그룹 체계(일반/프리미엄) 정의 + 기존 20개 테마 분류 + 데이터 모델 제안 + 운영 정책 | asoká |

---

## 목차

0. [개요 — 테마가 활성 사용자를 늘리는가](#0-개요--테마가-활성-사용자를-늘리는가)
1. [카페 그룹 정의](#1-카페-그룹-정의)
2. [그룹별 테마 카탈로그](#2-그룹별-테마-카탈로그)
3. [테마 데이터 모델](#3-테마-데이터-모델)
4. [테마-가격정책 연계 규칙](#4-테마-가격정책-연계-규칙)
5. [테마 운영 정책](#5-테마-운영-정책)
6. [신규 테마 추가 프로세스](#6-신규-테마-추가-프로세스)
7. [미해결 이슈 & 확인 필요](#7-미해결-이슈--확인-필요)

---

## 0. 개요 — 테마가 활성 사용자를 늘리는가

### 0-1. 테마의 역할

Cafe.pi의 **테마**는 단순 시각 장식이 아니라 **카페 공간의 정체성 + 모임의 성격 + 기능 집합**을 결정하는 전략 요소다.

```
테마 = 분위기(Vibe) + 타깃 사용자 + 기능 한도(권한) + 가격 정책
```

### 0-2. 최상위 판단 기준 — 활성 사용자 수

cafe.pi 생태계의 북극성(North Star): **활성 사용자 수(DAU/MAU)**

모든 테마 결정은 다음을 판단한다:
- **"이 테마를 추가/유지/폐기하면 활성 사용자가 증가하는가?"**
- **"이 그룹 배치가 신규 사용자 획득과 기존 사용자 유지를 동시에 달성하는가?"**

### 0-3. 설계 철학

#### 두 가지 카페 그룹의 명확한 구분

**일반카페 (GENERAL)**: 낮은 진입장벽 → 광범위한 사용자 획득
- 무료 또는 저가격 테마
- 캐주얼·친근·실용적 분위기
- 학습·스터디·가벼운 모임
- 예: 동네 카페, 스터디룸, 수다방

**프리미염카페 (PREMIUM)**: 고급스러운 경험 → 구독 수익화 + 적극 사용자 확보
- 차별화된 시각 디자인·특별 기능
- 전문적·우아한·공동체적 분위기
- 전문가 커뮤니티·비즈니스·취미 심화
- 예: 라운지, VIP 살롱, 전문가 포럼

#### 4축 분석 기준

테마를 그룹에 배치할 때 반드시 확인:

| 축 | 일반카페 | 프리미엄카페 |
|---|---|---|
| **①타깃 사용자** | 광범위(대중) | 세분화(전문가/enthusiast) |
| **②모임 성격** | 캐주얼·비구속 | 진지·정기적·조직화 |
| **③지불 의향** | 무료 또는 극소액(0~수 Bean) | 소액 구독(월 수십 Bean 이상) |
| **④활성사용자 기여** | 신규 유입·대량 → 상단부 확장 | 충성도·LTV 확대 → 중상층 유지 |

---

## 1. 카페 그룹 정의

### 1-1. GENERAL — 일반카페 (범용·일상 테마 중심)

#### **정체성**
> **"범용적·일상적 필요로 누구나 언제든 모이는 공간"**
> **마스터 지시 (2026-06-20)**: 우리동네 / 날씨 / 여행을 핵심 테마로, 일상 생활에 밀착한 모임 공간

가입 직후 언제든 진입 가능. 범용·일상 테마로 무료 모임 활성화. 플랫폼 신규 사용자 빠른 온보딩 담당. **일상의 필요 + 친구 찾기** = 높은 활성 사용자 유입.

#### **타깃 사용자**
- 신규 가입자 (온보딩)
- 테마 실험을 원하는 사용자
- 가벼운 모임 선호자 (스터디, 친목, 정보 공유)
- 구독 전 체험 사용자

#### **모임 성격**
- 비정기적·캐주얼
- 기간 제한 없음
- 진입/퇴장 자유
- 주최자 책임감 낮음

#### **가격 정책**
- 테마 자체 추가 과금: **없음** (카페 생성료 0 Bean로 무료 카페 지원)
- 카페 생성료: 0 Bean (프리미엘 등급·이벤트방 제외)
- 구독 불필요 (FREE 플랜 충분)
- 부가 기능 비용: 음성채팅·자동번역 등은 별도 구독

#### **기능 한도**
- PLAN_CAPS: FREE 플랜 사용
- 테마: BASIC(6개) 무제한 사용
- 채팅: 1:1 무제한, 그룹방 개수 제한 (건당 결제로 추가 가능)
- AI: 불가 (PREMIUM 이상)

#### **분위기·시각 요소**

| 요소 | 특징 |
|---|---|
| **컬러** | 밝고 부드러운 파스텔·중립 톤 (우버우드, 라이트 그레이, 스카이 블루) |
| **아이콘** | 간단한 이모지 + 선명한 단색 일러스트 |
| **배경** | 패턴 최소화, 백색 또는 연한 회색 |
| **폰트** | 라운드 산세리프 (접근성·캐주얼성) |
| **효과** | 그림자 최소, 부드러운 전환 |

---

### 1-2. PREMIUM — 프리미엄카페 (상업·스포츠 IP 특화)

#### **정체성**
> **"글로벌 스포츠 IP와 팬덤으로 성장하는, 구독 기반 커뮤니티"**
> **마스터 지시 (2026-06-20)**: 월드컵 / EPL / MLB / e스포츠를 핵심 테마로, 글로벌 스포츠 이벤트의 시즌성 활용

구독(월 1~5 Pi / 100~500 Bean) 사용자만 테마 접근. 글로벌 스포츠 팬덤의 시즌성 트래픽 → 구독 수익화 + LTV 극대화. **Pi 네트워크 글로벌 리치 + 스포츠 IP 팬덤** = 플랫폼 수익성 극대화.

#### **타깃 사용자**
- 전문가·전문 취미인 (골프, 투자, 요리, 음악 등)
- 비즈니스·커뮤니티 주최자
- 성숙한 모임 문화를 원하는 사용자
- 구독 가치를 인지하는 충성 사용자

#### **모임 성격**
- 정기적·조직화
- 장기 지속 (수개월~수년)
- 진입 선별 (구독 필요)
- 주최자 책임감·역할 명확
- 커뮤니티 규범·위계 존재

#### **가격 정책**
- 테마 자체 추가 과금: **없음** (구독료에 포함)
- 카페 생성료: 10 Bean (프리미엄 등급) 또는 0 Bean (구독자)
- 구독 필수: PREMIUM/BUSINESS 플랜 (월 1~5 Pi)
- 이벤트방: 20 Bean (추가)

#### **기능 한도**
- PLAN_CAPS: PREMIUM/BUSINESS 플랜
- 테마: PREMIUM(14개) + BASIC(6개) 모두 사용 가능
- 채팅: 1:1 무제한, 그룹방 무제한(PREMIUM 이상)
- 이벤트방: 무제한(BUSINESS 전용)
- AI: 월 10회(PREMIUM) / 무제한(BUSINESS)

#### **분위기·시각 요소**

| 요소 | 특징 |
|---|---|
| **컬러** | 세련된 어두운 톤 + 포인트 색상 (심포지엄 블루, 골드, 딥 펌플) |
| **아이콘** | 섬세한 일러스트·기하학 패턴 |
| **배경** | 텍스처·그라디언트 활용 (미묘한 패턴) |
| **폰트** | 우아한 세리프 또는 모던 산세리프 (가독성 + 고급성) |
| **효과** | 정교한 그림자·계층감·호버 애니메이션 |

---

## 2. 그룹별 테마 카탈로그 (신규 설계)

### 2-1. GENERAL (일반카페 / BASIC 범용·일상 테마)

**마스터 지시 필수 포함 3개**: MY_TOWN(우리동네), WEATHER(날씨), TRAVEL(여행)

**신규 설계 카탈로그** (6~8개 — 범용·일상 중심):

| # | 테마코드 | 테마명 | 이모지 | 컨셉 | 타깃 모임 | sort_ord |
|---|---|---|---|---|---|---|
| 1 | MY_TOWN | 우리동네 | 🏘️ | 동네 소식, 이웃 만남, 로컬 정보 | 동네 주민, 지역 커뮤니티 | 1 |
| 2 | WEATHER | 날씨 | 🌤️ | 오늘 날씨, 산책·여행 계획 | 날씨 관심층, 야외활동 계획자 | 2 |
| 3 | TRAVEL | 여행 | ✈️ | 여행지 공유, 여행 팁, 동행 찾기 | 여행 플래너, 배낭여행자 | 3 |
| 4 | FOOD_SPOTS | 맛집 | 🍽️ | 맛집 리뷰, 음식 정보, 맛집 탐방 | 미식가, 음식 블로거 | 4 |
| 5 | DAILY_CHAT | 일상수다 | 💬 | 일상 이야기, 잡담, 친구 찾기 | 누구나 | 5 |
| 6 | INFO_SHARE | 정보공유 | 📢 | 생활정보, 유용한 팁, 할인정보 | 정보 수집가, 주부 | 6 |
| 7 | SECONDHAND | 중고나눔 | ♻️ | 중고거래, 물물교환, 나눔(MPS 연계) | 중고 거래자, 절약 추구층 | 7 |
| 8 | HOBBY_GROUP | 취미 | 🎯 | 공통 관심사 모임(가벼운 취미) | 취미 애호가 | 8 |

**그룹 특성**: 신규 사용자 온보딩 최적화, 진입 장벽 0, 일상 필요성 높음, 비정기적·캐주얼, 무료 진입 ✅

---

### 2-2. PREMIUM (프리미엄카페 / PREMIUM 상업·스포츠 IP)

**마스터 지시 필수 포함 4개**: WORLD_CUP(월드컵), EPL(프리미어리그), MLB(메이저리그), ESPORTS(e스포츠)

**신규 설계 카탈로그** (12~14개 — 글로벌 스포츠 IP 중심):

| # | 테마코드 | 테마명 | 이모지 | 컨셉 | 타깃 모임 | sort_ord |
|---|---|---|---|---|---|---|
| 9 | WORLD_CUP | 월드컵 | ⚽ | 월드컵 경기, 팀 응원, 경기 분석 | 축구팬, 월드컵 광팬 | 9 |
| 10 | EPL | 프리미어리그 | 🏴󠁧󠁢󠁥󠁮󠁧󠁿 | EPL 시즌, 팀 채팅, 경기 일정·결과 | EPL 팬, 축구 매니아 | 10 |
| 11 | MLB | 메이저리그 | ⚾ | MLB 경기, 팀 추적, 경기 토론 | 야구팬, MLB 애호가 | 11 |
| 12 | ESPORTS | e스포츠 | 🎮 | 리그오브레전드, VALORANT, 팀 응원 | 게이머, 프로팀 팬 | 12 |
| 13 | NBA | NBA | 🏀 | NBA 경기, 팀/선수 팬덤, 경기 분석 | 농구팬, NBA 매니아 | 13 |
| 14 | UCL | 챔피언스리그 | 🥇 | UEFA Champions League, 팀 응원 | 축구팬(유럽 클럽) | 14 |
| 15 | F1 | 포뮬러1 | 🏎️ | F1 시즌, 드라이버/팀 추적 | F1 팬, 자동차 매니아 | 15 |
| 16 | UFC_MMA | 격투기 | 👊 | UFC/MMA 경기, 선수 팬덤 | 격투기팬 | 16 |
| 17 | K_LEAGUE | K리그 | ⚽ | K리그 경기, 팀 응원, 경기 토론 | 축구팬(국내) | 17 |
| 18 | PGA_GOLF | PGA투어 | ⛳ | PGA투어, 선수 추적, 골프 토론 | 골프팬, PGA 매니아 | 18 |
| 19 | TENNIS_GRAND_SLAM | 테니스 | 🎾 | 그랜드슬램, 선수/경기 추적 | 테니스팬 | 19 |
| 20 | CRYPTO_TRADING | Pi투자·암호화폐 | 💰 | Pi 시세·투자 정보, 재테크 커뮤니티 | Pi 투자자 | 20 |

**그룹 특성**: 구독 필수(월 1~5 Pi), 글로벌 팬덤 활성화, 이벤트 시즌성 높음, 정기적 활동, 수익화 중심 ✅

---

### 2-3. 기존 20개 테마 폐기 처리

v1.0의 기존 테마(FITNESS, GOLF, SWIMMING, SURFING, YOGA, AVIATION, COOKING, PET, BEAUTY, FINANCE, GAME, MUSIC, ART, ECO, CAR 등)는 **마스터 지시 반영으로 체계 재정의**되었으므로 다음 정책을 따릅니다:

| 기존 테마 | 신규 배치 / 폐기 결정 | 기존 카페 처리 |
|---|---|---|
| **TRAVEL** | → TRAVEL (일반) 유지 | 신규와 동일 코드 → 기존 카페 그대로 운영 |
| **FITNESS** | → 폐기 (범용성 낮음) | `del_yn='Y'` 논리삭제, 기존 카페는 존속 |
| **GOLF** | → PREMIUM (스포츠) 검토 | PGA_GOLF로 재설계 또는 폐기 판단 필요 |
| **SWIMMING, SURFING, YOGA, AVIATION, COOKING, PET, BEAUTY** | → 폐기 (전문취미, 비상업성) | `del_yn='Y'`, 기존 카페는 존속 |
| **FINANCE** | → CRYPTO_TRADING (투자) 재설계 | Pi 투자 특화로 전환 |
| **GAME** | → ESPORTS (상업IP) 흡수 | e스포츠 스포츠 카테고리로 통합 |
| **MUSIC, ART, ECO, CAR** | → 폐기 (커뮤니티/취미) | `del_yn='Y'`, 기존 카페는 존속 |

**폐기 정책 요약**:
- 물리삭제 금지, **논리삭제만 적용** (`del_yn='Y'`, `del_dtm=CURRENT_TIMESTAMP`)
- 신규 카페 생성 시 기존 테마 노출 안 함 (use_yn='N' → del_yn='Y')
- 기존 사용자의 카페는 존속 (테마 변경 강제 안 함, 자발적 전환 유도)
- 마이그레이션 기간 2주 (사용자 공지 후 점진적 폐기)

---

### 2-3. 신규 테마 배치 근거 (4축 분석)

#### **GENERAL (범용·일상 테마) 배치 근거**

| 테마 | ①타깃 사용자 | ②모임 성격 | ③지불 의향 | ④활성사용자 기여도 |
|---|---|---|---|---|
| **MY_TOWN** | 동네 주민, 지역 커뮤니티 관심층 | 로컬 정보, 이웃 만남 | 무료(0 Bean) | ✅**매우높음**(위치 기반 지속성, 신규 온보딩) |
| **WEATHER** | 날씨 관심층, 야외활동 계획자 | 날씨 정보, 야외 계획 | 무료 | ✅높음(일일 체크 습관, 빈번 재접속) |
| **TRAVEL** | 여행 플래너, 배낭여행자 | 여행지 정보, 동행 찾기 | 무료 | ✅높음(여행 주기 = 정기 재방문) |
| **FOOD_SPOTS** | 미식가, 음식 블로거, 음식 관심층 | 맛집 리뷰, 음식 정보 | 무료 | ✅높음(일상적 필요, 신규 유입 용이) |
| **DAILY_CHAT** | 누구나(친구 찾기, 일상 수다) | 캐주얼 잡담, 친구 형성 | 무료 | ✅**매우높음**(보편적 필요, DAU 극대화) |
| **INFO_SHARE** | 정보 수집가, 주부, 절약 추구층 | 생활정보, 할인정보, 팁 공유 | 무료 | ✅높음(정보 가치, 정기 참여) |
| **SECONDHAND** | 중고 거래자, 절약/환경 추구층 | 중고거래, 나눔(MPS 연계) | 무료 | ✅중상(플랫폼 경제 확장, 거래 활성화) |
| **HOBBY_GROUP** | 취미 애호가(가벼운 관심사) | 공통 관심사 모임 | 무료 | ✅중상(니치 세그먼트 확보) |

**결론**: 진입 장벽 0, 일상 필요성 극고(MY_TOWN·WEATHER·DAILY_CHAT), 광범위한 사용자층. **신규 DAU/MAU 극대화** 목표. 기존 시계열 흩어진 테마들을 범용 일상으로 통합·단순화.

---

#### **PREMIUM (상업·스포츠 IP 테마) 배치 근거**

| 테마 | ①타깃 사용자 | ②모임 성격 | ③지불 의향 | ④활성사용자 기여도 |
|---|---|---|---|---|
| **WORLD_CUP** | 축구팬(글로벌), 월드컵 광팬 | 경기 응원, 토론 | ✅높음(이벤트 시즌성) | ✅**매우높음**(4년 주기 집중 활성화) |
| **EPL** | 축구팬(유럽 클럽), 매니아 | 팀 응원, 경기 분석 | ✅높음(정기 리그) | ✅높음(월 9개월 지속 활동) |
| **MLB** | 야구팬, 미국 스포츠 애호가 | 팀 추적, 경기 토론 | ✅높음(시즌 리그) | ✅높음(북미권 글로벌 팬덤) |
| **ESPORTS** | 게이머, 프로팀 팬 | 리그 응원, 경기 토론 | ✅높음(e스포츠 구독 문화) | ✅높음(년중 활동, 젊은층) |
| **NBA** | 농구팬, 미국 스포츠 애호가 | 팀/선수 팬덤, 경기 분석 | ✅높음(정기 리그) | ✅높음(글로벌 명성·인기) |
| **UCL** | 축구팬(유럽 클럽), 매니아 | 팀 응원, 경기 토론 | ✅높음(유럽 최고 대회) | ✅높음(년중 활동, 유럽권 팬덤) |
| **F1** | F1 팬, 자동차 매니아 | 드라이버/팀 추적, 경기 분석 | ✅높음(럭셔리 취미) | ✅중상(년 23라운드 글로벌 이벤트) |
| **UFC_MMA** | 격투기팬, 전투 스포츠 애호가 | 선수 팬덤, 경기 토론 | ✅높음(고관심 이벤트) | ✅높음(월 이벤트 정기성) |
| **K_LEAGUE** | 축구팬(국내), 한국 팬덤 | 팀 응원, 경기 토론 | ✅중상(국내 리그) | ✅높음(로컬 팬덤·민족주의 감정) |
| **PGA_GOLF** | 골프팬, PGA 투어 추적층 | 선수 추적, 토너먼트 분석 | ✅높음(골프 팬덤) | ✅중상(고가 취미층, 충성도 높음) |
| **TENNIS_GRAND_SLAM** | 테니스팬, 그랜드슬램 추적층 | 선수/경기 추적, 토론 | ✅중상(테니스 팬덤) | ✅중상(연중 4대 대회 활동) |
| **CRYPTO_TRADING** | Pi 투자자, 암호화폐 관심층 | Pi 시세 토론, 투자 정보 | ✅**매우높음**(금융 관심층) | ✅**매우높음**(**Pi 네트워크 충성도**·LTV) |

**결론**: 글로벌 스포츠 IP + 시즌성 높음 = 구독 수익화 동력. CRYPTO_TRADING(Pi 투자)은 플랫폼 최우선 전략. 팬덤 문화의 시즌성 활용 → 월별 트래픽 집중 + 장기 구독 유지.

---

## 3. 테마 데이터 모델

### 3-1. 현행 `msg_theme` 테이블 스키마

```sql
CREATE TABLE public.msg_theme (
  theme_cd    VARCHAR(20)  PRIMARY KEY,
  theme_nm    VARCHAR(50)  NOT NULL,
  theme_emoji VARCHAR(10)  NOT NULL,
  theme_desc  TEXT,
  theme_tp_cd VARCHAR(10)  NOT NULL CHECK (theme_tp_cd IN ('BASIC','PREMIUM')),
  sort_ord    INTEGER      NOT NULL DEFAULT 0,
  use_yn      CHAR(1)      NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y','N')),
  del_yn      CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**컬럼 설명**

| 컬럼 | 타입 | 설명 | 비고 |
|---|---|---|---|
| `theme_cd` | VARCHAR(20) | 테마 코드 (PK) | 'GOLF', 'TRAVEL' 등 대문자 |
| `theme_nm` | VARCHAR(50) | 테마명 (한글) | '골프', '여행' 등 |
| `theme_emoji` | VARCHAR(10) | 이모지 아이콘 | '⛳', '✈️' 등 |
| `theme_desc` | TEXT | 테마 설명 및 태그 | '#골프 #필드 #스윙' |
| **`theme_tp_cd`** | VARCHAR(10) | **그룹 구분 코드** | ✅**기존 컬럼 활용** (BASIC\|PREMIUM) |
| `sort_ord` | INTEGER | 정렬 순서 | BASIC 1~6, PREMIUM 7~20 |
| `use_yn` | CHAR(1) | 사용 여부 | 'Y'\|'N' (운영 통제) |
| `del_yn` | CHAR(1) | 논리삭제 여부 | 'Y'\|'N' (물리 삭제 금지) |
| `del_dtm` | TIMESTAMPTZ | 삭제 일시 | `del_yn='Y'`일 때만 기록 |
| `regr_id`~`mod_dtm` | 시스템 컬럼 | DA 표준 4개 | 감사 추적 |

### 3-2. 추가 컬럼 검토 (향후 고려)

**현행 구조는 충분하나**, 운영 확장 시 고려 사항:

| 제안 | 목적 | 비고 |
|---|---|---|
| `theme_grp_cd` | 그룹 명시화 | 현행 `theme_tp_cd`와 중복 → 불필요 |
| `color_palette` | 테마 컬러 코드 저장 | JSON: `{"primary":"#2D3A4E", "accent":"#FFD700"}` 형식. **백엔드 렌더링 시 활용** |
| `icon_set_url` | 테마 아이콘 세트 경로 | Supabase Storage 경로 → 커스텀 아이콘 지원 |
| `recommend_plan_cd` | 권장 구독 플랜 | 'FREE' / 'PREMIUM' / 'BUSINESS' — **UI 추천 강화** |
| `min_members_hint` | 권장 최소 인원 | 정보성 (예: 5명 이상 추천) |

**판단**: 현재 PRD v1.0는 **기존 스키마로 충분**. 백엔드 코드에서 `theme_tp_cd='PREMIUM'` 필터로 권한 게이트 구현. **향후 필요시 마이그레이션 고려.**

---

### 3-3. DB 마이그레이션 SQL 초안 (PRD v2.0 적용용)

**주의**: 다음 SQL은 문서 예시용. 실제 적용은 `sql/` 디렉토리의 마이그레이션 파일로 관리하며, DA-APPROVED 검사를 거쳐야 합니다.

#### 신규 테마 INSERT (GENERAL + PREMIUM)

```sql
-- [1] GENERAL (일반카페) 신규 테마 8개 추가
INSERT INTO public.msg_theme (theme_cd, theme_nm, theme_emoji, theme_desc, theme_tp_cd, sort_ord, use_yn, regr_id, reg_dtm, modr_id, mod_dtm)
VALUES
  ('MY_TOWN', '우리동네', '🏘️', '#동네 #이웃 #로컬정보', 'BASIC', 1, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('WEATHER', '날씨', '🌤️', '#날씨 #예보 #야외활동', 'BASIC', 2, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('TRAVEL', '여행', '✈️', '#여행 #여행지 #동행', 'BASIC', 3, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('FOOD_SPOTS', '맛집', '🍽️', '#맛집 #음식 #리뷰', 'BASIC', 4, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('DAILY_CHAT', '일상수다', '💬', '#일상 #잡담 #친구찾기', 'BASIC', 5, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('INFO_SHARE', '정보공유', '📢', '#생활정보 #팁 #할인', 'BASIC', 6, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('SECONDHAND', '중고나눔', '♻️', '#중고거래 #나눔 #환경', 'BASIC', 7, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('HOBBY_GROUP', '취미', '🎯', '#취미 #공통관심 #모임', 'BASIC', 8, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP);

-- [2] PREMIUM (프리미엄카페) 신규 테마 12개 추가
INSERT INTO public.msg_theme (theme_cd, theme_nm, theme_emoji, theme_desc, theme_tp_cd, sort_ord, use_yn, regr_id, reg_dtm, modr_id, mod_dtm)
VALUES
  ('WORLD_CUP', '월드컵', '⚽', '#월드컵 #축구 #응원', 'PREMIUM', 9, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('EPL', '프리미어리그', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '#EPL #축구 #팀응원', 'PREMIUM', 10, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('MLB', '메이저리그', '⚾', '#MLB #야구 #경기분석', 'PREMIUM', 11, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('ESPORTS', 'e스포츠', '🎮', '#리그오브레전드 #VALORANT #팬덤', 'PREMIUM', 12, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('NBA', 'NBA', '🏀', '#NBA #농구 #팀응원', 'PREMIUM', 13, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('UCL', '챔피언스리그', '🥇', '#UEFA #축구 #유럽', 'PREMIUM', 14, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('F1', '포뮬러1', '🏎️', '#F1 #레이싱 #드라이버', 'PREMIUM', 15, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('UFC_MMA', '격투기', '👊', '#UFC #MMA #격투스포츠', 'PREMIUM', 16, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('K_LEAGUE', 'K리그', '⚽', '#K리그 #축구 #국내', 'PREMIUM', 17, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('PGA_GOLF', 'PGA투어', '⛳', '#PGA #골프 #토너먼트', 'PREMIUM', 18, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('TENNIS_GRAND_SLAM', '테니스', '🎾', '#그랜드슬램 #테니스 #선수', 'PREMIUM', 19, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP),
  ('CRYPTO_TRADING', 'Pi투자·암호화폐', '💰', '#Pi시세 #투자 #재테크', 'PREMIUM', 20, 'Y', 'ADMIN', CURRENT_TIMESTAMP, 'ADMIN', CURRENT_TIMESTAMP);
```

#### 기존 테마 논리삭제 (폐기)

```sql
-- [3] v1.0 기존 20개 테마 중 폐기 대상 논리삭제
-- TRAVEL은 유지(신규와 동일 코드), 나머지 19개는 del_yn='Y' 처리
UPDATE public.msg_theme
SET del_yn='Y', del_dtm=CURRENT_TIMESTAMP, modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP
WHERE theme_cd IN (
  'FITNESS', 'MUKBANG', 'PHOTO', 'READING', 'CODING',
  'GOLF', 'SWIMMING', 'SURFING', 'YOGA', 'AVIATION', 'COOKING', 'PET', 'BEAUTY', 'FINANCE', 'GAME', 'MUSIC', 'ART', 'ECO', 'CAR'
);
```

#### 기존 FINANCE → CRYPTO_TRADING 데이터 마이그레이션 (선택사항)

```sql
-- [4] (선택) 기존 FINANCE 테마 카페를 CRYPTO_TRADING으로 변경하는 경우
-- ⚠️ 사용자 동의 후 마이그레이션 필수 (일괄 변경은 혼동 야기)
UPDATE public.msg_room
SET theme_cd='CRYPTO_TRADING'
WHERE theme_cd='FINANCE' AND del_yn='N';
```

---

### 3-4. 백엔드 코드 예시 — 권한 기반 테마 조회

```typescript
// src/lib/chat-auth.ts 확장
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function getAvailableThemesForUser(userId: string) {
  const plan = await getChatPlan(userId)
  const supabase = getSupabaseAdmin()
  
  // FREE: BASIC만 / PREMIUM 이상: BASIC+PREMIUM 모두
  const allowedTypes = plan.tier === 'FREE' ? ['BASIC'] : ['BASIC', 'PREMIUM']
  
  const { data } = await supabase
    .from('msg_theme')
    .select('theme_cd, theme_nm, theme_emoji, theme_tp_cd, sort_ord')
    .in('theme_tp_cd', allowedTypes)
    .eq('del_yn', 'N')
    .eq('use_yn', 'Y')
    .order('sort_ord', { ascending: true })
  
  return data || []
}

// 테마별 접근 권한 검증
export async function canUseTheme(userId: string, themeCd: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const plan = await getChatPlan(userId)
  
  const { data: theme } = await supabase
    .from('msg_theme')
    .select('theme_tp_cd')
    .eq('theme_cd', themeCd)
    .eq('del_yn', 'N')
    .eq('use_yn', 'Y')
    .maybeSingle()
  
  if (!theme) return false
  
  // BASIC 테마는 누구나, PREMIUM은 구독자만
  if (theme.theme_tp_cd === 'BASIC') return true
  return plan.tier !== 'FREE'
}
```

---

## 3-1. 🚨 PI 메인넷 등재 레드라인 (절대 준수)

**cafe.pi가 Pi Network 메인넷/런치패드에 등재되기 위한 필수 가드 사항:**

### 스포츠 테마 허용 범위 (선명한 정의)

✅ **허용 기능** (다음만 가능):
- 경기 일정, 결과, 통계 정보 공유
- 팀/선수 정보 및 뉴스
- 팬 커뮤니티·응원 채팅
- 경기 분석·전술 논의
- 선수 성적 추적·기록
- 중계 시간 공지, 팬 활동

❌ **절대 금지 기능** (이 기능들을 추가하면 Pi 메인넷 심사 실패):
1. **베팅·스포츠토토** — 경기 결과에 대한 금전 베팅
2. **도박·승부예측 환전** — 예측 점수·순위 맞추기 & 상금 지급
3. **파생상품 거래** — 선수 카드, NFT 리그 순위 베팅
4. **동의 없는 개인정보 활용** — 위치·프로필 수익화
5. **Pi 외 통화 결제** — USD, KRW, 암호화폐(Bitcoin 등) 결제 게이트
6. **Pi 외 로그인** — Google/Apple 로그인만으로 서비스 진입 금지 (Pi 로그인 필수)

### 테마별 준수 체크리스트

| 테마 | 레드라인 체크 | 개발 시 주의사항 |
|---|---|---|
| **WORLD_CUP, EPL, MLB, ESPORTS** | ⚠️ 스포츠 테마 = 베팅 금지 구간 | 경기 정보·팬 채팅만 구현. 결과 예측 게임 금지. |
| **NBA, UCL, F1, UFC_MMA, K_LEAGUE, TENNIS_GRAND_SLAM** | ⚠️ 스포츠 테마 = 베팅 금지 구간 | 경기 일정·결과·통계만 표시. 점수 예측 환전 금지. |
| **PGA_GOLF** | ⚠️ 골프 IP = 베팅 강도 높음(주의) | 토너먼트 정보·선수 추적만. 골프 스코어 베팅 절대 금지. |
| **CRYPTO_TRADING** | ⚠️ Pi 투자만 허용 | Pi 시세 정보·투자 토론만. 다른 암호화폐 거래 거래소 링크 금지. |
| **MY_TOWN, WEATHER, TRAVEL, 기타 비스포츠** | ✅ 안전 | 일상 테마는 베팅/환전 가능성 없음. |

---

## 4. 테마-가격정책 연계 규칙

### 4-1. 가격 정본과의 교차 확인

테마 과금은 **테마 자체 비용 없음**. 대신:

| 과금 항목 | 기준 | Bean 금액 | 정본 |
|---|---|---|---|
| **카페 생성료** (일반) | BASIC + PREMIUM | 0 Bean | PRD_15_FEE §4-2 `CGGC1` |
| **카페 생성료** (프리미엄) | PREMIUM 테마만 | 10 Bean | PRD_15_FEE §4-2 `CGPC2` |
| **카페 입장료** (프리미엄) | PREMIUM 테마 카페 | 10 Bean (구독자 0 Bean) | PRD_15_FEE §4-2 `CGPE2`/`CSPE2` |
| **구독료** (월간) | PREMIUM 테마 무제한 접근 | 100 Bean (Pi Creator) | PRD_14_SUBSC §4-1-2 |
| **구독료** (월간) | PREMIUM 테마 + 이벤트·분석 | 500 Bean (Pi Host) | PRD_14_SUBSC §4-1-3 |

**핵심 원칙**: 
- BASIC 테마 사용 = **비용 없음** (완전 무료)
- PREMIUM 테마 접근 = **구독 필수** (월 1 Pi 이상)
- 테마별 추가 요금 없음 (기능 한도는 구독료에 통합)

### 4-2. 테마-플랜 매핑 매트릭스

| 플랜 | 테마 접근 | 카페 생성 가능 | 기타 기능 |
|---|---|---|---|
| **FREE** (Pi Explorer) | BASIC 6개만 | 0 Bean (BASIC만) | 그룹방 건당 결제 |
| **PREMIUM** (Pi Creator) | BASIC + PREMIUM 20개 모두 | 0 Bean (구독 특전) | 그룹방 무제한, AI 10회/월 |
| **BUSINESS** (Pi Host) | BASIC + PREMIUM 20개 모두 | 0 Bean (구독 특전) | 그룹방·이벤트방 무제한, AI 무제한 |

---

## 5. 테마 운영 정책

### 5-1. 테마 생성 정책

#### **새 테마 등록 프로세스**

1. **테마 기획 단계** (마스터님 결정)
   - 타깃 사용자 정의
   - BASIC/PREMIUM 그룹 배치 판단 (4축 분석)
   - 이모지·컬러·분위기 결정

2. **스키마 검증** (DA 팀)
   - `theme_cd`: 대문자 스네이크케이스 (예: `WINE_TASTING`)
   - `theme_nm`: 한글 40자 이내
   - `theme_emoji`: 유니코드 단일 이모지
   - `theme_tp_cd`: BASIC 또는 PREMIUM만

3. **DB 적용** (SQL 마이그레이션)
   ```sql
   INSERT INTO public.msg_theme
     (theme_cd, theme_nm, theme_emoji, theme_desc, theme_tp_cd, sort_ord)
   VALUES
     ('WINE_TASTING', '와인 테이스팅', '🍷', '#와인 #시음 #와이너리', 'PREMIUM', 21);
   ```

4. **QA 검증**
   - 테마 표시 렌더링 확인
   - 권한 게이트 동작 검증
   - 스티커팩 연결 확인

5. **운영 활성화**
   - `use_yn='Y'` 기본값
   - 사용자 공지 (테마 추가 안내)

#### **제약 조건**
- 테마 코드 중복 금지 (UNIQUE 제약)
- 테마명 중복 권장하지 않음 (사용자 혼동)
- sort_ord는 운영상 순서 (재정렬 가능)
- 삭제 후 재생성 시: 별도 코드 사용 (예: `FITNESS_V2`)

---

### 5-2. 테마 그룹 배치 기준

| 배치 결정 | 확인 항목 | YES/NO |
|---|---|---|
| **BASIC으로 배치?** | 신규 사용자(FREE 플랜)도 쉽게 진입 가능한가? | ✅YES → BASIC |
| | 가벼운 모임부터 구속 없이 시작하는가? | | |
| | 광범위한 사용자층이 관심 있는가? | | |
| **PREMIUM으로 배치?** | 구독 사용자만 가치를 느끼는가? | ✅YES → PREMIUM |
| | 정기적·장기적 활동이 예상되는가? | | |
| | 전문성·커뮤니티 성숙도가 중요한가? | | |

---

### 5-3. 테마 활성화 / 비활성화

#### **활성화 (use_yn='Y')**
- 기본값. 사용자에게 표시됨.
- 신규 사용자도 테마 선택 가능.

#### **임시 비활성화 (use_yn='N')**
- 정비·업데이트 중일 때
- 트렌드·문제 이유로 노출 최소화
- 기존 카페는 정상 운영 (조회만 차단)
- SQL: `UPDATE msg_theme SET use_yn='N' WHERE theme_cd='...'`

#### **논리삭제 (del_yn='Y')**
- 영구 폐기 결정 시 (운영 재검토 필요)
- 기존 카페는 존속 (테마 변경 유도 불가)
- 신규 카페 생성 불가
- SQL: `UPDATE msg_theme SET del_yn='Y', del_dtm=CURRENT_TIMESTAMP WHERE theme_cd='...'`

---

### 5-4. 테마-스티커팩 연결

각 테마마다 **기본 3가지 스티커팩** 자동 제공:
1. **이모지팩** (테마 이모지 활용, 간단·빠름)
2. **일러스트팩** (그려진 아트, 감성)
3. **인사/응원팩** (인사말·응원 메시지)

**관리 방식**:
- `msg_stkr_pack`: 팩 마스터 (테마별 3개)
- `msg_theme_stkr`: 테마-팩 매핑 (sort_ord로 순서)
- `msg_stkr`: 팩 내 개별 스티커 (30~50개 per 팩)

새 테마 등록 시:
```sql
DO $$
DECLARE
  v_pack_id UUID;
BEGIN
  -- 이모지팩
  INSERT INTO msg_stkr_pack (pack_nm, theme_cd, price_pi, is_dflt_yn)
  VALUES ('와인 테이스팅 이모지팩', 'WINE_TASTING', 0, 'Y')
  RETURNING pack_id INTO v_pack_id;
  
  INSERT INTO msg_theme_stkr (theme_cd, pack_id, sort_ord)
  VALUES ('WINE_TASTING', v_pack_id, 1);
  
  -- 일러스트팩, 인사/응원팩 ... (동일)
END;
$$;
```

---

## 6. 신규 테마 추가 프로세스

### 6-1. 전사 체크리스트

신규 테마 추가 시 **이 체크리스트를 필수 통과**:

```
[ ] 1. 테마 기획 단계
  [ ] 1.1. 타깃 사용자 정의 (구체적 페르소나)
  [ ] 1.2. 4축 분석 완료 (①타깃 ②모임 성격 ③지불 의향 ④활성사용자 기여도)
  [ ] 1.3. BASIC/PREMIUM 배치 결정 + 근거 문서화
  [ ] 1.4. 이모지 선정 (단일 유니코드 확인)

[ ] 2. 데이터 표준 준수 (DA)
  [ ] 2.1. theme_cd: 대문자 스네이크케이스, 4~12자
  [ ] 2.2. theme_nm: 한글 40자 이내
  [ ] 2.3. theme_tp_cd: BASIC 또는 PREMIUM만
  [ ] 2.4. sort_ord: 그룹 내 순서 확인

[ ] 3. 비용 정책 일관성
  [ ] 3.1. PRD_15_FEE §4 카페 생성료 테이블 조회
  [ ] 3.2. PRD_14_SUBSC 구독료 매핑 확인
  [ ] 3.3. 새 테마가 기존 과금 정책 변경하지 않는지 확인

[ ] 4. 스티커팩 준비
  [ ] 4.1. 3가지 팩 (이모지/일러스트/인사응원) 기획
  [ ] 4.2. 팩명 정의 (예: "와인 테이스팅 이모지팩")
  [ ] 4.3. 개별 스티커 30~50개 준비

[ ] 5. 운영 정책 정의
  [ ] 5.1. 론칭 시점 결정
  [ ] 5.2. 사용자 공지 콘텐츠 작성
  [ ] 5.3. sort_ord 위치 확정

[ ] 6. QA & 배포
  [ ] 6.1. 로컬 테스트: 테마 렌더링 + 권한 게이트 검증
  [ ] 6.2. 스티커팩 연결 확인
  [ ] 6.3. SQL 마이그레이션 적용 (Supabase 배포)
  [ ] 6.4. 프로덕션 검증
```

---

### 6-2. 신규 테마 추가 대기 목록 (향후 검토)

현행 20개 테마 외 **부족한 세그먼트** (우선순위 높은 순):

| 우선순위 | 테마 | 대상 사용자 | 기대 효과 | 배치 |
|---|---|---|---|---|
| **1** | **비즈니스·커리어** (예: `CAREER`) | 직장인, 취업 준비생 | 직무 커뮤니티 활성화 | PREMIUM |
| **2** | **부동산·인테리어** (예: `REAL_ESTATE`) | 집 사는 사람, 인테리어 관심층 | 중고 거래 연계(MPS) | PREMIUM |
| **3** | **학부모·육아** (예: `PARENTING`) | 부모, 양육자 | 자녀 교육 커뮤니티 | BASIC |
| **4** | **언어 학습** (예: `LANGUAGES`) | 어학 공부자 | 스터디 커뮤니티 | BASIC |
| **5** | **사이드 프로젝트** (예: `SIDE_HUSTLE`) | 창업가, 프리랜서 | 사이드 비즈니스 네트워크 | PREMIUM |

**판단 기준**: 
- 신규 테마가 **기존 20개 중 2개 이상과 겹치는 사용자층**이면 추가 불필요
- **활성 사용자 수 증가 예측**이 명확해야 함
- 마스터님 최종 판단

---

## 7. 미해결 이슈 & 마스터님 확인 필요

### 7-1. 즉시 확인 필요 사항 (v2.0 → 운영 전환 조건)

| # | 항목 | 현재 상태 | 마스터 결정 필요 |
|---|---|---|---|
| **1** | **GENERAL 테마 개수** | 제안: 8개 (MY_TOWN, WEATHER, TRAVEL, FOOD_SPOTS, DAILY_CHAT, INFO_SHARE, SECONDHAND, HOBBY_GROUP) | ✅확인 필요: 개수 조정? 추가/삭제 테마? |
| **2** | **PREMIUM 테마 개수** | 제안: 12개 (스포츠 IP 11 + CRYPTO_TRADING 1) | ✅확인 필요: 12개가 적절한가? 추가 IP? |
| **3** | **마스터 필수 지시 4개** | WORLD_CUP, EPL, MLB, ESPORTS 포함 확정 | ✅확인: 4개 모두 론칭? 순서 있는가? |
| **4** | **기존 테마 폐기 정책** | TRAVEL 유지, 나머지 19개 논리삭제 | ✅확인: 예외 테마 있는가? (예: GOLF → PGA_GOLF로 매핑?) |
| **5** | **CRYPTO_TRADING 명칭** | Pi 투자 중심, "Pi투자·암호화폐" 표기 | ✅확인: 영문명/이모지/설명 적절한가? |
| **6** | **스포츠 테마 시즌 운영** | 오프시즌 테마 노출 여부 (use_yn 제어 계획) | ✅판단: 월드컵은 4년 주기인데 비활성화할 것? |
| **7** | **테마별 컬러 팔레트** | 현행 스키마로 충분 (향후 color_palette 컬럼 선택) | ✅판단: 즉시 필요한가? |

### 7-2. 기술 구현 대기 사항

| # | 작업 | 담당 | 현황 | 마스터 지시 |
|---|---|---|---|---|
| **1** | `canUseTheme(userId, themeCd)` 권한 게이트 구현 | 백엔드 | 🚧 src/lib/chat-auth.ts 추가 필요 | ✅ v2.0 코드 예시 작성 완료 |
| **2** | 카페 생성 시 테마별 과금 분기 | 백엔드 | ✅ PRD_15_FEE 기반 기존 구현 | 기존 로직 그대로 유지 |
| **3** | 테마 선택 UI (GENERAL/PREMIUM 분리) | 프론트엔드 | 🚧 카페 생성 폼 UI 수정 필요 | 신규 테마 목록 기반 재설계 |
| **4** | 테마별 스티커팩 신규 생성 | 백엔드 | 📋 신규 20개 테마 × 3팩 = 60개 필요 | 마스터 론칭 시점 확정 후 진행 |
| **5** | 기존 테마 논리삭제 SQL 적용 | 데이터 | 📋 마스터 확인 후 마이그레이션 | 폐기 정책 최종 확정 필요 |
| **6** | 테마별 소개 콘텐츠 (OP 가이드) | PM/마케팅 | 📋 신규 20개 테마 설명 작성 | 론칭 2주 전 준비 |
| **7** | PRD_17_CAFE_THEMA v2.0 최종화 | 문서화 | 📝 본 문서 (마스터 검토 대기) | ✅ 작성 완료 |

### 7-3. 운영 정책 미결정 사항 (v2.0 론칭 후 고려)

| # | 정책 | 선택지 | 마스터 판단 |
|---|---|---|---|
| **1** | 오프시즌 테마 노출 | WORLD_CUP: 4년마다 활성화? / 년중 노출? | ⏳ 스포츠 시즌별 운영 정책 수립 |
| **2** | 테마 폐기 공지 | 사용자에게 "테마가 변경되었습니다" 알림? | ⏳ 커뮤니케이션 전략 |
| **3** | 테마별 커뮤니티 규범 | PREMIUM 테마 카페에 "베팅 금지" 가이드 자동 표시? | ⏳ PI 메인넷 준수 확인 시스템 |
| **4** | 계절성·이벤트 테마 | 크리스마스, 올림픽 같은 임시 테마 추가 정책? | ⏳ 향후 테마 확장 로드맵 |
| **5** | CRYPTO_TRADING 관리 | Pi 외 암호화폐 거래 링크 차단 로직 필요? | ⏳ 규제 준수 모니터링 |

---

## 8. 성공 지표 (KPI)

테마 정책이 **활성 사용자 수 증가**에 기여하는지 측정:

| KPI | 목표 | 측정 방법 |
|---|---|---|
| **DAU by Theme** | 모든 테마의 DAU 합 > 전월 대비 +15% | `msg_room` 테마별 일일 진입자 수 |
| **PREMIUM Theme 구독 전환** | PREMIUM 테마 체험 사용자 구독 전환율 > 5% | `msg_room.theme_tp_cd='PREMIUM'` 사용자 → `bean_subscr` 추적 |
| **테마별 이탈률** | 모든 테마 월 이탈률 < 20% | 30일 미접속자 / 활성 사용자 |
| **FINANCE 테마 충성도** | FINANCE 테마 재방문율 > 70% | FINANCE 카페 멤버의 월 재방문 횟수 |
| **신규 테마 채택율** | 신규 테마 론칭 후 1개월 누적 사용자 > 500명 | 테마별 room 생성 수 |

---

## 9. 결론 및 다음 단계

### 9-1. v2.0에서 확정한 사항 (마스터 지시 반영)

✅ **카페 그룹 정체성 재정의** (마스터 2026-06-20 지시)
- **GENERAL (일반카페 / BASIC)**: 범용·일상 테마 중심 → 신규 온보딩 + DAU 극대화
  - 마스터 필수 3개: MY_TOWN(우리동네), WEATHER(날씨), TRAVEL(여행)
  - 확장: FOOD_SPOTS, DAILY_CHAT, INFO_SHARE, SECONDHAND, HOBBY_GROUP (8개)
- **PREMIUM (프리미엄카페)**: 상업·글로벌 스포츠 IP 특화 → 구독 수익화 + LTV
  - 마스터 필수 4개: WORLD_CUP(월드컵), EPL(프리미어리그), MLB(메이저리그), ESPORTS(e스포츠)
  - 확장: NBA, UCL, F1, UFC_MMA, K_LEAGUE, PGA_GOLF, TENNIS_GRAND_SLAM, CRYPTO_TRADING (12개)

✅ **기존 20개 테마 폐기 처리**
- v1.0의 관심사 분류 테마(FITNESS, GOLF, SWIMMING 등) → 논리삭제 (del_yn='Y')
- TRAVEL 유지 (신규 카탈로그와 동일 코드)
- 기존 사용자 카페는 존속, 신규 생성은 차단

✅ **PI 메인넷 등재 레드라인 명시**
- **스포츠 테마 베팅·도박 절대 금지** (Pi 메인넷 심사 필수 조건)
- 경기 정보·팬덤·채팅만 허용
- CRYPTO_TRADING: Pi 투자만 허용 (다른 암호화폐 거래소 링크 금지)

✅ **테마-가격정책 연계 재확인**
- 테마 자체 과금 없음 (구독료/카페 생성료에 통합)
- GENERAL: 무료 (0 Bean) / PREMIUM: 구독 필수 (월 1~5 Pi)
- PRD_15_FEE / PRD_14_SUBSC 정본과 일관성 유지

✅ **신규 테마 SQL 초안 + 백엔드 코드 예시 제시**
- msg_theme INSERT 20개 (GENERAL 8 + PREMIUM 12)
- 기존 테마 논리삭제 UPDATE 19개
- `canUseTheme()` 권한 검증 함수 TypeScript 예시

### 9-2. 즉시 필요한 마스터 확인

| # | 항목 | 현황 | 결정 필요 |
|---|---|---|---|
| **1** | GENERAL 테마 8개 적절한가? | 제안 완료 | ✅ 개수/테마명/이모지 확정 |
| **2** | PREMIUM 테마 12개 적절한가? | 제안 완료 (스포츠 IP 11 + Pi투자 1) | ✅ 개수/IP 선정/순서 확정 |
| **3** | 기존 테마 폐기 정책 | TRAVEL 유지, 나머지 19개 논리삭제 제안 | ✅ 예외 테마 있는가? |
| **4** | CRYPTO_TRADING 명칭/설명 | "Pi투자·암호화폐" 제안 | ✅ 표기법 최종화 |
| **5** | 스포츠 테마 오프시즌 운영 | 정책 미수립 | ⏳ 론칭 전 결정 |

### 9-3. 다음 단계 (마스터 확인 후)

1. **마스터 최종 승인** (테마명/이모지/개수/폐기정책)
2. **DB 마이그레이션** (`sql/` 마이그레이션 파일 작성 + DA 검사 + Supabase 적용)
3. **백엔드 권한 게이트** (`canUseTheme()` 구현 + chat-auth.ts 통합)
4. **프론트엔드 UI** (카페 생성 시 테마 선택 폼 재설계)
5. **스티커팩 생성** (신규 20개 테마 × 3팩 = 60개)
6. **사용자 공지 + 론칭** (기존 테마 폐기 공지 → 2주 유예 → 테마 전환)
7. **KPI 모니터링** (테마별 DAU/구독 전환율 추적)

---

**PRD_17_CAFE_THEMA.md v2.0 — 마스터 지시 반영 완료** (2026-06-20)
**다음 파일 참조**: `docs/PRD_15_FEE.md`, `docs/PRD_14_SUBSC.md`, `src/lib/chat-auth.ts`
