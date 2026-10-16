# 일괄등록(단어·도메인·용어) 설계

- 근거 : PRD 표 FR-05·10(엑셀 일괄등록 : 중복 검사·정합성 체크·행 단위 오류), PRD API 표 `/api/areas/[areaId]/bulk/{words,domains,terms}`(검증·반영), Wordict 일괄등록 3종(`requirement/reqst.md` 05-2·05-4·05-6)
- 1차 입력 양식 : 행안부 공공데이터 공통표준 CSV(2025-11-01, loginpi `docs/da/references` 02.01~02.03) 헤더
- 작성 : 2026-10-15

## 1. 확정 결정 (2026-10-15 마스터)

| 번호 | 항목 | 결정 |
|---|---|---|
| D1 | 도메인 결정 방식 | 우리 규칙 유지 : 대표도메인명 = 용어 끝 단어(행안부 "끝 단어의 도메인분류명" 방식 미채택) → 위반 행은 오류 보고 |
| D2 | 단일 단어 용어 | 비표준으로 수용(`std_term.nstd_yn = 'Y'`), 일괄등록 경로에서만 |
| D3 | 도메인명 표기 | DA# 논리타입 약어 유지(`가격N9,2` → `가격NM9,2` 재생성) |
| D4 | 담을 곳 없는 열 | `sql/010` 칸 추가(금칙어목록·단위·허용값·표현형식·행정표준코드명·소관기관명) |
| D5 | 파일 형식 | CSV만(UTF-8, BOM 허용). xlsx 의존성 추가 안 함 |
| D6 | 권한 | 분류체계 관리자 전용, 즉시 반영(승인 요청 경로 없음) |
| D7 | 이미 있는 이름 | 건너뛰고 보고(덮어쓰기 없음) |
| D8 | 도메인유형 | 도메인그룹 `번호` → NO, `코드` → CD, 그 외 → GNRL |
| D9 | 일정 | 1단계로 당겨 즉시 구현(ROADMAP 2단계 항목에서 이동) |
| D10 | 용어 이음동의어 목록 | `std_term.syn_txt` 칸 추가(쉼표 구분 문자열, `sql/011`) |

## 2. 흐름

```
CSV 선택 → (브라우저) CSV 파싱·1,000행 묶음 → POST check 묶음별 → 결과 표·CSV 내려받기
        → [반영] → POST apply 묶음별(서버가 다시 검증) → 진행률·최종 집계
```

- 순서 : 단어 → 도메인 → 용어(뒤 유형은 앞 유형이 DB에 있어야 검증 통과)
- 브라우저는 파싱·분할만 담당하고, **판정은 매 요청 서버가 다시 수행**한다(클라이언트 값 신뢰 안 함). 요청 본문 크기 제한(Vercel 4.5MB)도 묶음 분할로 회피
- 파일 최대 20,000행, 묶음 1,000행
- 묶음 사이 중복 : 서버는 묶음 안만 대조하므로, 화면이 검증 결과를 모아 앞 묶음 정상 행과 이름(용어는 논리·물리명)이 겹치는 뒤 행을 `DUP_IN_FILE`로 바꾼다(`markCrossBatchDup`). 반영 시에는 앞 묶음이 이미 저장되어 서버가 `SKIP`으로 판정

## 3. API

`POST /api/areas/[areaId]/bulk/{words|domains|terms}` 본문 `{ mode: 'check' | 'apply', start_row: number, header: string[], rows: string[][] }`

- 관리자 전용(`requireAreaRole(areaId, 'ADMIN')`), `rows` 최대 1,000
- 응답 `{ ok, results: [{ row_no, status, code?, name, detail? }], applied? }`
- `status` : `OK` 정상 / `NSTD` 비표준 수용(용어 단일 단어) / `SKIP` 이미 있음 / `EXCL` 폐기 행 제외 / `ERR` 오류(코드)
- apply 는 같은 검증 후 `OK`·`NSTD` 행만 DB 함수로 반영. 경합으로 생긴 유일 충돌은 `ON CONFLICT DO NOTHING`으로 건너뛰고 `SKIP` 보고

## 4. 변환·검증 규칙

공용 순수 함수는 `src/lib/bulk.ts`(CSV 파서·헤더 대응·행 변환), 규칙 검사는 기존 함수 재사용(`term-split`·`domain`·`term`·`dom-name`). 헤더는 이름으로 찾고, 필수 헤더가 없으면 묶음 전체 `HEADER_MISSING`

### 4.1 단어 (02.01)

| CSV | 대상 | 규칙 |
|---|---|---|
| 공통표준단어명 | `dic_log_nm` | 필수 |
| 공통표준단어영문약어명 | `dic_phy_nm` | 필수, 영문 시작 영숫자, 대문자화 |
| 공통표준단어 영문명 | `dic_eng_nm` | |
| 공통표준단어 설명 | `dic_desc`, `dic_chn_nm` | 앞부분 `한자.`(CJK 문자 + 마침표)를 한자명으로 분리, 나머지 설명 |
| 형식단어여부 | `attr_clss_yn` | Y → 속성 분류어 |
| 이음동의어 목록 | `std_dic_rel`(SYN) | 쉼표 분리. 사전에 등록된 단어와 같은 표기는 제외하고 `detail`에 보고 |
| 금칙어 목록 | `forbid_word_txt` | |
| 개정구분명 | | `폐기` → `EXCL` |
| 공통표준도메인분류명·제정차수·개정항목·개정사유 | 사용 안 함 | 분류명은 D1에 따라 미사용 |

오류 : 논리명 중복(DB `SKIP` / 파일 안 두 번째 이후 `ERR DUP_IN_FILE`), 물리명 형식

### 4.2 도메인 (02.02)

| CSV | 대상 | 규칙 |
|---|---|---|
| 공통표준도메인그룹명 | `dom_grp_id`, `dom_tp_cd` | 그룹명 → ID(없으면 `ERR NOT_FOUND`), D8 |
| 공통표준도메인분류명 | `key_dom_nm` | `domKeyWordError` : 확정 속성 분류어 단어여야 함 |
| 데이터타입 | `lgc_tp_cd` | `std_lgc_tp.lgc_tp_nm` 일치(NUMERIC·VARCHAR·CHAR·DATETIME) |
| 데이터길이·데이터소수점길이 | `data_len`·`data_scale` | |
| 공통표준도메인명 | (검증용) | 서버가 `buildDomName`으로 재생성, CSV 값은 결과 `detail`에 원본명으로 표시 |
| 저장형식 / 표현형식 / 단위 / 허용값 | `fmt_txt` / `disp_fmt_txt` / `unit_nm` / `alw_val_txt` | |
| 공통표준도메인설명 | `dom_desc` | |

오류 : 재생성 이름 중복(`SKIP`/`DUP_IN_FILE`), 타입 없음, 분류명이 단어 아님·속성 분류어 아님

### 4.3 용어 (02.03)

| CSV | 대상 | 규칙 |
|---|---|---|
| 공통표준용어영문약어명 | `dic_ids` | `_`로 나눈 토큰마다 물리명이 같은 확정 단어. 같은 물리명 단어가 여럿이면 논리명 결합이 용어명과 맞는 조합 선택 |
| 공통표준용어명 | (검증용) | 선택 단어 논리명 결합 = 용어명(`TERM_NAME_MISMATCH`). 저장 이름은 서버 `termNames` 생성값 |
| 공통표준도메인명 | `dom_id` | `대표명 + N/V/C/D + 길이[,소수점]` 분해 → 타입 N=NUMERIC·V=VARCHAR·C=CHAR·D=DATETIME → DA# 도메인명으로 바꿔 조회(없으면 `DOM_NOT_FOUND`) → `termDomError`(D1) |
| 허용값 / 표현 형식 | `alw_val_txt` / `disp_fmt_txt` | 연결 도메인 값과 다를 때만 저장 |
| 행정표준코드명 / 소관기관명 | `adm_cd_nm` / `own_org_nm` | |
| 공통표준용어설명 | `term_desc` | |
| 개정구분명 | | `폐기` → `EXCL` |
| 저장 형식 | 사용 안 함 | CSV 전 행이 도메인 저장형식과 같음 |
| 용어 이음동의어 목록 | `syn_txt` | 쉼표 분리·중복 제거 후 `, `로 결합(D10) |

규칙 : `termRuleError` 결과가 `TERM_SINGLE_WORD`뿐이면 `NSTD`(D2), 그 외 규칙 위반은 `ERR`. 이름 중복은 `SKIP`/`DUP_IN_FILE`

## 5. DB 함수 (`sql/011_fn_bulk.sql`)

- `fn_bulk_ins_std_dic(p_area_id, p_rows JSONB, p_usr_id)` / `fn_bulk_ins_std_dom(...)` / `fn_bulk_ins_std_term(...)` : 배열 행마다 `INSERT … ON CONFLICT DO NOTHING RETURNING`, 들어간 행만 `std_audit_log` INS 기록(용어는 `std_term_dic`, 단어는 `std_dic_rel` 동반). 반환 = 반영된 행 번호 배열
- 한 호출 = 한 트랜잭션(묶음 단위 원자성). 이전 묶음은 유지되므로 반영 전 check 필수
- 권한 `fn_grant_svc_only`, 시스템 컬럼 규칙 동일

## 6. 화면 `/areas/[areaId]/bulk`

- 유형 탭(단어·도메인·용어) → 파일 선택 → [검증] → 상태별 건수 + 정상 외 행 표(화면 500행, 전체는 결과 CSV) → [반영(N건)] → 진행률 → 완료 집계
- 분류체계 목록에 "일괄등록" 링크(관리자에게만)

## 7. 검증 계획

- 단위 테스트 : CSV 파서(따옴표·줄바꿈·BOM), 단어 설명 한자 분리, 도메인명 분해, 용어 토큰 분해
- 로컬 PG : 011 함수(충돌 건너뜀·감사 이력·구성 저장)
- Supabase API : 시험 분류체계에 행안부 CSV 3종 전량 check → apply → 집계가 check와 일치하는지, 재실행 시 전부 `SKIP`, 편집자 403. 시험 데이터 논리 삭제

## 8. 시험 결과(2026-10-15, 행안부 CSV 3종 전량, Supabase)

| 유형 | 검증 | 반영 | 재검증 |
|---|---|---|---|
| 단어 3,284 | 정상 3,280 · 파일 안 중복 2(보훈·중권역) · 폐기 2 | 3,280(동의어 160) | 정상 0 |
| 도메인 129 | 정상 115 · 오류 14(DOM_KEY_NOT_WORD : 시분초·연월일 등 단어 파일에 없는 분류명) | 115 | 정상 0 |
| 용어 13,176 | 정상 7,635 · 비표준 23 · 오류 5,513(DOM_NOT_FOUND 3,396 · TERM_DOM_MISMATCH 2,113 · 파일 안 중복 2 · 폐기 단어 사용 2) · 폐기 5 | 7,658 | 정상 0 |

- 용어 오류 5,509건(중복·폐기 단어 제외)은 D1(대표도메인명 = 끝 단어)과 표준 선등록 규칙에 따른 결과. DOM_NOT_FOUND 는 연결 도메인이 위 14건 오류 도메인이거나 끝 단어와 다른 분류명 도메인인 경우
- 감사 이력 11,053건(반영 행 수와 같음), 구성 없는 용어 0건, 편집자 403, 필수 헤더 누락 400
