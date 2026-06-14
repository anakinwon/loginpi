# PRD_11_EVENT.md — Pi 요원 육성 이벤트 시스템 v2.0

> **작성일**: 2026-06-14
> **버전**: v2.0
> **상태**: 기획 문서 (코드 미구현)
> **작성자**: asoká (pi-event-mission-builder 에이전트) / 검토: anakin
> **관련 문서**: PRD_4_CHAT.md (카페), PRD_8_MPS.md (마켓플레이스), PRD_9_VOICE_CHAT.md (보이스챗)

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| **v2.0** | 2026-06-14 | **아키텍처 전환** — 행위(behavior)와 이벤트(data) 분리로 무코드 확장 가능한 구조. `evt_event` 마스터 + `evt_action_log` 원천 + `evt_mission` 데이터 정의 기반 미션 평가 엔진. 10미션은 첫 이벤트 시드로 재배치. 신규 이벤트는 DB 행 추가만으로 수용 가능. | asoká |
| v1.1 | 2026-06-14 | **M9/M10 확정** — M9=보증금+위치동의(선행), M10=M7·M8 재수행(보증금 활성 상태 조건) 통합 설계, 취소수수료 경험 미션으로 명시 | asoká |
| v1.0 | 2026-06-14 | 최초 작성 — 10가지 미션(M1~M10) 정의, 자동 감지 훅, 랭킹 시스템, 관리자 제외 관리 | asoká |

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [핵심 컨셉 및 네러티브](#2-핵심-컨셉-및-네러티브)
2-A. [아키텍처: 행위-이벤트 분리 모델](#2-a-아키텍처-행위-이벤트-분리-모델) ✨ **NEW v2.0**
3. [사용자 역할 정의](#3-사용자-역할-정의)
4. [10가지 미션 상세 설계](#4-10가지-미션-상세-설계)
5. [이벤트 페이지 요구사항](#5-이벤트-페이지-요구사항)
6. [Footer 네비게이션 확장](#6-footer-네비게이션-확장)
7. [관리자 제외 대상자 관리](#7-관리자-제외-대상자-관리)
8. [미션 완료 자동 감지 훅](#8-미션-완료-자동-감지-훅)
9. [랭킹 시스템 상세](#9-랭킹-시스템-상세)
10. [데이터 모델 제안](#10-데이터-모델-제안)
11. [API 엔드포인트 목록](#11-api-엔드포인트-목록)
12. [화면 목록 (SCR)](#12-화면-목록-scr)
13. [비기능 요구사항](#13-비기능-요구사항)
14. [제약사항 및 가정](#14-제약사항-및-가정)
15. [보상 설계](#15-보상-설계)
16. [마일스톤 및 우선순위](#16-마일스톤-및-우선순위)
17. [미해결 사항](#17-미해결-사항-open-issues)

---

## 1. 프로젝트 개요

### 1-1. 제품명

**Pi 요원 육성 이벤트** — Cafe.pi 사용자 전 기능 활성화 캠페인

### 1-2. 한 줄 요약

사용자가 10가지 핵심 기능을 모두 완료하면 화이트리스트에 자동으로 등록되고, 미션 수행 합계 기준 랭킹 보드에서 요원 등급을 획득하는 이벤트.

### 1-3. 목표

- **기능 인지·사용 활성화**: 카페(Chat), 음성채팅(Voice), PiShop(MPS), 게시판(Board), 구독(Subscription) 등 플랫폼의 산재된 기능들을 통합된 미션으로 경험하게 함
- **커뮤니티 참여 확대**: 미션 수행 시 자동으로 데이터가 기록되며, 랭킹 보드에서 공개적 경쟁·달성감 유발
- **화이트리스트 신뢰 구축**: 미션 완료자만 화이트리스트 등록으로, 플랫폼에 진정성 있는 활성 사용자임을 증명

### 1-4. 핵심 가치

| # | 가치 | 설명 |
|---|------|------|
| 1 | **첩보 요원 테마** | 각 미션을 "스킬 습득"으로 프레임 — 사용자를 "요원" 호칭으로 대우하는 정서적 몰입감 |
| 2 | **자동 감지** | 실제 사용자 행동(로그인, 결제, 거래 등)이 발생할 때만 미션이 완료되며 수동 체크 없음 — 진정성 보장 |
| 3 | **멱등 안전성** | `(user_id, mission_cd)` 유니크 제약으로 중복 기록 방지, 동일 미션 완료 시 다시 기록되지 않음 |
| 4 | **실시간 랭킹** | 미션 수행 즉시 합계가 갱신되고, 랭킹 테이블에 요원명(별명) 기준 내림차순 노출 — 경쟁 유발 |
| 5 | **관리 투명성** | 어드민만 특정 사용자를 명시적으로 제외할 수 있으며, 제외 사유가 기록됨 |

---

## 2. 핵심 컨셉 및 네러티브

### 2-1. 요원 등급 시스템

완료한 미션 수 기준으로 5단계 등급 부여:

| 등급 | 미션 수 | 호칭 | 아이콘 |
|------|--------|------|--------|
| **신입** | 0~2 | Recruit | 🆕 |
| **훈련생** | 3~4 | Trainee | 📚 |
| **정요원** | 5~6 | Agent | 🕵️ |
| **베테랑** | 7~8 | Veteran | 🏅 |
| **마스터 요원** | 9~10 | Master | 👑 |

### 2-2. 페이지 톤

- **배경**: 첩보 영화 느낌의 다크 톤 + 진행률 게이지(Mission Control)
- **요원명**: 사용자의 `nick_nm` (별명) 기반 — 실명 비노출
- **미션 카드**: 완료/미완료 체크박스 + 각 미션의 스킬 설명

### 2-3. 슬로건

> *"모든 요원은 10가지 스킬을 마스터하여 화이트리스트 요원이 된다."*

---

## 2-A. 아키텍처: 행위-이벤트 분리 모델 ✨ **v2.0 NEW**

### 2-A-1. 핵심 설계 원칙: 무코드 확장성

**문제점 (v1.x)**:
- 각 미션이 코드에 강결합 (`M1` → `recordUserMission('M1', ...)` 직접 호출)
- 신규 이벤트 추가 → 새로운 미션 로직 작성 필요 → 코드 배포 필수

**해결책 (v2.0)**:
- **행위(behavior)**: 비즈니스 로직이 발생하는 지점에서 추상화된 `action_cd` 기록만 함
  - 예: `ACCOUNT_LINK`, `SHOP_BUYER_CANCEL`, `BOND_DEPOSIT` 등 (미션과 무관)
- **이벤트(event)**: 이벤트 정의는 **데이터**(DB 행)로 관리
  - `evt_event`: 이벤트 메타데이터(기간·보상정책 등)
  - `evt_mission`: 미션 정의(어떤 action_cd 조합이 미션 완료인지)
  - `evt_action_log`: 사용자의 모든 행위 원천 기록
- **자동 평가**: 미션 평가 엔진이 활성 이벤트의 미션 정의를 읽고, 사용자의 action_log와 매칭 → 자동 완료

**결과**:
- **신규 이벤트 추가** = `evt_event` + `evt_mission` 행만 INSERT → 코드 변경 0
- **신규 action_cd 추가** = 해당 API에만 `recordUserAction(action_cd)` 훅 추가 → 이미 정의된 모든 이벤트가 자동으로 감시

---

### 2-A-2. 3계층 구조

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: 행위 원천 (evt_action_log)                        │
│ 사용자의 모든 비즈니스 로직 행위가 기록됨                    │
│ - action_cd: 'ACCOUNT_LINK', 'BOND_DEPOSIT', ...           │
│ - 미션·이벤트와 무관한 순수 행위 기록                        │
│ - 한 번 기록되면 영구히 보존 (이벤트 시간 변경 시에도 참조)  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: 이벤트·미션 정의 (evt_event, evt_mission)         │
│ 이벤트가 어떤 행위 조합을 미션으로 인식하는지 데이터로 정의 │
│ - evt_event: 이벤트 기간·보상정책·제외관리 설정             │
│ - evt_mission: 요구 action_cd(들) + 완료조건(SINGLE/MULTI) │
│ - 신규 이벤트 추가 시 이 테이블만 수정 (코드 변경 0)        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: 미션 평가 엔진 (evt_user_mission)                 │
│ 활성 이벤트의 미션 정의를 읽고, 사용자의 action_log를 평가 │
│ - 자동 감지: M1 = ACCOUNT_LINK + GOOGLE_LINK 발생 → 완료   │
│ - 멱등성: (event_id, user_id, mission_cd) UNIQUE           │
│ - 선착순: 미션 완료 시각 기반 (evt_user_mission.complete_dtm) │
└─────────────────────────────────────────────────────────────┘
```

---

### 2-A-3. 행위 코드(action_cd) 정의 — 미션과 분리

**10미션에 필요한 행위들** (예시):

| action_cd | 설명 | 트리거 API |
|-----------|------|-----------|
| `ACCOUNT_LINK` | 구글 계정 연동 완료 | `/api/auth/link-complete` |
| `PROFILE_UPDATE` | 별명·카톡ID 입력 | `/api/profile` PATCH |
| `PREMIUM_CAFE_CREATE` | PREMIUM 구독 카페 생성 | `/api/chat/rooms` POST |
| `CAFE_TRANSLATE_USE` | 카페 내 자동번역 사용 | `/api/chat/rooms/[roomId]/messages/[msgId]/translate` |
| `PIBET_CREATE` | Pi Bet 생성 | `/api/chat/rooms/[roomId]/bets` |
| `PIBET_ENTRY` | Pi Bet 참여자 추가 | `/api/chat/rooms/[roomId]/bets/[betId]/entries` |
| `BEAN_SEND` | Bean(팁) 전송 | `/api/tips` POST |
| `VOICE_JOIN` | 음성채널 입장 | `/api/voice/rooms/[roomId]/join` |
| `FILE_SEND` | 파일 전송 | `/api/chat/rooms/[roomId]/messages` (file 포함) |
| `STICKER_USE` | 스티커 사용 | `/api/chat/stickers` |
| `SELLER_CANCEL` | 판매자 거래 취소 | `/api/store/orders/[orderId]/cancel` |
| `BUYER_CANCEL` | 구매자 거래 취소 | `/api/store/orders/[orderId]/cancel` |
| `BOND_DEPOSIT` | 판매자 보증금 예치 | `/api/store/bond` + `/api/payments/complete` |
| `LBS_CONSENT` | 위치기반서비스 동의 | `/api/location/consent` PATCH |
| `FEE_INCUR` | 거래 수수료 발생 | `/api/store/orders/[orderId]/cancel` (M9 후) |

**특징**:
- 각 action_cd는 **단일 비즈니스 이벤트**
- 미션은 이들 action_cd의 **조합**으로 정의
- 신규 action_cd 추가 시만 코드 변경 (기존 이벤트는 영향 없음)

---

### 2-A-4. 미션 정의 데이터 모델: evt_mission

```json
{
  "event_id": "evt-20260614-001",
  "mission_cd": "M1",
  "mission_nm": "계정 통합",
  "complete_type": "MULTI_AND",
  "required_action_cds": ["ACCOUNT_LINK", "GOOGLE_LINK"],
  "sequence_order": null,
  "description": "Pi Browser 로그인 + Google 계정 연동"
}
```

**`complete_type` 옵션** (4가지):
- `SINGLE`: 1개 action_cd만 필요 (예: M2 = PROFILE_UPDATE)
- `MULTI_AND`: 여러 action_cd 모두 필요 (예: M1 = ACCOUNT_LINK AND GOOGLE_LINK, M9 = BOND_DEPOSIT AND LBS_CONSENT)
- `MULTI_OR`: 여러 action_cd 중 1개 이상 필요 (예: **M6 = VOICE_JOIN OR FILE_SEND OR STICKER_USE** — 3종 중 1개만 만족해도 완료)
- `SEQUENCE`: 선행 미션 완료 후 특정 조건 충족 (예: **M10 = M9 완료 후, 수수료 동반 취소 경험** — 환불에 FEE 행이 함께 존재)

**평가 방식**:
- 실시간: 각 API에서 `recordUserAction()` 호출 → 즉시 evt_action_log에 기록
- 정기(배치): 매일 자정 또는 5분 주기로 활성 이벤트의 모든 미션에 대해 사용자별 완료 여부 재평가
  - M6처럼 3가지 조건(voice+file+sticker)을 모두 감시할 때 필요
  - 개별 API 트리거가 복잡한 경우 배치 평가로 단순화

---

### 2-A-5. 첫 이벤트(v1.0의 10미션)는 시드 데이터

**evt_event 시드**:
```sql
INSERT INTO evt_event (event_id, event_nm, start_dtm, end_dtm, active_yn, reward_whitelist, reward_tier_system, ...)
VALUES ('evt-20260614-001', 'Pi 요원 육성 이벤트', '2026-06-14 00:00:00', '2026-12-31 23:59:59', 'Y', 'Y', 'Y', ...);
```

**evt_mission 시드** (M1~M10):
```sql
INSERT INTO evt_mission (event_id, mission_cd, mission_nm, complete_type, required_action_cds, ...)
VALUES 
  ('evt-20260614-001', 'M1', '계정 통합', 'MULTI_AND', '["ACCOUNT_LINK","GOOGLE_LINK"]', ...),
  ('evt-20260614-001', 'M2', '프로필 완성', 'SINGLE', '["PROFILE_UPDATE"]', ...),
  ...
  ('evt-20260614-001', 'M10', '보증금 활성 거래 취소', 'SEQUENCE', '["FEE_INCUR"]', '{"prior_mission":"M9",...}', ...);
```

**신규 이벤트 추가** (예: 2026년 Q3 마케팅 이벤트):
```sql
-- 코드 변경 없음. DB에 행만 추가.
INSERT INTO evt_event (event_id, event_nm, ...) VALUES ('evt-20260901-001', 'Q3 챌린지', ...);
INSERT INTO evt_mission (event_id, mission_cd, ...) VALUES 
  ('evt-20260901-001', 'M1', 'PREMIUM 가입', 'SINGLE', '["SUBSCRIPTION_PREMIUM"]', ...),
  ('evt-20260901-001', 'M2', '카페 생성', 'SINGLE', '["CAFE_CREATE"]', ...),
  ...;
```

→ **기존 10미션 이벤트는 영향 없고, 새로운 이벤트가 기존 action_cd(들)을 자동으로 감시.**

---

## 3. 사용자 역할 정의

| 역할 | 설명 | 접근 권한 |
|------|------|----------|
| **일반 사용자** | 로그인한 모든 사용자. 미션 진행 및 자신의 랭킹 조회 가능. | 이벤트 페이지 읽기, 자신의 미션 진행도 조회 |
| **Admin (관리자)** | ADMIN/MASTER role 사용자. 제외 대상자 관리 기능 보유. | 제외 대상자 추가/해제 |

---

## 4. 10가지 미션 상세 설계

### 4-1. 미션 정의표

| 미션 | 이름 | 완료 조건 | 스킬 설명 | 트리거 지점 (코드) | 상태 코드 |
|------|------|----------|-----------|------------------|-----------|
| **M1** | 계정 통합 (Account Integration) | Pi Browser 로그인 완료 + Google 계정 연동 완료 | "두 세계를 연결하는 기술" | `src/app/api/auth/link-complete` (POST) — `updatePiUserWithGoogle()` 호출 시 google_id, google_email 업데이트 | `auth_link_cd.used_at IS NOT NULL` + `sys_user.google_id IS NOT NULL` |
| **M2** | 프로필 완성 (Profile Mastery) | 별명(nick_nm) + 카카오 ID(kakao_id) 모두 입력 | "요원 신원 확립" | `src/app/api/profile` (PATCH) — sys_user 업데이트 시 nick_nm, kakao_id 동시 포함 | `sys_user.nick_nm IS NOT NULL AND kakao_id IS NOT NULL` |
| **M3** | PREMIUM 카페 생성 + 자동번역 | PREMIUM 구독 중에 새 카페(chat room) 생성 + 해당 카페 내 메시지 자동번역 사용 | "프리미엄 공간 개설" | `src/app/api/chat/rooms` (POST, 구독 게이트 통과) + `src/app/api/chat/rooms/[roomId]/messages/[msgId]/translate` (POST) 호출 | `msg_room.room_plan_cd='PREMIUM'` + `msg_translate` 테이블 해당 room_id 레코드 존재 |
| **M4** | Pi Bet 생성 후 분배 | 카페 내 Pi Bet 생성 + 최소 1명 이상의 참여자에게 분배 | "예측 게임 주관" | `src/app/api/chat/rooms/[roomId]/bets` (POST) — `msg_bet` 레코드 생성 + `msg_bet_entry` 레코드 최소 1건 존재 | `msg_bet.crtr_usr_id=$user AND EXISTS (SELECT 1 FROM msg_bet_entry WHERE bet_id=$bet_id)` |
| **M5** | Bean(팁) 전송 테스트 | 카페 채팅 내 메시지에 Pi Bean(팁) 최소 1회 전송 | "보상 전달 기술" | `src/app/api/tips` (POST) — 0.1/0.5/1 Pi 팁 전송 | `pi_pymnt.metadata.type='TIPS' AND buyer_id=$user` |
| **M6** | 채팅 멀티 기능 사용 (Multi-Feature Mastery) | 음성채널(voice channel) 입장 + 파일 전송 + 스티커 사용 **(3가지 중 1개 이상)** | "채팅 기술 완성" | ① Voice: `src/app/api/voice/rooms/[roomId]/join` (POST) — `msg_call_participant` 레코드 생성 ② File: `src/app/api/chat/rooms/[roomId]/messages` (POST, file 포함) ③ Sticker: `src/app/api/stickers` 사용 | ① `msg_call_participant.usr_id=$user AND del_yn='N'` OR ② `msg_chat.file_url IS NOT NULL AND sender_id=$user` OR ③ `msg_chat.sticker_id IS NOT NULL AND sender_id=$user` (최소 1가지) |
| **M7** | 판매자 거래 취소 (Seller Refund) | PiShop에서 자신이 등록한 상품의 주문을 "판매자 거래 취소" 처리 | "거래 협상 스킬" | `src/app/api/store/orders/[orderId]/cancel` (POST) — `cancelOrder(orderId, userId, reason, isAdminUser)` 호출, 판매자가 요청할 때 | `mps_order.order_st_cd='CANCELLED' AND cancel_req_id=$user (판매자) AND escrow_txid IS NOT NULL` |
| **M8** | 구매자 거래 취소 (Buyer Refund) | PiShop에서 타인의 상품을 구매 후 "구매자 거래 취소" 처리 | "구매 결정 권리" | `src/app/api/store/orders/[orderId]/cancel` (POST) — 구매자가 요청할 때 | `mps_order.order_st_cd='CANCELLED' AND cancel_req_id=$user (구매자) AND escrow_txid IS NOT NULL` |
| **M9** | 판매자 보증금 + 위치동의 (Seller Bonding + Location Consent) | ① 판매자 보증금 1π 이상 예치 + ② 위치기반서비스 동의 (선행 조건) | "신뢰 자본 확보" | ① `src/app/api/store/bond` (POST → `/api/payments/complete` MPS_BOND) + `src/lib/mps-bond.ts` `depositBond()` ② `src/app/api/location/consent` (PATCH) — `lbs_consent_yn='Y'` 업데이트 | ① `mps_seller_bond.seller_id=$user AND bond_bal_pi ≥ 1.0 AND del_yn='N'` ② `sys_user.lbs_consent_yn='Y'` (둘 다 만족) |
| **M10** | 보증금 활성 상태에서 거래 취소 수수료 경험 (Bonded Transaction Fee) | M9 완료 **이후** 발생한 판매자/구매자 거래 취소에서 **환불액에 취소수수료가 반영된 경험**(환불 = 원금±0.1π) | "신뢰 기반 거래" | `src/app/api/store/orders/[orderId]/cancel` (POST, M9 완료 후) — 취소 처리 시 환불 + FEE 동시 기록 | **환불(REFUND_IN) + 수수료(FEE)가 동일 order에 함께 존재** (근거: `src/lib/mps-refund.ts`, `sql/041`). 보증금 활성: 환불액 = 원금±0.1π(수수료 반영), 미활성: 원금만 반환. |

---

## 5. 이벤트 페이지 요구사항

### 5-1. 라우팅

```
/[locale]/event          → 이벤트 메인 페이지
```

### 5-2. 페이지 구성

```
┌─────────────────────────────────────────────────────────┐
│  🕵️ Pi 요원 육성 이벤트                                  │
│  ─────────────────────────────────────────────────────  │
│  요원 코드명: john_pi (별명 기반)                        │
│  현재 등급: 훈련생 📚 (5/10 미션 완료)                   │
│  진행률: ████████░░ 50%                                  │
│  ─────────────────────────────────────────────────────  │
│                                                          │
│  [ 미션 진행도 ]                                        │
│  ✓ M1. 계정 통합                                         │
│  ✓ M2. 프로필 완성                                       │
│  ✓ M3. PREMIUM 카페 생성                                 │
│  ✓ M4. Pi Bet 생성                                       │
│  ✓ M5. Bean 전송                                         │
│  ○ M6. 채팅 멀티 기능                                    │
│  ○ M7. 판매자 거래 취소                                  │
│  ○ M8. 구매자 거래 취소                                  │
│  ○ M9. 판매자 보증금 + 위치동의                          │
│  ○ M10. 보증금 활성 거래 취소 수수료                     │
│                                                          │
│  ─────────────────────────────────────────────────────  │
│  [ 랭킹 보드 ]                                          │
│  NO | 요원명        | M1~M10 완료 합계 |               │
│  1  | alice_master  | ██████████ (10)  |               │
│  2  | bob_veteran   | ████████░░ (8)   |               │
│  3  | charlie_agent | ██████░░░░ (6)   |               │
│  ...                                                    │
│  (당신의 순위를 찾으려면 스크롤)                         │
│  ─────────────────────────────────────────────────────  │
│  [👤 내 순위 보기]  [🏆 전체 랭킹]                      │
└─────────────────────────────────────────────────────────┘
```

### 5-3. 세부 컴포넌트

#### **5-3-1. 미션 진행도 섹션**

- **카드 레이아웃**: M1~M10 각 미션마다 카드
- **완료 상태**: 
  - ✓ 완료 (초록 배경, 체크 아이콘)
  - ○ 미완료 (회색 배경, 진행 단계 설명)
- **설명 텍스트**: 각 미션의 "스킬 설명" (예: "두 세계를 연결하는 기술")
- **클릭**: 각 카드 클릭 시 해당 미션의 상세 조건 모달 (예: "M7을 완료하려면 PiShop에서 상품을 등록하고 판매자 거래 취소를 해야 합니다")

#### **5-3-2. 요원 등급 배너**

- **등급 표시**: 아이콘 + 호칭 + 슬로건
- **진행률**: 원형 게이지 (완료 미션 수 / 10) 또는 막대 그래프
- **자동 갱신**: 미션 완료 시 즉시 랭킹 데이터 새로고침 (WebSocket 또는 5초 폴링)

#### **5-3-3. 랭킹 테이블 (SCR-02)**

- **컬럼**: NO(순위) | 요원명(별명) | M1 ✓/○ | M2 ✓/○ | ... | M10 ✓/○ | 합계(숫자)
- **정렬**: 합계 내림차순 (내림차순)
- **제외 처리**: `evt_exclude` 테이블에 있고 `del_yn='N'` 사용자는 테이블에서 제외 (SELECT WHERE user_id NOT IN ... OR evt_exclude.del_yn != 'N')
- **페이지네이션**: 상위 100명 표시 또는 무한 스크롤
- **현재 사용자 강조**: 당신의 순위 행을 노란색/주황색 배경으로 강조
- **Tie-break 규칙**: 동점(합계 동일)일 때, 해당 미션을 더 빨리 완료한 사용자가 상위 순위 (evt_user_mission.complete_dtm 오름차순)

---

## 6. Footer 네비게이션 확장

### 6-1. 변경 사항

**파일**: `src/components/layout/bottom-nav-client.tsx`

**현재 구조** (4개 탭):
```
[Home] [Cafe] [Shop] [My Profile / Admin]
```

**변경 후** (5개 탭):
```
[Home] [Cafe] [Event] [Shop] [My Profile / Admin]
```

또는 (Shop과 Event 위치 변경)
```
[Home] [Cafe] [Shop] [Event] [My Profile / Admin]
```

**아나킨 마스터님 선택**: 사용자 행동 흐름상 "Shop → Event"가 자연스러우므로 **[Shop] [Event]** 순서 추천

### 6-2. 구현 세부

- **아이콘**: Trophy 또는 Target 또는 Mission 아이콘 (lucide-react)
- **라벨**: next-intl 키 (예: `nav.event`) → `src/messages/ko.json`에 "이벤트" 추가
- **활성화 조건**: `pathname.startsWith('/event')`
- **링크**: `href="/event"` (locale 자동 추가)

---

## 7. 관리자 제외 대상자 관리

### 7-1. 관리자 화면 (SCR-03)

**라우팅**: `/[locale]/(admin)/admin/event/exclude` (또는 `/admin/event-exclusions`)

**접근 권한**: `isAdmin(user)` 통과한 사용자만

### 7-2. UI 구성

```
┌──────────────────────────────────────┐
│ 🛡️ 이벤트 제외 관리                   │
│ ──────────────────────────────────────│
│                                       │
│ [사용자 ID 입력]                      │
│ [example@pi.id]     [검색 / 제외]    │
│                                       │
│ ──────────────────────────────────────│
│ 제외 대상자 목록                       │
│ ──────────────────────────────────────│
│ ID           | 사유              | 제외일시       | 복구  |
│ user123_pi   | 부정 행위         | 2026-06-14   | [해제] |
│ user456_pi   | 요청              | 2026-06-13   | [해제] |
│ ...                                  │
└──────────────────────────────────────┘
```

### 7-3. 기능

- **사용자 조회**: ID 입력 후 검색 — `sys_user` 테이블에서 존재 확인
- **제외 추가**: 선택 후 "제외" 버튼 → 사유 입력 모달 → `evt_exclude` INSERT (또는 UPDATE del_yn='Y' → 'N')
- **제외 해제**: 기존 제외자 행의 [해제] 버튼 → `evt_exclude.del_yn='Y'` (논리삭제)
- **피드백**: 성공/실패 toast 메시지

---

## 8. 미션 완료 자동 감지: 행위-기반 평가 엔진

### 8-1. v2.0 설계 원칙

**2계층 분리**:
1. **Layer 1 (행위 기록)**: API 내부에서 `recordUserAction(action_cd)` 호출만 수행 (추상화)
2. **Layer 2 (미션 평가)**: 미션 평가 엔진이 활성 이벤트의 `evt_mission` 정의를 읽고, `evt_action_log`와 매칭 → 자동 완료

**멱등성**: `(event_id, user_id, mission_cd)` UNIQUE 제약으로 중복 기록 방지.

**확장성**: 신규 `action_cd` 추가 시 해당 API만 수정, 이미 정의된 모든 이벤트가 자동으로 감시.

---

### 8-2. Layer 1: 행위 기록 (API 내부)

#### **recordUserAction() 호출 위치**

각 API 라우트에서 기존 비즈니스 로직 완료 후 추상화된 행위만 기록:

```typescript
// src/app/api/auth/link-complete/route.ts (Google 링크 완료 후)
if (google_link_success) {
  // 기존 로직: updatePiUserWithGoogle() ...
  
  // v2.0: 행위 기록 (추상화)
  await recordUserAction(user_id, 'GOOGLE_LINK', { 
    endpoint: '/api/auth/link-complete',
    google_id: user.google_id 
  })
}

// src/app/api/profile/route.ts (프로필 업데이트)
if (nick_nm && kakao_id) {
  await recordUserAction(user_id, 'PROFILE_UPDATE', {
    endpoint: '/api/profile',
    updated_fields: ['nick_nm', 'kakao_id']
  })
}

// src/app/api/store/bond/route.ts (보증금 예치)
if (bond_deposited) {
  await recordUserAction(user_id, 'BOND_DEPOSIT', {
    endpoint: '/api/store/bond',
    bond_amount_pi: amount
  })
}

// src/app/api/location/consent/route.ts (위치동의)
if (lbs_consent_yn === 'Y') {
  await recordUserAction(user_id, 'LBS_CONSENT', {
    endpoint: '/api/location/consent'
  })
}
```

**목표**: 각 `recordUserAction()` 호출은 **1줄 추가**, 미션 정의와 무관.

---

### 8-3. recordUserAction() 유틸 함수

```typescript
// src/lib/event-action.ts
async function recordUserAction(
  userId: string,
  actionCd: string,
  metadata?: Record<string, any>
) {
  const db = getSupabaseAdmin()
  
  // evt_action_log에 행위 기록
  const { error } = await db
    .from('evt_action_log')
    .insert({
      user_id: userId,
      action_cd: actionCd,
      action_dtm: new Date().toISOString(),
      metadata: metadata ?? null,
      regr_id: 'SYSTEM',
      modr_id: 'SYSTEM',
    })
  
  if (error) {
    console.error(`행위 기록 실패 [${actionCd}]:`, error.message)
    return
  }
  
  // 행위 기록 후, 활성 이벤트의 미션 평가 엔진 호출 (비동기)
  // evaluateUserMissions(userId) // 옵션 1: 즉시 평가
  // 또는 정기 배치에서 처리 (옵션 2)
}
```

---

### 8-4. Layer 2: 미션 평가 엔진 (자동 완료)

#### **evaluateUserMissions(userId) — 실시간 평가**

각 활성 이벤트의 미션 정의를 읽고, 사용자의 action_log와 매칭:

```typescript
// src/lib/event-evaluator.ts
async function evaluateUserMissions(userId: string) {
  const db = getSupabaseAdmin()
  
  // 1. 활성 이벤트 조회
  const { data: events } = await db
    .from('evt_event')
    .select('event_id')
    .eq('active_yn', 'Y')
    .gte('end_dtm', new Date())
  
  for (const event of events) {
    // 2. 해당 이벤트의 모든 미션 조회
    const { data: missions } = await db
      .from('evt_mission')
      .select('*')
      .eq('event_id', event.event_id)
      .eq('del_yn', 'N')
    
    for (const mission of missions) {
      // 3. 미션 완료 판정
      const isCompleted = await evaluateMissionCompletion(
        userId, 
        event.event_id, 
        mission
      )
      
      if (isCompleted) {
        // 4. evt_user_mission에 기록 (멱등 UPSERT)
        await db
          .from('evt_user_mission')
          .upsert({
            event_id: event.event_id,
            user_id: userId,
            mission_cd: mission.mission_cd,
            complete_dtm: new Date().toISOString(),
            regr_id: 'SYSTEM',
          }, { 
            onConflict: 'event_id,user_id,mission_cd' 
          })
      }
    }
  }
}

// 미션 완료 판정 로직
async function evaluateMissionCompletion(
  userId: string,
  eventId: string,
  mission: {
    complete_type: string
    required_action_cds: string[]
    sequence_prior_mission?: string
  }
): Promise<boolean> {
  const db = getSupabaseAdmin()
  
  switch (mission.complete_type) {
    case 'SINGLE':
      // 1개 action_cd 발생 확인
      const { data: action1 } = await db
        .from('evt_action_log')
        .select('1')
        .eq('user_id', userId)
        .eq('action_cd', mission.required_action_cds[0])
        .limit(1)
      return !!action1?.length
      
    case 'MULTI_AND':
      // 모든 action_cd 발생 확인
      for (const actionCd of mission.required_action_cds) {
        const { data } = await db
          .from('evt_action_log')
          .select('1')
          .eq('user_id', userId)
          .eq('action_cd', actionCd)
          .limit(1)
        if (!data?.length) return false
      }
      return true
      
    case 'MULTI_OR':
      // 1개 이상의 action_cd 발생 확인 (예: M6 = VOICE_JOIN OR FILE_SEND OR STICKER_USE 중 1개)
      for (const actionCd of mission.required_action_cds) {
        const { data } = await db
          .from('evt_action_log')
          .select('1')
          .eq('user_id', userId)
          .eq('action_cd', actionCd)
          .limit(1)
        if (data?.length) return true // 1개 발생하면 즉시 완료
      }
      return false
      
    case 'SEQUENCE':
      // 선행 미션 완료 후 특정 조건 충족 확인
      const { data: priorMission } = await db
        .from('evt_user_mission')
        .select('complete_dtm')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('mission_cd', mission.sequence_prior_mission)
        .maybeSingle() // 선행 미션이 없을 수 있으므로 maybeSingle
      
      if (!priorMission) return false // 선행 미션 미완료
      
      // M10 특수 평가: 환불 + 수수료가 동일 order에 함께 존재하는 거래 취소 경험
      // (근거: src/lib/mps-refund.ts, 보증금 활성 시 환불 = 원금±0.1π)
      if (mission.mission_cd === 'M10') {
        // 판매자 또는 구매자 입장에서 FEE가 발생한 취소 거래 확인
        const { data: cancelWithFee } = await db
          .rpc('check_cancel_with_fee', {
            p_user_id: userId,
            p_after_dtm: priorMission.complete_dtm
          })
        
        return !!cancelWithFee?.length // 수수료 동반 취소가 존재하면 완료
      }
      
      // 일반 SEQUENCE: 선행 미션 후 action_cd 발생 확인
      const { data: seqAction } = await db
        .from('evt_action_log')
        .select('1')
        .eq('user_id', userId)
        .in('action_cd', mission.required_action_cds)
        .gte('action_dtm', priorMission.complete_dtm)
        .limit(1)
      
      return !!seqAction?.length
      
    default:
      return false
  }
}
```

---

### 8-5. 평가 실행 전략

**Option A: 실시간** (즉시 평가)
- 각 `recordUserAction()` 호출 후 `evaluateUserMissions(userId)` 즉시 실행
- 장점: 사용자가 미션 완료 후 즉시 반영됨
- 단점: M6 같은 3가지 조건이 모두 발생할 때까지 계속 평가 (부하)

**Option B: 정기 배치** (권장)
- 매 5분 또는 자정마다 모든 활성 이벤트·사용자에 대해 배치 평가
- 장점: 간단, M6 같은 복합 조건도 자연스럽게 평가
- 단점: 최대 5분 지연

**권장**: **Option B (정기 배치) + Option A (즉시 실행)를 선택적으로 조합**
- 빠른 응답이 필요한 미션(M1, M2): `recordUserAction()` 후 즉시 평가
- 복합 조건 미션(M6): 정기 배치에서 평가

---

### 8-6. 10미션 예시: evt_mission 시드 데이터

```sql
-- 이벤트 생성
INSERT INTO evt_event (event_id, event_nm, ...) 
VALUES ('evt-20260614-001', 'Pi 요원 육성 이벤트', ...);

-- M1: SINGLE (ACCOUNT_LINK만 있으면 안 됨, GOOGLE_LINK도 필요)
INSERT INTO evt_mission (event_id, mission_cd, complete_type, required_action_cds)
VALUES ('evt-20260614-001', 'M1', 'MULTI_AND', '["ACCOUNT_LINK","GOOGLE_LINK"]');

-- M2: SINGLE (PROFILE_UPDATE만)
INSERT INTO evt_mission (event_id, mission_cd, complete_type, required_action_cds)
VALUES ('evt-20260614-001', 'M2', 'SINGLE', '["PROFILE_UPDATE"]');

-- M3: MULTI_AND (PREMIUM_CAFE_CREATE + CAFE_TRANSLATE_USE)
INSERT INTO evt_mission (event_id, mission_cd, complete_type, required_action_cds)
VALUES ('evt-20260614-001', 'M3', 'MULTI_AND', '["PREMIUM_CAFE_CREATE","CAFE_TRANSLATE_USE"]');

-- M6: MULTI_OR (VOICE_JOIN OR FILE_SEND OR STICKER_USE 중 1개 이상)
INSERT INTO evt_mission (event_id, mission_cd, complete_type, required_action_cds)
VALUES ('evt-20260614-001', 'M6', 'MULTI_OR', '["VOICE_JOIN","FILE_SEND","STICKER_USE"]');

-- M9: MULTI_AND (BOND_DEPOSIT + LBS_CONSENT 모두)
INSERT INTO evt_mission (event_id, mission_cd, complete_type, required_action_cds)
VALUES ('evt-20260614-001', 'M9', 'MULTI_AND', '["BOND_DEPOSIT","LBS_CONSENT"]');

-- M10: SEQUENCE (M9 완료 후, 수수료 동반 취소 경험)
-- 평가 로직: REFUND_IN + FEE가 동일 order에 함께 존재하는 거래 취소를 감지
INSERT INTO evt_mission (event_id, mission_cd, complete_type, required_action_cds, sequence_prior_mission)
VALUES ('evt-20260614-001', 'M10', 'SEQUENCE', '["CANCEL_WITH_FEE"]', 'M9');

-- ... M4, M5, M7, M8도 유사하게
```

**신규 이벤트** (코드 변경 0):
```sql
INSERT INTO evt_event (event_id, event_nm, ...) 
VALUES ('evt-20260901-001', 'Q3 챌린지', ...);

-- 이 이벤트만의 미션 정의
INSERT INTO evt_mission (event_id, mission_cd, complete_type, required_action_cds)
VALUES 
  ('evt-20260901-001', 'M1', 'SINGLE', '["SUBSCRIPTION_PREMIUM"]'),
  ('evt-20260901-001', 'M2', 'SINGLE', '["CAFE_CREATE"]'),
  ...;
```

→ 신규 이벤트도 기존 action_cd(`SUBSCRIPTION_PREMIUM` 등)를 재사용하거나, 새로운 action_cd가 필요하면 해당 API에만 `recordUserAction()` 훅 추가.

---

## 9. 랭킹 시스템 상세

### 9-1. 랭킹 쿼리 로직

```sql
-- 의사 코드 (실제 SQL은 Supabase RPC 또는 Node 쿼리)
SELECT
  ROW_NUMBER() OVER (ORDER BY total_count DESC, first_complete_dtm ASC) AS rank,
  user_id,
  (SELECT nick_nm FROM sys_user u WHERE u.id = evt_user_mission.user_id) AS user_name,
  COUNT(DISTINCT mission_cd) AS total_count,
  MIN(complete_dtm) AS first_complete_dtm,
  MAX(CASE WHEN mission_cd = 'M1' THEN 1 ELSE 0 END) AS m1,
  MAX(CASE WHEN mission_cd = 'M2' THEN 1 ELSE 0 END) AS m2,
  ... (M3~M10 동일)
FROM evt_user_mission
WHERE del_yn = 'N'
  AND user_id NOT IN (
    SELECT user_id FROM evt_exclude WHERE del_yn = 'N'
  )
GROUP BY user_id
ORDER BY total_count DESC, first_complete_dtm ASC
```

### 9-2. Tie-Break 규칙

**동점자 처리 (완료 미션 수 동일)**:
- **Rule 1**: 동일 미션 수 → **더 빨리 완료한 사용자 상위** (evt_user_mission.complete_dtm 오름차순)
- **Rule 2**: 만약 동일 시간까지 같다면 (매우 드문 경우) → 사용자 ID 사전순 (deterministic)

### 9-3. 실시간 갱신 전략

**Option 1: 폴링** (간단, 서버 부하 중간)
- 클라이언트 5초마다 `/api/event/ranking` GET
- 응답: 전체 순위 상위 100명 + 당신의 순위

**Option 2: WebSocket** (복잡, 실시간)
- Supabase Realtime 활용
- `evt_user_mission` 테이블 변경 감지 → 클라이언트에 broadcast
- 클라이언트 수신 후 자동 리렌더

**초기 권장**: Option 1 (폴링) — 단순하고 충분한 반응성

---

## 10. 데이터 모델 제안 v2.0

### 10-0. 아키텍처 개요: 3계층 테이블

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: 행위 원천                                  │
│ evt_action_log — 모든 비즈니스 행위 기록             │
└─────────────────────────────────────────────────────┘
         ↓ (참조)
┌─────────────────────────────────────────────────────┐
│ Layer 2: 이벤트·미션 정의 (데이터-driven)          │
│ evt_event — 이벤트 설정                             │
│ evt_mission — 미션 정의 (action_cd 조합)           │
└─────────────────────────────────────────────────────┘
         ↓ (평가)
┌─────────────────────────────────────────────────────┐
│ Layer 3: 미션 수행 이력                             │
│ evt_user_mission — 사용자별 미션 완료 기록         │
│ evt_exclude — 관리자 제외 대상                      │
│ evt_gift_log — 선물 발송 이력                       │
└─────────────────────────────────────────────────────┘
```

---

### 10-1. Layer 1: 행위 원천

#### **Table: evt_action_log** (모든 비즈니스 행위 기록 — NEW v2.0)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| evt_action_log_id | UUID | PK | 자동 생성 |
| user_id | UUID | NOT NULL, FK(sys_user) | 사용자 ID |
| action_cd | VARCHAR(30) | NOT NULL | 행위 코드 (ACCOUNT_LINK, BOND_DEPOSIT, ...) |
| action_dtm | TIMESTAMPTZ | NOT NULL | 행위 발생 시각 |
| metadata | JSONB | | { "api_endpoint": "/api/auth/link-complete", "context": {...} } |
| regr_id | TEXT | DEFAULT 'SYSTEM' | 기록자 |
| reg_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 기록일시 |
| modr_id | TEXT | DEFAULT 'SYSTEM' | 수정자 |
| mod_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 수정일시 |
| del_yn | CHAR(1) | DEFAULT 'N' | 논리삭제 |
| del_dtm | TIMESTAMPTZ | | 삭제일시 |
| **INDEX**: (user_id, action_cd, action_dtm) | — | | 미션 평가 엔진 쿼리 최적화 |

**목적**: 모든 비즈니스 행위를 미션·이벤트와 무관하게 순수하게 기록. 이후 이벤트/미션 정의에 따라 다양하게 해석됨.

---

### 10-2. Layer 2: 이벤트·미션 정의 (데이터 기반)

#### **Table: evt_event** (이벤트 메타데이터 — NEW v2.0)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| event_id | VARCHAR(30) | PK | 'evt-20260614-001', 'evt-20260901-001', ... |
| event_nm | VARCHAR(200) | NOT NULL | '요원 육성', 'Q3 챌린지', ... |
| event_desc | TEXT | | 이벤트 설명·배경 |
| start_dtm | TIMESTAMPTZ | NOT NULL | 이벤트 시작일시 |
| end_dtm | TIMESTAMPTZ | NOT NULL | 이벤트 종료일시 |
| active_yn | CHAR(1) | DEFAULT 'Y' | 활성 여부 |
| reward_whitelist_yn | CHAR(1) | DEFAULT 'Y' | 화이트리스트 자동등록 여부 |
| reward_tier_system_yn | CHAR(1) | DEFAULT 'Y' | 요원 등급 시스템 적용 여부 |
| reward_gift_top_n | INT | | 선물 선착순 N명 (null = 선물 없음) |
| reward_gift_url | VARCHAR(500) | | 선물 링크 (카카오 선물하기 등) |
| reward_gift_send_method | VARCHAR(20) | | 발송 방식 (MANUAL/AUTO) |
| regr_id | TEXT | DEFAULT 'ADMIN' | 등록자 |
| reg_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 등록일시 |
| modr_id | TEXT | DEFAULT 'ADMIN' | 수정자 |
| mod_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 수정일시 |
| del_yn | CHAR(1) | DEFAULT 'N' | 논리삭제 |
| del_dtm | TIMESTAMPTZ | | 삭제일시 |

**예**: v1.0의 10미션 이벤트, v2.0의 신규 이벤트 등을 행으로 추가.

---

#### **Table: evt_mission** (미션 정의 — v2.0 재설계)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| evt_mission_id | UUID | PK | 자동 생성 |
| event_id | VARCHAR(30) | NOT NULL, FK(evt_event) | 이벤트 ID |
| mission_cd | CHAR(3) | NOT NULL | 'M1'~'M10', 또는 'M1'~'Mn' (신규 이벤트) |
| mission_nm | VARCHAR(100) | NOT NULL | "계정 통합", "프로필 완성" |
| skill_desc | TEXT | | "두 세계를 연결하는 기술" |
| **complete_type** | VARCHAR(20) | NOT NULL | SINGLE / MULTI_AND / MULTI_OR / SEQUENCE |
| **required_action_cds** | JSONB | NOT NULL | `["ACCOUNT_LINK", "GOOGLE_LINK"]` 또는 `["PROFILE_UPDATE"]` |
| **sequence_prior_mission** | CHAR(3) | | 선행 미션 (complete_type='SEQUENCE'일 때) |
| **sequence_delay_minutes** | INT | | 선행 미션 완료 후 최소 대기 시간(분) |
| mission_ord | INT | | 표시 순서 (1~10) |
| regr_id | TEXT | DEFAULT 'ADMIN' | 등록자 |
| reg_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 등록일시 |
| modr_id | TEXT | DEFAULT 'ADMIN' | 수정자 |
| mod_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 수정일시 |
| del_yn | CHAR(1) | DEFAULT 'N' | 논리삭제 |
| del_dtm | TIMESTAMPTZ | | 삭제일시 |
| **UNIQUE(event_id, mission_cd, del_yn='N')** | — | | 이벤트 내 미션 중복 방지 |

**complete_type 상세**:

| Type | 설명 | 예시 |
|------|------|------|
| SINGLE | 1개 action_cd만 필요 | M2: required_action_cds = ["PROFILE_UPDATE"] |
| MULTI_AND | 모든 action_cd 필요 | M1: required_action_cds = ["ACCOUNT_LINK", "GOOGLE_LINK"] |
| MULTI_OR | 1개 이상의 action_cd | M6_VOICE_OR_FILE: ["VOICE_JOIN", "FILE_SEND"] 중 1개 |
| SEQUENCE | 선행 미션 완료 후 특정 action_cd | M10: prior_mission="M9", required_action_cds=["FEE_INCUR"] |

**평가 로직** (의사코드):

```typescript
// 활성 이벤트의 모든 미션에 대해 사용자별 완료 여부 평가
for each evt_mission where event_id = active_event:
  switch (complete_type):
    case SINGLE:
      // 1개 action_cd 발생 확인
      completed = EXISTS (
        SELECT 1 FROM evt_action_log 
        WHERE user_id = $user AND action_cd = required_action_cds[0]
      )
    case MULTI_AND:
      // 모든 action_cd 발생 확인
      completed = ALL action_cd in required_action_cds 
                  EXISTS in evt_action_log
    case SEQUENCE:
      // 선행 미션 완료 후 action_cd 발생 확인
      prior_complete_dtm = (SELECT complete_dtm FROM evt_user_mission 
                            WHERE mission_cd = prior_mission)
      completed = EXISTS (
        SELECT 1 FROM evt_action_log 
        WHERE user_id = $user AND action_cd IN required_action_cds
          AND action_dtm >= prior_complete_dtm
      )
```

---

### 10-3. Layer 3: 미션 수행 이력

#### **Table: evt_user_mission** (사용자별 미션 완료 이력)

---

#### **Table: evt_user_mission** (사용자별 미션 완료 이력 — v2.0 업데이트)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| evt_user_mission_id | UUID | PK | 자동 생성 |
| event_id | VARCHAR(30) | NOT NULL, FK(evt_event) | 이벤트 ID (v2.0 추가: 이벤트별 스코핑) |
| user_id | UUID | NOT NULL, FK(sys_user) | 사용자 ID |
| mission_cd | CHAR(3) | NOT NULL | 미션 코드 |
| complete_dtm | TIMESTAMPTZ | NOT NULL | 완료일시 |
| gift_sent_yn | CHAR(1) | DEFAULT 'N' | 선물 발송 여부 (선착순 10명용) |
| gift_sent_dtm | TIMESTAMPTZ | | 선물 발송일시 |
| metadata | JSONB | | { "triggered_by_action_cds": ["ACCOUNT_LINK", "GOOGLE_LINK"], ...} |
| regr_id | TEXT | DEFAULT 'SYSTEM' | 등록자 |
| reg_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 등록일시 |
| modr_id | TEXT | DEFAULT 'SYSTEM' | 수정자 |
| mod_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 수정일시 |
| del_yn | CHAR(1) | DEFAULT 'N' | 논리삭제 |
| del_dtm | TIMESTAMPTZ | | 삭제일시 |
| **UNIQUE(event_id, user_id, mission_cd, del_yn='N')** | — | | 이벤트·사용자·미션 조합 중복 방지 |
| **INDEX**: (event_id, complete_dtm DESC) | — | | 선착순 10명 조회 최적화 |

**변경점**:
- `event_id` 추가: 이벤트별 미션 스코핑 (동일 사용자·미션_cd가 여러 이벤트에 걸쳐 기록 가능)
- `gift_sent_yn/dtm` 추가: 선물 발송 여부 추적
- UNIQUE 제약 변경: (event_id, user_id, mission_cd) 3중 유니크

---

#### **Table: evt_exclude** (제외 대상자 관리 — v2.0 업데이트)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| evt_exclude_id | UUID | PK | 자동 생성 |
| event_id | VARCHAR(30) | NOT NULL, FK(evt_event) | 이벤트 ID (v2.0 추가: 이벤트별 제외 관리) |
| user_id | UUID | NOT NULL, FK(sys_user) | 제외된 사용자 |
| exclude_reason | VARCHAR(200) | | "부정 행위", "요청" 등 |
| regr_id | TEXT | NOT NULL | 제외 등록자 (어드민) |
| reg_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 제외 등록일시 |
| modr_id | TEXT | DEFAULT 'ADMIN' | 수정자 |
| mod_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 수정일시 |
| del_yn | CHAR(1) | DEFAULT 'N' | 논리삭제 (해제 시 'Y') |
| del_dtm | TIMESTAMPTZ | | 해제일시 |
| **UNIQUE(event_id, user_id, del_yn='N')** | — | | 이벤트·사용자 중복 제외 방지 |

**변경점**:
- `event_id` 추가: 사용자를 특정 이벤트에서만 제외 가능 (다른 이벤트는 영향 없음)

---

#### **Table: evt_gift_log** (선물 발송 이력 — v2.0 신규)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| evt_gift_log_id | UUID | PK | 자동 생성 |
| event_id | VARCHAR(30) | NOT NULL, FK(evt_event) | 이벤트 ID |
| user_id | UUID | NOT NULL, FK(sys_user) | 수령자 사용자 ID |
| gift_rank | INT | NOT NULL | 선착순 순위 (1~10) |
| kakao_id | VARCHAR(100) | | 카카오톡 ID (수령 채널) |
| gift_send_status | VARCHAR(20) | DEFAULT 'PENDING' | PENDING / SENT / FAILED / CANCELLED |
| gift_send_dtm | TIMESTAMPTZ | | 실제 발송일시 |
| gift_send_method | VARCHAR(20) | | MANUAL / AUTO / BOT |
| metadata | JSONB | | { "kakao_gift_url": "...", "error_message": "..." } |
| regr_id | TEXT | DEFAULT 'ADMIN' | 기록자 |
| reg_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 기록일시 |
| modr_id | TEXT | DEFAULT 'ADMIN' | 수정자 |
| mod_dtm | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 수정일시 |
| del_yn | CHAR(1) | DEFAULT 'N' | 논리삭제 |
| del_dtm | TIMESTAMPTZ | | 삭제일시 |
| **UNIQUE(event_id, gift_rank)** | — | | 이벤트별 선착순 순위 중복 방지 |

**목적**: 선착순 10명 선물 발송 추적 및 발송 상태 관리용.

---

### 10-2. 인덱스 (성능 최적화)

```sql
-- evt_user_mission 쿼리 성능
CREATE INDEX idx_evt_user_mission_user_id_del 
  ON evt_user_mission(user_id, del_yn);

CREATE INDEX idx_evt_user_mission_complete_dtm 
  ON evt_user_mission(complete_dtm DESC);

-- evt_exclude 랭킹 필터
CREATE INDEX idx_evt_exclude_user_id_del 
  ON evt_exclude(user_id, del_yn);
```

---

## 11. API 엔드포인트 목록

### 11-1. 이벤트 관련 신규 API

#### **GET /api/event/my-progress**

사용자 자신의 미션 진행도 조회

**요청**:
```json
// 로그인한 사용자 자동 (getSessionUser)
```

**응답** (200 OK):
```json
{
  "user_id": "uuid-xxx",
  "user_name": "alice_pi",
  "rank": 1,
  "tier": "Master Agent",
  "total_count": 10,
  "missions": [
    { "mission_cd": "M1", "completed": true, "complete_dtm": "2026-06-10T..." },
    { "mission_cd": "M2", "completed": true, "complete_dtm": "2026-06-11T..." },
    ...
  ]
}
```

---

#### **GET /api/event/ranking**

전체 랭킹 조회 (상위 100명 + 당신의 순위)

**쿼리 파라미터**:
- `page` (optional): 페이지 번호 (기본값 1, 페이지당 20명)

**응답** (200 OK):
```json
{
  "top_100": [
    {
      "rank": 1,
      "user_id": "uuid-1",
      "user_name": "alice_master",
      "total_count": 10,
      "missions": { "M1": true, "M2": true, ..., "M10": true }
    },
    ...
  ],
  "your_rank": 42,
  "your_info": {
    "rank": 42,
    "user_name": "john_pi",
    "total_count": 5,
    "missions": { "M1": true, ..., "M5": true, "M6": false, ... }
  }
}
```

---

#### **GET /api/event/leaderboard** (paginated 버전)

대규모 랭킹 조회 (무한 스크롤 지원)

**쿼리 파라미터**:
- `offset`: 시작 위치 (기본값 0)
- `limit`: 한 번에 로드할 행 수 (기본값 20, 최대 100)

**응답** (200 OK):
```json
{
  "total_count": 5432,
  "data": [
    { "rank": 1, "user_name": "alice_master", "total_count": 10, ... },
    ...
  ]
}
```

---

### 11-2. 관리자 API

#### **GET /api/admin/event/exclude**

제외 대상자 목록 조회

**인증**: isAdmin(user) 필수

**응답** (200 OK):
```json
{
  "excludes": [
    {
      "evt_exclude_id": "uuid-1",
      "user_id": "uuid-xxx",
      "user_name": "user123_pi",
      "exclude_reason": "부정 행위",
      "reg_dtm": "2026-06-14T...",
      "regr_id": "admin_user_id"
    },
    ...
  ]
}
```

---

#### **POST /api/admin/event/exclude**

제외 대상자 추가

**인증**: isAdmin(user) 필수

**요청**:
```json
{
  "user_id": "uuid-xxx",
  "exclude_reason": "부정 행위"
}
```

**응답** (201 Created):
```json
{
  "evt_exclude_id": "uuid-new",
  "user_id": "uuid-xxx",
  "message": "제외 대상자가 추가되었습니다"
}
```

**에러** (400, 404, 401):
- `user_id` 없음: 400 Bad Request
- 사용자 존재하지 않음: 404 Not Found
- 권한 없음: 401 Unauthorized

---

#### **PATCH /api/admin/event/exclude/[excludeId]**

제외 해제

**인증**: isAdmin(user) 필수

**요청**:
```json
{} // 빈 본문 또는 { "del_yn": "Y" }
```

**응답** (200 OK):
```json
{
  "message": "제외가 해제되었습니다"
}
```

---

### 11-3. 내부 훅 함수 (기존 API 내부에서 호출)

#### **recordUserMission(userId, missionCd, metadata?)**

`evt_user_mission` 멱등 UPSERT

**호출 위치**:
- `src/app/api/auth/link-complete/route.ts` — M1
- `src/app/api/profile/route.ts` — M2
- `src/app/api/chat/rooms/[roomId]/messages/[msgId]/translate/route.ts` — M3
- `src/app/api/chat/rooms/[roomId]/bets/route.ts` — M4
- `src/app/api/tips/route.ts` — M5
- `src/app/api/voice/rooms/[roomId]/join/route.ts` + 파일·스티커 API — M6
- `src/app/api/store/orders/[orderId]/cancel/route.ts` — M7, M8
- `src/app/api/store/bond/route.ts` + `src/app/api/location/consent/route.ts` — M9 (두 조건 모두 만족 시)
- `src/app/api/store/orders/[orderId]/cancel/route.ts` — M10 (M9 완료 이후의 취소만 카운트)

---

## 12. 화면 목록 (SCR)

| 화면 코드 | 이름 | 라우트 | 역할 | 상세 |
|----------|------|--------|------|------|
| SCR-01 | Event Main (이벤트 메인) | `/[locale]/event` | 일반 사용자 | 미션 진행도 + 요원 등급 + 랭킹 테이블 |
| SCR-02 | Event Leaderboard (랭킹 보드) | `/[locale]/event#leaderboard` 또는 탭 | 일반 사용자 | 전체 랭킹 상위 100명 + 당신의 순위 (paginated) |
| SCR-03 | Admin Exclude Management (제외 관리) | `/[locale]/(admin)/admin/event/exclude` | 관리자 | 제외 대상자 추가/해제, 목록 조회 |
| — | Bottom Nav (하단 네비) | 모든 페이지 | 모든 사용자 | Footer 탭 추가: Event 탭 (Shop 다음) |

---

## 13. 비기능 요구사항

### 13-1. 성능 (NFR-01)

- **랭킹 조회**: 상위 100명 조회 시 < 1초
- **미션 진행도**: 사용자별 미션 상태 조회 < 500ms
- **멱등 기록**: recordUserMission() < 200ms (DB UPSERT)

### 13-2. 확장성 (NFR-02)

- **대규모 사용자**: 5,000+ 활성 사용자 지원 (적절한 인덱스)
- **랭킹 갱신**: 실시간 업데이트 (WebSocket 또는 5초 폴링)

### 13-3. 보안 (NFR-03)

- **인증**: `getSessionUser()` + Pi Browser 이중 경로 지원 (X-Pi-Token 헤더)
- **권한**: isAdmin(user) 검증 (관리자 API)
- **논리삭제**: 물리 DELETE 금지 (del_yn, del_dtm)

### 13-4. 접근성 (NFR-04)

- **UI 텍스트**: next-intl 국제화 (ko.json)
- **다크 모드**: 첩보 테마 어두운 톤 지원 (Tailwind dark: 클래스)
- **모바일**: Pi Browser 포함 전 기기 대응

### 13-5. 데이터 무결성 (NFR-05)

- **중복 기록 방지**: `evt_user_mission(user_id, mission_cd)` UNIQUE 제약
- **감시 필요**: 부정 행위 탐지 → evt_exclude 관리자 기록

---

## 14. 제약사항 및 가정

### 14-1. Pi Browser 쿠키 미저장 (CRITICAL)

**제약**: Pi Browser WebView는 모든 방식의 `Set-Cookie`를 저장하지 않음.

**대응**:
- 인증 필요 페이지: `getSessionUser()` (쿠키·헤더 자동 폴백) + 클라이언트 게이트
- 클라이언트 API 호출: `piFetch()` 사용 (X-Pi-Token 헤더 자동 첨부)
- **redirect() 절대 금지** (무한 루프 위험) → 클라이언트 게이트로 위임

### 14-2. 미션 트리거 실증 기반

각 미션의 완료 조건은 **기존 코드베이스에서 검증된 경로**만 포함. 미구현 기능(예: M9-A의 구독)은 "구현 필요"로 명기.

### 14-3. M9/M10 확정 (2026-06-14)

아나킨 마스터님이 M9/M10을 명확히 분리 확정:
- **M9** = 판매자 보증금(1π 이상) + 위치기반서비스 동의 (선행 조건)
- **M10** = M9 완료 이후 발생한 M7·M8(거래 취소) 재수행 (양방향 취소수수료 0.1π 경험)

### 14-4. 보상 현금화 제약

Pi A2U(app wallet → user)는 시드 미설정 또는 송금 실패 시 PENDING 반환. 본 이벤트 보상은 **뱃지·등급 중심**으로 설계 (실 Pi 지급은 향후 경영 결정).

### 14-5. 랭킹 실시간성

초기 구현: 폴링(5초) 권장. 향후 WebSocket 고도화 가능.

---

## 15. 보상 설계

### 15-1. 전원 대상: 뱃지 및 등급 (Phase 1)

미션 완료 시:
- **완료 뱃지**: 각 미션마다 미니 뱃지 (예: 🔐 for M1 계정통합, 🎯 for M2 프로필)
- **등급 뱃지**: 완료 합계별 요원 등급 (신입·훈련생·정요원·베테랑·마스터)

### 15-2. 전원 대상: 화이트리스트 등록 (Phase 1)

**M1~M8 + M9 + M10 모두 완료** (10/10) 시 자동으로 `evt_user_mission`에 기록되며, 랭킹 보드에서 마스터 에이전트 호칭 획득.

**화이트리스트** = evt_user_mission(mission_cd IN ('M1'~'M10'), del_yn='N') 모두 존재 && evt_exclude(del_yn='N') 미포함

### 15-3. ✅ 확정: 실물 선물 — 선착순 10명 (Phase 1)

#### 15-3-1. 선물 대상 및 선물

**대상**: 미션 수행 **선착순 10명**
- ⚠️ **미해결**: "선착순"의 정확한 기준 = "10가지 미션 **모두** 완료한 사용자의 마지막(10번째) 미션 완료 시각 기준 오름차순 상위 10명"인지 확인 필요

**선물**: 카카오 선물하기 상품  
📦 **링크**: https://gift.kakao.com/product/11105359

#### 15-3-2. M2(프로필 완성)과의 인프라 연계

**M2 미션의 역할 = 선물 발송 채널**:
- M2 완료 조건: 별명(nick_nm) + 카카오톡 ID(kakao_id) 입력 (기존)
- **선물 발송**: 시스템이 선착순 10명 리스트에서 `sys_user.kakao_id` 조회 → 카카오 선물하기로 자동/수동 발송
- **의미**: 사용자가 M2를 완료하지 않으면 (카카오톡 ID 미입력) 선착순에 진입해도 선물 발송 불가능 → M2의 중요성 강화

#### 15-3-3. 발송 운영 방식 (수동 운영)

**시스템 역할**: 선착순 10명 리스트 + 카카오톡 ID + 발송 상태 관리  
**운영자 역할**: 수동 발송 및 완료 체크

**관리 화면** (관리자 전용):
```
[ 이벤트 선물 발송 관리 ]

선착순 10명 리스트 (마지막 미션 완료 시각 오름차순):
┌─────────────────────────────────────────────────────┐
│ 순위 | 요원명      | 카톡ID        | 발송상태  | 발송  |
├─────────────────────────────────────────────────────┤
│ 1    | alice_pi    | kakao_123     | 발송완료  | ✅   |
│ 2    | bob_agent   | kakao_456     | 발송대기  | [발송] |
│ 3    | charlie_vm  | kakao_789     | 미입력*   | —    |
│ ...                                                 │
└─────────────────────────────────────────────────────┘

* M2 미완료로 카톡ID 없음 → 선물 발송 불가

액션:
- [발송] 버튼 클릭 → 카카오 선물링크 자동 생성 (또는 수동 관리)
- 발송 후 상태 = "발송완료" + timestamp
```

**발송 추적용 데이터 제안**:
- 신규 테이블: `evt_gift_log` (gift_id, user_id, gift_status, sent_dtm, regr_id)
- 또는 `evt_user_mission` 확장: `gift_sent_yn` 컬럼 추가 + 발송일시

#### 15-3-4. 선착순 종료 및 tie-break

**종료 조건**: 10명 채워지면 즉시 마감  
**표시**: 이벤트 페이지에 "🎁 선착순 마감" 배너

**Tie-break** (동시 완료 시):
- 기존 tie-break 규칙 적용 (complete_dtm 오름차순 정렬)

**부정 행위 시 제외**:
- `evt_exclude`에 추가 → 선착순 리스트에서 자동 제거
- 다음 순위자가 자동으로 10번째 자리 획득

---

### 15-4. 향후 경영 결정 (Out of Scope, Phase 2+)

- **실 Pi 보상**: 상위 랭커(1~100위) 중 추가 배분 (경영진 결정 필요)
- **상품 교환**: 뱃지를 가상 아이템 상점에서 교환 (후속 단계)

---

## 16. 마일스톤 및 우선순위 v2.0

### Phase 1: 기반 인프라 (2주)

**Priority: CRITICAL — 행위 기록·미션 평가 엔진**
- [ ] **Layer 1: 행위 기록 인프라**
  - [ ] `evt_action_log` 테이블 생성
  - [ ] `recordUserAction(action_cd, metadata)` 유틸 함수 개발
  - [ ] 기존 API (auth/link, profile, bond, lbs_consent, chat/voice, store/cancel 등)에 `recordUserAction()` 훅 심기 (코드 1줄 추가 × N개)
    - ⚠️ **핵심**: 각 API는 미션 정의와 무관하게 추상화된 action_cd만 기록
    
- [ ] **Layer 2: 이벤트·미션 정의**
  - [ ] `evt_event`, `evt_mission` 테이블 생성
  - [ ] 첫 이벤트(10미션) 시드 데이터 INSERT (evt-20260614-001 + M1~M10)
  - [ ] complete_type (SINGLE/MULTI_AND/MULTI_OR/SEQUENCE) 정의 및 시드에 명시
  
- [ ] **Layer 3: 미션 평가 엔진**
  - [ ] `evt_user_mission`, `evt_exclude`, `evt_gift_log` 테이블 생성
  - [ ] `evaluateUserMissions(userId)` 엔진 함수 개발
  - [ ] 정기 배치 설정 (5분/자정 주기)
  - [ ] **M6 평가**: MULTI_OR (3종 중 1개)
  - [ ] **M10 평가**: SEQUENCE + 수수료 동반 취소 감지 (RPC `check_cancel_with_fee`)

**Priority: HIGH — UI/API**
- [ ] Footer Event 탭 추가
- [ ] SCR-01 (이벤트 메인 페이지) 구현 — 미션 진행도 + 요원 등급 + 첫 이벤트 데이터
- [ ] GET `/api/event/my-progress` — 활성 이벤트 기준 사용자 미션 진행도
- [ ] GET `/api/event/ranking` — 활성 이벤트 랭킹 조회
- [ ] **선착순 10명 선물 발송 관리 화면** (관리자 전용)

### Phase 2: Admin & UX Polish (1주)

**Priority: HIGH**
- [ ] SCR-02 (랭킹 보드) — 상위 100명 paginated
- [ ] SCR-03 (관리자 제외 관리) — event_id 기반 이벤트별 제외
- [ ] POST/PATCH `/api/admin/event/exclude` — 이벤트별 제외 관리
- [ ] 관리자 이벤트 운영 화면 (이벤트 CRUD·미션 구성·보상 설정)

**Priority: MEDIUM**
- [ ] WebSocket 실시간 랭킹 갱신 (폴링 → WS 전환)
- [ ] 모바일 UI 최적화
- [ ] i18n (ko.json 완성)

### Phase 3: 신규 이벤트 수용 능력 검증 (1주)

**Priority: MEDIUM — "무코드 확장성" 검증**
- [ ] 신규 이벤트 시드 데이터 추가 (evt-20260901-001 등)
  - 기존 action_cd 조합으로 새 미션 정의
  - **코드 변경 0 확인**
- [ ] 신규 action_cd 필요 시 해당 API만 수정 (1줄 추가)
  - 이미 정의된 모든 이벤트가 자동으로 감시 확인

### Phase 4: 보상 시스템 (향후)

**Priority: LOW**
- [ ] 뱃지 UI 시스템
- [ ] 화이트리스트 공개 API
- [ ] Pi 보상 배분 로직 (경영진 승인 후)

---

## 17. 미해결 사항 (Open Issues)

### #1: M10 완료 판정 로직 상세화 ⚠️ **HIGH**

**현황**: M9 완료 이후 발생한 거래 취소를 판정하기 위해 `mps_txn_hist.reg_dtm > evt_user_mission.complete_dtm(M9)` 비교 필요

**액션 아이템**: 
- `mps_txn_hist` 테이블 구조 최종 검증 (FEE 행 타이밍·형식)
- M10 완료 판정용 DB 쿼리/RPC 설계
- M10은 M9와 달리 **한 번만 아닌 M7·M8 재수행 시마다** 기록되어야 하는지 확인 (현재: 유니크 제약으로 한 번만)

**타임라인**: Phase 1 구현 전

---

### #2: Tie-Break 규칙 확인

**현황**: 동점(완료 미션 수 동일) 시 complete_dtm(오름차순) 기준 제시

**액션 아이템**: 아나킨 마스터님 검증 — 다른 tie-break 기준 필요한가? (예: user_id 사전순, bonus points)

**타임라인**: Phase 1 랭킹 API 구현 전

---

### #3: 실시간 랭킹 갱신 전략

**현황**: 폴링(5초) 권장, WebSocket 후속 고도화

**액션 아이템**: 
- Phase 1: 폴링 기반 GET /api/event/ranking 구현
- Phase 2: Supabase Realtime 또는 외부 WebSocket 서버 검토

**기술 고려**:
- Supabase Realtime: 간단, 추가 비용 약간
- 자체 WebSocket 서버: 복잡, 운영 부담 증가

**타임라인**: Phase 2

---

### #4: 보상 Pi 지급 방식

**현황**: A2U 제약(시드 미설정) 고려해 뱃지·등급 중심 설계

**액션 아이템**: 경영진 결정 후 실 Pi 배분 규칙 추가
- 예: 상위 10명에게 월 1회 1π씩 배분
- 또는: 마스터 요원(10/10) 달성 시 보너스 1π 일회성

**리스크**: A2U 시드 부재 시 배분 불가 → 대체 보상(가상 포인트·뱃지)으로 회피 필요

**타임라인**: Phase 3(경영 결정 후)

---

### #5: 부정 행위 탐지 메커니즘

**현황**: evt_exclude 관리자 수동 기록만 제시

**액션 아이템**: 향후 자동 탐지 규칙 추가 고려
- 예: 단시간 내 M7·M8 다중 거래 취소 → 의심 패턴
- 또는: 거래 금액 비정상 → 플래그

**타임라인**: Phase 3+

---

### #6: M6(멀티 기능) 완료 판정 로직

**현황**: 3가지 조건(voice·file·sticker) 모두 만족 시 완료 — 개별 API에서 감지 어려움

**액션 아이템**: 
- **Option A**: 정기 배치 작업(매일 자정) — 모든 사용자에 대해 M6 조건 재평가
- **Option B**: M6 전용 "체크인" 버튼 페이지 — 사용자가 세 기능 다 사용 후 수동 완료 (추천 아님)

**권장**: Option A (정기 배치) — 자동화 원칙 준수

**타임라인**: Phase 1 구현 중

---

### #7: 선착순 기준 확정 필요 ⚠️ **HIGH**

**현황**: "미션 수행 선착순 10명"의 기준 모호
- **해석A**: 임의의 1개 미션 완료 선착순 10명 (각 미션 첫 완료자 10명 취합)
- **해석B**: 모든 10개 미션 완료 선착순 10명 (화이트리스트 등록자 중 마지막 미션 완료 시각 오름차순)

**액션 아이템**: 아나킨 마스터님 확인 필요
- 현재 설계: **해석B**(모두 완료) 기준으로 작성됨
- 해석에 따라 선착순 쿼리·발송 로직·tie-break 규칙 변경 필요

**타임라인**: Phase 1 구현 전 (매우 급함)

---

### #8: 카카오 선물하기 API 자동화 여부 ⚠️ **MEDIUM**

**현황**: 현재 설계는 **수동 운영** (관리자가 버튼 클릭 후 카카오 선물링크 수동 생성/발송)

**액션 아이템**: 
- **Option A (현재)**: 수동 운영 — 관리자가 [발송] 클릭 → 운영자가 카카오 선물링크 개인 발송
- **Option B**: 카카오 API 자동화 — 시스템이 카카오 선물 API 호출해 자동 발송 (카카오 API 키·보안 필요)
- **Option C**: 카카오톡 봇 알림 — 선착순 10명에게 카톡 봇으로 선물 유도 링크 발송

**선택 근거**: 카카오 API 별도 검토 필요 → Phase 1 수동으로 시작, Phase 2 자동화 검토

**타임라인**: Phase 1 수동 / Phase 2+ 자동화 검토

---

### #9: 다국어 지원 (i18n)

**현황**: 미션명·설명·라벨을 next-intl 키로 분리 필요

**액션 아이템**:
- `src/messages/ko.json` 추가:
  ```json
  {
    "event": {
      "title": "Pi 요원 육성 이벤트",
      "mission_m1": "계정 통합",
      "mission_m1_desc": "두 세계를 연결하는 기술",
      "reward_gift": "카카오 선물",
      "reward_whitelist": "화이트리스트 등록",
      ...
    }
  }
  ```
- 향후 locale 번역: i18n_message DB upsert

**타임라인**: Phase 2

---

## 최종 요약

본 PRD는 **Pi 요원 육성 이벤트 시스템**의 기획 문서입니다. (v2.0 — 행위-이벤트 분리 아키텍처)

### v2.0 핵심: 무코드 확장 가능한 아키텍처

**3계층 구조**:
1. **Layer 1: 행위 원천** (`evt_action_log`) — API 내부에서 `recordUserAction(action_cd)` 1줄 추가만으로 모든 행위 기록
2. **Layer 2: 이벤트·미션 정의** (`evt_event`, `evt_mission`) — 데이터 기반 미션 설정. 신규 이벤트 = DB 행 추가만으로 수용
3. **Layer 3: 미션 평가** (`evt_user_mission`, `evaluateUserMissions()`) — 자동 평가 엔진이 evt_mission 정의를 읽고 사용자의 action_log와 매칭

**신규 이벤트 추가 방식**:
```sql
INSERT INTO evt_event (...) VALUES (...);  -- 이벤트 정의
INSERT INTO evt_mission (...) VALUES (...); -- 미션 정의 (기존 action_cd 조합)
-- 코드 변경 0. 이미 정의된 모든 이벤트가 자동으로 감시.
```

---

### 첫 이벤트: 10미션 (v1.0에서 정정)

1. **M1**: 계정 통합 — `ACCOUNT_LINK` + `GOOGLE_LINK` (MULTI_AND)
2. **M2**: 프로필 완성 — `PROFILE_UPDATE` (SINGLE)
3. **M3**: PREMIUM 카페 + 자동번역 — `PREMIUM_CAFE_CREATE` + `CAFE_TRANSLATE_USE` (MULTI_AND)
4. **M4**: Pi Bet 생성 + 분배 — `PIBET_CREATE` + `PIBET_ENTRY` (MULTI_AND)
5. **M5**: Bean 전송 — `BEAN_SEND` (SINGLE)
6. **M6**: 채팅 멀티 기능 — **`VOICE_JOIN` OR `FILE_SEND` OR `STICKER_USE`** (MULTI_OR — 3종 중 1개)
7. **M7**: 판매자 거래 취소 — `SELLER_CANCEL` (SINGLE)
8. **M8**: 구매자 거래 취소 — `BUYER_CANCEL` (SINGLE)
9. **M9**: 보증금 + 위치동의 — `BOND_DEPOSIT` + `LBS_CONSENT` (MULTI_AND)
10. **M10**: 보증금 활성 취소 수수료 경험 — M9 완료 후, **환불 + FEE 동반** (SEQUENCE, 근거: `src/lib/mps-refund.ts`)

---

### 자동 감지 방식

- **실시간**: 각 API에서 `recordUserAction()` 호출 → `evt_action_log` 기록
- **정기 배치** (5분/자정): `evaluateUserMissions()` 엔진이 활성 이벤트의 모든 미션 재평가 → evt_user_mission 자동 갱신
- **멱등성**: `(event_id, user_id, mission_cd)` UNIQUE 제약으로 중복 기록 방지

---

### 보상 정책

- **전원**: 뱃지 + 등급(신입~마스터) + 화이트리스트(10/10 완료)
- **선착순 10명**: 카카오 선물하기 (`https://gift.kakao.com/product/11105359`)
  - 발송: M2의 카카오톡 ID 기반
  - 운영: 수동 (관리자 화면에서 [발송] 클릭)
  
---

### 핵심 개선점 (v1.0 → v2.0)

| 항목 | v1.0 | v2.0 |
|------|------|------|
| 미션 기록 방식 | API마다 `recordUserMission('M1', ...)` 직접 호출 | 추상화된 `recordUserAction(action_cd)` 1줄 |
| 신규 이벤트 추가 | 새 미션 로직 작성 + 코드 배포 필수 | DB 행 추가만으로 수용 |
| M6 완료 조건 | "3종 모두" | **"3종 중 1개 이상"** (MULTI_OR) |
| M10 완료 판정 | 시간 비교 (M9 후) | **환불+FEE 동반 감지** (수수료 실제 경험) |
| 이벤트 스코핑 | 단일 고정 | **이벤트별 독립 관리** (event_id FK) |

---

### 추가 확인 필요

- [ ] M6, M10 정정 사항 최종 검증 (완료)
- [ ] Tie-break 규칙 (동점 시 complete_dtm 오름차순)
- [ ] 선착순 기준 — 아나킨님 최종 확정 대기
- [ ] 카카오 선물 자동화 여부 (Phase 2+)

