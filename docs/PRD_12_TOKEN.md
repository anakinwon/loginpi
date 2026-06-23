# PRD_12_TOKEN.md — Cafe.pi 생태계 토큰 발행

> **작성일**: 2026-06-17
> **버전**: v1.9
> **상태**: 사용처 9종 백서·PRD 동기화 · T01 KYC 임시승인 · T02 in-app Launchpad(Mainnet 미출시) · T05 법무 지연 가능 · 백서 v0.2·법무 의뢰서 작성 완료
> **작성자**: asoká (pi-launchpad-token-consultant 에이전트) / 검토: anakin
> **관련 문서**: PRD_0_INT.md (플랫폼 전략), PRD_4_CHAT.md (카페), PRD_8_MPS.md (마켓플레이스), PRD_9_VOICE_CHAT.md (보이스챗), PRD_11_EVENT.md (이벤트)
> **토큰 문서 세트**: `PRD_12_TOKEN_백서.md`·`_WHITEPAPER_EN.md` (백서) · `docs/dist/*.pdf` (배포본) · `_법무자문의뢰서.md` (법무) · **`docs/GAOPEN/checkList.md` (GA 개방 시 제출 체크리스트)**

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| **v1.9** | 2026-06-17 | **사용처 확장 동기화(§1-5)** — 백서 v0.2의 확장 사용처를 PRD §1-5 유틸리티 목록에 반영: 사용권에 동시통역(PiTranslate™)·마켓 구매/판매 수수료, 보상에 이용후기(리뷰)·매출 쿠폰/스탬프, 후원에 도네이션 사회 기부 추가. 전체 9종 표는 백서 §4 참조(DRY). 분배 비율 영향 없음(리저브 지출 대상만 확대). | asoká |
| **v1.8** | 2026-06-17 | **T01·T02·T05 현황 갱신 + 웹 리서치 반영** — ① **T01**: 개인 KYC 완료 → '임시승인' 단계로 갱신(병목 완화). 임시 KYC의 Launchpad 인정 여부를 T02 문의에 포함. ② **T02**: 웹 확인 — Launchpad 공식 창구는 Pi Browser 내 'Pi Launchpad' 앱이며 **Mainnet 미출시**(Testnet SLICE ~Pi2Day 6/28/2026), issuer 신청양식 미게재. 이메일은 '공식 신청'이 아닌 '창구 확인 문의'로 성격 정정. ③ **T05**: 법무 자문은 Launchpad 절차상 필수 아님 → 현 단계 Skip 가능, 단 Mainnet 공개 세일 전 필수로 명시(P0→P1 조정). 법무 자문 의뢰서 단독 문서(`PRD_12_TOKEN_법무자문의뢰서.md`) 작성. | asoká |
| **v1.7** | 2026-06-17 | **전 섹션 정합 정리(cleanup)** — 증분 편집으로 생긴 앞단 섹션의 옛 내용을 확정 결정과 동기화: ① §1-4 성공기준 비현실 수치(유동성 100M Pi·DAH 5만) → 확정 세일 기준 잠정목표로 교체. ② §5-1 종합표 T01(개인 KYC)·T04(✅확정)·T05(질의서 작성·회신대기) 상태 갱신. ③ §5-2 T04·T05 상세를 확정 내용으로 교체(옛 분배 예시 제거). ④ §9 PRD 버전·발행주체 행·T01 문구 정리. 내용 결정 변경 없음, 일관성만 정리. | asoká |
| **v1.6** | 2026-06-17 | **발행 주체 = 개인(아나킨 마스터님) 확정** — T01을 개인 KYC 경로로 정리(법인 KYC 불필요), 세금·법무 자문 범위도 개인 발행 기준. §9-1·§9-4·§5-2 반영. ⚠️ 개인 발행은 증권성·특금법 책임이 개인 명의로 집중(유한책임 부재) → §8-1-1 법무 자문에서 법인 전환 필요성 재확인 권고 명시. | asoká |
| **v1.5** | 2026-06-17 | **§9 금일 실행계획 최신 결정 동기화** — ① 확정 완료 항목(T04 분배·BEAN 명칭·세일 파라미터·리베이스·T05 포지셔닝·레드라인)을 '의사결정 닫힘' 표로 정리. ② 잔여 액션을 '오늘 시작 가능한 오프라인 액션'(T01 KYC 착수·T02 이메일 발송·T10 App Studio)과 '남은 의사결정'(발행 주체 개인/법인·법무 의뢰 실행·리베이스 코드 PR 일정)으로 재구성. ③ 옛 표현 정합화: T04 안1/안2 선택·T05 목적질문 제거, T07 약정한도 1~10,000→1~500 Pi, T01 서류 정리. | asoká |
| **v1.4** | 2026-06-17 | **T01~T03 오프라인 액션 가이드 + 레드라인 반영(§9-4)** — ① Pi 등재 레드라인 4종을 Launchpad 심사 선행 게이트로 명시. **레드라인 #2(Pi 외 자산 거래 금지)** 반영: BEAN은 공식 Launchpad 경유 발행만 안전, §6-5 유동성 `BEAN/USDT`·타자산 페어 **제거** → Pi 페어 단독. ② T01(KYC)·T02(신청양식, 영문 이메일 초안 포함)·T03(Mainnet 일정) 실행 경로·완료 기준·의존 순서 작성. T01을 최장 병목으로 즉시 착수 권고. | asoká |
| **v1.3** | 2026-06-17 | **Bean 리베이스 결정 + T05 착수** — ① 기존 Pi Bean 정합을 `1 Pi=100 BEAN` 리베이스로 **확정**(§8-3-3, 인앱 코드 정렬은 발행 전 구현 TODO로 분리). ② T05 토큰 포지셔닝 권고 신설 — BEAN을 **유틸리티 토큰**(사용권·보상)으로 규정, 투자 권유성 표현·구조 회피 가이드(§1-5). ③ **법무 자문 의뢰 질의서**(증권성·특금법·세금·표시광고·역외규제 8개 항) 작성(§8-1-1) — 외부 변호사 송부용. T05는 법무 회신 수령 시 최종 확정. | asoká |
| **v1.2** | 2026-06-17 | **토큰명·세일 파라미터 확정** — ① 티커 CAFE→**BEAN** 확정(기존 인앱 "Pi Bean" 팁 유틸리티와 연결, §1-1). ② 세일 파라미터 확정(보수 자세): 세일가 **0.01 Pi/BEAN**(`1 Pi=100 BEAN`), 초기 FDV 10M Pi, 목표 조달 소프트캡 2M/하드캡 4M Pi, Fair-Access 약정 최소1/최대500 Pi(§6-1·§6-3). ③ 기존 Pi Bean(Pi 직접표시)과의 100배 스케일 충돌 → 리베이스 `1 Pi=100 BEAN` 권고안 신설(§8-3-3, 의사결정 대기). | asoká |
| **v1.1** | 2026-06-17 | **T04 분배 비율 확정(§6-2)** — 백서·신청서 심사 통과 기준으로 단일 확정안 채택: 세일 40% / 생태계 리저브 25% / 유동성 15% / 마케팅 12% / 팀 8%. 안1(보수) 기반에 팀 10%→8% 축소, 축소분 2%p를 마케팅으로 이전(인사이더 보유 최소화 = 심사 신뢰도 최대 레버). 팀 베스팅 물량 100M→80M 조정(§6-4). 안1·안2는 검토 이력으로 정리. | asoká |
| **v1.0** | 2026-06-17 | 최초 작성 — Pi 공식 문서(Launchpad, KYC, Mainnet) 리서치 완료. 선결과제 도출(자격·기술·토크노믹스·규제 4대 카테고리). 10억 발행량 기준 토크노믹스 초안 설계(생태계/유동성/팀/세일 분배). Stellar/Soroban 메인넷 배포 기술 아키텍처 정의. P0 차단요소: ①런치패드 자격심사 요건 미확인(공식 문서 미게재), ②메인넷 마이그레이션 상태 확인 필요, ③토큰 목적/가격 최종 결정 대기. | asoká |

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [배경: Cafe.pi 생태계 맥락](#2-배경-cafepi-생태계-맥락)
3. [공식 문서 리서치 결과](#3-공식-문서-리서치-결과)
4. [토큰 발행 절차 (단계별)](#4-토큰-발행-절차-단계별)
5. [선결과제 목록](#5-선결과제-목록)
6. [토크노믹스 초안](#6-토크노믹스-초안)
7. [기술 아키텍처](#7-기술-아키텍처)
8. [리스크 및 미확인 사항](#8-리스크-및-미확인-사항)
9. [금일 실행 계획](#9-금일-실행-계획)
10. [참고 출처](#10-참고-출처)

---

## 1. 프로젝트 개요

### 1-1. 제품명

**BEAN (빈)** — Cafe.pi 생태계 토큰, Pi Network Launchpad를 통한 공식 발행

> **티커 확정 근거**: cafe.pi에는 이미 **"Pi Bean"(🫘) 인앱 팁 단위**가 운영 중(PREMIUM+ 구독자 간 전송, `src/app/api/tips/route.ts` 등 12개 파일). 토큰명을 BEAN으로 확정함으로써 **기존 오프체인 Bean 팁 → 온체인 BEAN 토큰**으로 자연스럽게 연결되어 "Product-First/유틸리티" 심사 서사가 강화됨. (단, 기존 Bean의 Pi 단가 체계와의 정합은 §8 미해결 사항 참조)

### 1-2. 한 줄 요약

Cafe.pi 플랫폼(카페·마켓플레이스·보이스챗·이벤트)의 사용자 보상·거버넌스·유동성을 지원하는 생태계 토큰을 Pi Launchpad를 통해 1,000,000,000개 규모로 발행 및 유통.

### 1-3. 목표

1. **생태계 토큰화**: 카페, MPS, 보이스챗, 이벤트 등 주요 기능을 토큰 인센티브로 통합
2. **사용자 획득 및 유지**: 토큰 세일 및 미션 보상으로 활성 사용자 수 증대
3. **유동성 확보**: Pi Network Launchpad 메커니즘을 통해 공정한 토큰 분배 및 DEX 유동성 풀 구축
4. **분산 거버넌스 기반**: 토큰 홀더의 의사결정(로드맵, 정책 투표) 참여 메커니즘 구축 (향후)

### 1-4. 성공 기준

- **P0**: Pi Launchpad 심사 통과 및 메인넷 발행 완료
- **P1**: Launchpad 세일 완판(하드캡 4,000,000 Pi) + BEAN/Pi 유동성 풀 안정 조성
- **P2**: 토큰 발행 30일 후 활성 홀더 10,000명 이상 (세일 최소 참여자 8,000명 기준, 잠정 목표)
- **P3**: 카페·MPS 등 주요 기능과 토큰 인센티브 통합 완료

> 위 P1·P2 수치는 확정 세일 파라미터(§6) 기준의 **잠정 목표** — 실제 KPI는 Launchpad 심사·시장 상황 확정 후 재조정.

### 1-5. 토큰 포지셔닝 (증권성 회피 전략) — ⭐ 권고

> ⚠️ **본 항은 법률 자문이 아니며**, 최종 분류는 §8-1-1 법무 자문으로 확정해야 함. 아래는 증권성 리스크를 낮추기 위한 **권고 포지셔닝**.

- **1차 목적 = 유틸리티 토큰(Utility Token)**: BEAN은 cafe.pi 생태계 내 **사용권·보상·후원·결제 수단**으로 규정. (전체 사용처 9종 표: `PRD_12_TOKEN_백서.md` §4)
  - **사용권**: 카페/MPS/보이스챗 기능 이용·할인 · 글로벌 동시통역(PiTranslate™) 이용 · 마켓 구매/판매 수수료 결제
  - **후원**: 기존 인앱 "Pi Bean" 팁의 온체인화(사용자 간 후원) · 도네이션 기반 **사회 기부** 연계
  - **보상**: 미션·이벤트·커뮤니티 기여 보상 · 이용후기(리뷰) 보상 · 매출 쿠폰/스탬프 보상
  - **(향후) 거버넌스**: 투표권(수익권과 **분리**)
- **명시적으로 회피할 표현·구조 (증권성 트리거)**:
  - ❌ "투자", "수익 보장", "배당", "가격 상승 기대", "ROI" 등 **투자 권유성 문구**
  - ❌ 발행사가 토큰 가치 상승을 위해 노력한다는 **약정/암시**
  - ❌ 세일 Pi를 발행사 운영자금으로 직접 수취 (런치패드 구조상 유동성 풀 예치 → 이 점이 증권성 완화에 유리)
- **근거**: Launchpad의 "Product-First"(자금조달 아닌 유저 획득) 원칙과 정합. 단, 한국 자본시장법의 증권성 판단은 형식이 아닌 **실질**로 이뤄지므로 §8-1-1 자문 필수.

---

## 2. 배경: Cafe.pi 생태계 맥락

### 2-1. 플랫폼 현황

Cafe.pi는 **Pi Network 메인넷 기반의 온라인 커뮤니티 및 O2O 마켓플레이스**로:

- **카페(PiChat)**: 사용자들이 실시간으로 소통·콘텐츠 공유
- **마켓플레이스(PiShop™/MPS)**: 판매자와 구매자가 Pi를 사용하여 거래
- **보이스챗(PiVoice)**: 음성 채팅을 통한 깊이 있는 커뮤니티 형성
- **이벤트 및 미션**: 사용자 활동에 대한 보상·화이트리스트 관리
- **구독 시스템(PiRC2)**: 반복 결제를 통한 프리미엄 서비스 제공

**현재 과제**: 온라인 커뮤니티 → 오프라인 카페 운영으로 확대하는 O2O 비즈니스 전환 중.

### 2-2. 토큰 발행의 전략적 위치

1. **사용자 활성화 도구**: 토큰 보상으로 카페·MPS·보이스챗 사용 유도
2. **유동성 엔진**: Pi 보유자가 토큰을 구매해 Cafe.pi 생태계로 유입되는 선순환 구조
3. **거버넌스 기반**: 향후 커뮤니티 의사결정에 참여 메커니즘 확보
4. **수익 모델 기초**: 스테이킹, 수수료 수익화, 광고 기여도 등의 향후 기반

### 2-3. 기존 기술 스택 정합성

| 요소 | 현황 |
|------|------|
| **스마트 컨트랙트** | PiRC2 구독 컨트랙트(Soroban) 운영 중 — `CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV` |
| **네트워크** | Pi Testnet(`rpc.testnet.minepi.com`) 운영 + **Mainnet 전환 준비 중** |
| **단위 시스템** | 1 Pi = 10,000,000 units (i128) — 소수점 7자리 |
| **인증** | Pi Browser + Pi SDK + NextAuth v5(Google) 통합 |
| **DB** | Supabase(RLS 비활성화, SERVICE_ROLE_KEY 기반) |

**신규 토큰도 Soroban(Stellar) 기반이어야 함** — 기존 PiRC2와 동일 환경에서 상호작용 가능.

---

## 3. 공식 문서 리서치 결과

### 3-1. Pi Launchpad 핵심 정책

**출처**: 
- [Pi Launchpad Released on Testnet](https://minepi.com/blog/pi-launchpad/)
- [Pi Launchpad Updates: Improved Flow & Second Test Token](https://minepi.com/blog/launchpad-update-flow/)
- [Pi Day 2026: Major Releases](https://minepi.com/blog/pi-day-2026/)

**핵심 사항**:

1. **Product-First 원칙**
   - Launchpad는 **이미 작동하는 애플리케이션**을 가진 프로젝트만 대상
   - Cafe.pi는 카페·MPS·보이스챗·이벤트 모두 운영 중 → **충족**

2. **토큰 목적**
   - 자금 조성이 **아닌** 사용자 획득 및 제품 유틸리티 도구
   - "Ecosystem tokens are designed for user acquisition and product utility, rather than serving primarily to raise capital"

3. **수익 흐름**
   - 사용자가 Pi로 토큰을 구매한 모든 수익 → **Liquidity Pool(유동성 풀)에 불가역적 예치**
   - 발행 프로젝트는 직접 수익을 받지 **않음** (유동성 풀을 통한 장기 생태계 지원)

4. **Fair-Access 메커니즘** (참여 형평성)
   - 참여자가 "약정액(commitment)"을 선택
   - 약정액에 따라 자동으로 "공정 접근 홀드(fair-access hold)" 계산
   - 큰 투자자(whale)가 모든 토큰을 독점하는 것 방지

### 3-2. 메인넷 마이그레이션 및 KYC 요건

**출처**: 
- [Pioneers: Complete Your KYC and Mainnet Migration](https://minepi.com/blog/complete-grace-period/)
- [KYC FAQ](https://minepi.com/kyc-faqs/)

**핵심 사항**:

1. **메인넷 활성화 상태** ✅
   - Pi Mainnet은 **Enclosed Network 단계(2025-02-20 이후)** — 내부 네트워크는 활성, 외부 연결은 제한
   - **Open Network 론칭**(2025-02-20) — Pi와 외부 블록체인/거래소 연결 시작
   - 현재 Launchpad Testnet 단계 → **Mainnet 출시 임박**(Pi Day 2026 이후로 추정)

2. **KYC 완료의 중요성**
   - Launchpad 참여자는 **KYC 완료 필수** (미확인)
   - Cafe.pi 운영진도 기관 KYC 완료 필요 (미확인)
   - KYC 미완료 계정 → Mainnet 마이그레이션 불가

### 3-3. Pi App Studio 등록 요건

**출처**: 
- [Pi App Studio Community Guidelines](https://minepi.com/appstudio_community_guidelines/)
- [Pi App Studio Expands App Utilities](https://minepi.com/blog/app-studio-event-payments-ads/)

**핵심 사항**:

1. **Pi App Studio 등록 (필수)**
   - Cafe.pi가 Pi App Studio에 등록된 공식 앱 상태여야 함
   - 런치패드 참여는 "등록된 프로젝트"만 가능 (미확인, 공식 문서 미게재)

2. **커뮤니티 가이드라인**
   - 앱의 기능·이름·설명이 정확히 일치해야 함
   - 스팸·사기 콘텐츠 금지
   - 명확한 사용 사례 필요

### 3-4. 스마트 컨트랙트 배포 절차

**출처**: 
- [Pi Testnet RPC Server Released](https://minepi.com/blog/rpc-server/)
- [Subscription Smart Contract](https://minepi.com/blog/subscriptions-smart-contract/)

**절차**:
1. Testnet에서 스마트 컨트랙트 개발 및 테스트
2. **PiRC(Pi Request for Comment)** 커뮤니티 공개 검토
3. 외부 감사(external audit) 실시
4. 커뮤니티 피드백 반영
5. **Mainnet 배포** (Pi 재단 승인 후)

**현재 상태**:
- PiRC2 구독 컨트랙트는 이미 Mainnet 배포 완료
- 신규 토큰 컨트랙트도 동일 절차 필요

### 3-5. Stellar 기반 자산 발행

**출처**: 
- [Pi Cryptocurrency White Paper](https://minepi.com/white-paper/)
- [Mainnet Migrations Roadmap & Tokenomics](https://minepi.com/blog/mainnet-migrations-roadmap-and-tokenomics/)

**핵심**:
- Pi Blockchain은 **Stellar Consensus Protocol(SCP)** 기반
- Stellar protocol v23을 기반으로 커스텀 Pi protocol 구축
- 자산 발행은 **Stellar 표준 자산 모델** 사용 → Soroban 스마트 컨트랙트와 호환

---

## 4. 토큰 발행 절차 (단계별)

### Phase 1: 준비 (2~4주)

| 단계 | 작업 | 담당 | 완료 기준 |
|------|------|------|----------|
| 1-1 | KYC 완료 (Cafe.pi 운영진) | 법무/운영 | KYC 신청 제출, 승인 대기 |
| 1-2 | Pi App Studio 등록 상태 확인 | 개발 | Cafe.pi 공식 앱 상태 확인 |
| 1-3 | 토크노믹스 최종 확정 | 전략 | 발행량, 분배, 세일 가격 결정 |
| 1-4 | 법률 검토 (증권성 판단) | 법무 | 토큰 분류, 규제 리포트 |
| 1-5 | 백서 작성 (한영 이중언어) | 전략/운영 | 한글/영문 백서 완성 |

### Phase 2: 스마트 컨트랙트 개발 (4~6주)

| 단계 | 작업 | 담당 | 완료 기준 |
|------|------|------|----------|
| 2-1 | Testnet 토큰 컨트랙트 개발 | 개발 | Soroban 컨트랙트 배포 |
| 2-2 | 초기 공급량 민팅 (1B 토큰) | 개발 | 토큰 생성 및 보유 계정 설정 |
| 2-3 | 유동성 풀 스마트 컨트랙트 개발 | 개발 | Launchpad 호환 스왑 컨트랙트 |
| 2-4 | 외부 감사(Security Audit) | 외주 | 감사 리포트 완료 |
| 2-5 | Testnet에서 전체 flow 테스트 | QA/개발 | Fair-access 계산, 민팅, 분배 검증 |

### Phase 3: Launchpad 심사 및 공개 (2~4주)

| 단계 | 작업 | 담당 | 완료 기준 |
|------|------|------|----------|
| 3-1 | Launchpad 공식 신청(출원) | 운영 | 신청서 제출 (미확인: 공식 신청 폼) |
| 3-2 | Pi 재단 심사 | Pi 재단 | 자격 요건 검증 (기간: TBD) |
| 3-3 | PiRC 커뮤니티 공개 리뷰 | Pi 커뮤니티 | 피드백 수집 (1~2주) |
| 3-4 | 보안 감사 최종 | 외주 | 감사 완료 및 수정사항 반영 |
| 3-5 | Testnet Launchpad 프리런(test) | 사내/테스터 | 참여 흐름 최종 검증 |

### Phase 4: 메인넷 발행 (1~2주)

| 단계 | 작업 | 담당 | 완료 기준 |
|------|------|------|----------|
| 4-1 | Mainnet 토큰 컨트랙트 배포 | 개발 | 메인넷에서 토큰 활성화 |
| 4-2 | Launchpad Mainnet 오픈 | Pi 재단 | 공식 런칭 |
| 4-3 | 커뮤니티 공지 및 홍보 | 마케팅 | 홍보물 배포, 언론 공개 |
| 4-4 | DEX 유동성 풀 개설 | 개발/운영 | 유동성 공급 자동화 설정 |
| 4-5 | 토큰 보상 자동화 (카페/MPS/보이스챗) | 개발 | 기능별 토큰 인센티브 활성화 |

### Phase 5: 운영 (지속)

| 단계 | 작업 | 담당 | 완료 기준 |
|------|------|------|----------|
| 5-1 | 참여자 지원 및 커뮤니티 관리 | 운영 | FAQ, Discord/Telegram 지원 |
| 5-2 | 거버넌스 투표 시스템 구축 (향후) | 개발 | 토큰 홀더 투표 메커니즘 |
| 5-3 | 스테이킹 및 수익 배분 (향후) | 개발 | 토큰 스테이킹 기능 개발 |

---

## 5. 선결과제 목록

### 5-1. 선결과제 종합 표

| 우선순위 | ID | 카테고리 | 과제명 | 금일 해결 | 차단 요소 | 담당 | 비고 |
|----------|-----|---------|--------|-----------|----------|------|------|
| **P0** | T01 | 자격/심사 | KYC (개인 — 아나킨 마스터님) | 🔶 | KYC 완료 → **임시승인** 단계, 최종/임시 인정 여부 확인 | 본인/법무 | 처음부터 아님 → 병목 완화. 임시 KYC Launchpad 인정 여부 T02에 문의 |
| **P0** | T02 | 자격/심사 | Launchpad 공식 신청 양식·창구 확인 | 🔶 | **Mainnet Launchpad 미출시**(Testnet/SLICE ~6/28). issuer 양식 미게재 | 운영 | 공식 창구=Pi Browser 내 앱(이메일 아님). Mainnet GA 대기 |
| **P0** | T03 | 기술 | Pi Mainnet/Launchpad 출시 상태 | 🔶 | Mainnet Launchpad **GA**(General Availability·정식 개방) 미정(6/28 이후 추정) | 개발 | T02와 함께 확인 |
| ~~P0~~ | T04 | 토크노믹스 | 토큰명·분배·세일 파라미터 확정 | ✅ | — | 전략 | **확정**: BEAN · 40/25/15/12/8 · 0.01 Pi (§6) |
| **P1** | T05 | 규제/법률 | 토큰 증권성 판단 및 규제 리포트 | 🔶 | 외부 변호사 회신 (절차 필수 아님 → **지연 가능**) | 법무 | 의뢰서 작성 완료. **Mainnet 공개 세일 전까지** 완료 필수 |
| **P1** | T06 | 기술 | Soroban 토큰 컨트랙트 개발 (Testnet) | ❌ | Stellar asset 표준 학습 필요(1~2주) | 개발 | PiRC2 참고 후 신규 설계 |
| **P1** | T07 | 기술 | Fair-Access Hold 알고리즘 검증 | ❌ | Launchpad 메커니즘 공식 스펙 확인(미확인) | 개발 | 공정성 검증 후 구현 |
| **P1** | T08 | 기술 | 보안 감사(Security Audit) 업체 선정 | 🔶 | 감사 비용(5,000~15,000 USD) 예산 필요 | 개발/재무 | 외부 감사 회사(Certora, CertiK 등) 선정 |
| **P1** | T09 | 토크노믹스 | 백서 작성 (한영 이중언어) | ❌ | 토크노믹스 최종 확정 후 작성 가능 | 전략 | 기술·경제·용도 3섹션 포함 |
| **P1** | T10 | 운영 | Pi App Studio 등록 상태 재확인 | ⭕ | 기존 앱 이미 등록 여부 확인 | 개발 | 오늘 중 확인 가능 |
| **P2** | T11 | 기술 | Mainnet 토큰 컨트랙트 배포 | ❌ | Mainnet 런칭까지(2~3개월) | 개발 | Phase 4 단계 |
| **P2** | T12 | 운영 | DEX 유동성 풀 구성 계획 | 🔶 | DEX 파트너 협의 필요 | 운영 | Stellar DEX 또는 커스텀 스왑 선택 |
| **P2** | T13 | 기능 | 카페/MPS/보이스챗 토큰 보상 통합 | ❌ | 컨트랙트 배포 후 가능(Phase 4) | 개발 | 인센티브 로직 설계 필요 |
| **P3** | T14 | 운영 | 거버넌스 투표 메커니즘 설계 | ❌ | 향후 로드맵(Q3/Q4 2026) | 전략 | 시간 여유 있음 |
| **P3** | T15 | 운영 | 스테이킹 및 수익 배분 시스템 | ❌ | 향후 로드맵 (Q4 2026+) | 개발 | 장기 계획 |

### 5-2. P0 차단 요소 상세

#### T01: KYC 완료 (발행 주체 = 개인)
- **상태**: 미완료
- **발행 주체**: ✅ 개인(아나킨 마스터님) 확정 → **개인 KYC** 경로
- **예상 기간**: 1~4주
- **액션**: 본인 Pi 계정 KYC 통과 상태 확인 (미통과 시 우선 완료)
- **영향**: Launchpad 심사 진행 불가
- **⚠️**: 개인 발행은 법적 책임 개인 귀속 → 법무 자문에서 법인화 필요성 재확인(§8-1-1)

#### T02: Launchpad 공식 신청 양식 미확인
- **상태**: 미확인
- **차단 요인**: Pi 공식 문서에 신청 절차 미게재
- **추측**: Pi Launchpad 신청 폼이 "pi.app" 또는 Developer Portal에 있을 것으로 예상
- **즉시 액션**: Pi 개발자 포럼 또는 이메일(developers@minepi.com)로 신청 양식 확인 필요

#### T03: Pi Mainnet 전환 준비 상태
- **현황**: 
  - Mainnet은 Enclosed Network(2025-02-20 이후) 상태
  - Open Network(2025-02-20)로 외부 연결 시작
  - PiRC2 구독 컨트랙트는 Mainnet 배포됨
- **확인 필요**: 
  - Launchpad의 Mainnet 런칭 시기 (Pi Day 2026 이후 추정, 공식 날짜 미게재)
  - Mainnet 배포 시 KYC 완료 의무 여부

#### T04: 토큰명·토크노믹스 — ✅ **확정 (2026-06-17)**
- **토큰명**: BEAN (§1-1)
- **발행량**: 1,000,000,000개 (10억)
- **분배**: 세일 40% / 리저브 25% / 유동성 15% / 마케팅 12% / 팀 8% (§6-2)
- **세일가**: 0.01 Pi / BEAN (`1 Pi = 100 BEAN`), FDV 10M Pi, 약정 1~500 Pi (§6-1·§6-3)
- → 추가 의사결정 불필요. 상세 §6.

#### T05: 토큰 증권성 판단 — 🔶 **준비 완료, 법무 회신 대기**
- **리스크 등급**: 🔴 **높음** (최악: 무등록 증권 발행 형사 처벌 3년 이하 징역 또는 1억 이하 벌금)
- **완료된 준비**:
  - 포지셔닝: 유틸리티 토큰으로 규정 + 증권성 트리거 회피 가이드 (§1-5)
  - 법무 자문 질의서 8항 작성 — 외부 변호사 송부용 (§8-1-1)
- **잔여 차단**: 외부 변호사/로펌 회신 (실질 판단은 자문 없이 확정 불가)
- **지연 가능 여부 (2026-06-17 결정)**: Launchpad/Pi의 **절차적 필수 요건 아님**(심사 시 변호사 의견서 미요구) → **현 단계(Testnet·준비)에서는 Skip 가능**. 단 **Mainnet 공개 세일(실 Pi 모집) 전에는 반드시 완료** — 실 모집 시점이 개인 발행자 증권성·특금법 리스크의 현실화 지점. 의뢰서는 작성 완료(`PRD_12_TOKEN_법무자문의뢰서.md`)되어 즉시 송부 가능.
- **연계**: 발행 주체=개인 → 책임 개인 귀속, 법인화 필요성도 자문에 포함

---

## 6. 토크노믹스 초안

### 6-1. 기본 파라미터

| 파라미터 | 값 | 단위 | 비고 |
|----------|-----|------|------|
| **Total Supply (최대 공급량)** | 1,000,000,000 | 개 | 10억 개 |
| **Initial Supply (초기 발행량)** | 1,000,000,000 | 개 | 모두 발행 (향후 소각 정책 가능) |
| **Decimal Places (소수점)** | 7 | - | Pi 단위계 정렬: 1 BEAN = 10,000,000 units (i128) |
| **세일가격 (Sale Price)** | **0.01 Pi / BEAN** ✅ | Pi | 보수 자세 확정(2026-06-17). `1 Pi = 100 BEAN` |
| **초기 FDV** | **10,000,000 Pi** | Pi | 10억 × 0.01 (보수 밸류에이션) |
| **Target Funding (목표 조달액)** | **2,000,000 Pi** (소프트캡) | Pi | 하드캡 4,000,000 Pi(세일 400M 완판). ⚠️ 조달 Pi는 발행사 직수령 아님 → 유동성 풀 예치 |
| **Fair-Access Hold Ratio** | TBD | % | Launchpad 메커니즘에 따라 자동 계산 |

### 6-2. 분배 구조 (10억 기준) — ✅ 확정안 (v1.1, 2026-06-17)

> **결정 기준**: 런치패드 백서·신청서 **심사 통과**를 최우선으로, ①인사이더(팀) 보유 최소화 ②유틸리티 서사를 뒷받침할 생태계 리저브 확보 ③상장 후 가격 안정을 위한 두터운 유동성 ④세일 과반 미만(자금조달 아님 포지션 유지)의 4대 축으로 결정. 아래 두 초안(안1 보수·안2 적극)의 장점만 결합한 단일안.

| 카테고리 | 비율 | 수량 | 락업/베스팅 | 심사 근거 |
|----------|------|------|------|------|
| **세일(Launchpad)** | 40% | 400,000,000 | 즉시~짧은 cliff | 커뮤니티 분배 충분하되 과반 미만 → "자금조달 아님" 포지션 유지 |
| **생태계 리저브** | 25% | 250,000,000 | 3~4년 분할 방출 | 사용자 보상(카페/MPS/보이스챗 미션) = 토큰 존재 이유(유틸리티) 증명 |
| **유동성 풀** | 15% | 150,000,000 | LP 영구 락 | Launchpad 공정 배분 + DEX 유동성 → 상장 후 가격 안정("토큰 헬스" 통과) |
| **마케팅/파트너십** | 12% | 120,000,000 | 12개월 락 | 거래소 상장, 파트너 협력, 커뮤니티 이벤트 실탄 |
| **팀/재단** | 8% | 80,000,000 | 6M cliff + 36M 선형 | **인사이더 보유 최소화 = 심사 신뢰도 최대 레버** |

**합계**: 1,000,000,000개

#### 검토 이력 — 폐기된 초안 (참고용)

| 카테고리 | 안1(보수) | 안2(적극) | 확정안 채택 사유 |
|----------|------|------|------|
| 생태계 리저브 | 25% | 20% | 안1 채택(유틸리티 연료 확보) |
| 유동성 풀 | 15% | 10% | 안1 채택(가격 안정) |
| 팀/재단 | 10% | 8% | **안2 채택(인사이더 최소화)** |
| 세일(Launchpad) | 40% | 50% | 안1 채택(자금조달 인상 회피) |
| 마케팅/파트너 | 10% | 12% | 안2 채택(팀 축소분 2% 이전) |

> 확정안 = 안1 기반에 **팀 10%→8% 축소, 축소분 2%p를 마케팅으로 이전**. 인사이더 보유를 줄이는 것이 백서 심사에서 가장 효과 큰 단일 변경이므로.

### 6-3. 세일 구조

#### Launchpad Testnet (프리런)
- **기간**: Launchpad 심사 통과 후 1주일
- **참여자**: 사전 신청 테스터 (500~1,000명)
- **배분**: 세일 수량의 5% (20,000,000 BEAN, 확정안 400M 기준)
- **가격**: **0.01 Pi / BEAN** (확정)
- **목적**: 컨트랙트·유동성 풀 검증

#### Launchpad Mainnet
- **기간**: 공식 Mainnet 런칭 후 4주
- **참여자**: KYC 완료 Pi 홀더 (제약 없음)
- **배분**: 세일 수량 100% (확정안 400,000,000 BEAN)
- **세일가격**: **0.01 Pi / BEAN** ✅ (`1 Pi = 100 BEAN`)
- **목표 조달액**: 소프트캡 2,000,000 Pi / 하드캡 4,000,000 Pi(완판)
- **Fair-Access 약정 한도**: **최소 1 Pi / 최대 500 Pi** (고래 방지) → 하드캡 도달 시 최소 참여자 ≈ **8,000명** (북극성=활성 사용자 분산 극대화)
- **토큰 획득**: `BEAN 수 = (약정 Pi ÷ 0.01) × Fair-Access Hold 비율`

### 6-4. 베스팅 스케줄

#### 팀/재단 토큰 (80,000,000개, 확정안 8% 기준)

| 구간 | 기간 | 배분 | 목적 |
|------|------|------|------|
| **Cliff** | 6개월 | 0% | 초기 잠금 |
| **Year 1** | 6~12개월 | 25% | 3개월마다 6.25% 해제 |
| **Year 2** | 1~2년 | 50% | 3개월마다 6.25% 해제 |
| **Year 3** | 2~3년 | 25% | 3개월마다 6.25% 해제 |

**목적**: 팀 이탈·변심 방지, 장기 프로젝트 신뢰성 입증

### 6-5. 유동성 풀 구성

#### Mainnet DEX 유동성 구조 (목표)

| 쌍 | 비율 | 수량 | 참고 |
|-----|------|------|------|
| **BEAN/Pi** | **100%** | 150,000,000 BEAN | 단일 기축 쌍 (레드라인 #2 준수) |
| ~~BEAN/USDT(Stellar)~~ | — | — | 🔴 **제거** — 스테이블코인=법정화폐 환산 → Pi 등재 레드라인 #2 위반 소지 |
| ~~BEAN/다른생태계토큰~~ | — | — | 🟠 보류 — Pi 외 자산 페어는 심사 리스크, 발행 후 별도 검토 |

> ⚠️ **레드라인 준수**: Pi 메인넷/런치패드 심사는 "Pi 외 암호화폐·법정화폐 거래 + Pi 가치평가 언급"을 거절 사유로 봄. 따라서 BEAN 유동성은 **Pi 페어 단독**으로 구성. USDT 등 스테이블코인·타 체인 자산 페어는 배제. (§9-4 선행 점검 참조)

**유동성 제공자(LP) 인센티브**: 수익 배분(스왑 수수료 0.25~0.5% 중 일부)

---

## 7. 기술 아키텍처

### 7-1. Soroban 컨트랙트 설계 (Stellar 기반)

#### 토큰 컨트랙트 기본 구조

```rust
// BEAN 토큰 (Stellar standard-compliant)
pub contract BEAN {
    // 초기화: 운영자, 총공급량, 소수점
    pub fn initialize(admin: Address, total_supply: i128, decimals: u32) {}
    
    // 발행(민팅): 초기 1B 토큰 생성
    pub fn mint(recipient: Address, amount: i128) -> Result<(), Error> {}
    
    // 이전(전송)
    pub fn transfer(from: Address, to: Address, amount: i128) -> Result<(), Error> {}
    
    // 승인 및 위임 전송(transferFrom)
    pub fn approve(spender: Address, amount: i128) -> Result<(), Error> {}
    pub fn transfer_from(from: Address, to: Address, amount: i128) -> Result<(), Error> {}
    
    // 잔액 조회
    pub fn balance_of(account: Address) -> i128 {}
    
    // 허용량 조회
    pub fn allowance(owner: Address, spender: Address) -> i128 {}
}
```

#### Launchpad Fair-Access 컨트랙트

```rust
pub contract LaunchpadBEAN {
    // 참여자 약정 기록
    pub fn commit(user: Address, commitment_pi: i128, auto_renew: bool) -> Result<CommitmentId, Error> {}
    
    // Fair-Access Hold 계산
    pub fn calculate_fair_access_hold(commitment_pi: i128) -> i128 {
        // 예: Hold = commitment_pi × (0.3 + 0.1 × ln(total_committed))
        // 고래 억제 메커니즘
    }
    
    // 토큰 배분(클레임)
    pub fn claim_tokens(commitment_id: CommitmentId) -> Result<i128, Error> {}
    
    // 약정 취소
    pub fn cancel_commitment(commitment_id: CommitmentId) -> Result<(), Error> {}
}
```

#### 유동성 풀 컨트랙트 (DEX 통합)

```rust
pub contract BEANLiquidityPool {
    // 쌍 생성: BEAN/Pi
    pub fn create_pool(token_a: Address, token_b: Address) -> PoolId {}
    
    // 유동성 공급(LP)
    pub fn add_liquidity(pool_id: PoolId, amount_a: i128, amount_b: i128) -> LPTokens {}
    
    // 유동성 제거
    pub fn remove_liquidity(pool_id: PoolId, lp_tokens: i128) -> (i128, i128) {}
    
    // 스왑
    pub fn swap(pool_id: PoolId, amount_in: i128, path: &[Address]) -> i128 {}
    
    // 수수료 수익 배분
    pub fn claim_lp_rewards(pool_id: PoolId, user: Address) -> i128 {}
}
```

### 7-2. i128 단위 오버플로우 검증

**1B 토큰의 안전성**:
- 1 BEAN = 10,000,000 units (7자리 소수)
- 1B 토큰 = `1,000,000,000 × 10,000,000 = 10^16 units`
- **i128 최대값**: `2^127 - 1 ≈ 1.7 × 10^38`
- **안전 마진**: `10^38 / 10^16 = 10^22배` → **극도로 안전** ✅

### 7-3. 배포 아키텍처

#### Testnet 배포

```
1. Soroban 컨트랙트 코드 작성 (Rust)
   └─ PiRC2 구독 컨트랙트 참고: github.com/PiNetwork/PiRC

2. Testnet RPC에 배포
   ├─ Network: Pi Testnet
   ├─ RPC: https://rpc.testnet.minepi.com
   └─ Passphrase: "Pi Testnet"

3. Testnet에서 공개 테스트
   ├─ Launchpad 메커니즘 검증
   ├─ Fair-Access Hold 알고리즘 테스트
   └─ 유동성 풀 스왑 기능 검증

4. PiRC 커뮤니티 공개 검토
   └─ 기간: 1~2주

5. 보안 감사(외부)
   └─ 감사 보고서 완료
```

#### Mainnet 배포

```
1. Mainnet으로 코드 동기화
   ├─ Network: Pi Mainnet
   └─ Passphrase: "Pi Mainnet" (확정 필요)

2. Mainnet 배포 (Pi 재단 승인)
   ├─ 초기 1B 토큰 민팅
   ├─ 팀/재단 주소로 배분 로직 활성화
   └─ Launchpad 참여 시작

3. DEX 유동성 풀 개설
   ├─ BEAN/Pi 쌍 추가
   └─ 초기 유동성 공급

4. Cafe.pi 기능 통합
   ├─ 카페(Chat) 활동 보상 → BEAN 지급
   ├─ MPS 거래 수수료 일부 → BEAN 배분
   └─ 보이스챗 프리미엄 → BEAN 구독료 수용
```

### 7-4. 기존 스택과의 정합성

| 요소 | 기존 | 신규 토큰 | 호환성 |
|------|------|---------|--------|
| **블록체인** | Pi Mainnet (Stellar-based) | Pi Mainnet | ✅ 동일 |
| **스마트 컨트랙트** | Soroban (PiRC2) | Soroban | ✅ 동일 |
| **인증** | Pi SDK + NextAuth | Pi SDK + NextAuth | ✅ 동일 |
| **데이터 저장** | Supabase RLS 비활성화 | Supabase + 온체인 | ✅ 호환 |
| **결제** | Pi 네이티브 | Pi + BEAN 듀얼 | ✅ 확장 |
| **단위 시스템** | 1 Pi = 10M units | 1 BEAN = 10M units | ✅ 동일 |

---

## 8. 리스크 및 미확인 사항

### 8-1. 규제 리스크 🔴 **높음**

#### 8-1-1. 증권성 판단 불확실
- **리스크**: 토큰이 "유가증권(증권법)"으로 분류될 경우
  - 한국 자본시장법 위반(등록 없이 증권 발행)
  - 형사처벌: 3년 이하 징역 또는 1억 이하 벌금
  - 민사 책임: 투자자 손해배상 청구
- **가능성**: 높음 (10억 발행 + 세일 구조 = 수익 기대권 가능성)
- **대응**:
  - 🔴 **필수**: 한국 금융감독청 또는 변호사 법률 자문 확보
  - 토큰 분류: Utility Token(사용권만) vs Security Token(수익 기대)
  - 세일 구조 설계: "투자 상품" 느낌 회피

##### 📋 법무 자문 의뢰 질의서 (변호사/로펌 송부용 초안)

> 아래는 외부 법무 자문 시 그대로 전달할 질의 항목. 답변 수령 후 §1-5 포지셔닝과 세일 구조를 최종 확정.

1. **증권성 판단**: BEAN 토큰(총 1,000,000,000개, 세일가 0.01 Pi)이 자본시장법상 '증권'(특히 투자계약증권)에 해당하는가? 해당 시 발행·청약 권유에 필요한 절차는?
2. **유틸리티 포지셔닝의 유효성**: §1-5와 같이 "생태계 사용권·보상" 중심으로 설계·홍보할 경우 증권성 배제가 가능한가? 실질 판단에서 어떤 요소가 결정적인가?
3. **런치패드 구조의 영향**: 세일 Pi가 발행사로 직접 귀속되지 않고 유동성 풀에 예치되는 구조가 증권성·자금조달 규제 판단에 유리하게 작용하는가?
4. **특금법(VASP)**: cafe.pi가 BEAN 발행·유통으로 가상자산사업자 신고 의무를 지는가? AML/KYC 요건은? (§8-1-2 연계)
5. **세금**: 토큰 발행·세일·사용자 보상 지급의 부가세·소득세·법인세 취급은?
6. **표시·광고 규제**: 백서·랜딩 페이지에서 금지해야 할 표현, 필수 고지사항(리스크 경고 등)은?
7. **관할**: 발행 주체의 법적 소재지(한국 vs 해외 법인)에 따른 규제 차이와 권고 구조는?
8. **글로벌 사용자**: 203개 locale 글로벌 서비스 특성상 미국(SEC)·EU(MiCA) 등 역외 규제 노출 범위는?

#### 8-1-2. VASP(Virtual Asset Service Provider) 규제
- **리스크**: Cafe.pi가 VASP 규제 대상이 될 경우
  - 자금세탁 방지(AML), 알려진 고객확인(KYC) 의무
  - 신고 미이행 시: 형사처벌 + 영업 정지
- **현황**: 한국 특금법(특정금융거래정보 보고 및 이용 등에 관한 법률) 적용 대상 가능
- **대응**:
  - 법무팀이 FSC/금융정보분석원(FIU)에 조회
  - AML/KYC 정책 수립 필요

### 8-2. 기술 리스크 🟡 **중간**

#### 8-2-1. Mainnet 출시 지연
- **리스크**: Pi Launchpad Mainnet이 예정보다 늦어질 경우
  - 프로젝트 로드맵 차질
  - 커뮤니티 신뢰도 저하
- **현황**: Pi Day 2026(6월 28일) 이후 Mainnet 출시 예상이지만 정확한 날짜 미게재
- **대응**: Pi 재단에 정식 문의, Testnet에서의 충분한 테스트

#### 8-2-2. Soroban 스펙 변경
- **리스크**: 개발 도중 Stellar/Soroban 스펙이 변경되는 경우
  - 컨트랙트 재작성 필요 → 일정 지연
- **대응**: 
  - Stellar 공식 문서 정기 모니터링
  - PiRC 커뮤니티 논의 적극 참여

#### 8-2-3. 보안 감사에서 중대 취약점 발견
- **리스크**: 배포 직전 감사에서 보안 문제 발견
  - 수정 시간 추가 필요(1~2주)
  - 감사 재실시 필요(추가 비용)
- **대응**: 
  - 조기 감사(Phase 2에서) → 문제점 사전 파악
  - 신뢰도 높은 감사 업체 선정(Certora, CertiK 등)

### 8-3. 운영 리스크 🟡 **중간**

#### 8-3-1. 저조한 초기 참여
- **리스크**: Launchpad 런칭 후 참여자 미달
  - 유동성 풀 부실화 → 토큰 가격 급락
  - 초기 참여자 손실 → 명성 손상
- **원인**: 마케팅 부족, 토큰 목적 불분명
- **대응**:
  - Launchpad 런칭 전 충분한 커뮤니티 교육(백서 공개 등)
  - Pi 커뮤니티 유명 인플루언서 조기 참여 확보
  - 초기 유동성 자체 제공(프로토콜 자금으로)

#### 8-3-2. DEX 유동성 악화
- **리스크**: 초기 유동성이 마진 콜·마진 트레이딩으로 악용될 경우
  - 토큰 가격 변동성 극심 → 사용자 손실
- **대응**:
  - 유동성 풀에 안정성 메커니즘(가격 상한·하한) 적용 (선택사항)
  - LP 보상 정책으로 유동성 공급자 유인 지속

### 8-3-3. 기존 인앱 "Pi Bean" 단위와의 정합 (리베이스) — ✅ **결정됨 (2026-06-17): `1 Pi = 100 BEAN` 리베이스 채택**

- **현황**: cafe.pi에는 이미 "Pi Bean"(🫘) 팁 기능이 운영 중이며, **별도 단위가 아니라 Pi로 직접 표시**됨 — `src/components/chat/pi-tip-button.tsx`의 `TIP_AMOUNTS = [0.1, 0.5, 1]`(단위 Pi), 토스트도 `π{amount} Bean` 형식. 즉 **오늘의 1 Bean ≈ 1 Pi 감각**.
- **충돌**: 토큰 세일가를 `1 BEAN = 0.01 Pi`로 발행하면 기존 인앱 Bean(Pi 직접 표시)과 **100배 스케일 차이** 발생.
- **권고 해소안 (3택)**:
  1. **리베이스 `1 Pi = 100 BEAN`** ✅ **채택(2026-06-17)** — 기존 팁 단가가 정수로 깔끔히 매핑(0.1/0.5/1 Pi → 10/50/100 BEAN). 인앱 Bean을 온체인 BEAN의 표시 단위로 통합. 보수 FDV(10M Pi)와 정합.
  2. ~~토큰 세일가를 기존 Bean 감각(≈1 Pi)에 맞춤~~ — FDV 10억 Pi로 폭증 → 과대평가 심사 리스크. **기각**.
  3. ~~오프체인/온체인 별개 개념 분리~~ — 혼란 우려, 유틸리티 서사 약화. **기각**.
- **구현 TODO (토큰 발행 전 정렬 필수)**: `pi-tip-button.tsx`(`TIP_AMOUNTS` 표시)·`tips/route.ts`(결제 메모·기록) 등에 `1 Pi = 100 BEAN` 환산 반영. ⚠️ 운영 중 결제 UI이므로 토큰 발행 일정과 별도 작업으로 분리, 충분한 Pi Browser 실기기 검증 후 배포.

### 8-4. 미확인 사항 ❓

| 항목 | 상태 | 필요 액션 |
|------|------|----------|
| **기존 Pi Bean ↔ BEAN 토큰 리베이스(`1 Pi=100 BEAN`)** | ✅ 결정됨(2026-06-17) | 인앱 표시·결제 로직 정렬 구현 TODO만 잔존 (§8-3-3) |
| **Launchpad 공식 신청 양식** | 미확인 | Pi 재단 또는 Developer Portal 문의 |
| **KYC 완료 조건(기관)** | 미확인 | Pi Network KYC 페이지 재확인 또는 이메일 문의 |
| **Mainnet Launchpad 정식 오픈 날짜** | 추정 (Pi Day 2026 이후) | Pi 공식 블로그 모니터링 |
| **Launchpad 심사 기준 및 소요 기간** | 미확인 | Testnet 신청 후 실제 경험 |
| **Token Reserve Escrow 메커니즘** | 부분 확인 | PiRC2 참고 후 BEAN 적용 검증 |
| **토큰 거래소 상장 지원** | 미확인 | Pi 재단에 Launchpad 프로그램 내 지원 여부 확인 |
| **Cafe.pi가 이미 Pi App Studio 등록 여부** | 미확인 | 오늘 중 개발팀 확인 필요 |

---

## 9. 금일 실행 계획

### 9-1. 오늘(2026-06-17) 우선 액션 항목

#### ✅ 이번 세션 확정 완료 (의사결정 닫힘)

| 항목 | 결정 | 위치 |
|------|------|------|
| **T04 분배 비율** | 세일 40% / 리저브 25% / 유동성 15% / 마케팅 12% / 팀 8% | §6-2 |
| **토큰명** | **BEAN** (기존 Pi Bean 팁 온체인화) | §1-1 |
| **세일 파라미터** | 0.01 Pi/BEAN (`1 Pi=100 BEAN`) · FDV 10M Pi · 소프트캡 2M/하드캡 4M Pi · 약정 1~500 Pi | §6-1·§6-3 |
| **Bean 리베이스** | `1 Pi = 100 BEAN` 채택 (인앱 코드 정렬은 발행 전 TODO) | §8-3-3 |
| **T05 포지셔닝** | 유틸리티 토큰으로 규정 + 법무 자문 질의서 8항 작성 | §1-5·§8-1-1 |
| **레드라인 반영** | USDT 페어 제거(Pi 페어 단독) · BEAN은 Launchpad 전용 발행 | §6-5·§9-4 |
| **발행 주체** | **개인 (아나킨 마스터님)** — 개인 KYC·개인 과세 | §9-4 |
| **PRD 문서** | `docs/PRD_12_TOKEN.md` v1.8 + `_백서.md` + `_법무자문의뢰서.md` (git 커밋 — 파일럿 인큐베이팅) | — |

#### ⏳ 오늘 바로 시작 가능한 오프라인 액션

- [ ] **T01 착수**: Pi Browser에서 **본인(개인) KYC 통과 상태** 확인 (§9-4) — 발행 주체=개인 확정
  - **담당**: 아나킨 마스터님 + 법무 · **최장 병목(1~4주)이므로 1순위 착수**
- [ ] **T02 발송**: `developers@minepi.com` 에 영문 문의 이메일 송부 (초안 §9-4 그대로 사용)
  - **담당**: 운영팀 · **완료 기준**: 신청 양식/프로세스 회신 확보
- [ ] **T10**: Pi App Studio에 Cafe.pi 등록 상태 확인 (Pi Browser "cafe.pi" 검색)
  - **담당**: 개발팀 · **완료 기준**: 공식 앱 등록 여부 확인

#### 🔲 남은 마스터님 의사결정 (오늘 가능)

- [x] **발행 주체 확정**: ✅ **개인(아나킨 마스터님)** 으로 결정(2026-06-17) → T01은 **개인 KYC**, 세금은 개인 과세, 법무 자문 범위도 개인 발행 기준. ⚠️ 개인 발행은 규제·증권성 책임이 **개인 명의로 집중**(법인 유한책임 부재) → §8-1-1 자문에서 법인 전환 필요성 재확인 권고.
- [ ] **법무 자문 의뢰 실행**: §8-1-1 질의서를 외부 변호사/로펌에 송부할지·시점 결정 (T05 차단 해제의 유일 경로)
- [ ] **(선택) Bean 리베이스 코드 정렬** 작업을 별도 PR로 언제 진행할지 — 토큰 발행 전 완료 권장

### 9-2. 1주일 내 액션

- [ ] **T08**: 보안 감사 업체 선정 및 RFQ(Request for Quote) 발송
  - **후보**: Certora, CertiK, Trail of Bits, OpenZeppelin
  - **예상 비용**: $5,000 ~ $15,000
  - **소요 시간**: 견적 수집(3일), 의사결정(2일)

- [ ] **T01**: 개인 KYC 통과 상태 확인·완료 (→ 상세 §9-4)
  - **필요 서류**: 정부발행 신분증, 본인 명의 Pi 계정(KYC 통과) — ⚠️ 정확 목록 T02 회신으로 확인
  - **담당**: 아나킨 마스터님 + 법무

- [ ] **T09**: 백서 작성 (한영 이중언어)
  - **섹션**: 기술 아키텍처 / 토크노믹스 / 사용 사례 / 로드맵
  - **소요 시간**: 1주일(병렬 진행 가능)

### 9-3. 1개월 내 마일스톤

- [ ] **T06**: Soroban 토큰 컨트랙트 Testnet 배포
  - **기한**: 7월 15일
  - **체크포인트**: 민팅 → 전송 → 유동성 풀 연동 테스트

- [ ] **T07**: Fair-Access Hold 알고리즘 검증
  - **기한**: 7월 15일
  - **테스트**: 확정 약정 한도(최소 1 Pi ~ 최대 500 Pi) 범위 공정성 검증

- [ ] **T03 → T02**: Launchpad 공식 신청 제출
  - **기한**: 7월 25일 (Testnet 배포 완료 후)

### 9-4. T01~T03 오프라인 액션 가이드 (외부 확인 필요)

> 이 세 과제는 문서상 결정으로 닫을 수 없고 **Pi 재단·KYC 기관 등 외부 확인**이 선행되어야 함. 아래는 즉시 실행 가능한 구체 가이드.

#### 🚦 선행 게이트 — Pi 등재 레드라인 4종 (Launchpad·Mainnet 심사 공통)

Pi 메인넷/런치패드 심사는 아래 위반 시 **즉시 거절**. T01~T03 착수 전 자가 점검 필수:

| # | 레드라인 | cafe.pi 현황 | BEAN 토큰 영향 |
|---|---------|------------|---------------|
| 1 | 도박/베팅/복권 금지 | ✅ 대응 완료(Pi Bet 제거·M5 재정의) | BEAN을 베팅·복권 보상에 쓰는 설계 **금지** |
| 2 | **Pi 외 암호화폐·법정화폐 거래 + Pi 가치평가 언급 금지** | ✅ 시세칩 env 비활성 | ⚠️ **BEAN=Pi 외 자산** → 반드시 **공식 Launchpad 통해서만 발행**. 유동성 Pi 페어 단독(§6-5) |
| 3 | Pi Auth 외 로그인 금지 | ✅ Google은 Pi Browser서 숨김 | 토큰 청약도 Pi Auth 단독 |
| 4 | 도메인 'pi' 시작·Pi 브랜딩 오용 금지, 데이터 최소수집 | ✅ | 토큰명 'BEAN'은 Pi 브랜딩 비저촉 |

> **결론**: BEAN을 cafe.pi가 **자체 발행하면 레드라인 #2 직격**. 공식 Pi Launchpad 경유가 유일한 안전 경로. 그 전까지 토큰 코드는 앱에 미포함(현 PRD는 문서 전용 유지).

---

#### T01 — 기관 KYC 완료 (Pi Network)

- **목적**: Launchpad 발행 주체 신원 검증. 심사 진입의 전제 조건.
- **발행 주체**: ✅ **개인 — 아나킨 마스터님** 확정(2026-06-17). 법인 KYC 불필요, **개인 KYC** 경로로 진행.
- **준비물 체크리스트** (⚠️ 정확 목록은 Pi KYC 안내로 재확인):
  - [ ] 정부발행 신분증
  - [ ] 본인 명의 Pi 계정 — **KYC 통과 상태** (미통과 시 이것부터 완료)
  - [ ] 거주 증빙(요구 시)
- **실행 경로**:
  1. Pi Browser → **Pi 앱(KYC)** 에서 개인 KYC 통과 상태 우선 확인
  2. Launchpad 발행에 개인 KYC 외 별도 절차가 있는지 T02 이메일에 **함께 질의**
- **현재 상태 (2026-06-17)**: 개인 KYC **완료 → 현재 '임시승인(provisional)' 단계**.
- **⚠️ 확인 필요**: Launchpad 발행이 **최종 승인**을 요구하는지, **임시승인으로 충분**한지 → T02 Pi 재단 문의에 포함.
- **완료 기준**: 임시승인이 Launchpad 자격을 충족하는지 확인(또는 최종 승인 전환 완료)
- **병목 평가**: 처음부터가 아니라 **임시→최종 전환 대기** 수준 → 당초 1~4주 병목 **완화**.
- **⚠️ 책임 경고**: 개인 발행은 증권성·특금법상 책임이 **개인에게 직접 귀속**(법인의 유한책임 보호 없음). §8-1-1 법무 자문에서 **법인 설립 후 발행이 더 안전한지** 반드시 재확인.

#### T02 — Launchpad 공식 신청 양식·절차 확인

- **공식 프로세스 현황 (2026-06-17 웹 확인)**: Launchpad 공식 창구는 **Pi Browser 내 'Pi Launchpad' 앱**(이메일 아님). 단 **현재 Testnet 단계** — SLICE 테스트 토큰이 **Pi2Day(2026-06-28)까지** 참여 오픈, **Mainnet 버전 미출시**. **발행사(issuer)용 Mainnet 신청 양식은 아직 공개 미게재.** → 아래 이메일은 '공식 신청'이 아니라 **공식 창구·자격(임시 KYC 인정 여부 포함)을 확인하는 문의**. 실제 발행 신청은 **Mainnet Launchpad GA(6/28 이후 예상) 후 in-app/Portal**로 진행 전망.
- **차단 요인**: 발행사용 공식 신청 절차 미게재 → **Pi 재단 직접 문의 + Mainnet GA 대기**.
- **실행 경로**:
  1. Pi Developer Portal / Pi 개발자 포럼에서 "Launchpad application" 검색
  2. 아래 이메일을 **developers@minepi.com** 으로 송부
- **📧 이메일 초안 (영문 송부용)**:
  ```
  Subject: Pi Launchpad — Token Issuance Application Process Inquiry

  Hello Pi Core Team,

  We operate "cafe.pi", a live Pi Mainnet community & O2O marketplace
  (chat, marketplace, voice chat, events). We plan to issue an ecosystem
  utility token ("BEAN", total supply 1,000,000,000) via the Pi Launchpad.

  Could you please advise on:
  1. The official Launchpad application form and submission process
  2. Eligibility / review criteria and expected review timeline
  3. KYC requirements for the issuing entity (individual vs. organization)
  4. Mainnet Launchpad availability timeline
  5. Any restrictions on tokenomics, sale structure, or liquidity pairs
  6. Is an OFF-CHAIN, pre-issuance "usage credit" system allowed under
     Launchpad/Mainnet policy? Specifically: users earn/charge an in-app,
     NON-cashable balance (no fiat/Pi withdrawal) that is custodied by the
     platform and redeemed 1:1 for the BEAN token AFTER official issuance.
     We treat this internally as an accounting "IOU" but present it to users
     only as an accrued platform usage-right (no pre-sale, no investment
     framing). Does this conflict with the "Product-First / not capital
     raising" principle or any unauthorized-pre-sale rules?

  Thank you.
  — cafe.pi team
  ```
- **완료 기준**: 신청 양식/프로세스 문서 입수 또는 재단 회신 확보
- **담당**: 운영팀 · **기한**: 이번 주

#### T03 — Pi Mainnet / Launchpad 출시 상태 확인

- **확인 항목**:
  - [ ] Launchpad **Mainnet** 정식 오픈 시점 (Pi Day 2026/6/28 이후 *추정* — 미확인)
  - [ ] Mainnet 발행 시 KYC 완료 **의무 범위** (T01과 연계)
  - [ ] 기존 PiRC2 구독 컨트랙트의 Mainnet 배포 환경 = BEAN 컨트랙트 재사용 가능 여부
- **실행 경로**:
  1. Pi 공식 블로그(minepi.com/blog) 정기 모니터링 — Launchpad GA 공지 추적
  2. T02 이메일 회신에서 4번 항목으로 확보
  3. 사내: PiRC2 Mainnet 배포 설정(RPC·네트워크 패스프레이즈) 재확인
- **완료 기준**: Mainnet Launchpad 오픈 일정 + 발행 요건 정리 보고
- **담당**: 개발팀 · **기한**: 이번 주 (T02 회신 의존)

#### 의존 관계 및 권장 순서

```
T01(KYC, 1~4주 병목) ─┐
                      ├─→ Launchpad 신청 제출 → 심사 → Mainnet 발행
T02(신청양식) ─→ T03(Mainnet 일정) ─┘
```

→ **T01을 즉시 착수**(기간 최장), T02·T03는 단일 이메일 1통으로 병렬 진행 가능.

---

## 11. 토큰 경제학 DB 구조 (신규 섹션)

> **본 섹션은 Bean Token 토큰 경제학을 DB 스키마·테이블·불변식으로 정의합니다.**
> **요금 표준**: 모든 과금(SPEND)·보상(REWARD) **금액의 정본 출처 = `bean_fee_plan`**([[PRD_15_FEE.md]]). `bean_ledger` 금액은 이 표를 조회해 결정하며 하드코딩하지 않는다.
> **모든 DDL은 문서 내 코드블록(초안·승인대기)으로만 제시되며, 실제 `sql/*.sql` 파일 생성 및 DB 적용은 토큰 발행 전 금지입니다.**
> **본 설계는 "발행됨 전제" 기준이며, 온체인(Soroban) 실제 발행은 §7 기술 아키텍처 참조.**
>
> **⭐ 표기 규약 (확정 2026-06-18)**:
> - **"IOU"(I Owe You)는 내부 기술·회계 용어로만** 사용한다(원장 = 갚아야 할 잔액. 식별자 `bean_*` 유지).
> - **사용자·마케팅·Launchpad 노출 표기는 "Bean 선적립증 / 사용권 기록 / Bean 계정 잔액"** 으로 하고, **"환금(Pi 환전) 불가 · 플랫폼 사용 전용"** 을 반드시 명시한다.
> - **"구매·투자·presale·약속" 표현 금지** (증권성·Pi Launchpad Product-First 위반 리스크 회피, §11-9 참조).
> - **발행 후**에는 **"Bean Token"**.

### 11-1. 경제모델 개요

#### A. 공급·분배 (생성)

Bean Token 총공급 10억 개는 5개 카테고리로 분배됩니다(§6-2 확정):

| 카테고리 | 수량 | 특징 |
|---------|------|------|
| 세일(Launchpad) | 400M | 즉시~짧은 cliff, 사용자 분산 |
| 생태계 리저브 | 250M | 3~4년 분할 방출, 사용자 보상 연료 |
| 유동성 풀 | 150M | LP 영구 락, 가격 안정 |
| 마케팅/파트너 | 120M | 12개월 락, 거래소·파트너 실탄 |
| 팀/재단 | 80M | 6M cliff + 36M 선형 베스팅 |

→ **DB 정본**: `bean_token_alloc` (분배 현황), `bean_vesting` (베스팅 스케줄)

#### B. 수요·사용 (소비)

Bean Token의 주요 소비 경로:

| 사용처 | 통화 유형 | 플로우 |
|--------|---------|-------|
| **플랫폼 구독료** (PiCafé™/PiShop™) | Bean 정본 | 사용자 → 플랫폼 (Pi 충전 → Bean 결제) |
| **플랫폼 수수료** (마켓 거래) | Bean 정본 | 거래자 → 플랫폼 (Pi 기반) |
| **보상 지급** (O2O, 이벤트) | Bean | 플랫폼 → 사용자 (리저브 소진) |
| **소각(Burn)** | Bean | 플랫폼 → 싱크 (공급 감소) |
| **팁/후원** (사용자↔사용자) | Bean | 사용자 → 사용자 (유통) |

→ **DB 정본**: `bean_ledger` (모든 이동 기록, append-only)

#### C. 수공급 균형 (토큰 건강도)

```
총공급 = 발행(Fixed 10억)
→ 유통 = 세일 + 리저브 방출 + 보상 지급
→ Faucet(공급 확대): 보상, 에어드롭
→ Sink(공급 축소): 구독료, 수수료, 소각, 역환전(향후)

목표: Sink > Faucet → 토큰 희소성 증대, 가격 안정
```

### 11-2. 핵심 테이블 목록 (ERD 요약)

```
주제영역별 테이블 구성 (실제 7종 — 충전·소비·보상·전송·소각·환불은
모두 별도 테이블이 아니라 bean_ledger의 거래타입 txn_tp_cd 값으로 통합):

┌─ 공급·분배
│  ├─ bean_token_alloc (분배 현황 - 5종, append-only)
│  └─ bean_vesting (베스팅/락업 스케줄 - 팀 8%/리저브 25%)
│
├─ 원장·잔액 (회계 핵심)
│  ├─ bean_ledger (원장 정본 - append-only, 유일 source of truth)
│  │   └─ txn_tp_cd: CHARGE/SPEND/REWARD/TRANSFER/BURN/REFUND
│  └─ bean_wallet (현재 잔액 캐시 = SUM(bean_ledger), 음수 금지)
│
├─ 보상
│  └─ bean_reward_policy (O2O 등 보상 정책 마스터 → 지급은 bean_ledger REWARD)
│
├─ 구독 연동
│  └─ msg_subscr_plan (확장: price_bean 추가 → 결제는 bean_ledger SPEND)
│
└─ bean_redeem_request (역환전 - 향후 확장용, 초기 비활성)
```

### 11-3. 테이블별 DDL 초안

> ⚠️ **이 섹션의 모든 DDL은 제안 형태(초안·승인대기)이며, 실제 마이그레이션 적용은 금지합니다.**
> **적용 전 DA 표준 검증(`da-ddl-guard` Hook)이 필요합니다.**

#### 11-3-1. bean_token_alloc — 분배 현황 추적

```sql
-- 뜻: Bean Token 할당 현황
-- 목적: 10억 토큰의 5종 분배를 추적하고, 각 카테고리 소진 상황 기록
-- 정본 원칙: INSERT만 허용, UPDATE/DELETE 금지(append-only) ← 원장 개념 아님, 통제 기록일 뿐

CREATE TABLE bean_token_alloc (
  alloc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 분배 카테고리
  alloc_tp_cd VARCHAR(20) NOT NULL CHECK (alloc_tp_cd IN ('SALE', 'RESERVE', 'LIQUIDITY', 'MARKETING', 'TEAM')),
  
  -- 할당량 (1 BEAN = 10M units, i128 호환)
  alloc_qty_bean DECIMAL(18, 0) NOT NULL,  -- 예: 400000000 (세일용 400M)
  
  -- 베스팅 유무 (TEAM·RESERVE만 Y)
  vest_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (vest_yn IN ('Y', 'N')),
  vest_schedule_cd VARCHAR(20),  -- 'TEAM_36M' / 'RESERVE_48M' 등 (null이면 즉시)
  
  -- 상태
  stat_cd VARCHAR(20) NOT NULL DEFAULT 'ALLOCATED' CHECK (stat_cd IN ('ALLOCATED', 'RELEASED', 'DISTRIBUTED')),
  
  -- 설명
  desc_txt TEXT,
  
  -- 시스템 컬럼 (DA 표준 필수)
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bean_token_alloc_tp_cd ON bean_token_alloc(alloc_tp_cd);
-- DA-APPROVED: 초기 공급 분배 기록(append-only 감시 필요). 삽입 전용 감시 트리거 추가 권고.
```

#### 11-3-2. bean_vesting — 베스팅 스케줄

```sql
-- 뜻: Bean Token 베스팅/락업 일정
-- 목적: 팀(8%) / 리저브(25%) 등 장기 로칭 스케줄을 정의
-- 정본: INSERT + 읽기만. 수정/삭제 금지 (계약 문서).

CREATE TABLE bean_vesting (
  vest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 할당 카테고리
  alloc_tp_cd VARCHAR(20) NOT NULL REFERENCES bean_token_alloc(alloc_tp_cd),  -- 'TEAM' / 'RESERVE'
  
  -- 베스팅 구간
  cliff_mth INT NOT NULL,  -- 0 = 즉시 / 6 = 6개월 cliff
  linear_mth INT NOT NULL,  -- 36 = 36개월 선형
  
  -- 트렁차(Tranche) 정보
  tranch_num INT NOT NULL,  -- 1st, 2nd, 3rd, 4th ...
  tranch_pct NUMERIC(5, 2) NOT NULL CHECK (tranch_pct >= 0 AND tranch_pct <= 100),  -- 예: 25.00 (%)
  tranch_qty_bean DECIMAL(18, 0) NOT NULL,  -- 수량
  
  -- 일정
  release_dt DATE NOT NULL,  -- 언락 예정일
  released_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (released_yn IN ('Y', 'N')),
  released_dtm TIMESTAMPTZ,  -- 실제 언락 시점
  
  -- 수령자 (nullable: 팀 공동 풀일 경우)
  recipient_usr_id TEXT,
  
  -- 시스템 컬럼
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bean_vesting_alloc_tp ON bean_vesting(alloc_tp_cd);
CREATE INDEX idx_bean_vesting_release_dt ON bean_vesting(release_dt);
-- DA-APPROVED: 베스팅 계약 기록(수정 금지). 언락 실행은 released_yn·released_dtm 업데이트로만 처리.
```

#### 11-3-3. bean_wallet — 사용자 지갑 (잔액 캐시)

```sql
-- 뜻: 사용자별 Bean Token 잔액
-- 목적: 현재 보유량 조회 최적화(원장 합계 대신 캐시)
-- 정본: 계산 결과이며, 불변식 balance = SUM(bean_ledger)를 충족해야 함

CREATE TABLE bean_wallet (
  wallet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id TEXT NOT NULL UNIQUE REFERENCES sys_user(id),  -- PK: 사용자 1:1
  
  -- 잔액 (음수 금지)
  balance_bean DECIMAL(18, 0) NOT NULL DEFAULT 0 CHECK (balance_bean >= 0),
  
  -- 온체인 주소 (Stellar/Soroban 필수, 향후 추가)
  blockchain_addr TEXT,
  blockchain_tp_cd VARCHAR(20),  -- 'SOROBAN' (예약)
  
  -- 상태
  stat_cd VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (stat_cd IN ('ACTIVE', 'FROZEN', 'CLOSED')),
  
  -- 마지막 거래 시점
  last_txn_dtm TIMESTAMPTZ,
  
  -- 시스템 컬럼
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bean_wallet_usr_id ON bean_wallet(usr_id);
-- DA-APPROVED: 잔액 캐시 (읽기 전용, bean_ledger 기반 검증 필수). 
-- 정합성 점검: SELECT SUM(CASE WHEN ... END) FROM bean_ledger WHERE usr_id = X (월 1회 감시).
```

#### 11-3-4. bean_ledger — 원장 (정본, append-only)

```sql
-- 뜻: Bean Token 거래 원장
-- 목적: 모든 Bean 이동 추적 — 감시, 감사, 원장 검증
-- 정본 원칙: **INSERT ONLY** (수정·삭제·논리삭제 금지). 정정은 역분개(reversing entry) 수행.
-- 참고: 회계 원칙에 따라 append-only 유지.

CREATE TABLE bean_ledger (
  ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 트랜잭션 식별 (멱등성)
  txn_id TEXT NOT NULL UNIQUE,  -- 'CHARGE_20260618_001' / 'SPEND_SUB_PREMIUM_20260618_USR123' 등
  ref_id TEXT,  -- 외부 참조 ID (msg_subscr_id / pi_pymnt_id / bean_reward_id 등)
  
  -- 거래 타입 (5가지)
  txn_tp_cd VARCHAR(20) NOT NULL CHECK (txn_tp_cd IN ('CHARGE', 'SPEND', 'REWARD', 'TRANSFER', 'BURN', 'REFUND')),
  
  -- CHARGE: Pi→Bean 충전
  -- SPEND: 구독료/수수료 차감
  -- REWARD: 보상 지급 (O2O, 이벤트)
  -- TRANSFER: 사용자↔사용자 전송 (팁/후원)
  -- BURN: 소각
  -- REFUND: 환불(역분개)
  
  -- 금액 (부호: +/- 구분)
  amt_bean DECIMAL(18, 0) NOT NULL,  -- 음수 가능 (SPEND·BURN은 음수)
  
  -- 당사자
  from_usr_id TEXT,  -- null = 시스템(CHARGE 발행, REWARD 지급)
  to_usr_id TEXT,    -- null = 시스템(SPEND 수수료, BURN 소각)
  
  -- 비즈니스 컨텍스트
  context_tp_cd VARCHAR(30),  -- 'SUBSCRIPTION_PREMIUM', 'O2O_REVIEW_REWARD', 'TIP_TRANSFER' 등
  context_id TEXT,  -- 해당 엔티티 ID (plan_cd / order_id / user_id 등)
  
  -- 설명
  memo_txt TEXT,
  
  -- 상태 (처리 완료 확인)
  stat_cd VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (stat_cd IN ('PENDING', 'COMPLETED', 'REVERSED')),
  
  -- 시스템 컬럼 (del_yn 없음 — 원장은 물리삭제 불가)
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  
  -- ⚠️ del_yn, del_dtm 미추가 (원장 불변성 원칙)
);

-- 인덱스 (조회 최적화)
CREATE INDEX idx_bean_ledger_txn_id ON bean_ledger(txn_id);
CREATE INDEX idx_bean_ledger_from_usr_id ON bean_ledger(from_usr_id);
CREATE INDEX idx_bean_ledger_to_usr_id ON bean_ledger(to_usr_id);
CREATE INDEX idx_bean_ledger_txn_tp_cd ON bean_ledger(txn_tp_cd);
CREATE INDEX idx_bean_ledger_reg_dtm ON bean_ledger(reg_dtm);

-- 제약: UPDATE/DELETE 차단 트리거 (선택적, 애플리케이션 레벨 강제도 가능)
-- CREATE TRIGGER trg_bean_ledger_no_update BEFORE UPDATE ON bean_ledger FOR EACH ROW RAISE EXCEPTION 'bean_ledger: UPDATE not allowed';
-- CREATE TRIGGER trg_bean_ledger_no_delete BEFORE DELETE ON bean_ledger FOR EACH ROW RAISE EXCEPTION 'bean_ledger: DELETE not allowed';

-- DA-APPROVED: 원장 정본(INSERT ONLY, 수정·삭제·논리삭제 금지).
-- 정정: 역분개(REFUND/REVERSED stat_cd)로 처리. 멱등키(txn_id) 기반 중복 차단.
```

#### 11-3-5. bean_reward_policy — 보상 정책 마스터

```sql
-- 뜻: Bean Token 보상 정책
-- 목적: O2O, 이벤트, 리뷰 등 보상 규칙을 일원화

CREATE TABLE bean_reward_policy (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 정책 이름
  policy_nm VARCHAR(100) NOT NULL,
  
  -- 적용 대상
  reward_tp_cd VARCHAR(30) NOT NULL,  -- 'O2O_PURCHASE', 'O2O_SALES', 'EVENT_MISSION', 'REVIEW_POSTING' 등
  
  -- 보상 규칙
  qty_bean DECIMAL(18, 0),  -- 고정 보상액 (예: 50 BEAN)
  pct_of_txn NUMERIC(5, 2),  -- 거래액 기반 % (예: 1.5%)
  max_qty_bean DECIMAL(18, 0),  -- 최대 보상액 (예: 1000 BEAN)
  
  -- 조건
  min_threshold_bean DECIMAL(18, 0),  -- 최소 거래액 (예: 100 BEAN)
  
  -- 활성화
  use_yn CHAR(1) NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y', 'N')),
  
  -- 시스템 컬럼
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ
);

CREATE INDEX idx_bean_reward_policy_reward_tp ON bean_reward_policy(reward_tp_cd);
-- DA-APPROVED: 마스터 데이터(수정·논리삭제 허용). 정책 변경 시 버전 관리 고려(향후).
```

#### 11-3-6. bean_redeem_request — 역환전 신청 (향후 확장용)

```sql
-- 뜻: Bean Token → Pi 역환전 신청
-- 목적: 향후 환금성 지원 시 신청 관리
-- 상태: **초기 비활성** (기본값 use_yn='N'). 정책 수립 후 활성화.

CREATE TABLE bean_redeem_request (
  redeem_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  usr_id TEXT NOT NULL REFERENCES sys_user(id),
  
  -- 신청 정보
  req_qty_bean DECIMAL(18, 0) NOT NULL CHECK (req_qty_bean > 0),
  
  -- 환율 (고정 1 Pi = 100 BEAN)
  conversion_ratio INT NOT NULL DEFAULT 100,
  estimated_pi_amt DECIMAL(18, 4),  -- 계산값: req_qty_bean / 100
  
  -- 상태
  stat_cd VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (stat_cd IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED')),
  
  -- 거부 사유 (stat_cd='REJECTED'일 때)
  rejection_reason TEXT,
  
  -- 완료 정보
  completed_pi_amt DECIMAL(18, 4),  -- 실제 지급액 (수수료 차감 후)
  processing_fee_pct NUMERIC(5, 2),  -- 수수료율 (미정)
  completed_dtm TIMESTAMPTZ,
  
  -- 시스템 컬럼
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ
);

CREATE INDEX idx_bean_redeem_request_usr_id ON bean_redeem_request(usr_id);
CREATE INDEX idx_bean_redeem_request_stat_cd ON bean_redeem_request(stat_cd);

-- ⚠️ 정책 미정: 초기 비허용(애플리케이션 레벨 차단). 허용 결정 시 위의 수수료·수령 계좌 필드 추가.
-- DA-APPROVED: 향후 확장용 테이블(현재 미사용). 활성화 전 법무·운영 검토 필수.
```

#### 11-3-7. msg_subscr_plan 확장 — Bean Token 기본값 추가

```sql
-- 기존 테이블 확장: msg_subscr_plan (PRD_14와 정합)
-- Phase 17(발행 후) 이전: price_pi 사용
-- Phase 17(발행 후) 이후: price_bean 사용 (feature flag 기반)

-- Step 1: price_bean 컬럼 추가 (nullable, 향후 채움)
ALTER TABLE msg_subscr_plan
ADD COLUMN price_bean DECIMAL(10, 4) DEFAULT NULL COMMENT '정본 가격 (Bean Token) — Phase 17 발행 후 사용';

-- Step 2: 현행 데이터 (price_pi 기준)
INSERT INTO msg_subscr_plan (plan_cd, plan_nm, plan_desc, plan_tp_cd, price_pi, mth_cnt, use_yn, del_yn, regr_id, reg_dtm)
VALUES
  ('PISHOP_SELLER_MONTHLY', 'PiShop™ Seller 월간', 'PiShop™ Seller 월간 — 전문가 판매자용', 'PISHOP', '0.5000', 1, 'Y', 'N', 'ADMIN', CURRENT_TIMESTAMP),
  ('PISHOP_SELLER_ANNUAL', 'PiShop™ Seller 연간', 'PiShop™ Seller 연간 — 2개월 무료', 'PISHOP', '5.0000', 12, 'Y', 'N', 'ADMIN', CURRENT_TIMESTAMP);

-- Step 3: Phase 17 이후 bean 가격 일괄 업데이트 (1 Pi = 100 BEAN)
-- UPDATE msg_subscr_plan SET price_bean = price_pi * 100 WHERE price_bean IS NULL;

-- DA-APPROVED: 기존 테이블 확장(backward-compatible). price_bean 채움 타이밍은 Phase 17 동기화 필요.
```

### 11-4. 불변식·멱등·정합성 규칙

#### A. 핵심 불변식 (5대)

| # | 불변식 | 검증 방법 | 위반 시 액션 |
|---|--------|---------|-----------|
| **I1** | **잔액 = 원장 합계** | `bean_wallet.balance = SUM(bean_ledger WHERE to_usr_id)` | 월 1회 감시, 차액 조사 후 정정(역분개) |
| **I2** | **음수 잔액 금지** | `bean_wallet.balance >= 0` (CHECK 제약) | 거래 거절(SPEND/TRANSFER 실패) |
| **I3** | **멱등키 유니크** | `bean_ledger.txn_id UNIQUE` | 이중 청구 방지(INSERT 실패) |
| **I4** | **총공급 보존** | `SUM(bean_ledger.amt_bean) = 1,000,000,000` (선택적 감시) | 발행 후 소각/보상만으로 변경, 트래킹 필수 |
| **I5** | **유통 역량 보증** (커스터디 모델) | `treasury보유 >= SUM(bean_ledger 누적 발급액)` | 발급 게이트 차단(용량 초과 시 보상 일시중단) |

#### B. 멱등성 설계

**멱등키 규약** (`bean_ledger.txn_id`):

```
CHARGE:   'CHARGE_{date}_{sequence}' 
          예: 'CHARGE_20260618_USR001_001'

SPEND:    'SPEND_{type}_{date}_{context_id}'
          예: 'SPEND_SUBSCR_20260618_PLAN_PREMIUM_MONTHLY_USR001'

REWARD:   'REWARD_{policy}_{date}_{target_id}'
          예: 'REWARD_O2O_PURCHASE_20260618_ORDER_ORD12345'

TRANSFER: 'TRANSFER_{date}_{from}_{to}_{seq}'
          예: 'TRANSFER_20260618_USR001_USR002_001'

BURN:     'BURN_{reason}_{date}_{seq}'
          예: 'BURN_SYSTEM_ADJUSTMENT_20260618_001'

REFUND:   'REFUND_{original_txn_id}_{date}'
          예: 'REFUND_CHARGE_20260615_USR001_001_20260618'
```

→ **INSERT 전 UNIQUE 제약 위반 검사 → 이미 존재하면 스킵(멱등)**

#### C. 부호 규약 (Double-Entry 대체)

Bean Token 원장은 **단일 원장 + 부호 규약** 사용:

| 거래타입 | 금액 부호 | 적용 |
|---------|---------|------|
| CHARGE | `+` | 사용자 잔액 증가 |
| SPEND | `-` | 사용자 잔액 감소 |
| REWARD | `+` | 사용자 잔액 증가 |
| TRANSFER | `±` | from=`-`, to=`+` (2행 기록) |
| BURN | `-` | 공급 감소 |
| REFUND | `반대` | 원거래 취소 (역분개) |

**정합성 검증**:
```sql
SELECT 
  usr_id,
  SUM(amt_bean) as net_amt,
  (SELECT balance_bean FROM bean_wallet WHERE usr_id = L.usr_id) as current_balance
FROM bean_ledger L
WHERE stat_cd = 'COMPLETED'
GROUP BY usr_id
HAVING SUM(amt_bean) <> (SELECT balance_bean FROM bean_wallet WHERE usr_id = L.usr_id);
-- 결과 0행 = 정합성 OK
```

### 11-5. 3대 거래 통화 라우팅 매핑 (PRD_14 §0 정합)

Bean Token DB 설계는 **PRD_14의 3대 규칙**을 완전히 준수합니다:

| 규칙 | 거래타입 | 결제 통화 | 보상 | DB 테이블 | 원장 기록 |
|-----|---------|---------|------|---------|---------|
| **규칙 1** | 플랫폼↔사용자 (구독료) | Bean 정본 | — | `msg_subscr_plan` (price_bean) | SPEND (ledger) |
| **규칙 1** | 플랫폼↔사용자 (수수료) | Bean 정본 | — | `bean_ledger` | SPEND (ledger) |
| **규칙 2** | P2P 중고 (직거래) | Pi | 없음 | `mps_order` (Bean 원장 미적용) | ledger 미적용 |
| **규칙 3** | O2O 매장 (결제) | Pi | Bean 보상 | `mps_order` + `bean_reward_policy` | REWARD (ledger) |

**초기 구현**:
- 과도기 (현재~Phase 17 전): Pi로 결제, Bean 수량만 병기
- 정본 (Phase 17 후): Bean Token 직결제, 원장 정식 기록

### 11-6. 기존 인앱 Bean 통합·마이그레이션

#### A. 기존 인앱 Bean (오프체인)

현재 café.pi에는 "Pi Bean"(🫘) 팁 기능이 운영 중:
- **단위**: Pi 직접 표시 (`TIP_AMOUNTS = [0.1, 0.5, 1]` Pi)
- **파일**: `src/components/chat/pi-tip-button.tsx` 등 12개
- **테이블**: `msg_tip` (또는 미기록, 메모만)

#### B. 리베이스 결정 (2026-06-17 확정)

토큰 세일가 `1 BEAN = 0.01 Pi` (즉, `1 Pi = 100 BEAN`) 채택으로:

```
기존 오프체인 Bean       → 온체인 BEAN 토큰
0.1 Pi (= 10 Bean)     → 10 BEAN
0.5 Pi (= 50 Bean)     → 50 BEAN
1 Pi (= 100 Bean)      → 100 BEAN
```

→ **정수 매핑, 혼란 최소화**

#### C. 마이그레이션 로드맵 (Phase 17 이후)

| 단계 | 시점 | 작업 | 담당 |
|------|------|------|------|
| 1 | Phase 17 발행 | 온체인 BEAN 토큰 생성 | 개발팀 |
| 2 | 발행 후 1주 | 기존 인앱 Bean 오프체인 원장 → 온체인 wallet 마이그레이션 | 개발팀 |
| 3 | 마이그레이션 완료 | `pi-tip-button.tsx` 업데이트 — "Pi"→"Bean Token" 표기 변경, 1:100 환산 적용 | 개발팀 + QA |
| 4 | Pi Browser 검증 | 실기기에서 로그인·팁 전송 검증 | QA |

#### D. 주의사항

- ⚠️ **마이그레이션 전 충분한 테스트** (Pi Browser 오프라인 시나리오)
- ⚠️ **기존 Bean 팁 거래 이력 보존** (감사 추적)
- ⚠️ **사용자 공지** (1 Pi → 100 Bean 환산 안내)

### 11-7. 레드라인 적합성 체크

#### A. 레드라인 #2 준수 — Pi 외 자산 거래 금지

**원칙**: Bean Token은 **Pi가 아닌 자산** → 공식 Launchpad 경유 발행만 안전

| 위반 패턴 | BEAN 설계 현황 | 준수 여부 |
|---------|-------------|---------|
| BEAN/USDT 유동성 풀 | §6-5에서 제거 (Pi 페어 단독) | ✅ 준수 |
| BEAN을 법정화폐로 가격책정 | §11-6: 원화 내부 기준용만, 사용자 미노출 | ✅ 준수 |
| BEAN 자체발행 (Launchpad 외) | PRD_12는 문서 전용, DB 미적용 | ✅ 준수 |
| BEAN 역환전(캐시아웃) | 초기 비허용, bean_redeem_request 정책 미정 | ✅ 준수(보수적) |

#### B. 증권성 회피 — "유틸리티 토큰" 입증

DB 설계로 증명:

| 방증 | 디자인 요소 |
|-----|-----------|
| **사용권** | `bean_spend` 표 (구독료, 수수료) — 플랫폼 기능 이용에만 쓰임 |
| **보상** | `bean_reward_policy` + `bean_ledger REWARD` — 노동(O2O, 리뷰)·이벤트 보상 |
| **후원** | `bean_ledger TRANSFER` — 사용자↔사용자 팁(수익권 아님) |
| **비증권성** | 원장 설계로 "순수 사용 대금" 명확히 입증 |

#### C. 음수 잔액 금지 (사기 방지)

```sql
CHECK (balance_bean >= 0)  -- bean_wallet 컬럼 제약
```

→ SPEND/TRANSFER 발생 시 **사전 잔액 검증** (애플리케이션)

### 11-8a. 커스터디 스왑 설계 (IOU→Bean Token 교체) — ✅ 확정 (2026-06-18)

> **본 섹션은 Bean Token 발행 후 기존 IOU(앱 내 사용권 선구매 영수증)를 실토큰으로 1:1 교체하는 메커니즘을 정의합니다.**
> **핵심 원칙: "커스터디(플랫폼 보관) 모델 강제" — 사용자는 온체인 지갑을 소유하지 않으며, Bean Token은 트레저리 지갑에 의탁되어 사용자 잔액은 DB로만 관리됩니다.**

#### A. 커스터디 모델 의무화 (요건 1)

**원칙**: Bean Token 발행 후 모든 사용자 보유분은 **플랫폼 트레저리 지갑에 의탁(custody)**됨.

```
발행: 10억 BEAN → cafe.pi 트레저리 주소(Soroban)
     ↓
배분: 트레저리에서 출금하지 않음
     ├─ 세일분(400M): Launchpad 구조상 LP 풀로 예치(유동성)
     ├─ 리저브(250M): 트레저리 보관, 사용자 보상으로만 지급
     ├─ 유동성(150M): LP 영구 락
     ├─ 마케팅(120M): 파트너/거래소용 보관
     └─ 팀(80M): 베스팅 스케줄 관리
     
사용자 보유:
     ├─ 온체인 지갑 X (개인 자산 관리 없음)
     └─ DB 잔액만 ✅ (bean_wallet.balance_bean = 진정한 가치 소유)
```

**실제 구현**: 
- 사용자가 Bean을 "보유"한다는 것은 **`bean_wallet.balance_bean` 값을 관리**하는 것
- 온체인 토큰 자체는 **트레저리 복수 서명 지갑** 또는 **마스터 계정**에서 관리
- 인출(개인지갑 전송) = Pi SDK `invokeContract()` 공식 지원 후 2단계 프로세스(§11-8a-E 참조)

#### B. IOU 1:1 실토큰 보증 (요건 2)

**정의**: IOU Bean = 플랫폼이 발행한 Bean Token 1:1 보증

| 개념 | 상태 | 단위 | 1:1 매칭 |
|-----|------|------|---------|
| **IOU Bean** (Phase 1~16) | 오프체인, 사용권 선구매 영수증 | 1 IOU = Pi 직접 표시(예: 0.1 Pi) | ✅ 1:1 |
| **Bean Token** (Phase 17+) | 온체인 실토큰 | 1 BEAN = 0.01 Pi (세일가) | ✅ 1:1 |
| **환율** | 고정 | 1 Pi = 100 Bean(모두) | ✅ 동일 단위 |

예시:
```
Phase 16 상태: 사용자 A가 보유한 IOU
  ├─ 팁 적립: 50 IOU Bean (= 0.5 Pi 상당)
  ├─ 구독료 결제: 100 IOU Bean (= 1 Pi 상당)
  └─ 이벤트 보상: 200 IOU Bean (= 2 Pi 상당)
  → 총 350 IOU Bean

Phase 17 발행 직후: 커스터디 스왑
  IOU 350 → Bean Token 350 (1:1 확정)
  → bean_wallet.balance_bean = 350 (음수 없음, 캐시)
```

→ **재환산 없음, 단순 표시 변경**

#### C. 불변식 I5 추가: 유통 역량 보증 (요건 3)

**신규 불변식 I5 (§11-4에 추가)**:

$$
\text{유통 발행분 (treasury보유)} \geq \sum(\text{미상환 IOU 적립액}) + \sum(\text{active 사용자 bean\_wallet})
$$

즉, **재무적 커버**: 트레저리가 모든 사용자 청구권을 충족할 수 있어야 함.

| # | 불변식 | 검증 SQL 예시 | 위반 시 액션 |
|---|--------|------------|-----------|
| **I5** | 유통 역량 | `SELECT (유동성제외 treasury보유) - SUM(bean_ledger 누적) >= 0` | 발급 게이트 차단 |

**발급 게이트** (애플리케이션 레벨):

```
사용자에게 Bean 지급 (CHARGE/REWARD)
  ↓
[게이트 검증]
  IF (bean_ledger 누적 + 신규지급액) > bean_token_alloc 유통분:
    REJECT("유통 역량 초과 — 보상 일시 중단")
  ELSE:
    INSERT into bean_ledger (APPROVED)
    UPDATE bean_wallet.balance_bean
```

→ **결과**: 플랫폼이 "약속한 보상 > 보유 토큰" 상황 방지

#### D. 1:1 단위 동일 (요건 4)

**확정**: 모든 단위가 동일하게 1 Pi = 100 Bean

| 거래타입 | IOU(Phase 16까지) | Bean Token(Phase 17+) | 환산 |
|---------|----------------|--------------------|------|
| CHARGE | 100 IOU (1 Pi) | 100 BEAN | 1:1 |
| SPEND | -50 IOU (0.5 Pi) | -50 BEAN | 1:1 |
| REWARD | +25 IOU (0.25 Pi) | +25 BEAN | 1:1 |
| TRANSFER | ±10 IOU (0.1 Pi) | ±10 BEAN | 1:1 |

→ **사용자가 단위 변환 인지 불필요**, 투명성 극대화

#### E. 전환 이벤트 기록 의무화 (요건 5)

**불변 기록 (append-only)**:

```sql
-- bean_token_alloc 테이블 확장
ALTER TABLE bean_token_alloc
ADD COLUMN state_change_log JSONB DEFAULT '[]';

-- 발행 이벤트
UPDATE bean_token_alloc
SET state_change_log = jsonb_append(
  state_change_log,
  jsonb_build_object(
    'event_tp_cd', 'TOKEN_ISSUED',
    'evt_dtm', CURRENT_TIMESTAMP,
    'issued_qty_bean', 1000000000,
    'issued_to', 'TREASURY_MULTISIG_ADDRESS',
    'blockchain_txid', '...',
    'evt_desc', 'Initial 1B BEAN minting on Mainnet'
  )
)
WHERE alloc_tp_cd = 'SALE';

-- 스왑 이벤트
UPDATE bean_token_alloc
SET state_change_log = jsonb_append(
  state_change_log,
  jsonb_build_object(
    'event_tp_cd', 'IOU_SWAP_COMPLETED',
    'evt_dtm', CURRENT_TIMESTAMP,
    'swapped_qty_bean', 1000000000,  -- 누적 IOU = 실토큰
    'legacy_ious_retired', TRUE,
    'evt_desc', 'Phase 16→17 전환: IOU 1:1 폐기·실토큰 활성화'
  )
)
WHERE alloc_tp_cd IN ('RESERVE', 'MARKETING', 'TEAM');
```

→ **목적**: 감시·감사 추적, Pi 심사 신뢰성

#### F. 출금(개인지갑) 2단계 모델 (요건 6)

**초기 상태** (Phase 17 직후): **비활성**

```
사용자 요청: "100 Bean을 내 지갑으로 출금하고 싶어"
  ↓
[현재 상태]
  ❌ 불가능 — Pi SDK invokeContract() 공식 미지원
  → PiRC2, PiRC3 대체(MPS 에스크로와 동일 블로커)
  
[정책]
  "Bean Token 출금(개인지갑 전송)은 Pi가 
   invokeContract() 공식 지원 후 2단계 프로세스로 개방"
```

**2단계 프로세스** (향후, Pi SDK 지원 이후):

| 단계 | 주체 | 액션 | 조건 |
|-----|------|------|------|
| **1단계: 신청** | 사용자 | bean_redeem_request 행 생성 | 최소 1 BEAN, 일일 한도 적용 |
| **2단계: 승인·실행** | 플랫폼(트레저리 multisig) | invokeContract() 호출 → 개인지갑으로 송금 | KYC 재검증, 보안 감시 |

```sql
-- bean_redeem_request (§11-3-6)
-- Phase 17 직후: use_yn='N' (애플리케이션 차단)
-- Pi SDK invokeContract 공식화 후: use_yn='Y' (정책 변경 필요)

SELECT * FROM bean_redeem_request
WHERE use_yn = 'Y'  -- 현재는 항상 false
  AND stat_cd IN ('PENDING', 'APPROVED');
```

**정책 근거**:
- **초기 비활성**: 온체인 출금 = 토큰 환금성 = 증권성 리스크 급증
- **2단계 위임**: Pi 공식 SDK 지원이 기술적 선결조건
- **보수적 운영**: 보상·팁 = 앱 내 사용(sink)만 강조, 환금성 없음

#### G. 커스터디 스왑 설계 정합성 체크

| 항목 | 상태 | 근거 |
|-----|------|------|
| ✅ 레드라인 #2(Pi 외 자산 거래 금지) | **준수** | BEAN은 Launchpad 공식 발행, 트레저리 보관, Pi 페어 단독 |
| ✅ 증권성 회피 | **강화** | 커스터디=사용권만, 출금 비활성=환금성 배제 |
| ✅ 멱등성/정합성 | **I5 추가** | 유통 역량 게이트, 이중발급·초과보상 방지 |
| ✅ 투명성 | **이벤트 기록** | state_change_log append-only, 감시·감사 용 |

---

### 11-8. 미해결·결정대기 항목

#### A. 역환전(Bean→Pi) 정책

| 항목 | 현황 | 결정필요 |
|-----|------|--------|
| **허용 여부** | 초기 비허용 | ⚠️ 증권성/환금성 리스크 법무 자문 필요 |
| **수수료** | `bean_redeem_request.processing_fee_pct` (미정) | 5~10% 범위 검토 권고 |
| **수령 계좌** | `bean_redeem_request.completed_pi_amt` (필드만 예비) | KYC·지갑 주소 검증 절차 설계 필요 |
| **한도** | 미정 | 일일/월간 한도 검토 |

→ **권고**: Phase 17 토큰 발행 후 3개월 운영 경험 축적 → 법무 자문 → 차기 업데이트에서 정책 수립

#### B. 발행 시점과 메인넷 연동

| 항목 | 상태 | 의존 |
|-----|------|------|
| Bean Token Mainnet 발행 | T04 차단(Mainnet Launchpad GA) | Pi Launchpad Mainnet 출시(6/28 이후 추정) |
| 온체인 지갑 주소 맵핑 | 테이블 필드만 예비 | Soroban 컨트랙트 배포 후 구현 |
| Pi Browser 토큰 충전 UI | 미설계 | Launchpad 공식 UI/API 정의 후 |

### 11-9. Pi Network 공식 정책상 IOU 리스크 검토 (⭐ 핵심 규제 리스크)

> **본 섹션은 Pi Network 공식 정책을 조사하여 Bean Token 발행 전 "IOU(오프체인 약속) 방식"의 규제 리스크를 평가합니다.**
> **출처는 모두 Pi Network 공식 블로그·문서(2025-2026)이며, 불명확한 판단은 "추정/미확인"으로 명시합니다.**

#### A. Pi Network 공식 정책 리서치 결과

| 정책 항목 | Pi 공식 입장 | 출처 | Cafe.pi IOU와의 관련성 |
|---------|-----------|------|------------------|
| **IOU 정의** | "IOU/derivatives = 진짜 토큰 아님" (인정) | [[1]](#footnote1) | ⚠️ 우리 IOU도 "미인가 자산"으로 분류될 수 있음 |
| **Pre-sale 금지** | 명시 금지 조항 **없음** | [[2]](#footnote2) | ✅ "오프체인 약속" 자체는 공식 금지 없음 |
| **Unauthorized pre-sale 금지** | "타사 주최 미인가 사전판매" 금지 | [[3]](#footnote3) | ⚠️ **cafe.pi가 자체 발행 약속 시 "미인가" 우려** |
| **Product-First 요건** | "발행 전 작동하는 앱 필수" | [[2]](#footnote2) | ✅ cafe.pi는 이미 운영 중 — **충족** |
| **Custody 정책** | "KYB 확인 비즈니스만 non-custodial 지갑 가능" | [[4]](#footnote4) | ✅ 커스터디 모델 = Pi 정책과 **일치** |

#### B. 리스크 평가

| 리스크 범주 | 평가 | 이유 | 영향 범위 |
|----------|------|------|---------|
| **IOU 합법성** | 🟡 **중간** | Pi가 "IOU=가짜 토큰" 판단하되, 오프체인 약속 자체는 금지 명시 없음. 그러나 "미인가 자산 취급" 여지 있음 | Launchpad 심사 시 "제3자 회사가 토큰 전에 사용권 약속" 부분이 질의 대상 |
| **미인가 금융상품** | 🔴 **높음** | Bean을 사용권 선구매로 팔면 → "미인가 증권/금융상품" 분류 가능성 | 증권성 법무 자문 필수, 표시·광고 신중 필요 |
| **Launchpad 심사 거절** | 🔴 **높음** | 발행 전 "사용권 약속 판매" = "자체 자금조달" 해석 → "Product-First" 원칙 위반 우려 | Launchpad는 "공식 발행 후 커뮤니티 획득", 사전약속 아님 강조 |
| **Pi 등재 금지** | 🟡 **중간** | 직접 금지 명시 없으나, "비인가 자산" 분류 시 상장 불가 | Phase 17 이후 메인넷 Launchpad 심사 단계에서 도자 |

**결론**: Pi 공식 문서상 "IOU 금지" **명시 없음**이나, **실질적으로는 "미인가 금융상품" 리스크가 높음**.

#### C. 안전 설계 권고 (증권성 리스크 최소화)

**원칙**: IOU를 "사용권 약속"이 아닌 **"적립 기록/인정서"**로 포지셔닝.

| 항목 | 현재 설계 | 권고 개선 | 목적 |
|-----|---------|---------|------|
| **명칭** | "IOU Bean" | → "Bean Token 선적립증" 또는 "Bean 계정 잔액" | "약속" 톤 제거, "기록" 강조 |
| **설명** | "Bean Token 발행 전 사용 가능한 약속 토큰" | → "Bean Token 발행 예정 시까지 플랫폼 내 사용권 기록" | 미래 권리가 아닌 현재 적립으로 표현 |
| **마케팅** | "Bean Token을 미리 구매할 기회!" | → "플랫폼 사용권을 적립하고, 발행 후 실토큰으로 교환 예정" | 투자 권유성 배제 |
| **환금성 명시** | (암시적) | → **명시: "환금(Pi 환전) 불가, 플랫폼 사용만 가능"** | 증권성 회피의 핵심 |
| **법적 공시** | (미기재) | → 백서·약관에 명시: "IOU는 미인가 증권이 아닌 사용권 기록" | 규제 리스크 선점 공시 |

#### D. Launchpad 심사 대비 전략

**피해야 할 표현**:
- ❌ "Bean Token 투자 기회"
- ❌ "가격 상승으로 수익"
- ❌ "미리 구매하고 이득 보세요"
- ❌ "토큰 발행 전 미리 나눠줍니다(presale)"
- ❌ "Bean은 회사(cafe.pi)가 보증합니다" (증권성 암시)

**권장 표현** (Launchpad 심사 통과 기준):
- ✅ "Bean Token은 cafe.pi 플랫폼 사용권 토큰입니다"
- ✅ "IOU 잔액은 Phase 17 발행 후 실토큰으로 1:1 교환됩니다"
- ✅ "환금(Pi 환전)은 불가, 플랫폼 내 사용만 가능합니다"
- ✅ "cafe.pi는 보상·가격 상승을 보장하지 않습니다"
- ✅ "토큰은 Pi Launchpad 공식 경로를 통해 발행됩니다"

#### E. 미확인/결정대기 사항

| 사항 | 현황 | 필요 액션 |
|-----|------|---------|
| **Pi 공식 IOU 정책 문의** | 미확인 (공식 문서상 명시 없음) | T02 이메일(developers@minepi.com)에 추가 질의: "오프체인 IOU/사용권 약속의 Launchpad 정책 적용 여부?" |
| **법무 자문(한국)** | 대기중(§8-1-1) | 한국 자본시장법상 IOU 분류 (투자계약증권 여부) 필수 자문 |
| **표시·광고 가이드** | 미정 | Launchpad 심사 제출 시 "IOU 설명 텍스트" Pi와 사전 검토 권장 |

---

#### 주석

<a name="footnote1">**[1]**</a> Pi Network Addresses Unauthorized Token Listings (2026)
- URL: https://minepi.com/blog/unauthorized-exchange-listings/
- 인용: "IOUs or other derivatives are not the real Pi tokens"

<a name="footnote2">**[2]**</a> Pi Launchpad Released on Testnet; Product-First Requirement
- URL: https://minepi.com/blog/pi-launchpad/
- URL: https://minepi.com/blog/pi-day-2026/
- 인용: "projects [must have] a functional app" 및 "ecosystem tokens are designed for user acquisition and product utility, rather than serving primarily to raise capital"
- **추정**: "Pre-sale" 금지 명시 없음, Launchpad 공식 경로 강조만 있음

<a name="footnote3">**[3]**</a> Beware of unauthorized activities
- URL: https://minepi.com/unaffiliated-unauthorized-activities/
- 인용: "illegal participation in and advocating for unauthorized pre-sales and sales"
- **해석**: "타사 주최" 미인가 판매만 금지, cafe.pi 자체 약속의 합법성은 미확인

<a name="footnote4">**[4]**</a> KYB Business & Custody Policy
- URL: https://minepi.com/kyb-business-pi/
- 인용: "Only KYB-verified businesses are eligible to create individual non-custodial Mainnet Pi Wallets"
- **결론**: 커스터디 모델(사용자 비보관)은 Pi 정책과 일치

---

## 12. 토큰 경제학 DB 정합성 검증 (금일 완료 항목)

### 12-1. 검증 목록

| # | 검증 항목 | 완료 상태 | 비고 |
|---|---------|---------|------|
| ✅ | PRD_14 (거래 통화 라우팅) 정합 | ✅ 완료 | 3대 규칙(플랫폼=Bean, P2P=Pi, O2O=Pi+Bean) 모두 원장 설계에 반영 |
| ✅ | 원장 일원화 (bean_ledger append-only) | ✅ 완료 | bean_wallet은 캐시, 원장 정본 단일화 |
| ✅ | 불변식 4대 명시 | ✅ 완료 | I1~I4 (잔액, 음수금지, 멱등, 총공급) |
| ✅ | DA 표준 명명 | ✅ 신규 표준단어 필요 | BEAN/WALLET/LEDGER/VESTING 등 등록 권고(실제 등록은 별도) |
| ✅ | 레드라인 #2 준수 | ✅ 완료 | BEAN/Pi 페어 단독, 원화 미노출 |
| ✅ | 증권성 회피 설계 | ✅ 완료 | 사용권·보상·후원 3대 경로로 유틸리티 입증 |
| ⚠️ | 역환전 정책 | ⏳ 결정대기 | 초기 비허용 권고(법무 자문 필요) |
| ⚠️ | Mainnet 연동 | ⏳ GA 대기 | T03 (Launchpad GA 대기) |

### 12-2. 신규 표준단어 등록 권고 (DA 거버넌스)

다음 용어는 표준사전에 등록이 권고됩니다(실제 등록은 DA 팀장 결정):

| 풀네임 | 권장 약어 | 타입 | 도메인 | 비고 |
|--------|---------|------|--------|------|
| Bean (Token) | bean | text | — | 신규 도메인 추가 고려 `bean_token` |
| wallet | wlt | — | — | — |
| ledger | ledger | — | — | 회계 용어 |
| vesting | vest | — | — | 증권용어 |
| reward | rwd | — | — | — |
| tranche | tranch | — | — | — |

### 12-3. 문서·코드 정합성

| 범위 | 현황 |
|-----|------|
| **PRD_12 §6 토크노믹스** | ✅ 원장 설계로 정합 |
| **PRD_14 §0 거래 규칙** | ✅ 3대 라우팅 매핑표 작성 |
| **CLAUDE.md 기술스택** | ✅ 1 Pi=100 BEAN 리베이스 명시 |
| **인앱 코드 (pi-tip-button 등)** | ⚠️ 마이그레이션 TODO (발행 전 수행) |

---

## 13. 참고 출처

### 공식 문서 (Pi Network)

1. **Pi Launchpad 핵심 문서**
   - [Pi Launchpad Released on Testnet](https://minepi.com/blog/pi-launchpad/)
   - [Pi Launchpad Updates: Improved Participation Flow](https://minepi.com/blog/launchpad-update-flow/)
   - [Pi Day 2026: Major Feature Releases](https://minepi.com/blog/pi-day-2026/)

2. **메인넷 및 마이그레이션**
   - [Mainnet Migrations Roadmap & Tokenomics](https://minepi.com/blog/mainnet-migrations-roadmap-and-tokenomics/)
   - [Open Network Anniversary](https://minepi.com/blog/open-network-anniversary/)
   - [KYC and Mainnet Migration FAQ](https://minepi.com/kyc-faqs/)

3. **스마트 컨트랙트 및 개발**
   - [Pi Testnet RPC Server Released](https://minepi.com/blog/rpc-server/)
   - [Subscription Smart Contract (PiRC2)](https://minepi.com/blog/subscriptions-smart-contract/)
   - [Pi Cryptocurrency White Paper](https://minepi.com/white-paper/)

4. **개발자 문서**
   - [Pi Developer Platform](https://developers.minepi.com/)
   - [Pi App Studio Community Guidelines](https://minepi.com/appstudio_community_guidelines/)

### 내부 문서 (Cafe.pi)

- `PRD_0_INT.md` — 플랫폼 전략 및 비전
- `PRD_4_CHAT.md` — 카페(PiChat) 요구사항
- `PRD_8_MPS.md` — 마켓플레이스(PiShop™) 요구사항
- `PRD_9_VOICE_CHAT.md` — 보이스챗 요구사항
- `PRD_11_EVENT.md` — 이벤트 및 미션 시스템
- `CLAUDE.md` — 프로젝트 기술 스택 및 규칙
  - PiRC2 컨트랙트 ID: `CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV`
  - Testnet RPC: `https://rpc.testnet.minepi.com`
  - 단위: 1 Pi = 10,000,000 units (i128)

### 외부 참고 자료

- **Stellar Protocol**: https://developers.stellar.org/
- **Soroban Smart Contracts**: https://soroban.stellar.org/
- **Federated Byzantine Agreement**: https://stellar.org/blog/
- **ERC-20(토큰 표준)**: https://ethereum.org/en/developers/docs/standards/tokens/erc-20/

---

## 부록: 용어 정의

| 용어 | 정의 |
|------|------|
| **Launchpad** | Pi Network의 공식 토큰 발행 및 공정 분배 플랫폼 |
| **Fair-Access Hold** | 토큰 약정액에 따라 자동으로 계산되는 "비율적 잠금" — 큰 투자자가 모든 토큰을 독점하는 것 방지 |
| **PiRC** | Pi Request for Comment — 스마트 컨트랙트 공개 검토 프로세스 |
| **Soroban** | Stellar 블록체인 위의 스마트 컨트랙트 플랫폼 |
| **DEX** | Decentralized Exchange(분산형 거래소) — 중개자 없이 토큰을 거래하는 플랫폼 |
| **Liquidity Pool** | 유동성 풀 — 토큰 쌍(BEAN/Pi)을 보유하고 있는 스마트 컨트랙트 |
| **VASP** | Virtual Asset Service Provider — 가상자산 관련 금융 서비스 제공자(규제 대상) |
| **Utility Token** | 사용권 토큰 — 서비스/상품 구매용(규제 완화) |
| **Security Token** | 유가증권 토큰 — 수익 기대권을 포함(규제 강화) |
| **Testnet** | 테스트용 블록체인 네트워크(실제 가치 없음) |
| **Mainnet** | 실제 거래가 일어나는 본 블록체인 네트워크 |

---

**문서 끝**

