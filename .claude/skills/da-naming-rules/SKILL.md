---
name: da-naming-rules
description: 신규 테이블·컬럼·DDL 작성 또는 리뷰 시 한국 DA 표준 명명규칙을 적용한다. CREATE TABLE, ALTER TABLE, 마이그레이션 SQL 작성, 데이터 모델 설계, 엔터티·속성 명명이 필요할 때 사용. 도메인 접두사·시스템 컬럼 4개·표준용어 형식·논리삭제 규칙 포함.
---

# DA 표준 명명규칙 적용

## 정본 문서 (반드시 먼저 읽기)

규칙의 단일 진실 소스: **`docs/da/데이터표준규칙.md`**
DDL 작성 전 해당 문서의 §0(설계원칙)·§1(표준사전)·§2(테이블)·§3(컬럼)·§4(논리삭제)를 확인한다.

## 핵심 요약 (빠른 참조)

### 테이블 명명
- 도메인 접두사 필수: `sys_` `brd_` `std_` `pi_` `auth_` `cod_` `msg_` `i18n_`
- 소문자 snake_case, 복수형 금지, 단어 3개 이하

### 표준용어 형식 (컬럼명)
- `표준단어1(_표준단어n)_표준도메인` — 반드시 도메인 약어로 끝남
- 도메인 약어: `_id` `_nm` `_cd` `_yn` `_dtm` `_dt` `_no` `_cnt` `_amt` `_sz` `_ord` `_url` `_desc`
- 미등록 표준단어 사용 금지 (`/admin/std/words`에서 등록 후 사용)

### 시스템 컬럼 4개 (전 테이블 필수, 마지막 4개)
```sql
regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
```

### 논리 삭제 (운영 테이블 필수)
```sql
del_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
del_dtm TIMESTAMPTZ
```
- 물리 `DELETE`/`DROP TABLE` 절대 금지

### 타입 규칙
- `_dt`/`_dtm` 컬럼: VARCHAR/TEXT 금지 — `DATE`/`TIMESTAMPTZ`(UTC) 강제
- Y/N 플래그: `CHAR(1)` + CHECK
- 파일 크기·금액: `BIGINT`

## 완전한 DDL 템플릿

`docs/da/README.md` §6의 신규 테이블 템플릿을 사용하면 da-ddl-guard Hook을 통과한다.

## 주의

- `sql/*.sql` 작성 시 **da-ddl-guard Hook이 자동 검사** — 위반 시 차단되며 DA 승인(`-- DA-APPROVED:` 주석) 필요
- 상세 지침 원문: `references/` (표준단어·도메인·용어·코드 지침서 DOCX, 명명규칙 PPTX)
