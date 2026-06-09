# PRD: 다국어(i18n) 처리 시스템

> **버전**: v1.0  
> **작성일**: 2026-06-02  
> **작성자**: anakin  
> **상태**: 설계 완료 / 구현 대기  
> **연관 PRD**: `docs/PRD.md` (표준데이터 관리 프로그램)

---

## 1. 개요 (Executive Summary)

| 항목 | 내용 |
|---|---|
| 기능명 | 다국어(i18n) 처리 시스템 |
| 핵심 가치 | 전 세계 11개 언어권 사용자에게 동일한 UI를 자국어로 제공, 국가·통화 정보를 실시간 선택 |
| 라이브러리 | `next-intl ^4.13.0` (Next.js 16 App Router 최적화) |
| 지원 언어 | 11개 (ko · en · zh · ja · hi · vi · id · ms · en-ZA · fil · th) |
| 기본 locale | `ko` (한국어, prefix 없음 — 기존 URL `/notice` 등 유지) |
| DB 표준 | DA 표준 v2 준수 (2026-05-30 총괄DA 승인) |

**엘리베이터 피치**  
CSV로 관리되던 187개국 국가·통화 데이터를 Supabase DB에 정규화하고, 모든 화면 우측 상단에 국기·자국어명·환율을 표시하는 국가 선택 콤보박스를 제공합니다. 번역 문자열은 관리 화면에서 실시간 편집하고 next-intl로 즉시 반영합니다.

---

## 2. 배경 및 문제 정의

### As-Is (현재)

- 한국어 문자열 **751건**이 47개 파일에 하드코딩됨
- `<html lang="ko">` 고정 — 영어 사용자에게도 한국어 UI 노출
- 국가·통화 데이터가 CSV 파일(`currency_countries.csv`)로만 관리 — DB 연동 불가
- 다국어 라이브러리 미설치 — i18n 인프라 전무
- 폰트: `Noto_Sans`의 `latin` subset만 로드 — 한글·CJK·태국어 글리프 미지원

### To-Be (목표)

- URL prefix `as-needed` 방식으로 기존 `/notice` 등 한국어 URL **무중단 유지**
- 187개국 국가·통화 데이터를 Supabase `i18n_cntry_mst`에 표준화 저장
- 모든 화면 우측 상단 **국가 선택 콤보박스** — 국기 이모지 + 자국어 국가명 + 통화코드
- 번역 문자열을 Supabase `i18n_msg`에 저장, 관리 화면에서 실시간 CRUD
- locale별 Noto Sans 서브셋 동적 로딩으로 글자 깨짐 완전 해소

---

## 3. 타겟 사용자

| 페르소나 | 역할 | 주요 요구사항 |
|---|---|---|
| 글로벌 DA 팀원 | 표준데이터 관리 (비한국어권) | 자국어 UI, 자국 통화로 환율 확인 |
| 시스템 관리자 | 번역 문자열 관리 | 관리 화면에서 키·값 실시간 수정 |
| 일반 사용자 | 게시판·프로필 이용 | 언어 전환 후 URL 유지, 빠른 반응 |

---

## 4. 기능 요구사항

### F1 — 국가·통화 마스터 DB화 (`i18n_cntry_mst`)

| 항목 | 내용 |
|---|---|
| 원천 데이터 | `.claude/skills/multi-lang/lang_cd/references/currency_countries.csv` |
| 레코드 수 | 187개국 |
| 테이블명 | `i18n_cntry_mst` |
| 주요 컬럼 | `country_cd(PK)`, `dis_ord_seq`, `country_eng_nm`, `country_mot_nm`, `currency_cd`, `currency_eng_nm`, `flag_emoji`, `use_yn` |
| 우선 표시 | `dis_ord_seq 1~11` (KR→TH) 상단 고정, 이후 알파벳 순 |
| 국기 이모지 | ISO 3166-1 alpha-2 → Regional Indicator Symbol 자동 변환 함수 (`countryToFlag`) |

**`flag_emoji` 생성 로직**:
```ts
// KR → 🇰🇷, US → 🇺🇸 (Regional Indicator Symbols)
export function countryToFlag(code: string): string {
  return code.toUpperCase().split('').map(
    c => String.fromCodePoint(c.charCodeAt(0) - 65 + 0x1F1E6)
  ).join('')
}
```

---

### F2 — 국가 선택 콤보박스 (모든 화면 공통)

**위치**: 통합게시판 헤더(`BoardUserMenu` 옆) + Admin 헤더(`AdminLogoutButton` 옆)

**콤보박스 표시 형식**:
```
[ 🇰🇷  대한민국  KRW ▼ ]
```

**드롭다운 항목 구조** (per row):
```
🇰🇷  대한민국 (Daehanminguk)    KRW · Korean Won
🇺🇸  United States of America   USD · US Dollar
🇨🇳  中国 (Zhōngguó)            CNY · Yuan Renminbi
...
```

**기능 세부**:

| 항목 | 내용 |
|---|---|
| 국기 | `flag_emoji` (이모지) |
| 국가명 | `country_mot_nm` (자국어 현지 표기) |
| 통화 | `currency_cd` + `currency_eng_nm` |
| 검색 | 국가명(영문·현지어) 실시간 필터 |
| 정렬 | dis_ord_seq 1~11 우선 표시 + 구분선 + 나머지 알파벳 순 |
| 선택 효과 | locale 전환 (`useRouter().replace()`) + `NEXT_LOCALE` 쿠키 갱신 |
| 지원 locale | 11개 외 국가 선택 시 → 가장 근접한 locale 자동 매핑 또는 `en` fallback |
| 환율 | Phase 1: 통화코드만 표시 / Phase 2: 실시간 환율 API 연동 |

**locale 매핑 로직** (`i18n_cntry_mst.country_cd` → locale):
```
KR → ko, US → en, CN → zh, JP → ja, IN → hi,
VN → vi, ID → id, MY → ms, ZA → en-ZA, PH → fil, TH → th
기타 → en (fallback)
```

**컴포넌트 분리**:
- `components/i18n/CountrySelector.tsx` — 공통 클라이언트 컴포넌트
- `components/i18n/useCountrySelector.ts` — 국가 목록 fetching + locale 전환 로직

---

### F3 — 다국어 메시지 DB 관리 (`i18n_msg`)

번역 문자열을 DB에 저장하고 next-intl이 DB에서 직접 조회.

**아키텍처**:
```
관리 화면 수정
  → i18n_msg UPDATE (Supabase)
  → revalidateTag('i18n')
  → unstable_cache 무효화(5분 TTL)
  → 다음 요청부터 새 번역 반영
```

**`i18n/request.ts` 동작**:
- `getRequestConfig`에서 `supabaseAdmin`으로 `i18n_msg` 조회
- `buildMessageTree()` 함수로 flat rows → next-intl nested object 변환
- `unstable_cache` 5분 캐싱 + `tags:['i18n']` 수동 무효화

---

### F4 — 다국어 관리 화면 (`/admin/i18n/`)

Admin 네비게이션에 `🌐 다국어관리` 메뉴 추가.

| 화면 경로 | 기능 |
|---|---|
| `/admin/i18n` | 대시보드 — 언어별 번역 완료율(%), 미번역 키 목록, 최근 수정 이력 |
| `/admin/i18n/languages` | `i18n_lang_mst` CRUD, use_yn 토글, 정렬순서 편집 |
| `/admin/i18n/countries` | `i18n_cntry_mst` 조회 (187개국), use_yn 토글, dis_ord_seq 편집 |
| `/admin/i18n/messages` | 번역 매트릭스 뷰 (키 × 언어 인라인 편집, 미번역 하이라이트) |
| `/admin/i18n/sync` | DB→JSON 동기화 실행, 결과 로그 표시 |

**번역 매트릭스 UI**:
```
[네임스페이스: board ▼]  [미번역만 □]  [키 검색: ____]

키                       | ko        | en      | zh   | ···
-------------------------|-----------|---------|------|-----
board.categories.NOTICE  | 공지사항   | Notice  | 公告 | ···
board.newPost            | 글쓰기     | ❌미번역 | ···  | ···
```
- 셀 클릭 → 인라인 textarea 편집 → 저장
- 미번역 셀: 빨간 배경 + ❌ 표시
- 행 단위 일괄 저장

---

### F5 — DB↔JSON 동기화

| 방향 | 트리거 | 결과 |
|---|---|---|
| DB → JSON | `/admin/i18n/sync` 버튼 | `messages/{locale}.json` 11개 재생성 |
| DB → 캐시 무효화 | 메시지 수정 시 자동 | `revalidateTag('i18n')` 호출 |
| JSON → DB | 마이그레이션 시드 | `seed_i18n_msg_ko` 등 초기 로드 |

---

## 5. 비기능 요구사항

| 항목 | 요구 수준 |
|---|---|
| 번역 반영 속도 | 관리 화면 저장 후 5분 이내 (캐시 TTL) |
| 폰트 로딩 | locale별 단일 Noto 서브셋, `display:swap` — LCP 영향 최소화 |
| URL 호환성 | 기존 `/notice`, `/login`, `/admin` URL 무중단 유지 (ko prefix 생략) |
| 국가 목록 로딩 | 콤보박스 오픈 시 500ms 이내 (캐싱 필수) |
| DA 표준 준수 | 신규 테이블 전부 v2 (`regr_id→reg_dtm→modr_id→mod_dtm`) |

---

## 6. 기술 스택

| 영역 | 기술 |
|---|---|
| i18n 라이브러리 | `next-intl ^4.13.0` |
| DB | Supabase PostgreSQL |
| 캐싱 | Next.js `unstable_cache` (tags: 'i18n') |
| 폰트 | `next/font/google` — Noto Sans KR/SC/JP/Thai/Devanagari |
| 환율 (Phase 2) | `exchangerate-api.com` 또는 `open.er-api.com` (무료 tier) |
| 국기 이모지 | Regional Indicator Symbol 변환 (`countryToFlag` 유틸) |

---

## 7. 데이터 모델 (DA 표준 v2 준수)

> **기준**: 물리DB 구축 표준준수 전파 (2026-05-30 총괄DA 승인)  
> 시스템 컬럼 순서 `regr_id → reg_dtm → modr_id → mod_dtm`, 전부 NOT NULL, 맨 마지막 위치

### ERD

```
i18n_lang_mst (1) ──────────── (N) i18n_msg (N) ──────────── (1) i18n_ns_mst
                                        │
                                (locale 매핑)
                                        │
i18n_cntry_mst ─── CountrySelector ────┘
  (187개국)         (국가 → locale)
```

---

### 7-1. `i18n_cntry_mst` — 국가·통화 마스터

**원천**: `currency_countries.csv` (187개국)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `country_cd` | varchar(10) | **PK** | ISO 3166-1 alpha-2 (KR, US, …) |
| `dis_ord_seq` | integer | NOT NULL | 표시 정렬순서 (1~187) |
| `country_eng_nm` | varchar(100) | NOT NULL | 영문 국가명 |
| `country_mot_nm` | varchar(200) | NOT NULL | 모국어 국가명 (현지어 표기) |
| `currency_cd` | varchar(10) | NOT NULL | ISO 4217 통화코드 (KRW, USD) |
| `currency_eng_nm` | varchar(100) | NOT NULL | 통화 영문명 |
| `flag_emoji` | varchar(10) | NULL | 국기 이모지 (🇰🇷) — 앱에서 생성 가능 |
| `locale_cd` | varchar(10) | NULL | 매핑 locale (ko, en, …, NULL=fallback en) |
| `use_yn` | varchar(1) | NOT NULL DEFAULT 'Y' | 사용여부 |
| `regr_id` | varchar(20) | NOT NULL DEFAULT 'ADMIN' | 등록자ID |
| `reg_dtm` | timestamptz | NOT NULL DEFAULT CURRENT_TIMESTAMP | 등록일시 |
| `modr_id` | varchar(20) | NOT NULL DEFAULT 'ADMIN' | 변경자ID |
| `mod_dtm` | timestamptz | NOT NULL DEFAULT CURRENT_TIMESTAMP | 변경일시 |

```sql
CREATE TABLE i18n_cntry_mst (
    country_cd        character varying(10)   NOT NULL,
    dis_ord_seq       integer                 NOT NULL DEFAULT 999,
    country_eng_nm    character varying(100)  NOT NULL,
    country_mot_nm    character varying(200)  NOT NULL,
    currency_cd       character varying(10)   NOT NULL,
    currency_eng_nm   character varying(100)  NOT NULL,
    flag_emoji        character varying(10)   NULL,
    locale_cd         character varying(10)   NULL,
    use_yn            character varying(1)    NOT NULL DEFAULT 'Y',
    regr_id           character varying(20)   NOT NULL DEFAULT 'ADMIN',
    reg_dtm           timestamptz               NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modr_id           character varying(20)   NOT NULL DEFAULT 'ADMIN',
    mod_dtm           timestamptz               NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_i18n_cntry_mst    PRIMARY KEY (country_cd),
    CONSTRAINT ck_i18n_cntry_use_yn CHECK (use_yn IN ('Y', 'N')),
    CONSTRAINT fk_i18n_cntry_locale FOREIGN KEY (locale_cd)
        REFERENCES i18n_lang_mst (lang_cd) ON DELETE SET NULL
);

CREATE INDEX idx_i18n_cntry_seq    ON i18n_cntry_mst (dis_ord_seq);
CREATE INDEX idx_i18n_cntry_locale ON i18n_cntry_mst (locale_cd);

CREATE TRIGGER trg_i18n_cntry_mst_mod_dtm
    BEFORE UPDATE ON i18n_cntry_mst
    FOR EACH ROW EXECUTE FUNCTION fn_update_mod_dtm();
```

---

### 7-2. `i18n_lang_mst` — 언어 마스터

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `lang_cd` | varchar(10) | **PK** | locale 코드 (ko, en, zh, …) |
| `lang_nm` | varchar(50) | NOT NULL | 한국어 언어명 (한국어, 영어) |
| `native_nm` | varchar(50) | NOT NULL | 자국어 언어명 (한국어, English) |
| `country_cd` | varchar(10) | NULL | 대표 국가코드 |
| `font_key` | varchar(20) | NULL | 폰트키 (kr, latin, sc, jp, deva, thai) |
| `dir_cd` | varchar(3) | NOT NULL DEFAULT 'ltr' | 텍스트 방향 |
| `sort_ord` | integer | NOT NULL DEFAULT 0 | 정렬순서 |
| `use_yn` | varchar(1) | NOT NULL DEFAULT 'Y' | 사용여부 |
| 시스템 컬럼 v2 | — | — | `regr_id → reg_dtm → modr_id → mod_dtm` |

**초기 데이터 (11개)**:

| lang_cd | lang_nm | native_nm | country_cd | font_key | sort_ord |
|---|---|---|---|---|---|
| ko | 한국어 | 한국어 | KR | kr | 1 |
| en | 영어 | English | US | latin | 2 |
| zh | 중국어(간체) | 中文 | CN | sc | 3 |
| ja | 일본어 | 日本語 | JP | jp | 4 |
| hi | 힌디어 | हिन्दी | IN | deva | 5 |
| vi | 베트남어 | Tiếng Việt | VN | latin | 6 |
| id | 인도네시아어 | Bahasa Indonesia | ID | latin | 7 |
| ms | 말레이어 | Bahasa Melayu | MY | latin | 8 |
| en-ZA | 영어(남아공) | English (SA) | ZA | latin | 9 |
| fil | 필리핀어 | Filipino | PH | latin | 10 |
| th | 태국어 | ไทย | TH | thai | 11 |

---

### 7-3. `i18n_ns_mst` — 네임스페이스 마스터

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `ns_cd` | varchar(30) | **PK** | 네임스페이스코드 (common, auth, board, …) |
| `ns_nm` | varchar(100) | NOT NULL | 네임스페이스명 |
| `ns_desc` | text | NULL | 설명 |
| `sort_ord` | integer | NOT NULL DEFAULT 0 | 정렬순서 |
| `use_yn` | varchar(1) | NOT NULL DEFAULT 'Y' | 사용여부 |
| 시스템 컬럼 v2 | — | — | — |

**초기 데이터 (7개)**:

| ns_cd | ns_nm | sort_ord |
|---|---|---|
| common | 공통 | 1 |
| auth | 인증 | 2 |
| board | 게시판 | 3 |
| admin | 관리자 | 4 |
| profile | 프로필 | 5 |
| validation | 유효성검사 | 6 |
| languageSwitcher | 언어선택기 | 7 |

---

### 7-4. `i18n_msg` — 번역 메시지

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `msg_id` | uuid | **PK** DEFAULT gen_random_uuid() | 메시지ID |
| `ns_cd` | varchar(30) | NOT NULL, FK → i18n_ns_mst | 네임스페이스 |
| `msg_key` | varchar(200) | NOT NULL | 번역키 (`board.categories.NOTICE`) |
| `lang_cd` | varchar(10) | NOT NULL, FK → i18n_lang_mst | 언어코드 |
| `msg_val` | text | NOT NULL | 번역값 |
| 시스템 컬럼 v2 | — | — | — |

**제약**: `UNIQUE (ns_cd, msg_key, lang_cd)` — 동일 키·언어 중복 방지

**인덱스**:
- `idx_i18n_msg_ns_lang ON (ns_cd, lang_cd)` — 언어별 전체 조회 최적화
- `idx_i18n_msg_key ON (msg_key)` — 키 검색

---

### 7-5. 마이그레이션 실행 순서

| 순서 | 마이그레이션명 | 내용 |
|---|---|---|
| 1 | `create_i18n_lang_mst` | 언어 마스터 테이블 + 트리거 |
| 2 | `create_i18n_ns_mst` | 네임스페이스 마스터 테이블 + 트리거 |
| 3 | `create_i18n_msg` | 번역 메시지 테이블 + 인덱스 + 트리거 |
| 4 | `create_i18n_cntry_mst` | 국가·통화 마스터 테이블 + 트리거 |
| 5 | `seed_i18n_lang_mst` | 11개 언어 초기 데이터 |
| 6 | `seed_i18n_ns_mst` | 7개 네임스페이스 초기 데이터 |
| 7 | `seed_i18n_cntry_mst` | CSV 187개국 데이터 |
| 8 | `seed_i18n_msg_ko` | ko.json → DB 초기 로드 (약 50건) |

---

## 8. 화면 설계

### 8-1. 통합게시판 헤더 (변경 후)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 대시보드     공지사항 │ 자료실 │ 자유게시판 │ Q&A            [🌐콤보] [👤사용자명] [로그아웃] │
└──────────────────────────────────────────────────────────────────────┘
```

### 8-2. Admin 헤더 (변경 후)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔐 표준데이터 관리   [대시보드] [표준관리] ··· [🌐다국어관리]        [🌐콤보] [👤사용자명] [로그아웃] │
└──────────────────────────────────────────────────────────────────────┘
```

### 8-3. 국가 선택 콤보박스 UI

```
닫힌 상태:
┌─────────────────────┐
│ 🇰🇷  대한민국  KRW  ▼│
└─────────────────────┘

열린 상태:
┌─────────────────────┐
│ 🇰🇷  대한민국  KRW  ▲│
├─────────────────────┤
│ [____검색_______]   │
├─────────────────────┤
│ 🇰🇷 대한민국 (KRW)  │  ← 우선 11개국
│ 🇺🇸 United States (USD)│
│ 🇨🇳 中国 (CNY)      │
│ 🇯🇵 日本 (JPY)      │
│ ···                 │
│ ─────────────────── │  ← 구분선
│ 🇦🇫 افغانستان (AFN) │  ← 나머지 176개국
│ 🇦🇱 Shqipëria (ALL) │
│ ···                 │
└─────────────────────┘
```

### 8-4. 다국어 관리 대시보드 (`/admin/i18n`)

```
┌─── 번역 현황 ────────────────────────────────────────────────────┐
│  🇰🇷 ko  ████████████████████  100% (50/50)                      │
│  🇺🇸 en  ████████████░░░░░░░░   72% (36/50)  ← 14건 미번역       │
│  🇨🇳 zh  ████████░░░░░░░░░░░░   56% (28/50)                      │
│  ···                                                              │
└──────────────────────────────────────────────────────────────────┘

┌─── 미번역 키 (en 기준) ─────────┐  ┌─── 최근 수정 이력 ────────────┐
│ board.categories.FREE           │  │ 2026-06-02  admin  auth.login │
│ board.newPost                   │  │ 2026-06-01  admin  common.save│
│ admin.menu.users                │  │ ···                           │
└─────────────────────────────────┘  └───────────────────────────────┘
```

---

## 9. API 엔드포인트

| 경로 | 메서드 | 역할 | 인증 |
|---|---|---|---|
| `GET /api/i18n/langs` | GET | 언어 목록 (use_yn='Y' 필터) | USER+ |
| `POST /api/i18n/langs` | POST | 언어 등록 | ADMIN |
| `PUT /api/i18n/langs/[cd]` | PUT | 언어 수정 | ADMIN |
| `GET /api/i18n/countries` | GET | 국가·통화 목록 (dis_ord_seq 순) | USER+ |
| `PUT /api/i18n/countries/[cd]` | PUT | 국가 수정 (use_yn 등) | ADMIN |
| `GET /api/i18n/namespaces` | GET | 네임스페이스 목록 | USER+ |
| `POST /api/i18n/namespaces` | POST | 네임스페이스 등록 | ADMIN |
| `GET /api/i18n/messages` | GET | 메시지 조회 (ns_cd, lang_cd 필터) | USER+ |
| `POST /api/i18n/messages` | POST | 메시지 등록 | ADMIN |
| `PUT /api/i18n/messages/[id]` | PUT | 메시지 수정 + revalidateTag | ADMIN |
| `DELETE /api/i18n/messages/[id]` | DELETE | 메시지 삭제 | ADMIN |
| `POST /api/i18n/messages/bulk` | POST | 일괄 등록 (시드·동기화용) | ADMIN |
| `GET /api/i18n/stats` | GET | 언어별 번역 완료율 통계 | ADMIN |
| `POST /api/i18n/sync` | POST | DB→JSON 동기화 + 캐시 무효화 | ADMIN |

---

## 10. 구현 단계 (Phase)

### Phase 0 — 스킬 파일 생성 ✅ **완료**
- `.claude/skills/multi-lang/SKILL.md` 생성
- `lang_cd/lang_map.json` 생성 (11개국 매핑)
- `lang_cd/supported_locales.json` 생성 (런타임 SSoT)

### Phase 1 — 의존성 & 설정 파일
```bash
npm install next-intl@^4.13.0
```
- `i18n/routing.ts` — `defineRouting` (11 locales, as-needed prefix)
- `i18n/request.ts` — `getRequestConfig` (DB 조회 + unstable_cache)
- `i18n/navigation.ts` — `createNavigation` (locale-aware Link·router)
- `next.config.ts` — `createNextIntlPlugin` 적용
- `global.d.ts` — `AppConfig` 타입 (키 누락 컴파일 에러)
- `lib/i18n/locales.ts` — 런타임용 locale 목록 (스킬 JSON 복제)

### Phase 2 — 디렉터리 이동 & 레이아웃
- `app/*` → `app/[locale]/*` (api 제외)
- `app/[locale]/layout.tsx` — `<html lang={locale}>` 동적화
- `lib/fonts.ts` — locale별 Noto 서브셋 CSS 변수 스왑
- `globals.css` — `.font-kr`, `.font-jp` 등 유틸 추가

### Phase 3 — proxy.ts 수정 (인증 + i18n 체이닝)
- `intlMiddleware = createMiddleware(routing)` 선언
- `stripLocale()` 헬퍼 추가
- 인증 리다이렉트 시 locale prefix 보존 (`/en/admin` → `/en/login`)
- **`export async function proxy` named export 형태 유지** (Next 16 필수)

### Phase 4 — Supabase DB 마이그레이션 (DA 표준 v2)
- 마이그레이션 8개 순서 실행 (§7-5 참조)
- `i18n_cntry_mst` — CSV 187개국 시드
- `i18n_msg` — `messages/ko.json` 초기 로드

### Phase 5 — 번역 파일 & 키 치환
- `messages/ko.json` 작성 (기존 한글 추출)
- 11개 파일 생성 (초기엔 ko 값 복사)
- `next/link` → `@/i18n/navigation` Link 치환 (14곳)
- `lib/board.ts` CATEGORY_NAME → `t('board.categories.코드')` 전환
- 핵심 화면 우선 치환 (board layout, auth, admin)

### Phase 6 — 국가 선택 콤보박스
- `components/i18n/CountrySelector.tsx` — 공통 클라이언트 컴포넌트
- `components/i18n/useCountrySelector.ts` — 국가 목록 + locale 전환
- `countryToFlag(code)` 유틸 — Regional Indicator Symbol 변환
- Board 헤더(`BoardUserMenu` 옆) + Admin 헤더(`AdminLogoutButton` 옆) 삽입
- `app/api/i18n/countries` — `i18n_cntry_mst` GET API

### Phase 7 — 언어 전환 UI & 다국어 관리 화면
- `LanguageSwitcher` 컴포넌트 (헤더 연동)
- `app/[locale]/admin/(protected)/i18n/` 관리 화면 (§F4 참조)
- 번역 매트릭스 인라인 편집 + 미번역 하이라이트
- DB→JSON 동기화 화면
- `generateMetadata` locale화 (login 등 static metadata 전환)

---

## 11. 검증 체크리스트

| Phase | 항목 |
|---|---|
| 1 | `npm run build` 통과 |
| 2 | `/`→ko Noto KR 폰트, `/en`→latin, `/th`→태국 글리프 정상 |
| 3 | 미인증 `/en/admin`→`/en/login` 리다이렉트, 세션 쿠키 갱신 유지 |
| 4 | DA 감리: 시스템 컬럼 순서·NOT NULL·DEFAULT 준수, 트리거 동작 |
| 4 | `i18n_cntry_mst` 187개국 시드 확인 |
| 5 | 빌드 타입 통과 (키 누락 없음), `/en` 영어 텍스트 표시 |
| 6 | 콤보박스에 국기·현지 국가명·통화코드 정상 표시 |
| 6 | 국가 선택 시 locale 전환 + URL 변경 확인 |
| 7 | 관리 화면에서 번역 수정 → 5분 내 반영 |
| 7 | 동기화 버튼 → `messages/*.json` 11개 재생성 확인 |
| 7 | USER 역할 `/admin/i18n` 접근 차단 확인 |

---

## 12. 주요 리스크

| 리스크 | 대응 방안 |
|---|---|
| `proxy` named export 깨짐 | 체이닝 후에도 `export async function proxy` 형태 유지 (Next 16 필수) |
| intl + Supabase 쿠키 합성 누락 | `setAll`이 `intlMiddleware(request)` 반환 response에 쿠키 set |
| CJK/Thai 폰트 용량 | locale별 단일 Noto 서브셋, `display:swap` |
| 751건 한글 일괄 치환 | 섹션(common/auth/board/admin) 단위 PR 분리 |
| 국가 선택 콤보박스 187개 목록 성능 | `GET /api/i18n/countries` 결과 5분 캐싱 |
| 환율 표시 정확도 | Phase 1은 통화코드만, Phase 2에서 외부 API 연동 |
| `i18n_cntry_mst.country_mot_nm` 이모지 오염 | CSV 일부 행에 이모지 혼입 — 시드 전처리 필터 필요 |
| DA 표준 v2 컬럼 혼용 | `brd_*`의 `reg_usr_id` 패턴과 혼동 주의. 신규 `i18n_*`는 `regr_id`/`modr_id`만 사용 |

---

## 13. 관련 파일 참조

| 파일 | 역할 |
|---|---|
| `.claude/skills/multi-lang/SKILL.md` | Claude 다국어 처리 가이드 |
| `.claude/skills/multi-lang/lang_cd/lang_map.json` | 11개국 locale 매핑 |
| `.claude/skills/multi-lang/lang_cd/supported_locales.json` | 지원 locale SSoT |
| `.claude/skills/multi-lang/lang_cd/references/currency_countries.csv` | 187개국 원본 데이터 |
| `.claude/plans/claude-skills-multi-lang-quirky-widget.md` | 상세 구현 플랜 |
| `docs/PRD.md` | 표준데이터 관리 프로그램 PRD |
| `docs/da-plan/notices/물리DB구축_표준준수_전파.md` | DA 표준 v2 체크리스트 |
