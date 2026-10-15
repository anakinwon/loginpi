## 1. 참조 사이트 분석 (REA)

### 1-1. 선정 근거

| 후보 | 요건 12영역 적합 | 분석 가능성 | 라이선스 | 판정 |
|---|---|---|---|---|
| **OpenMetadata** (sandbox.open-metadata.org, docs, GitHub openmetadata-spec) | 8 — 용어집(계층·동의어·검토자·상태), 커넥터 수집, 버전 이력(changeDescription), 컬럼 계보, 검색, 용어 승인 워크플로(Draft→Approved/Rejected·Task), CSV import(Preview), 품질 테스트 | 공개 샌드박스(Google 로그인) + JSON Schema·REST 공개 → 화면·모델·API 셋 다 검증 가능 | Apache-2.0 | **1순위** |
| DataHub (demo.datahub.com, 공식 문서 datahubproject.io 2026-10-14 확인) | 6 — 용어집·수집·스키마 이력·계보·검색·assertion | 데모 로그인 방식 [확인중 : REA — 마스터 세션], 승인 워크플로는 DataHub Cloud 기능으로 문서에 표기(2026-10-14) | Apache-2.0(코어) | 2순위 보조(스키마 이력 화면) |
| NCP Data Catalog(네이버클라우드 공식 가이드, 2026-10-14 확인) | 3 — 스캐너·스키마 버전·태그 | 문서만(콘솔 로그인·VPC) | 상용 | 문서 보조 |
| Metatron·Amundsen·Atlas·eGovFrame | — | 공개 데모 없음(Amundsen 은 GitHub 저장소 보관 처리 2026-09, 구 데모 도메인은 이전돼 접속하지 않음 — 2026-10-14 확인) | Apache-2.0 등 | 제외 |
| 국내 상용 6종 | 10+ | 공개 화면 없음 | 상용 | 제안서 §1 근거로 이미 반영 |

어느 제품도 갖지 않아 **직접 설계**한 영역 : 모델↔DB 현행화 비교(§6-3), 표준단어·도메인 2계층과 `단어_도메인` 조립(§3-3 P03), 표준코드(§4 `cod_*`), 명명 준수율(§6-4), DDL 생성기(§2-4 `genDdl`), `pg_stat` 기반 튜닝(§7).

### 1-2. 스펙·문서 기준 분석 (GitHub `openmetadata-spec` · docs.open-metadata.org, 2026-10-14)

원문 메모 `rea/00_spec_notes.md`. 설계 반영 지점 :

| OpenMetadata | 확인 내용 | METAPI 반영 |
|---|---|---|
| GlossaryTerm `entityStatus`(type/status.json) | Draft · In Review · Approved · Archived · Deprecated · Rejected · Unprocessed, 생성 시 생략하면 유형별 초기 단계 | `apv_sts_cd` = DRAFT·PENDING·APPROVED·REJECTED 4값(§3-2 상태 머신, 승계 `approval_queue.apv_status` 와 동일). In Review=PENDING, Deprecated 는 `use_yn`/`del_yn` 으로 대체, Archived·Unprocessed 는 미채택 |
| GlossaryTerm 속성 | `parent/children`·`synonyms`·`relatedTerms`·`reviewers`·`owners`·`deleted`(논리삭제)·`version`·`changeDescription` | 유사어 = `pg_trgm` 경고 + (3단계) `std_synm`; `deleted` = `del_yn`; `reviewers` 는 DA 단일 승인자라 미채택 |
| 승인 워크플로(docs) | Reviewers 있으면 Draft → Task 생성 → Reviewers 만 Approve/Reject, **없으면 자동 Approved** | 자동 승인 **불채택**(자기 승인 금지), P20 승인은 항상 master. Task = `approval_queue` 행 + 코멘트 |
| entityHistory `changeDescription` | `fieldsAdded/Updated/Deleted[] {name, oldValue, newValue}`, `previousVersion`, 버전 0.1 시작·Minor/Major | `mdl_chg_hist`(`chg_tp_cd` ADD/DROP/ALTER, `old_val`·`new_val` JSONB) — 1:1 대응, 버전 대신 수집 시점 쌍(§6-2) |
| Table / Column | `dataType`(80 enum)·`dataLength`·`precision`·`scale`·`constraint`(NULL·NOT_NULL·UNIQUE·PRIMARY_KEY)·`ordinalPosition`·`description`·`profile`, `tableType` 15종, `tableConstraints`(FK·relationshipType), `schemaDefinition`(DDL 원문) | `mdl_col_hist` 속성 집합(§4-3), `tbl_tp_cd` TABLE/VIEW/MVIEW/PARTITIONED/FOREIGN, `profile` 은 **수집 금지**(구조만) |
| Classification / Tag | 집합·값 2계층, `mutuallyExclusive`·`disabled`(삭제 대신 비활성)·`deprecated`·`usageCount` | `cod_group`/`cod_val`, 값 폐기 = `use_yn`+유효종료일자(04 §6.1) |
| Glossary CSV import(docs) | Export(템플릿/현재) → 열 parent·name*·displayName·description*·synonyms(;)·relatedTerms·references·tags → Import → 검증·Preview → 확정 → 성공/실패 메시지 | P06 = 템플릿 다운로드 → 업로드 → **행별 검증 미리보기** → 반영(승인 경유). 행별 사유를 OM 보다 한 단계 더 둠 |
| Lineage(docs) | 컬럼 수준 계보 그래프 | P23 은 그래프 대신 역조회 목록(1단계), 그래프는 3단계 |
| Data Quality TestCase | Success/Failed/Aborted 결과·추이 | P18 위반 목록 + P19 추이 스파크라인 |

### 1-3. REA 화면 관찰 (sandbox.open-metadata.org)

상태 : **[확인중 : 마스터 — Google 로그인 Chrome(디버그 포트 9222) 제공]**. 비로그인 공개 화면·번들 분석도 이 세션에서는 Chrome 실행 권한이 거부돼 수행하지 못했다(2026-10-14, 아래 S0). 제공되면 `rea` CLI(connect 모드, passive 관찰·쿠키 미수집)로 시나리오 S1~S8 을 관찰해 Evidence ID 와 스크린샷을 부록 A 에 싣고 이 절을 갱신한다.

| # | 시나리오 | 관찰 목적 | 반영 절 |
|---|---|---|---|
| S0 | 비로그인 공개 화면·JS 번들(라우트 트리·`/api/v1/*` 목록) | 마스터 세션 또는 승인된 헤드리스 Chrome | 부록 A |
| S1 | 설정 메뉴 트리 | 메뉴 계층·명칭 | §3-1 |
| S2 | 용어 추가 → Draft → 검토자 → Approve/Reject | 상태 배지·Task 패널·API 호출 순서 | §3-2·§5 A16 |
| S3 | 테이블 상세 Schema 탭 | 컬럼 그리드 항목·제약 표시 | §3-3 P08·P16 |
| S4 | Version History | diff 표현 | §3-3 P15·§6-2 |
| S5 | Lineage 컬럼 수준 | 역조회 UI | §3-3 P23 |
| S6 | 검색·필터 | 결과 카드·필터 축 | §3-3 P25 |
| S7 | Data Quality 결과·추이 | 상태·추이 그래프 | §3-3 P18·P19 |
| S8 | Glossary Import 미리보기 | 검증→미리보기→확정 화면 | §3-3 P06 |

비로그인 공개 화면·JS 번들 분석(S0)은 로그인 여부와 무관하게 가능하지만 이 세션에서는 수행하지 못했고(위), 결과가 나오면 부록 A 에 기록한다. 관찰 전에는 §1-2 스펙·문서 기준으로 설계했고, 화면 관찰로 바뀌는 범위는 주로 레이아웃 세부(§3)로 예상한다 [확인중 : 마스터 — REA 관찰 후 확정].
