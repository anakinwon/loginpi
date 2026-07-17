# PRD_10_GPS.md — Cafe.pi 위치기반서비스(LBS) v1.3

> **작성일**: 2026-06-12 (최종 수정: 2026-07-17)
> **버전**: v1.3
> **상태**: 운영 반영
> **작성자**: lbs-consulting-architect 에이전트 (검토: anakin)
> **관련 문서**: PRD_8_MPS.md (마켓플레이스), PRD_GPS.md (LBS v1.0 기반)

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| v1.3 | 2026-07-17 | **매장 거리 표시 3층 구조 + 동의 게이트 401 원칙** — Rule LBS-05 신규(지도 인포윈도우 📍·매장 인증 등록 다이얼로그 실시간 거리 배지·제출 좌표 최신 GPS, 100m 현장 인증 사전 안내). Rule LBS-01 보강(401=미동의 확정 아님 — Pi 자동인증 레이스 오판 금지·실패 무피드백 금지, 사고 2c2a7748 반영). 운영 배포·실기기 검증 완료 | 아소카 |
| v1.2 | 2026-06-12 | **직거래 비즈니스 맥락 반영** — MPS 직거래 전용 모델에서 거리 = 구매 가능성 판단 핵심 데이터로 명시. Rule LBS-04 비즈니스 근거 강화, US-LBS-08 신규 (반경 필터), 섹션 9 기본 거리순 정렬 추가 | lbs-consulting-architect |
| v1.1 | 2026-06-12 | PRD_GPS.md 기반 — **Rule LBS-04 신규 추가** (상품목록 나와의 거리 표시) | lbs-consulting-architect |
| v1.0 | 2026-06-12 | 최초 작성 (PRD_GPS.md) | lbs-consulting-architect |

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [핵심 비즈니스 규칙](#2-핵심-비즈니스-규칙--최우선)
3. [위치 유형 정의](#3-위치-유형-정의)
4. [사용자 스토리](#4-사용자-스토리)
5. [DB 스키마 설계](#5-db-스키마-설계)
6. [API 엔드포인트 목록](#6-api-엔드포인트-목록)
7. [동의 플로우](#7-동의-플로우)
8. [위치 수집 트리거 통합 포인트](#8-위치-수집-트리거-통합-포인트)
9. [위치기반 서비스 기능 명세](#9-위치기반-서비스-기능-명세-동의자-전용-ui)
10. [Google Maps 연동](#10-google-maps-연동)
11. [Pi Browser 특수 처리](#11-pi-browser-특수-처리)
12. [법적 요건 체크리스트](#12-법적-요건-체크리스트)
13. [마이그레이션 계획](#13-마이그레이션-계획)
14. [미결 사항](#14-미결-사항-open-issues)

---

## 1. 프로젝트 개요

### 배경

- `mps_shop` 테이블에 이미 `lat`, `lng`, `place_id` 컬럼이 존재 → Google Maps 기반 위치 저장 인프라 부분 준비됨
- PRD_8_MPS.md §1-4에서 "Google Maps 기반 매장 위치 정확도 확보" 가치 명시
- 현재 위치 수집·저장 코드는 미구현 → 이 PRD에서 근거 규칙 및 API 설계

> **⚠️ 직거래 전용 비즈니스 맥락 (핵심)**
>
> MPS는 **직거래 전용** 마켓플레이스입니다 (PRD_8_MPS.md §1-5 "배송 기능 없음 — 구매자·판매자가 직접 만나 거래").
>
> 이 제약에 따라 **"나와의 거리"는 단순한 부가 정보가 아닌 구매 가능 여부를 결정하는 핵심 데이터**입니다.
>
> | 거리 예시 | 직거래 가능성 |
> |----------|------------|
> | 1~5km | 도보/자전거 가능 — 즉시 거래 의향 높음 |
> | 5~20km | 차량 이동 — 선택적 거래 의향 |
> | 20km 이상 | 일반적으로 거래 성사 어려움 |
>
> 따라서 상품 목록에서 거리를 표시하고 거리 기반 필터/정렬을 제공하는 것은 **거래 성사율 향상에 직결**됩니다.

### 목적

위치 기반 채팅방·상품·매장 탐색을 통해 오프라인 Pi 커뮤니티 활성화:
- **주변 채팅방 탐색**: 사용자 현재 위치 기반 동일 도시/지역 채팅방 추천
- **주변 상품/매장 탐색**: 반경 1km/5km/10km 내 등록된 상품 및 오프라인 매장 표시
- **상품목록 거리 표시**: MPS 상품 목록에서 사용자의 현재 위치로부터 각 상품까지의 거리 동적 표시
- **개인정보 보호**: 동의 기반 위치 수집 + 철회 시 즉시 파기 → 한국 위치정보법 준수

### 현재 범위 제한

- **포함**: 위치 수집(GPS/주소 입력)·저장·조회·삭제·거리 계산
- **제외**: 지도 UI 렌더링 (Phase 2)
- **법적 근거**: `docs/law/agreement/위치기반서비스이용약관및위치정보수집이용동의서_kor.md`

---

## 2. 핵심 비즈니스 규칙 ⚠️ 최우선

### Rule LBS-01 — 동의 게이트 (UI 노출 제어)

```
sys_user.lbs_consent_yn = 'Y'  →  위치기반 서비스 UI 노출
sys_user.lbs_consent_yn ≠ 'Y'  →  위치기반 서비스 UI 완전 숨김
```

**숨겨지는 UI 목록:**
- 채팅방 목록의 "[주변 채팅방]" 탭
- MPS 상품 검색의 "[주변 상품]" 필터
- MPS 매장의 "[지도 보기]" 버튼
- 프로필 페이지의 "[가입 지역]" 표시
- **상품 카드의 거리 표시** (신규 — LBS-04)

**클라이언트 구현:**
```tsx
// 동의자만 해당 UI 렌더
{user?.lbs_consent_yn === 'Y' && (
  <Tab value="nearby">주변 채팅방</Tab>
)}

// 상품 카드 거리 표시 (동의자만)
{user?.lbs_consent_yn === 'Y' && item.distance_km && (
  <div className="text-sm text-gray-600">📍 {formatDistance(item.distance_km)}</div>
)}
```

**⚠️ 동의 상태 조회 401 오판 금지 (v1.3 — 2026-07-17 사고 2c2a7748 반영):**

Pi Browser 인증은 비동기(SDK authenticate → 토큰 localStorage)라서, 마운트 직후의
동의 상태 조회(`GET /api/location/consent`)는 인증 완료 전 레이스로 401이 날 수 있다.

```
401·네트워크 오류  →  "아직 모름" — 판단 보류 (기존 상태·낙관 캐시 유지)
정상 200 응답      →  이 값만 동의 상태 정본으로 반영 (캐시 갱신·삭제)
```

- 401을 "미동의 확정"으로 처리하고 동의 캐시(localStorage)를 삭제하면, **이미 동의한
  사용자에게 동의 게이트가 오뜬다** (실사고: 동의자에게 게이트 노출 + 동의 POST도
  같은 401로 실패하는데 무피드백 → "죽은 버튼" 체감)
- 동의 POST 실패 경로는 **반드시 토스트 노출** (`useApiErrorMessage` — AUTH_REQUIRED는
  "로그인이 필요합니다"로 해석, 폴백 `lbs.consentFail`)

---

### Rule LBS-02 — 자동 저장 게이트

```
lbs_consent_yn = 'Y'  →  4가지 트리거(로그인/가입/상품등록/매장등록) 모두 위치 자동 저장
lbs_consent_yn ≠ 'Y'  →  어떤 트리거도 저장 안 함 + API 레벨에서 403 반환
```

**서버 검증 로직:**
```typescript
// POST /api/location/save
const user = await getSessionUser()
if (user?.lbs_consent_yn !== 'Y') {
  return NextResponse.json({ error: '위치 서비스 미동의' }, { status: 403 })
}
```

---

### Rule LBS-03 — 철회 처리 (즉시 파기 의무)

```
동의 철회 시:
  1. sys_user.lbs_consent_yn = 'N', lbs_consent_dtm 갱신
  2. usr_loc_hist에서 user_id 해당 레코드 모두: del_yn = 'Y', del_dtm = NOW()
  3. 위치정보법 확인자료(6개월 보관)는 sys_user_consent 테이블에서 del_yn='N' 유지
```

**서버 구현 (트랜잭션):**
```typescript
// DELETE /api/location/consent
await supabase.from('sys_user').update({
  lbs_consent_yn: 'N',
  lbs_consent_dtm: new Date().toISOString()
}).eq('user_id', userId)

await supabase.from('usr_loc_hist').update({
  del_yn: 'Y',
  del_dtm: new Date().toISOString()
}).eq('user_id', userId)
```

---

### Rule LBS-04 — 상품목록 거리 표시 게이트 (신규)

```
lbs_consent_yn = 'Y' AND 상품에 위치 정보 있음  →  상품 카드에 거리 표시 (예: "📍 2.3km")
lbs_consent_yn ≠ 'Y'                            →  거리 정보 완전 숨김 (상품 카드는 정상 표시)
```

**비즈니스 근거 (직거래 전용 모델):**

MPS는 배송이 없는 직거래 플랫폼이므로, 구매자가 판매자를 직접 만날 수 있어야 거래가 성사됩니다.
거리 정보는 "이 상품을 살 수 있는가?"를 즉시 판단하게 해주는 핵심 구매 결정 요소입니다.
구매자가 이동 가능한 거리의 상품을 빠르게 찾도록 돕는 것이 거래 성사율 향상의 핵심입니다.

**원칙:**
- 동의자에게만 MPS 상품 목록에서 각 상품까지의 거리 표시
- 미동의자는 거리 표시 영역 자체 미노출 (UI 공간 절약, 혼란 방지)
- 위치 정보 없는 상품은 거리 표시 미노출 (동의자라도)
- **동의자 기본 정렬: 거리 가까운 순** (직거래 특성상 가까운 상품이 실제 거래 가능성 높음)

**상품 위치 소스 우선순위:**

| 우선순위 | 소스 | 설명 | 저장 위치 |
|---------|------|------|---------|
| 1순위 | `mps_shop.lat / lng` | 판매자 매장 위치 (등록됨) | mps_shop 테이블 |
| 2순위 | `usr_loc_hist.loc_tp_cd='04'` | 상품 등록 시점의 판매자 GPS 위치 (최신 1건) | usr_loc_hist 테이블 |
| 없음 | null | 위치 정보 없는 상품 | 거리 표시 없음 |

**사용자 현재 위치 소스 우선순위:**

| 우선순위 | 소스 | 설명 | 정확도 |
|---------|------|------|--------|
| 1순위 | `navigator.geolocation` (실시간) | 현재 GPS 위치 | 최고 |
| 2순위 | `usr_loc_hist` 최신 로그인 위치 (loc_tp_cd='02') | 마지막 저장 위치 | 중간 |
| 3순위 | 표시 안 함 | 위치 소스 없을 때 | 표시 불가 |

---

### Rule LBS-05 — 매장 거리 표시 3층 구조 + 100m 현장 인증 안내 (v1.3 신규 — 2026-07-17 운영 배포)

**배경:** 매장 인증 등록(`POST /api/store/shops/claim`)은 사용자 GPS ↔ 구글 권위 좌표
**≤ 100m**(`CLAIM_RADIUS_M`) 현장 검증을 서버가 강제한다. 거리를 미리 보여주지 않으면
사용자가 폼을 다 채운 뒤에야 거절(`STORE_CLAIM_TOO_FAR`)을 만난다.

**3층 구조 (커밋 342808d6·20a68cef):**

| 층 | 위치 | 거리 소스 | 갱신 |
|----|------|----------|------|
| ① 지도 인포윈도우 | 모든 매장 마커(등록 매장 + **구글 검색 매장**) 📍 표시 | 등록 매장=API `distance_km` / 구글 매장=클라이언트 haversine 직접 계산(Places API는 거리 미제공) | 지도 로딩 시점 스냅샷 |
| ② 등록 다이얼로그 배지 | `ShopClaimDialog` 상단 — 100m 이내=초록 "등록 가능" / 초과=빨강 안내 | `watchPosition` 실시간 추적 (매장 접근 시 거리 감소가 보임) | 실시간 |
| ③ 제출 좌표 | claim POST의 `user_lat/lng` | ②와 동일한 최신 GPS (부모 위치는 최대 7일 localStorage 캐시라 stale 제출 방지) | 제출 시점 최신 |

**원칙:**
- 표시 거리와 서버 검증 좌표는 **같은 소스** — "화면엔 80m인데 서버는 거절" 모순 금지
- 클라이언트는 100m 초과여도 **제출을 하드 차단하지 않음** (GPS 오차 감안, 안내만) —
  최종 판정은 서버(`CLAIM_RADIUS_M`, 구글 권위 좌표 대조)가 강제
- 클라이언트 `CLAIM_RADIUS_M` 상수는 서버 정본(claim route)과 수동 동기 (변경 시 양쪽)
- `ClaimTarget`에 매장 `lat`/`lng` 전달 필수 (없으면 배지 생략)
- haversine 공식은 서버 route·다이얼로그·지도·목록에 **의도적 파일별 중복** (독립 배포 단위)
- 거리 포맷 공통: `<1km` → `NNNm` / `≥1km` → `N.Nkm` 1자리 (`formatDistKm`)

---

## 3. 위치 유형 정의

| loc_tp_cd | 유형 | 수집 트리거 | 수집 방법 | 보유 기간 | 비고 |
|-----------|------|------------|----------|----------|------|
| 01 | 가입 위치 | 회원가입 완료 시 1회만 | GPS 자동 또는 주소 입력 | 1년 | 오프라인 커뮤니티 입지 파악 |
| 02 | 로그인 위치 | 로그인 이벤트 (touchLastLogin 연동) | GPS 자동 → IP 폴백 | 90일 | 5분 스로틀 적용 |
| 03 | 오프라인 매장 위치 | MPS 매장 등록 시점 | GPS 또는 주소 입력 → Geocoding → mps_shop 저장 | 무제한 | mps_shop 테이블 재활용 (이중 저장 금지) |
| 04 | 상품 거래 위치 | MPS 상품 등록 완료 시점 | GPS 자동 또는 주소 입력 | 상품 삭제 시까지 | usr_loc_hist.ref_id = mps_item.item_id |

---

## 4. 사용자 스토리

### US-LBS-01: 동의 사용자 — 로그인 시 자동 위치 기록

**액터:** 위치 서비스 동의한 사용자  
**흐름:**
1. 사용자가 Pi/Google 계정으로 로그인
2. 로그인 완료 후 클라이언트에서 `navigator.geolocation.getCurrentPosition()` 호출
3. 서버에 `POST /api/location/save { locTpCd: '02', lat, lng }` 전송
4. usr_loc_hist에 로그인 위치 기록 (5분 스로틀 적용)

**결과:** 마이페이지 → 위치 이력에서 로그인 위치 확인 가능

---

### US-LBS-02: 미동의 사용자 — 위치 기반 UI 미노출, 기존 기능 정상

**액터:** 위치 서비스 미동의 또는 동의 철회한 사용자  
**흐름:**
1. 사용자가 앱에 접속 (lbs_consent_yn ≠ 'Y')
2. "[주변 채팅방]" 탭, "[주변 상품]" 필터 등 위치 UI 완전히 숨김
3. 채팅방 목록 "[전체]" 탭은 정상 작동
4. 기존 MPS 기능(카테고리/테마 검색) 정상 작동
5. 상품 목록에서 거리 정보 미표시

**결과:** 위치 미동의가 서비스 이용을 방해하지 않음

---

### US-LBS-03: 동의 사용자 — 주변 반경 채팅방 탐색

**액터:** 위치 서비스 동의한 사용자  
**흐름:**
1. 채팅 페이지 → "[주변 채팅방]" 탭 진입
2. 반경 선택 UI: 1km / 5km / 10km 버튼
3. 사용자 현재 위치로부터 선택 반경 내 채팅방 표시
4. 각 채팅방: 방 이름, 거리(예: "2.3km"), 행정구역(동 단위)

**결과:** 사용자가 현재 위치 근처 오프라인 모임 채팅방 발견 및 참여

---

### US-LBS-04: 동의 사용자 — 주변 MPS 상품/매장 탐색

**액터:** 위치 서비스 동의한 사용자  
**흐름:**
1. MPS 상품 검색 페이지 → "[주변 상품]" 필터 활성화
2. 반경 선택 (1km/5km/10km)
3. 매장 지도 페이지 → "[지도 보기]" 클릭하면 Maps JavaScript API로 매장 위치 표시
4. 거리 및 행정구역 정보 표시 (정밀 좌표 미노출)

**결과:** 사용자가 주변 상품 및 오프라인 매장 발견 → 거래 활성화

---

### US-LBS-05: 동의 사용자 — 동의 철회 시 즉시 데이터 파기

**액터:** 위치 서비스 동의 철회하는 사용자  
**흐름:**
1. 마이페이지 → 설정 → "[위치 서비스]" 토글 OFF
2. 또는 마이페이지 → "[동의 관리]" → "[위치 서비스]" 철회 버튼
3. DELETE /api/location/consent 호출
4. 즉시 usr_loc_hist.del_yn='Y', del_dtm=NOW() 처리
5. 위치 UI 즉시 숨김

**결과:** 철회 직후 위치 데이터 삭제 및 UI 제거 완료

---

### US-LBS-06: 동의 사용자 — 내 위치 이력 열람 (정보주체 권리)

**액터:** 위치 서비스 동의한 사용자  
**흐름:**
1. 마이페이지 → 설정 → "[내 위치 이력]" 클릭
2. GET /api/location/history 호출
3. 자신의 모든 위치 기록 조회:
   - 기록 날짜/시간
   - 위치 유형 (가입/로그인/매장/상품)
   - 주소 및 행정구역
   - 관련 채팅방/상품/매장 정보

**결과:** 사용자가 위치정보법 제16조 정보주체 권리(이력 열람) 행사

---

### US-LBS-07: 동의 사용자 — MPS 상품 목록에서 나와의 거리 확인 (신규)

**액터:** 위치 서비스 동의한 사용자  
**맥락:** MPS는 직거래 전용이므로 구매자가 판매자를 직접 만나야 거래 성사. 거리 = 거래 가능성 판단 기준.

**흐름:**
1. MPS 상품 검색/카테고리 페이지 진입
2. 상품 목록 렌더링 시 현재 위치 자동 수집 (1순위: GPS, 2순위: 최신 로그인 위치)
3. 각 상품 카드에 거리 표시:
   - 예: "📍 2.3km" (판매자 매장 1순위, 상품 등록 위치 2순위)
4. 기본 정렬: 거리 가까운 순 (직거래 가능성 높은 상품 우선)
5. 위치 정보 없는 상품은 거리 표시 없이 목록 하단 배치

**결과:** 구매자가 직거래 가능한 거리의 상품을 즉시 식별하여 거래 성사율 향상

---

### US-LBS-08: 동의 사용자 — 반경 N km 직거래 가능 상품만 필터 (신규)

**액터:** 위치 서비스 동의한 사용자  
**맥락:** 이동 가능 거리는 사용자마다 다름. 내가 갈 수 있는 범위의 상품만 보는 필터 필요.

**흐름:**
1. MPS 상품 목록 상단 반경 필터 선택: `[1km] [5km] [10km] [30km] [전체]`
2. 선택 반경 저장 (localStorage) → 다음 방문 시 유지
3. `GET /api/store/items?lat=...&lng=...&radius=5` 재조회
4. 해당 반경 밖 상품 제외 (distance_km > radius 필터링)
5. 결과 없을 때: "현재 위치에서 {N}km 내 상품이 없습니다. 반경을 늘려보세요." 안내

**결과:** 실제 이동 가능한 거리의 상품만 탐색 → 불필요한 상품 열람 방지

---

## 5. DB 스키마 설계

### 마이그레이션 파일

**파일**: `sql/030_lbs.sql` (현재 029까지 진행됨)

### 5-1. sys_user 컬럼 추가

동의 상태 빠른 조회 캐시:

```sql
ALTER TABLE sys_user
  ADD COLUMN lbs_consent_yn   CHAR(1)     DEFAULT 'N',
  ADD COLUMN lbs_consent_dtm  TIMESTAMPTZ,
  ADD COLUMN lbs_consent_ver  TEXT;       -- 약관 버전 (e.g. 'v1.0')
```

**설명:**
- `lbs_consent_yn`: 'Y' | 'N' — Rule LBS-01, Rule LBS-02 게이트 판정 기준
- `lbs_consent_dtm`: 동의 일시 (철회 시에도 갱신)
- `lbs_consent_ver`: 동의한 약관 버전 (향후 약관 개정 시 버전 관리)

### 5-2. sys_user_consent 신규 테이블

동의 유형별 이력 관리 및 6개월 확인자료 보관:

```sql
CREATE TABLE sys_user_consent (
  consent_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  consent_tp_cd   CHAR(10)    NOT NULL,   -- 'LBS' | 'MKT' | 'PUSH' (확장 가능)
  consent_yn      CHAR(1)     NOT NULL,   -- 'Y' | 'N'
  consent_ver     TEXT,                   -- 약관 버전
  regr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn          CHAR(1)     DEFAULT 'N',
  del_dtm         TIMESTAMPTZ
);

CREATE INDEX idx_sys_user_consent_user 
  ON sys_user_consent(user_id, consent_tp_cd);

COMMENT ON TABLE sys_user_consent 
  IS '사용자 동의 이력 — 6개월 보관 의무 (위치정보법 제16조)';
COMMENT ON COLUMN sys_user_consent.consent_tp_cd 
  IS '동의 유형 코드: LBS(위치), MKT(마케팅), PUSH(알림)';
```

**설명:**
- 동의 철회 후에도 del_yn='N' 상태로 6개월 유지 → 위치정보법 제16조 2항 준수
- 향후 마케팅/알림 동의도 동일 테이블에서 관리

### 5-3. usr_loc_hist 신규 테이블

위치 수집 이력 (4가지 트리거별 저장):

```sql
CREATE TABLE usr_loc_hist (
  loc_hist_id   UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID            NOT NULL,
  loc_tp_cd     CHAR(2)         NOT NULL,         -- '01'|'02'|'03'|'04'
  lat           DECIMAL(10,8)   NOT NULL,          -- WGS84 위도 (-90~90)
  lng           DECIMAL(11,8)   NOT NULL,          -- WGS84 경도 (-180~180)
  full_addr     TEXT,                              -- 전체 주소 (예: "서울시 강남구 역삼동 45번지")
  sido_nm       TEXT,                              -- 시·도 (예: "서울특별시")
  sigungu_nm    TEXT,                              -- 시·군·구 (예: "강남구")
  dong_nm       TEXT,                              -- 읍·면·동 (예: "역삼동")
  place_id      TEXT,                              -- Google place_id
  ref_id        TEXT,                              -- 참조 ID (mps_item.item_id 또는 mps_shop.shop_id)
  consent_yn    CHAR(1)         NOT NULL DEFAULT 'Y',
  consent_dtm   TIMESTAMPTZ,                       -- 수집 시점의 동의 여부
  regr_id       TEXT            NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT            NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn        CHAR(1)         DEFAULT 'N',
  del_dtm       TIMESTAMPTZ
);

CREATE INDEX idx_usr_loc_hist_user 
  ON usr_loc_hist(user_id, loc_tp_cd);

CREATE INDEX idx_usr_loc_hist_latng 
  ON usr_loc_hist(lat, lng);

CREATE INDEX idx_usr_loc_hist_ref 
  ON usr_loc_hist(ref_id);

COMMENT ON TABLE usr_loc_hist 
  IS '사용자 위치 수집 이력 — loc_tp_cd별 4가지 트리거로 기록';
COMMENT ON COLUMN usr_loc_hist.loc_tp_cd 
  IS '위치 유형: 01(가입), 02(로그인), 03(매장), 04(상품)';
COMMENT ON COLUMN usr_loc_hist.lat 
  IS 'WGS84 위도 — DECIMAL(10,8) 정밀도';
COMMENT ON COLUMN usr_loc_hist.lng 
  IS 'WGS84 경도 — DECIMAL(11,8) 정밀도';
COMMENT ON COLUMN usr_loc_hist.ref_id 
  IS '참조 ID — 상품 등록 시 mps_item.item_id, 매장은 mps_shop 재활용';
```

**설명:**
- `lat`, `lng`: WGS84 (EPSG:4326) — Google Maps API 표준
- `full_addr`: Reverse Geocoding 결과 저장
- `ref_id`: 상품/매장 거래 추적 (예: mps_item.item_id)
- 매장 위치는 mps_shop 테이블 직접 활용 (이중 저장 금지 → Rule LBS-03의 설계 결정)
- 논리삭제 적용 (del_yn='Y' 처리)

### 5-4. mps_shop 기존 컬럼 활용

**현황:** mps_shop 테이블에 이미 `lat`, `lng`, `place_id` 컬럼 존재

**설계 결정:** 매장 위치(loc_tp_cd='03')는 usr_loc_hist에 이중 저장하지 않고 mps_shop 직접 활용
- **이유**: 데이터 중복 제거 + 매장 수정 시 위치 일관성 유지
- **조회**: `/api/location/nearby/shops` → mps_shop.lat/lng + 반경 필터링
- **상품 거리 계산**: mps_item JOIN mps_shop 또는 usr_loc_hist(loc_tp_cd='04')에서 위치 조회

### 5-5. 상품 목록 거리 계산 조회 패턴 (신규)

**상품 위치 소스 우선순위 SQL:**

```sql
-- 상품별 위치 소스 조회 (1순위: mps_shop, 2순위: usr_loc_hist loc_tp_cd='04')
SELECT
  i.item_id,
  i.item_nm,
  i.price,
  COALESCE(s.lat, l.lat) AS item_lat,
  COALESCE(s.lng, l.lng) AS item_lng
FROM mps_item i
LEFT JOIN mps_shop s ON i.shop_id = s.shop_id AND s.del_yn = 'N'
LEFT JOIN (
  SELECT 
    ref_id, 
    lat, 
    lng,
    ROW_NUMBER() OVER (PARTITION BY ref_id ORDER BY reg_dtm DESC) AS rn
  FROM usr_loc_hist
  WHERE loc_tp_cd = '04' AND del_yn = 'N'
) l ON l.ref_id = i.item_id AND l.rn = 1
WHERE i.del_yn = 'N'
  AND (s.lat IS NOT NULL OR l.lat IS NOT NULL);  -- 위치 있는 상품만
```

### 5-6. TypeScript 타입 업데이트

`src/lib/users.ts` 또는 `src/types/user.ts`:

```typescript
interface UserRow {
  // ... 기존 필드 ...
  user_id: string
  email: string
  // ... 이하 생략 ...
  
  // LBS 필드 추가
  lbs_consent_yn: string | null   // 'Y' | 'N'
  lbs_consent_dtm: string | null  // ISO 8601 datetime
  lbs_consent_ver: string | null  // 약관 버전
}

interface LocationHistory {
  loc_hist_id: string
  user_id: string
  loc_tp_cd: '01' | '02' | '03' | '04'
  lat: number
  lng: number
  full_addr: string | null
  sido_nm: string | null
  sigungu_nm: string | null
  dong_nm: string | null
  place_id: string | null
  ref_id: string | null
  consent_yn: string
  consent_dtm: string | null
  reg_dtm: string
  del_yn: string
}

// 신규: 거리 표시를 위한 상품 타입
interface MpsItemWithDistance {
  item_id: string
  item_nm: string
  price: number
  seller_nm: string
  distance_km: number | null      // 동의자 + 위치 있을 때만 값
  item_lat?: number               // 내부용 (클라이언트 미노출)
  item_lng?: number               // 내부용 (클라이언트 미노출)
  dong_nm?: string | null         // 행정구역 (동의자만 표시)
}
```

---

## 6. API 엔드포인트 목록

### 6-1. 동의 관리

#### GET /api/location/consent
사용자의 현재 동의 상태 조회

**인증**: 필요 (getSessionUser)  
**동의 필수**: 아니오  

**응답**:
```typescript
const GetConsentResponseSchema = z.object({
  lbs_consent_yn: z.enum(['Y', 'N']),
  lbs_consent_dtm: z.string().datetime().nullable(),
  lbs_consent_ver: z.string().nullable(),
})
```

---

#### POST /api/location/consent
위치 서비스 동의 등록 또는 갱신

**인증**: 필요 (getSessionUser)  
**동의 필수**: 아니오  

**요청**:
```typescript
const CreateConsentSchema = z.object({
  lbs_consent_yn: z.enum(['Y', 'N']),
  lbs_consent_ver: z.string(), // e.g. 'v1.0'
})
```

**응답**:
```typescript
const CreateConsentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})
```

**처리 로직**:
- sys_user.lbs_consent_yn, lbs_consent_dtm, lbs_consent_ver 갱신
- sys_user_consent 테이블에 이력 기록

---

#### DELETE /api/location/consent
위치 서비스 동의 철회 + 위치 데이터 논리삭제 (Rule LBS-03)

**인증**: 필요 (getSessionUser)  
**동의 필수**: 아니오  

**응답**:
```typescript
const DeleteConsentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  deleted_count: z.number(),
})
```

**처리 로직** (트랜잭션):
1. sys_user.lbs_consent_yn = 'N', lbs_consent_dtm = NOW()
2. usr_loc_hist에서 user_id 전체 레코드: del_yn = 'Y', del_dtm = NOW()
3. sys_user_consent에 동의 철회 이력 기록 (del_yn='N' 유지 — 6개월 보관)

---

### 6-2. 위치 수집

#### POST /api/location/save
위치 저장 (4가지 트리거: 가입/로그인/상품/매장)

**인증**: 필요 (getSessionUser)  
**동의 필수**: 예 (lbs_consent_yn='Y' → 아니면 403)  

**요청**:
```typescript
const SaveLocationSchema = z.object({
  loc_tp_cd: z.enum(['01', '02', '03', '04']),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  full_addr: z.string().optional(),
  ref_id: z.string().uuid().optional(),
})
```

**응답**:
```typescript
const SaveLocationResponseSchema = z.object({
  success: z.boolean(),
  loc_hist_id: z.string().uuid(),
  message: z.string(),
})
```

**처리 로직**:
- Reverse Geocoding (좌표→주소) → sido_nm, sigungu_nm, dong_nm 분해
- usr_loc_hist 레코드 생성
- loc_tp_cd='02' (로그인)일 경우 5분 스로틀 적용 (마지막 기록으로부터 5분 경과 필요)

---

### 6-3. 위치 이력 조회

#### GET /api/location/history
사용자의 모든 위치 기록 조회 (정보주체 권리 — US-LBS-06)

**인증**: 필요 (getSessionUser)  
**동의 필수**: 예 (lbs_consent_yn='Y' → 아니면 403)  

**쿼리 파라미터**:
```typescript
const HistoryQuerySchema = z.object({
  loc_tp_cd: z.enum(['01', '02', '03', '04']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})
```

**응답**:
```typescript
const HistoryResponseSchema = z.object({
  total: z.number(),
  records: z.array(z.object({
    loc_hist_id: z.string().uuid(),
    loc_tp_cd: z.enum(['01', '02', '03', '04']),
    lat: z.number(),
    lng: z.number(),
    full_addr: z.string().nullable(),
    dong_nm: z.string().nullable(),
    reg_dtm: z.string().datetime(),
  })),
})
```

---

### 6-4. 근처 채팅방 탐색

#### GET /api/location/nearby/rooms
주변 채팅방 탐색 (반경 필터링)

**인증**: 필요 (getSessionUser)  
**동의 필수**: 예  

**쿼리 파라미터**:
```typescript
const NearbyRoomsQuerySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().min(0.5).max(50).default(5), // km
  limit: z.number().int().min(1).max(100).default(20),
})
```

**응답**:
```typescript
const NearbyRoomsResponseSchema = z.object({
  total: z.number(),
  records: z.array(z.object({
    room_id: z.string().uuid(),
    room_nm: z.string(),
    lat: z.number(),
    lng: z.number(),
    distance_km: z.number(),
    dong_nm: z.string(),
    member_count: z.number(),
  })),
})
```

**처리 로직**:
- Haversine formula로 거리 계산 (PostGIS 미사용)
- 반경 내 채팅방 필터링
- 정밀 좌표 미노출 (dong_nm만 표시)

---

### 6-5. 근처 MPS 매장 탐색

#### GET /api/location/nearby/shops
주변 매장 탐색

**인증**: 필요 (getSessionUser)  
**동의 필수**: 예  

**쿼리 파라미터**:
```typescript
const NearbyShopsQuerySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().min(0.5).max(50).default(5),
  limit: z.number().int().min(1).max(50).default(20),
})
```

**응답**:
```typescript
const NearbyShopsResponseSchema = z.object({
  total: z.number(),
  records: z.array(z.object({
    shop_id: z.string().uuid(),
    shop_nm: z.string(),
    lat: z.number(),
    lng: z.number(),
    place_id: z.string(),
    distance_km: z.number(),
    dong_nm: z.string(),
    item_count: z.number(),
  })),
})
```

---

### 6-6. 근처 MPS 상품 탐색

#### GET /api/location/nearby/items
주변 상품 탐색

**인증**: 필요 (getSessionUser)  
**동의 필수**: 예  

**쿼리 파라미터**:
```typescript
const NearbyItemsQuerySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().min(0.5).max(50).default(5),
  limit: z.number().int().min(1).max(50).default(20),
})
```

**응답**:
```typescript
const NearbyItemsResponseSchema = z.object({
  total: z.number(),
  records: z.array(z.object({
    item_id: z.string().uuid(),
    item_nm: z.string(),
    lat: z.number(),
    lng: z.number(),
    distance_km: z.number(),
    dong_nm: z.string(),
    price: z.number(),
    seller_nm: z.string(),
  })),
})
```

---

### 6-7. 상품목록 거리 포함 조회 (기존 API 확장)

#### GET /api/store/items?lat=37.5665&lng=126.9780&radius=10

MPS 상품 목록 조회 API 기존 엔드포인트에 **파라미터 추가** (신규 — LBS-04)

**인증**: 필요 (getSessionUser)  
**동의 필수**: 아니오 (동의자만 파라미터 전송)  

**기존 쿼리 파라미터 + 신규 추가**:
```typescript
const StoreItemsQuerySchema = z.object({
  // 기존 필드
  category_cd: z.string().optional(),
  theme_cd: z.string().optional(),
  search_text: z.string().optional(),
  sort: z.enum(['recent', 'popular', 'price_asc', 'price_desc']).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  
  // 신규 필드 (LBS-04) — 동의자만 전송
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radius: z.number().min(0.5).max(50).default(10).optional(),  // km
})
```

**응답 필드 신규 추가**:
```typescript
const StoreItemsResponseSchema = z.object({
  total: z.number(),
  records: z.array(z.object({
    // 기존 필드
    item_id: z.string().uuid(),
    item_nm: z.string(),
    price: z.number(),
    seller_nm: z.string(),
    image_url: z.string().nullable(),
    
    // 신규 필드 (LBS-04) — 동의자 + lat/lng 전송했을 때만
    distance_km: z.number().nullable(),
    dong_nm: z.string().nullable(),
  })),
})
```

**처리 로직**:
```sql
-- lat, lng 파라미터 있고 동의자인 경우만 거리 계산
SELECT
  i.*,
  CASE
    WHEN $user_lat IS NOT NULL AND $user_lng IS NOT NULL 
      AND (s.lat IS NOT NULL OR l.lat IS NOT NULL)
    THEN
      ROUND(
        6371 * acos(
          LEAST(1.0, 
            cos(radians($user_lat)) * cos(radians(COALESCE(s.lat, l.lat))) *
            cos(radians(COALESCE(s.lng, l.lng)) - radians($user_lng)) +
            sin(radians($user_lat)) * sin(radians(COALESCE(s.lat, l.lat)))
          )
        )::numeric, 1
      )
    ELSE NULL
  END AS distance_km,
  -- 행정구역은 별도 조회 또는 캐시에서 (정밀도 제한)
  CASE 
    WHEN $user_lbs_consent_yn = 'Y' 
      AND (s.lat IS NOT NULL OR l.lat IS NOT NULL)
    THEN l.dong_nm
    ELSE NULL
  END AS dong_nm
FROM mps_item i
LEFT JOIN mps_shop s ON i.shop_id = s.shop_id AND s.del_yn = 'N'
LEFT JOIN (
  SELECT ref_id, lat, lng, dong_nm,
         ROW_NUMBER() OVER (PARTITION BY ref_id ORDER BY reg_dtm DESC) AS rn
  FROM usr_loc_hist
  WHERE loc_tp_cd = '04' AND del_yn = 'N'
) l ON l.ref_id = i.item_id AND l.rn = 1
WHERE i.del_yn = 'N'
  AND category_cd = $category_cd -- 기존 필터
  -- 거리 필터 (optional)
  AND (
    $user_lat IS NULL
    OR (
      s.lat IS NOT NULL 
      OR l.lat IS NOT NULL
      AND 6371 * acos(...) <= $radius  -- Haversine 거리 <= 반경
    )
  )
ORDER BY distance_km ASC NULLS LAST;  -- 거리순 정렬 (옵션)
```

**응답 포맷 (동의자 vs 미동의자)**:

동의자 (lbs_consent_yn='Y', ?lat, ?lng 전송):
```json
{
  "total": 2,
  "records": [
    {
      "item_id": "uuid-1",
      "item_nm": "iPhone 15 Pro",
      "price": 1500,
      "seller_nm": "홍길동",
      "distance_km": 2.3,
      "dong_nm": "역삼동"
    }
  ]
}
```

미동의자 또는 파라미터 미전송:
```json
{
  "total": 2,
  "records": [
    {
      "item_id": "uuid-1",
      "item_nm": "iPhone 15 Pro",
      "price": 1500,
      "seller_nm": "홍길동",
      "distance_km": null,
      "dong_nm": null
    }
  ]
}
```

---

### 6-8. Geocoding 프록시 (주소→좌표)

#### POST /api/location/geocode
주소를 좌표로 변환 (Google Geocoding API 프록시)

**인증**: 필요 (getSessionUser)  
**동의 필수**: 아니오 (공개 주소 입력)  

**요청**:
```typescript
const GeocodeSchema = z.object({
  address: z.string().min(5),
})
```

**응답**:
```typescript
const GeocodeResponseSchema = z.object({
  success: z.boolean(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  place_id: z.string().optional(),
  full_addr: z.string().optional(),
  sido_nm: z.string().optional(),
  sigungu_nm: z.string().optional(),
  dong_nm: z.string().optional(),
})
```

---

### 6-9. Reverse Geocoding 프록시 (좌표→주소)

#### POST /api/location/reverse-geocode
좌표를 주소로 변환 (Google Reverse Geocoding API 프록시)

**인증**: 필요 (getSessionUser)  
**동의 필수**: 아니오  

**요청**:
```typescript
const ReverseGeocodeSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
```

**응답**:
```typescript
const ReverseGeocodeResponseSchema = z.object({
  success: z.boolean(),
  full_addr: z.string().optional(),
  sido_nm: z.string().optional(),
  sigungu_nm: z.string().optional(),
  dong_nm: z.string().optional(),
  place_id: z.string().optional(),
})
```

---

### 6-10. API 공통 사항

**모든 API 준수**:
- `getSessionUser()` 사용 → 쿠키/X-Pi-Token 헤더 이중 경로 자동 지원
- 클라이언트는 반드시 `piFetch()` 사용 (X-Pi-Token 헤더 자동 첨부)
- Pi Browser WebView 호환: `credentials: 'include'` + X-Pi-Token

**오류 응답**:
```typescript
const ErrorResponseSchema = z.object({
  error: z.string(),
  status: z.number(),
  message: z.string().optional(),
})
```

---

## 7. 동의 플로우

### 동의 진입점 3가지

#### 1. 회원가입 완료 화면
- 회원가입 성공 후 "위치 서비스 안내" 모달/바텀시트 자동 팝업
- 선택 항목 (필수 아님) → 동의 또는 건너뛰기

#### 2. 위치 기반 기능 터치 시
- "[주변 채팅방]" 탭 클릭 시 미동의 상태면 "[위치 서비스 동의 필요]" 바텀시트
- "[주변 상품]" 필터 클릭 시 동일 안내
- "동의하기" 또는 "나중에"

#### 3. 마이페이지 → 설정 → 위치 서비스 관리
- 현재 동의 상태 표시
- 동의/철회 토글

### 동의 UI 흐름

```
┌─────────────────────────────────────────────────────────┐
│          [위치 서비스 안내 화면]                          │
│                                                         │
│ Cafe.pi에서는 주변 채팅방, 상품, 매장을 추천하기 위해  │
│ 정확한 위치 정보가 필요합니다.                          │
│                                                         │
│ ✓ [약관 전문 보기]                                     │
│                                                         │
│ 수집 항목:                                             │
│  • GPS 좌표 (위도, 경도)                               │
│  • 주소 (시·도, 시·군·구, 읍·면·동)                    │
│  • 방문 시간                                           │
│                                                         │
│ 이용 목적: 주변 서비스 추천, 상품 거리 표시           │
│ 보유 기간: 1년 (동의 철회 시 즉시 삭제)               │
│                                                         │
│            [거부]        [동의]                        │
└─────────────────────────────────────────────────────────┘
         │                     │
         │                     └─→ POST /api/location/consent
         │                           lbs_consent_yn = 'Y'
         │                           
         │                     └─→ 즉시 getCurrentPosition()
         │                           POST /api/location/save
         │                           loc_tp_cd = '01' (가입)
         │
         └─→ 화면 닫기
             lbs_consent_yn = 'N' 유지
             위치 UI 미노출

[동의 철회]
  마이페이지 → 설정 → 위치 서비스 [OFF]
       │
       └─→ DELETE /api/location/consent
           sys_user.lbs_consent_yn = 'N'
           usr_loc_hist.del_yn = 'Y' 일괄 처리
           UI 즉시 숨김
```

---

## 8. 위치 수집 트리거 통합 포인트

| 트리거 | 기존 코드 위치 | LBS 연동 방식 |
|--------|----------------|--------------|
| **로그인(Pi)** | `src/app/api/auth/pi/route.ts` + `src/lib/users.ts` touchLastLogin() | touchLastLogin() 호출 후 클라이언트에서 위치 수집 → POST /api/location/save (loc_tp_cd='02', 5분 스로틀) |
| **로그인(Google)** | `src/auth.ts` NextAuth signIn 콜백 | signIn 완료 후 클라이언트 측 useEffect에서 위치 수집 트리거 |
| **회원가입** | `src/app/api/auth/pi/route.ts` upsertPiUser() 후 | 회원가입 200 응답 수신 → 클라이언트 가입 완료 모달 팝업 → "[동의]" 클릭 시 POST /api/location/save (loc_tp_cd='01') |
| **상품 등록** | `src/app/api/store/items/route.ts` POST 완료 | 상품 등록 200 응답 후 클라이언트에서 위치 수집 → POST /api/location/save (loc_tp_cd='04', ref_id=mps_item.item_id) |
| **매장 등록** | `src/app/api/store/shops/route.ts` POST 완료 | 매장 등록 시 주소/GPS 입력 → Geocoding → mps_shop (lat, lng, place_id 직접 저장) — usr_loc_hist에는 이중 저장 금지 |

### 클라이언트 구현 패턴

**동의 확인 후 위치 수집:**

```typescript
// src/hooks/use-collect-location.ts
const collectAndSaveLocation = async (
  locTpCd: '01' | '02' | '03' | '04',
  refId?: string
): Promise<boolean> => {
  const user = await getSessionUser() // 서버 조회
  
  if (user?.lbs_consent_yn !== 'Y') {
    console.log('LBS 미동의 — 위치 수집 스킵')
    return false
  }
  
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      })
    )
    
    const res = await piFetch('/api/location/save', {
      method: 'POST',
      body: JSON.stringify({
        loc_tp_cd: locTpCd,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        ref_id: refId
      })
    })
    
    return res.ok
  } catch (err) {
    // 위치 수집 실패 — 조용히 무시 (서비스 차단 없음)
    console.warn('위치 수집 실패:', err)
    return false
  }
}
```

**로그인 후 위치 수집 트리거:**

```typescript
// src/app/[locale]/chat/page.tsx 또는 layout
useEffect(() => {
  if (user) {
    collectAndSaveLocation('02') // loc_tp_cd='02' 로그인
      .catch(console.warn)
  }
}, [user])
```

---

## 9. 위치기반 서비스 기능 명세 (동의자 전용 UI)

### 기본 원칙

- **UI 가시성**: lbs_consent_yn='Y'인 사용자에게만 노출
- **정밀도 제한**: 정확한 좌표(lat/lng) 미노출 → 행정구역(dong_nm) 단위로만 표시
- **거리 표시**: Haversine formula로 계산 (예: "2.3km")

### 채팅 — 주변 채팅방 탐색

**UI 구성:**
- 탭: [전체 채팅방] [주변 채팅방 ← 동의자만]
- 반경 선택 버튼: 1km / 5km / 10km
- 각 채팅방 카드:
  - 방 이름
  - 거리 (예: "2.3km 떨어짐")
  - 행정구역 (예: "강남구 역삼동")
  - 멤버 수
  - 최신 메시지 미리보기

**API 호출:**
```typescript
GET /api/location/nearby/rooms?lat=37.4979&lng=127.0276&radius=5
```

**반경별 권장:**
- 1km: 초근거리 (같은 건물/이웃)
- 5km: 근처 (도보 또는 자전거 이동)
- 10km: 광역 (자동차 15분 거리)

---

### MPS — 주변 매장/상품

**매장 목록 페이지:**
- 필터: [전체] [주변 ← 동의자만]
- 반경 선택 (1km/5km/10km)
- 각 매장 카드:
  - 매장명
  - 거리
  - 행정구역
  - 상품 개수

**API 호출:**
```typescript
GET /api/location/nearby/shops?lat=37.4979&lng=127.0276&radius=5
```

**상품 검색 페이지:**
- 필터: [전체] [주변 ← 동의자만]
- 반경 선택
- 각 상품 카드:
  - 상품명
  - 가격
  - 판매자명
  - 거리
  - 행정구역

**API 호출:**
```typescript
GET /api/location/nearby/items?lat=37.4979&lng=127.0276&radius=5
```

**지도 뷰 버튼:**
- 매장 목록 → "[지도로 보기]" 버튼 (동의자만 활성)
- 클릭 시 Maps JavaScript API 로드
- 주변 매장 핀 표시 (lat/lng 기반)

---

### MPS — 상품 목록 거리 표시 (신규 — LBS-04)

> **직거래 비즈니스 맥락**: MPS는 배송 없는 직거래 전용입니다. 구매자가 판매자를 직접 만나야 하므로,
> "나와의 거리"는 "이 상품을 실제로 살 수 있는가"를 결정하는 핵심 정보입니다.
> 거리가 표시되면 구매자는 이동 가능한 상품에 집중하고, 거래 성사율이 향상됩니다.

**기본 정렬 (동의자):** 거리 가까운 순 → 직거래 가능한 상품 우선 노출
**반경 필터 (동의자):** 1km / 5km / 10km / 30km / 전체

#### UI 명세 (동의자 vs 미동의자 vs 위치 없는 상품)

**동의자 + 위치 정보 있는 상품 (lbs_consent_yn='Y'):**
```
┌─────────────────────────────────────────┐
│  [상품 이미지]    상품명                  │
│ iPhone 15 Pro                            │
│ 가격: 1.5π                               │
│ 📍 2.3km  ← 신규 거리 표시               │
│ 판매자: 홍길동                           │
└─────────────────────────────────────────┘
```

**동의자 + 위치 정보 없는 상품:**
```
┌─────────────────────────────────────────┐
│  [상품 이미지]    상품명                  │
│ 중고 노트북                               │
│ 가격: 0.8π                               │
│ (거리 정보 없음 — 공백)                   │
│ 판매자: 김철수                           │
└─────────────────────────────────────────┘
```

**미동의자 (lbs_consent_yn ≠ 'Y'):**
```
┌─────────────────────────────────────────┐
│  [상품 이미지]    상품명                  │
│ iPhone 15 Pro                            │
│ 가격: 1.5π                               │
│ (거리 표시 영역 자체 없음)                │
│ 판매자: 홍길동                           │
└─────────────────────────────────────────┘
```

#### 거리 표시 형식

| 거리 범위 | 표시 형식 | 예시 |
|---------|---------|------|
| 1km 미만 | "0.X km" (소수점 1자리) | "0.5km" |
| 1km 이상 100km 미만 | "X.X km" (소수점 1자리) | "2.3km", "12.8km" |
| 100km 이상 | "XXX km" (정수) | "123km" |
| 위치 없음 | 공백 (표시 영역 없음) | — |

#### 거리 계산 방식 (서버 권장)

**SQL Haversine formula — GET /api/store/items**

```sql
-- 상품 목록 거리 계산 조회
SELECT
  i.*,
  s.user_id AS shop_user_id,
  s.lat AS shop_lat,
  s.lng AS shop_lng,
  l.lat AS item_reg_lat,
  l.lng AS item_reg_lng,
  CASE
    WHEN $user_lat IS NOT NULL 
      AND $user_lng IS NOT NULL
      AND (s.lat IS NOT NULL OR l.lat IS NOT NULL)
    THEN
      ROUND(
        6371 * acos(
          LEAST(1.0,
            cos(radians($user_lat)) * 
            cos(radians(COALESCE(s.lat, l.lat))) *
            cos(radians(COALESCE(s.lng, l.lng)) - radians($user_lng)) +
            sin(radians($user_lat)) * 
            sin(radians(COALESCE(s.lat, l.lat)))
          )
        )::numeric, 1
      )
    ELSE NULL
  END AS distance_km
FROM mps_item i
LEFT JOIN mps_shop s ON i.shop_id = s.shop_id AND s.del_yn = 'N'
LEFT JOIN (
  SELECT 
    ref_id, 
    lat, 
    lng,
    ROW_NUMBER() OVER (PARTITION BY ref_id ORDER BY reg_dtm DESC) AS rn
  FROM usr_loc_hist
  WHERE loc_tp_cd = '04' AND del_yn = 'N'
) l ON l.ref_id = i.item_id AND l.rn = 1
WHERE i.del_yn = 'N'
  AND (s.lat IS NOT NULL OR l.lat IS NOT NULL)  -- 위치 있는 상품만
  AND ($user_lbs_consent_yn = 'Y')  -- 동의자만
  -- 거리 필터 (반경 파라미터 있으면)
  AND (
    $radius IS NULL
    OR 6371 * acos(...) <= $radius
  )
ORDER BY distance_km ASC NULLS LAST;
```

**JavaScript Haversine (클라이언트 폴백):**

```typescript
// 이미 좌표가 있을 때 클라이언트에서 계산
const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371 // 지구 반지름 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// 거리 포맷팅
const formatDistance = (km: number): string => {
  if (km < 1) return `${km.toFixed(1)}km`
  if (km < 100) return `${km.toFixed(1)}km`
  return `${Math.round(km)}km`
}
```

#### 사용자 현재 위치 동적 갱신 (선택사항)

상품 목록 진입 시 2가지 방식:

**방식 1: 페이지 로드 시 1회 수집**
```typescript
useEffect(() => {
  if (user?.lbs_consent_yn === 'Y') {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        // 상품 목록 API 호출: ?lat, ?lng 파라미터 포함
      },
      () => {
        // 위치 수집 실패 → 최신 로그인 위치 사용
        setUserLat(lastLoginLat)
        setUserLng(lastLoginLng)
      }
    )
  }
}, [])
```

**방식 2: 실시간 갱신 (고급)**
- 페이지 진입 → GPS 수집 시작
- 5초 또는 위치 변경 감지 시 상품 목록 거리 동적 업데이트
- UX 트레이드오프 검토 필수 (배터리/네트워크)

---

### 마이페이지 — 위치 서비스 관리 (동의자 전용)

**정보 표시:**
- 가입 지역: "강남구 역삼동" (행정구역만 — 정밀 좌표 숨김)
- 동의 일시: "2026-06-12 14:30"
- 마지막 로그인 위치: "서초구 방배동"

**내 위치 이력 열람:**
- "[내 위치 이력]" 버튼 → 새 페이지 이동
- GET /api/location/history 호출
- 시간순 역정렬 (최신순):
  - 기록 날짜/시간
  - 위치 유형 ("가입", "로그인", "상품 등록" 등)
  - 주소 (행정구역 + 동명)
  - 거리/매장 연관정보 (있으면)

**위치 서비스 설정:**
- 토글 [ON/OFF]:
  - ON → lbs_consent_yn = 'Y' (기존: 동의 유지)
  - OFF → lbs_consent_yn = 'N' + DELETE /api/location/consent 호출
- "[동의 철회]" 버튼 (명시적):
  - 확인 모달 → "정말 위치 데이터를 삭제하시겠습니까?"
  - "예" → DELETE /api/location/consent

---

## 10. Google Maps 연동

### API 사용 현황

| API | 사용 목적 | 호출 주체 | 서버 환경변수 | 비용 최적화 |
|-----|----------|----------|---|---|
| **Geocoding API** | 주소→좌표 (가입 위치 수동 입력) | 서버 API Route만 | `GOOGLE_MAPS_API_KEY` | 사용자 입력 완료 후 1회만 |
| **Reverse Geocoding API** | 좌표→주소+행정구역 분해 | 서버 API Route만 | `GOOGLE_MAPS_API_KEY` | 위치 저장 시 1회 |
| **Places API** | 매장 검색 + place_id 취득 | 서버 API Route만 | `GOOGLE_MAPS_API_KEY` | 매장 등록 시 1회 |
| **Maps JavaScript API** | 지도 뷰 렌더링 | 클라이언트 | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 지도 화면 진입 시만 로드 |

### 환경변수 추가

**`src/env.ts` (t3-env 스키마)**:

```typescript
export const env = createEnv({
  server: {
    // ... 기존 ...
    GOOGLE_MAPS_API_KEY: z.string().min(1),
  },
  client: {
    // ... 기존 ...
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().min(1),
  },
})
```

**`.env.example`**:

```
GOOGLE_MAPS_API_KEY=AIza...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
```

**비용 최적화 권장:**
- `GOOGLE_MAPS_API_KEY`: 서버 IP 제한 (API key 제한 → HTTP Referer 미지정)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: 도메인 제한 (Referer: cafe.pi)
- 두 키 분리 → Maps JS API 로드 시에만 클라이언트 키 사용

### 좌표 저장 형식

**표준:** WGS84 (EPSG:4326)

**컬럼 정의:**
```sql
lat           DECIMAL(10,8)   -- 위도: -90.00000000 ~ +90.00000000
lng           DECIMAL(11,8)   -- 경도: -180.00000000 ~ +180.00000000
```

**정밀도:** ±0.00000001 도 ≈ ±1.1cm (건물 수준)

### 주소 저장 구조 (Reverse Geocoding)

Google Reverse Geocoding 결과 분해:

```typescript
const parseAddressComponents = (result: any) => {
  let sido = '', sigungu = '', dong = ''
  
  result.address_components.forEach((comp: any) => {
    if (comp.types.includes('administrative_area_level_1')) {
      sido = comp.long_name // "서울특별시"
    }
    if (comp.types.includes('administrative_area_level_2')) {
      sigungu = comp.long_name // "강남구"
    }
    if (comp.types.includes('sublocality_level_1') || comp.types.includes('sublocality_level_2')) {
      dong = comp.long_name // "역삼동"
    }
  })
  
  return { full_addr: result.formatted_address, sido, sigungu, dong }
}
```

---

## 11. Pi Browser 특수 처리

### Geolocation API 호환성

**현재 상태:** Pi Browser WebView에서 `navigator.geolocation` 지원 여부 **미검증**

**필수 실기기 테스트:**
- [ ] Pi Browser에서 getCurrentPosition() 호출 가능 여부
- [ ] 위치 권한 요청 UI 노출 여부
- [ ] 거부 시 에러 처리 동작

**구현 시 주의:**
```typescript
// 권한 거부 또는 타임아웃 시 조용히 무시
navigator.geolocation.getCurrentPosition(
  (pos) => { /* 성공 */ },
  (err) => {
    console.warn('위치 수집 실패:', err.code)
    // 서비스 차단 없음 — IP 폴백은 추후 Phase
  },
  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
)
```

### 위치 권한 거부 처리

**Scenario 1: GPS 실패 또는 거부**
1. getCurrentPosition() → timeout 또는 PermissionDenied
2. 클라이언트: 조용히 무시 (catch 블록에서 console.warn만)
3. 서비스: 정상 작동 (위치 기반 기능만 미작동)
4. 서버: 해당 위치 기록 생성 안 함

**Scenario 2: IP 기반 폴백 (추후 Phase)**
- IP 기반 도시/시·군·구 수준 정확도만 제공
- `full_addr=null`, `dong_nm=null`, `sido_nm` + `sigungu_nm`만 저장
- 구현 시 ip-api.com 등 제공자 선정 필요

### 모든 위치 API 호출 패턴

**클라이언트: piFetch() 필수 사용**

```typescript
// 정상 패턴 ✓
const res = await piFetch('/api/location/save', {
  method: 'POST',
  body: JSON.stringify({ locTpCd: '02', lat, lng }),
  credentials: 'include' // Pi Browser: X-Pi-Token 헤더 자동
})

// 잘못된 패턴 ✗
const res = await fetch('/api/location/save', {
  method: 'POST',
  body: JSON.stringify({ ... })
})
// → X-Pi-Token 헤더 누락 → 쿠키 미지원 Pi Browser에서 401
```

**서버: getSessionUser() 필수 사용**

```typescript
// POST /api/location/save
export async function POST(req: Request) {
  const user = await getSessionUser() // 쿠키 + X-Pi-Token 헤더 이중 경로
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  if (user.lbs_consent_yn !== 'Y') {
    return NextResponse.json({ error: 'LBS 미동의' }, { status: 403 })
  }
  
  // ... 위치 저장 로직 ...
}
```

### 동의 API 특수 패턴 (클라이언트 게이트)

**상황:** 동의 상태 확인/갱신 API에서 getSessionUser() null일 때

**잘못된 패턴 ✗**
```typescript
const user = await getSessionUser()
if (!user) {
  redirect('/auth/login') // Pi Browser 무한 루프 ← 쿠키 미지원
}
```

**올바른 패턴 ✓**
```typescript
// 서버에서는 null 반환만 — redirect 금지
if (!user) {
  return NextResponse.json({ authenticated: false }, { status: 401 })
}

// 클라이언트에서 게이트 처리
if (!user) {
  return <ClientAuthGate /> // 로그인 UI를 클라이언트에서 렌더
}
```

---

## 12. 법적 요건 체크리스트

### 한국 위치정보법 준수

| # | 항목 | 법령 근거 | 구현 방법 | 상태 |
|---|------|---------|---------|------|
| 1 | 명시적 동의 취득 | 위치정보법 제18조 | POST /api/location/consent + UI 동의 체크 | ✓ 설계 완료 |
| 2 | 동의 내용 명시 | 위치정보법 제18조 2항 | 약관 문구: 수집 항목/목적/보유기간 명시 | ✓ 설계 완료 |
| 3 | 목적 달성 후 즉시 파기 | 위치정보법 제16조 1항 | del_yn='Y' 논리삭제 (물리삭제 금지) | ✓ 설계 완료 |
| 4 | 6개월 확인자료 보관 | 위치정보법 제16조 2항 | sys_user_consent 테이블 (del_yn='N' 유지) | ✓ 설계 완료 |
| 5 | 동의 철회 보장 | 위치정보법 제18조 3항 | DELETE /api/location/consent 엔드포인트 | ✓ 설계 완료 |
| 6 | 동의 일시 중지 보장 | 약관 제7조 2항 | lbs_consent_yn 토글 기능 | ✓ 설계 완료 |
| 7 | 정보주체 열람권 | 위치정보법 제16조 3항 | GET /api/location/history 엔드포인트 | ✓ 설계 완료 |
| 8 | 8세 이하 보호자 동의 | 약관 제8조 | 회원가입 연령 확인 + 보호자 동의 | ⚠️ 추후 구현 |
| 9 | 제3자 미제공 | 약관 제6조 | Supabase 외 위치 데이터 미전송 | ✓ 설계 완료 |
| 10 | 정보 보호 조치 | 위치정보법 제21조 | Supabase HTTPS + 행정구역 단위 표시 (정밀 좌표 숨김) | ✓ 설계 완료 |
| 11 | 위치기반 이용약관 공시 | 위치정보법 제25조 | `docs/law/agreement/위치기반서비스이용약관및위치정보수집이용동의서_kor.md` | ✓ 완료 |

---

### 미결 법적 사항

#### Q1: 방통위 위치기반서비스 신고 의무

**현황:** 앱이 위치기반서비스사에 해당하면 방통위 신고 의무 (위치정보법 제29조)

**확인 필요:**
- Cafe.pi가 "위치를 수집·저장·가공하여 부가가치 정보를 제공하는 사업" 해당 여부
- 신고 필요 시: 방통위 위치기반서비스사 신고 신청 + 수수료 납부

**담당:** 법무 자문 필요 → `docs/law/compliance/정부신고사항_가이드.md` 작성 대기

---

## 13. 마이그레이션 계획

### SQL 파일

**파일:** `sql/030_lbs.sql`

### 마이그레이션 순서

#### Step 1: sys_user_consent 테이블 생성

```sql
-- 동의 이력 관리 (6개월 보관 의무)
CREATE TABLE sys_user_consent (
  consent_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  consent_tp_cd   CHAR(10)    NOT NULL,   -- 'LBS' | 'MKT' | 'PUSH'
  consent_yn      CHAR(1)     NOT NULL,   -- 'Y' | 'N'
  consent_ver     TEXT,                   -- 약관 버전
  regr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn          CHAR(1)     DEFAULT 'N',
  del_dtm         TIMESTAMPTZ
);

CREATE INDEX idx_sys_user_consent_user ON sys_user_consent(user_id, consent_tp_cd);

COMMENT ON TABLE sys_user_consent IS '사용자 동의 이력 — 6개월 보관 의무 (위치정보법 제16조)';
COMMENT ON COLUMN sys_user_consent.consent_tp_cd IS '동의 유형 코드: LBS(위치) | MKT(마케팅) | PUSH(알림)';
```

#### Step 2: usr_loc_hist 테이블 생성

```sql
-- 위치 수집 이력 (4가지 트리거)
CREATE TABLE usr_loc_hist (
  loc_hist_id   UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID            NOT NULL,
  loc_tp_cd     CHAR(2)         NOT NULL,         -- '01'|'02'|'03'|'04'
  lat           DECIMAL(10,8)   NOT NULL,
  lng           DECIMAL(11,8)   NOT NULL,
  full_addr     TEXT,
  sido_nm       TEXT,
  sigungu_nm    TEXT,
  dong_nm       TEXT,
  place_id      TEXT,
  ref_id        TEXT,
  consent_yn    CHAR(1)         NOT NULL DEFAULT 'Y',
  consent_dtm   TIMESTAMPTZ,
  regr_id       TEXT            NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT            NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn        CHAR(1)         DEFAULT 'N',
  del_dtm       TIMESTAMPTZ
);

CREATE INDEX idx_usr_loc_hist_user ON usr_loc_hist(user_id, loc_tp_cd);
CREATE INDEX idx_usr_loc_hist_latng ON usr_loc_hist(lat, lng);
CREATE INDEX idx_usr_loc_hist_ref ON usr_loc_hist(ref_id);

COMMENT ON TABLE usr_loc_hist IS '사용자 위치 수집 이력 — loc_tp_cd별 4가지 트리거로 기록';
COMMENT ON COLUMN usr_loc_hist.loc_tp_cd IS '위치 유형: 01(가입) | 02(로그인) | 03(매장) | 04(상품)';
COMMENT ON COLUMN usr_loc_hist.lat IS 'WGS84 위도 — DECIMAL(10,8) 정밀도 (±1.1cm)';
COMMENT ON COLUMN usr_loc_hist.lng IS 'WGS84 경도 — DECIMAL(11,8) 정밀도 (±1.1cm)';
COMMENT ON COLUMN usr_loc_hist.ref_id IS '참조 ID — mps_item.item_id 또는 mps_shop.shop_id';
```

#### Step 3: sys_user 컬럼 추가

```sql
-- 동의 상태 캐시 (빠른 조회용)
ALTER TABLE sys_user
  ADD COLUMN lbs_consent_yn   CHAR(1)     DEFAULT 'N',
  ADD COLUMN lbs_consent_dtm  TIMESTAMPTZ,
  ADD COLUMN lbs_consent_ver  TEXT;

COMMENT ON COLUMN sys_user.lbs_consent_yn IS '위치 서비스 동의 여부: Y | N';
COMMENT ON COLUMN sys_user.lbs_consent_dtm IS '동의 일시 (철회 시에도 갱신)';
COMMENT ON COLUMN sys_user.lbs_consent_ver IS '동의한 약관 버전';
```

#### Step 4: 외래키 설정 (선택사항)

```sql
-- usr_loc_hist -> sys_user
ALTER TABLE usr_loc_hist
  ADD CONSTRAINT fk_usr_loc_hist_user 
  FOREIGN KEY (user_id) REFERENCES sys_user(user_id) ON DELETE CASCADE;

-- sys_user_consent -> sys_user
ALTER TABLE sys_user_consent
  ADD CONSTRAINT fk_sys_user_consent_user 
  FOREIGN KEY (user_id) REFERENCES sys_user(user_id) ON DELETE CASCADE;
```

#### Step 5: mps_shop 인덱스 확인 (선택사항)

```sql
-- 거리 계산 성능 최적화 (이미 있으면 스킵)
CREATE INDEX IF NOT EXISTS idx_mps_shop_latng 
  ON mps_shop(lat, lng);
```

### 롤백 순서

```sql
-- 1. 외래키 삭제 (있으면)
ALTER TABLE usr_loc_hist 
  DROP CONSTRAINT IF EXISTS fk_usr_loc_hist_user;

ALTER TABLE sys_user_consent 
  DROP CONSTRAINT IF EXISTS fk_sys_user_consent_user;

-- 2. sys_user 컬럼 삭제
ALTER TABLE sys_user 
  DROP COLUMN IF EXISTS lbs_consent_yn,
  DROP COLUMN IF EXISTS lbs_consent_dtm,
  DROP COLUMN IF EXISTS lbs_consent_ver;

-- 3. 테이블 삭제
DROP TABLE IF EXISTS usr_loc_hist;
DROP TABLE IF EXISTS sys_user_consent;
```

---

## 14. 미결 사항 (Open Issues)

### Priority High

| # | 항목 | 담당 | 마감 | 상태 |
|---|------|------|------|------|
| 1 | Pi Browser navigator.geolocation 실기기 호환 테스트 | 개발팀 | Phase 1 중 | 블로킹 |
| 2 | 방통위 위치기반서비스 신고 의무 해당 여부 법률 자문 | 법무 | Phase 1 전 | 블로킹 |

### Priority Medium

| # | 항목 | 담당 | 마감 | 상태 |
|---|------|------|------|------|
| 3 | usr_loc_hist vs mps_shop 매장 위치 이중 저장 방지 정책 코드 리뷰 | 개발팀 | Phase 1 | 진행중 |
| 4 | Google Maps API 키 분리 (서버 제한 vs 클라이언트 제한) 구성 및 비용 한도 설정 | 운영 | Phase 1 중 | 블로킹 |
| 5 | 8세 이하 보호자 동의 UI/API 설계 | 개발팀 | Phase 2 | 대기 |
| 6 | 상품 목록 거리 정렬 옵션 ('거리순 정렬' 버튼) 추가 여부 검토 | PM/개발팀 | Phase 2 | 대기 |

### Priority Low

| # | 항목 | 담당 | 마감 | 상태 |
|---|------|------|------|------|
| 7 | Haversine SQL 성능 검증 (대용량 위치 데이터 시 PostGIS 전환 검토) | 개발팀 | Phase 2 | 대기 |
| 8 | IP 기반 위치 폴백 제공자 선정 (ip-api.com 등) 및 구현 | 개발팀 | Phase 2 | 대기 |
| 9 | mps_item 테이블 위치 정보 없는 상품 비율 조사 → 거리 표시 실효성 검토 | 분석팀 | Phase 2 | 대기 |
| 10 | Maps JavaScript API 지도 렌더링 UI 구현 | 디자인/개발 | Phase 2 | 대기 |

---

## 부록 A: 용어 정의

| 용어 | 정의 |
|------|------|
| **LBS** | Location-Based Service — 위치 정보를 활용한 서비스 |
| **WGS84** | World Geodetic System 1984 — GPS 표준 좌표계 |
| **Geocoding** | 주소(문자열)를 좌표(lat/lng)로 변환 |
| **Reverse Geocoding** | 좌표(lat/lng)를 주소(문자열)로 변환 |
| **Haversine Formula** | 두 좌표 간 대원 거리 계산 방법 |
| **Place ID** | Google Maps 고유 식별자 — 장소 정보 조회 용도 |
| **DECIMAL(10,8)** | 10자리 총 길이, 소수점 8자리 정밀도 (±1.1cm) |
| **논리삭제** | 물리적 삭제 대신 del_yn='Y' + del_dtm 설정 |
| **스로틀** | 특정 시간 간격 내 반복 호출 제한 (로그인 위치 5분) |
| **동의 게이트** | lbs_consent_yn 값에 따른 UI/API 접근 제어 |
| **거리 표시 게이트** | 동의자에게만 거리 정보 노출하는 제어 (LBS-04) |

---

## 부록 B: 관련 문서

- `CLAUDE.md` — Cafe.pi 프로젝트 핵심 기술 가이드
- `docs/PRD_8_MPS.md` — MPS 마켓플레이스 요구사항
- ~~`docs/PRD_GPS.md`~~ — v1.0 → 이 문서(PRD_10_GPS.md v1.2)로 통합됨
- `docs/law/agreement/위치기반서비스이용약관및위치정보수집이용동의서_kor.md` — 법적 약관
- `sql/029_*.sql` — 기존 마이그레이션 파일
- `src/lib/users.ts` — 사용자 관리 로직
- `src/lib/pi-fetch.ts` — Pi Browser 호환 fetch

---

**문서 끝**
