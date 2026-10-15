# OpenMetadata 스펙·문서 추출 메모 (설계서 §1·부록 B 원천, 2026-10-14)

원천 : GitHub open-metadata/OpenMetadata `openmetadata-spec/src/main/resources/json/schema/` (main, raw 조회), docs.open-metadata.org. REA 화면 관찰과 별개로 "모델·상태 머신"은 이 스펙이 정본.

## 1. 용어(GlossaryTerm) — `entity/data/glossaryTerm.json`
- 필수 `id`·`name`·`description`·`glossary`. 계층 `parent`(null = 루트)·`children`·`childrenCount`, `mutuallyExclusive`(형제 중 하나만 적용).
- 관계 `synonyms`(entityName[])·`relatedTerms`(termRelation 유형 있음)·`references`(name+endpoint URI).
- 거버넌스 `owners`·`reviewers`·`domains`·`tags`·`votes`·`usageCount`.
- 생명주기 `entityStatus`(→ `type/status.json` EntityStatus : **Draft · In Review · Approved · Archived · Deprecated · Rejected · Unprocessed**, 생성 시 생략하면 엔터티 유형의 초기 단계 부여), `deleted`(기본 false — 논리삭제), `disabled`.
- 버전 `version`(entityVersion : 0.1 시작, 호환 변경 Minor +0.1, 비호환 Major +1.0)·`updatedAt`·`updatedBy`·`changeDescription`·`incrementalChangeDescription`.
- 시사점(METAPI) : `std_term` 에 `apv_status` 가 이미 있음 → 상태값을 DRAFT·IN_REVIEW·APPROVED·REJECTED·DEPRECATED 로 확장, `synonyms` 는 표준사전 "유사어" 열(구 지침 3.3)로, `deleted` = `del_yn`.

## 2. 변경 이력 — `type/entityHistory.json`
- `changeDescription { fieldsAdded[], fieldsUpdated[], fieldsDeleted[], previousVersion, changeSummary }`, `fieldChange { name, oldValue, newValue }`(값은 JSON 문자열).
- `EntityHistory { entityType, versions[] }` 최신→과거 순.
- 시사점 : `mdl_chg_hist` 행 = (수집 시점 쌍, 객체 FQN, 변경 유형 ADD/DROP/ALTER, 필드명, old·new JSON) — OM 의 fieldChange 와 1:1. 버전 번호는 수집 시점 ID 로 대체(Major/Minor 불필요).

## 3. 테이블·컬럼 — `entity/data/table.json`
- Column 필수 `name`·`dataType`(약 80 enum), `dataLength`·`precision`·`scale`·`constraint`(NULL·NOT_NULL·UNIQUE·PRIMARY_KEY)·`ordinalPosition`·`description`·`tags`·`children`(map/struct)·`profile`(nullCount·uniqueCount·min·max·histogram).
- Table `tableType`(Regular·View·MaterializedView·Partitioned·Foreign … 15종)·`tableConstraints`(UNIQUE·PRIMARY_KEY·FOREIGN_KEY·…, `columns`·`referredColumns`·`relationshipType`)·`schemaDefinition`(DDL 원문)·`dataModel`(DBT|DDL, rawSql)·`usageSummary`·`lifeCycle`.
- 시사점 : `mdl_col_hist` 속성 = 이름·순서·타입·길이·정밀도·스케일·NULL·기본값·PK/UK/FK 여부·설명(COMMENT); `mdl_tbl_hist` 에 `tbl_tp_cd`(TABLE·VIEW·MVIEW·PARTITIONED·FOREIGN)·DDL 원문 보관 여부는 선택. `profile` 은 **수집 금지**(§5 구조만).

## 4. 태그/분류 — `entity/classification/tag.json`
- 필수 `id`·`name`·`description`, `classification`(집합)·`parent`·`children`·`mutuallyExclusive`·`disabled`(시스템 태그는 삭제 대신 비활성)·`deprecated`·`usageCount`·`style`·`provider`.
- 시사점 : `cod_set`(classification) / `cod_val`(tag) 2계층 대응. `disabled`·`deprecated` → `cod_val.use_yn`·유효종료일자(04 §6.1 코드값 폐기 = 유효종료 + 사용여부, 삭제 금지).

## 5. 용어 승인 워크플로 — docs how-to-guides/data-governance/glossary/approval
- 글로서리에 Reviewers 가 있으면 New Term → **Draft** → Reviewers 에게 **Task** 생성(Overview 탭에서 상세, 답글·@멘션) → **Approved / Rejected**. Reviewers 만 승인·반려. **Reviewers 없으면 자동 Approved.**
- 시사점 : `approval_queue` 확장 — 대상 유형(단어·도메인·용어·코드·모델·튜닝 권고), 검토자 지정, 검토자 없으면 자동 승인 옵션(DA 1인 체계면 자기 승인 금지 규칙과 충돌 → 자동 승인 **불채택**, 항상 DA 승인), 코멘트 스레드(`apv_cmnt` 선택).

## 6. CSV 대량 가져오기 — docs …/glossary/import
- Export(템플릿/현재 데이터) → CSV 작성(열 : parent·name*·displayName·description*·synonyms(;)·relatedTerms(;)·references(name;url;…)·tags(;)) → Import 업로드 → 검증·**Preview** → Import 확정 → 성공/실패 메시지. 문서상 행별 오류 보고·dryRun 파라미터는 미기재(API 레퍼런스 [확인중 : OpenMetadata API 문서]).
- 시사점 : P06 엑셀 업로드 = 템플릿 다운로드(P07 과 공용) → 업로드 → **행별 검증 결과 미리보기(오류 행 강조)** → 반영(P20 승인 경유). OM 보다 한 단계(행별 오류) 더 둔다.

## 7. 미확인 → REA 화면 관찰로 채울 것
- 설정 메뉴 트리 실제 명칭·깊이(S1), 승인 화면의 버튼·상태 배지·Task 패널 배치(S2), 테이블 Schema 탭 컬럼 그리드 항목(S3), Version History diff 표현(S4), Lineage 역조회 UI(S5), 검색 필터 축(S6), Data Quality 결과·추이(S7), CSV import 미리보기 화면(S8), `/api/v1/*` 호출 형태·페이지네이션 파라미터.
