# Pi통신 과금 데이터 표준화 — 공용 컨텍스트 (모든 에이전트 필독)

> 작성 2026-11-07 · 마스터 지시 "약 200여 개 테이블 → 테스트 데이터 생성(오늘) → CDC 파이프라인 → 데이터 레이크 → AI 분석 센터(다음)".
> 운영 방식 = **마스터 위임 자동 승인 모드**(지시 원문 "가장 최선의 방안을 자동으로 선택하고 알아서 모두 승인"). 판단이 갈리면 아래 결정 기록·규칙을 따르고, 없으면 실제 이동통신 실무 관행 + 이 저장소 DA 표준 중 더 엄격한 쪽을 택한 뒤 산출물의 '결정 메모'에 근거를 남긴다. 질문하지 말고 진행한다.

## 0. 역할(지시 원문 이름 그대로)

| 역할 | 하는 일 |
|---|---|
| subagent_planner | 주제영역 정의 — 상품·고객·가입·청구·수납·미납·파트너 7개(+ 업무 모듈 정산 STL), 실제 이동통신 기준(국내 3사 실무·TM Forum SID/eTOM·3GPP 과금 개념) |
| subagent_subject_modeler | 개념 모델 — 주제영역별 핵심 엔터티 + 주요 속성 |
| subagent_logical_modeler | 논리 모델 — 핵심 + 기본·일반 엔터티 전부, 정규화(3NF) |
| subagent_physical_modeler | 물리 모델 — PK·FK(설계)·인덱스·반정규화·파티셔닝 |
| subagent_data_migrationner | 대용량 샘플 데이터 — 관계 유지·무작위·의도적 편향 분포 |
| masteragent_da_coordinator | 단계마다 취합·리뷰·승인·통제(반려 = 직접 고치게 지시하거나 직접 수정) |

## 1. 결정 기록 (2026-11-07, 착수 시 즉시 결정)

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| D1 | 오늘 범위 | 표준·개념·논리·물리 모델 + DDL + 테스트 데이터 생성·적재까지. CDC·레이크·AI 는 다음 세션 | 지시 원문 |
| D2 | 대상 DBMS | **PostgreSQL 17**(로컬 Docker `pitel-pg`, 포트 55432, DB `pitel` = 적재 대상, `pitel_dev` = 검증용). `wal_level=logical`·`pg_stat_statements` 켜 둠(다음 단계 CDC·dbms.pi 진단 대비) | dbms.pi·PiCDC 1차 = PostgreSQL, 고객 DB 수억 건은 무료 클라우드 한도 초과 |
| D3 | 규모 | 주제영역 7개 × (핵심 약 10 + 기본·일반 약 20) ≈ **엔터티·테이블 200개 남짓**(200~230, 정산 모듈 포함). 파티션 하위 테이블은 개수에 넣지 않는다 | "약 200여 개 테이블", "10개 정도 핵심", 정산 = 업무 모듈(마스터 2026-11-07) |
| D4 | 주제영역·약어 | 상품 `PRD` · 고객 `CUS` · 가입 `ORD` · 청구 `PAY`(사용량·요금계산 포함) · 수납 `INV` · 미납 `COL` · 파트너 `PRM`(대리점·유통망·제휴사·콘텐츠 제공사·타 통신사·로밍 사업자)(**마스터 지정 2026-11-07** — 일반 영문 의미와 달라도 이 약어 고정). 프로젝트 접두 `PTL` → 테이블명 `PTL_<주제영역>_<엔터티 약어>[_접미어]`(모델 단계 대문자, PostgreSQL DDL 은 소문자) | schema.pi 프로젝트 접두·주제영역 약어 3자 규칙(sql/023) |
| D5 | 공통 기준 엔터티 | 공통코드·조직·지역·은행·카드사 같은 기준(REF) 엔터티는 가장 많이 쓰는 주제영역에 둔다(대리점·유통망·제휴사 = 파트너 PRM, 은행·카드사 = 수납, 지역 = 고객). 별도 '공통' 주제영역을 만들지 않는다 | 마스터 지정 7개 주제영역 |
| D6 | 참조무결성 | 관계·FK 는 **설계(모델·물리 FK 정의·ERD)만**, DDL 에 FK 제약 없음 — 대신 FK 칼럼 인덱스는 접근 경로에 따라 설계 | 마스터 결정 2026-10-20 RI 물리 미구현 |
| D7 | 시스템 칼럼 | 논리·물리 모델 JSON 에 넣지 않는다. **DDL 생성 때만** 테이블 맨 끝에 `LST_MDDTM`·`LST_MDFR_ID`·`LST_RGDTM`·`LST_RGTR_ID`(이 순서, 표준용어 그대로). 삭제여부·삭제일시는 시스템 칼럼 아님(필요하면 논리 속성) | 마스터 2026-10-17 |
| D8 | 데이터 기간 | **2010-01-01 ~ 2026-10-31**(청구 마감 2026-10월분까지). 최근으로 갈수록 많게 | 지시 원문 "2010년부터" |
| D9 | 데이터 규모 | 기준 데이터 수만 / 상품계 수백만 / 고객·가입계 수천만 / 요금계산·청구·수납계 수억. **전체 약 10억~12억 행, 인덱스 포함 디스크 ≤ 220GB**(C: 여유 375GB, 100GB 이상 남김). 생성 스크립트는 배율 `scale`(1.0 = 목표)로 줄일 수 있게 | 지시 원문 + 로컬 자원 |
| D10 | 데이터 성격 | 성능 고려 없이 무작위, **의도적 편향**(5절 S1~S14). 관계는 유지(부모 키 존재), 단 0.05% 고의 고아 행(S11) | 지시 원문 |
| D11 | 개인정보 | 실제 개인정보 금지 — 이름은 소수 목록 조합(중복 많게), 전화번호는 합성 010 번호, 주민번호 없음(생년월일·성별·암호화 값 자리 표시) | 개인정보보호 |
| D12 | schema.pi 반영 | schema.pi 에 분류체계 **"Pi통신 과금 데이터 표준화"** + 프로젝트 "Pi통신 과금 시스템"(접두 PTL, 대상 DBMS PostgreSQL 0014, 업종 TEL) + 주제영역 6 + 표준(단어·도메인·용어·공통코드) + 엔터티·속성·관계 + 물리(테이블·칼럼·인덱스·FK 정의) + 주제영역별 ERD 배치. 적재기는 멱등 SQL, **로컬 복제 DB 시험 통과 후** 메인이 운영에 적용 | 지시 원문 "schema.pi 에 녹여서" |
| D13 | 산출물 위치 | 저장소 `sitemap/schema.pi/pitel/`(앱 아님 — `.pi` 접미 없음, Vercel·tenant 스크립트 대상 밖). 데이터 자체는 Docker 볼륨 `pitel-pgdata`, 저장소에 넣지 않음 | |
| D15 | 정산 업무 모듈 | **정산 = 주제영역 아님, 업무 모듈 `STL`**(마스터 2026-11-07). 대리점 판매·유치 수수료, 사업자 간 상호접속료, 국제로밍(TAP), 콘텐츠·소액결제 제공사, 유통망 장려금, 세금계산서·지급 확정 엔터티를 업무가 가까운 주제영역(주로 PRM 파트너, 고객 요금 쪽은 PAY·INV)에 두고 JSON 엔터티·테이블에 `moduleCd:'STL'` 표시. 테이블명은 주제영역 규칙 그대로(`PTL_<주제영역>_…`) | 마스터 지시 |
| D14 | 적재 순서 | 테이블(PK·인덱스 없이) → 데이터 → PK·인덱스 → ANALYZE. 부모·자식은 결정적 키 공식(5절)이라 테이블끼리 병렬 적재 가능 | 대량 적재 표준 |

## 2. 모델링 규칙 (메모리·schema.pi 정본 요약 — 위반 = 반려)

1. **표준 먼저** : 엔터티명·속성명은 표준단어 조합(표준용어)만. 표준단어 = 논리명(한글)·물리 약어(영문 대문자)·영문 풀네임. 합성어는 약어 사이 `_` 없이 붙임(부제 = `SUBTTL`), `_` 는 서로 다른 표준단어를 이을 때만.
2. **모델 단계 이름은 무조건 대문자**(DBMS 무관). PostgreSQL DDL 생성 때만 소문자.
3. **엔터티 유형 4종**(schema.pi `mdl_ent.ent_tp_cd`) : `BASE` 실체(고객·회선) / `REF` 기준(코드·요금제·조직) / `ACT` 행위(가입·청구·수납·이벤트) / `PROC` 가공(집계·통계). 모델 단계 `CNCP` 핵심(개념) / `LGCL` 논리.
4. **엔터티 분류어·테이블 접미어**(sql/017) : 이력 `_H`, 상세·내역·기본·정보·통계·로그 등 — 단어 사전의 `tbl_sfx_txt` 를 쓴다.
5. **핵심 엔터티 필수 속성 4종** : ① 주식별자 ② 주식별자 명칭(~명) ③ 행위 일시(행위 엔터티 = ~일시, 실체 = ~등록일시) ④ 행위 상태 = **~상태유형코드**(~상태코드 단독 금지).
6. **공통코드 이름 3종만** : ~구분코드(값 2~3개·절대 안 늘어남, 예 성별구분코드) / ~종류코드 / ~유형코드(4개 이상·늘어날 수 있음 — 상태는 기본 유형코드).
7. 정규화 = 3NF 까지(반복 그룹·부분 종속·이행 종속 제거), N:M 은 관계 엔터티로 해소. 반정규화는 **물리 단계에서만**, 사유(조회 경로·건수) 기록.
8. **물리 객체 이름** : PK 제약·PK 인덱스 = `PK_<테이블>` / 인덱스 = `X_<테이블>_NN`(2자리, `IX_` 금지) / FK = `FK_<자식테이블>_NN`(정의만). PostgreSQL 은 DDL 에서 소문자(`pk_ptl_cst_cust`). 식별자 63자 넘으면 테이블 부분을 자른다.
9. 칼럼 순서 = PK → FK → 일반(업무 순) → (DDL 때) 시스템 칼럼 4.
10. 물리 데이터 타입은 표준 도메인에서 나온다(금액 `NUMERIC(15)`·일시 `TIMESTAMP`·일자 `CHAR(8)` 또는 `DATE` 등 — 도메인 사전이 정본).

## 3. 디렉토리·산출물 계약

```
sitemap/schema.pi/pitel/
  CONTEXT.md                 # 이 문서
  docs/01_subject_areas.md   # planner
  docs/02_conceptual.md      # subject_modeler 통합본(주제영역별 절)
  docs/03_standards.md       # 표준사전 요약
  docs/04_logical.md         # logical_modeler 통합본
  docs/05_physical.md        # physical_modeler 통합본(파티션·인덱스·반정규화 근거)
  docs/06_datagen.md         # data_migrationner(볼륨·편향·실행)
  model/areas.json           # 주제영역·엔터티 예산·교차 관계·볼륨 등급
  model/conceptual/<AREA>.json
  model/std/{words,domains,terms,codes}.json
  model/logical/<AREA>.json
  model/physical/<AREA>.json
  ddl/<NN>_<area>_tables.sql      # PK·인덱스 없는 CREATE TABLE(+파티션)
  ddl/<NN>_<area>_constraints.sql # PK·인덱스(적재 뒤)
  datagen/…                  # 2단계 워크플로가 만든다
  loader/…                   # schema.pi 적재기
  reviews/…                  # coordinator 리뷰·승인 기록
```

JSON 형식(모든 단계 공통 키, 한글 값 허용, 이름은 대문자 물리명) :

- `model/areas.json` : `{ project:{prjNm, tblPfx:'PTL', trgtDbms:'POSTGRESQL', indstryCd:'TEL'}, areas:[{code, nm, def, scope:[...], coreBudget, basicBudget, volumeTier, refs:[...]}], crossRels:[{from:'ORD.가입계약', to:'CUS.고객', card:'N:1', note}], volumeTiers:{T1..T4} }`
- `model/conceptual/<AREA>.json` : `{ area, entities:[{entNm, phyNm, tp:'BASE|REF|ACT|PROC', def, keyAttrs:[{attrNm, phyNm, role:'PK|NM|DTM|STS|ATTR', domNm}], rels:[{toEnt, toArea, card:'1:N|1:1|N:1', idn:true|false, opt:true|false, nm}] }] }`
- `model/std/words.json` : `[{wordNm, abbr, engNm, def, entClss:bool, attrClss:bool, tblSfx:'_H'|null}]` / `domains.json` : `[{domNm, grp, lgcTp:'VARCHAR|CHAR|NUMERIC|INTEGER|BIGINT|DATE|TIMESTAMP|TEXT', len, scale, def}]` / `terms.json` : `[{termNm, words:[...], phyNm, domNm, def}]` / `codes.json` : `[{termNm, kind:'구분|종류|유형', vals:[{cd, nm, def}]}]`
- `model/logical/<AREA>.json` : `{ area, entities:[{entId:'PRD-001', entNm, phyNm, tp, stg:'CNCP|LGCL', def, attrs:[{attrNm, phyNm, domNm, pk:bool, fk:{ent, attr}|null, nullYn:bool, seq, def}], rels:[{relNm, parent, child, card, idn, opt}], normNote }], newTerms:[…terms.json 형식] }`
- `model/physical/<AREA>.json` : `{ area, tables:[{tblNm, entId, def, estRows, cols:[{colNm, dataTp, nullYn, pk, seq, termNm, dflt}], pk:{nm, cols}, idx:[{nm, cols, unq, why}], fks:[{nm, cols, refTbl, refCols}], partition:null|{type:'RANGE|LIST|HASH', key, unit, from, to, note}, denorm:[{col, srcTbl, why}] }] }`

## 4. 로컬 DB

- 접속 : `docker exec -i pitel-pg psql -U postgres -d pitel_dev -v ON_ERROR_STOP=1`(비밀번호 불필요). Node 스크립트는 `sitemap/schema.pi/pitel/.env.local` 의 `PITEL_DB_URL`·`PITEL_DEV_DB_URL`(값 출력 금지, 커밋 금지).
- `pitel_dev` = 검증(작은 배율). 검증용 스키마는 `chk_<area>` 처럼 따로 만들고 끝나면 지워도 된다. `pitel` = 최종 적재(public 스키마) — **최종 적재는 메인 세션만** 한다.
- 메모리 8GB·CPU 8 — 검증 쿼리는 몇 분 안에 끝나게(작은 배율).

## 5. 데이터 생성 규칙 (data_migrationner)

- **결정적 키 공식** : 부모 키는 1..N 조밀 정수에서 형식화(`lpad` 등). 자식은 부모 번호를 편향 함수로 골라 항상 존재하게(조인 없이 병렬 생성). 생성 일시도 키 번호에서 결정(번호가 클수록 최근 → 자식 일시 ≥ 부모 일시 보장). 공용 SQL 함수는 스키마 `gen`(예 `gen.zipf(n, s)`·`gen.recent_dtm(n, N)`).
- 볼륨 등급 : T1 기준 1만~9만 / T2 상품계 100만~900만 / T3 고객·가입계 1천만~9천만 / T4 과금계 1억~4억. 표 단위 목표 행 수는 data_migrationner 가 정하고 docs/06 에 표로 남긴다(합계·예상 크기 포함).
- **의도적 편향(성능 악영향) 목록** — 테이블마다 해당되는 것을 적용하고 기록 :
  S1 고객→회선 멱법칙(상위 0.01% 고객이 회선 20%, 법인 1곳이 회선 100만+) · S2 인기 상품 쏠림(요금제 1개 = 가입상품 35%, 부가서비스 70% 미사용) · S3 상태값 저선택도(98% 한 값, 인덱스 있는 칼럼) · S4 날짜 쏠림(최근 3년 60%, 말일·1일 급증, 장애일 하루에 수납 5%) · S5 NULL 쏠림(선택 칼럼 90~99% NULL, 일부 FK 30% NULL) · S6 파티션 쏠림(최근 파티션이 과거의 10~20배) · S7 이상치(금액 0.001% 극단값, 음수 조정) · S8 중복(해지 번호 재사용, 같은 이름 다수) · S9 넓은 행(메모 1~4KB 0.5% — TOAST) · S10 상관 칼럼(지역↔대리점 강상관 — 통계 오판) · S11 고아 행 0.05%(RI 위반 — 품질 진단용) · S12 형식 함정(앞자리 0·공백 섞인 코드 문자열) · S13 대소문자·표기 흔들림(자유 텍스트) · S14 한 청구계정에 청구서 수천 건 같은 핫 키
- 생성 단위는 **테이블 × 연도**(재시작 가능), 실행기는 병렬(동시 6) — 2단계 워크플로에서 정의.

## 6. 리뷰·승인 기준 (masteragent_da_coordinator)

- 단계 관문 : 규칙 2절 위반 0, JSON 형식 3절 준수, 주제영역 간 관계 양끝 존재, 엔터티 수 예산(±15%), 핵심 엔터티 필수 4종, 공통코드 이름 3종, 물리 = DDL 실제 실행 성공(pitel_dev).
- 반려 시 : 사유를 구체적으로 적고 **직접 고친다**(위임 모드 — 되돌려 보내 기다리지 않는다). 고친 내용은 `reviews/<단계>.md` 에 남긴다.
- 문서·주석 = 한국어, 실제 이동통신 용어 사용(가입계약·회선·서비스번호·번호이동·약정·결합·할부·청구계정·청구주기·요금계산·사용량·부가서비스·수납·자동이체·과오납·미납·연체가산금·이용정지·직권해지·채권추심·대손).
