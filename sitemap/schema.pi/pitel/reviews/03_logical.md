# 03 논리 모델 관문 리뷰 + 표준사전 2차 병합 — masteragent_da_coordinator

> 2026-11-07 · 대상 `model/logical/{PRD,CUS,ORD,PAY,INV,COL,PRM}.json`(엔터티 214), `docs/04_logical_*.md` 7개, `model/areas.json` crossRels, 표준 원장 `tools/std_words.js`·`std_codes.js`·생성기 `tools/std_build.js` → `model/std/*.json` · 기준 `CONTEXT.md` 2절·3절·6절, 02 관문 승계 이슈(reviews/02_conceptual.md 4절), 영역별 04 관문 리뷰(reviews/04_logical_*.md)
> 마스터 위임 자동 승인 모드 — 결함은 리더가 직접 수정. 점검·수정 도구는 저장소 밖 `%TEMP%/pitel03L/`(merge.js·check.js·fix.js·gen-docs.js·guard.js·upd-std-doc.js), 수정 전 사본 `%TEMP%/pitel03L/bak/`
> **동시 작업 기록** : 이 관문 진행 중(16:41) 다른 작업(04 PRM 논리 관문으로 보임 — `reviews/04_logical_PRM.md` 미작성 상태)이 `model/areas.json` 을 다시 써서 같은 영역 안 관계 8건을 crossRels 에서 뺐다(crossRels = 주제영역 간 관계만이라는 정의에 맞으므로 승계). 이 관문이 추가한 31건은 보존됨을 확인했고, 최종 점검은 현재 파일 기준이다. 영역 생성기 재실행으로 논리 JSON 이 되돌아가지 않도록 생성기 4종에 가드를 넣었다(F9).

## 1. 점검표

| # | 항목 | 기준 | 수정 전 | 최종 | 판정 |
|---|---|---|---|---|---|
| L1 | 엔터티 수 | 영역 30 ±15%, 합계 200~230(D3) | PRD·CUS·ORD·PAY·INV·COL 30 · PRM 34 = 214, 핵심 70(영역마다 10), STL 25 | 같음 | 통과 |
| L2 | 핵심 필수 4종(규칙 2-5) | 핵심(stg CNCP) 70개마다 주식별자·~명·~일시·~상태유형코드 | 위반 0 | 0 | 통과 |
| L3 | ~상태코드 단독 금지 | 상태 = ~상태유형코드 | 0 | 0 | 통과 |
| L4 | 공통코드 이름 3종(규칙 2-6) | ~코드 속성 = ~유형·구분·종류코드 또는 식별 코드(코드 엔터티 PK·FK·외부 표준 코드) | 0 | 0 | 통과 |
| L5 | 공통코드 값 존재 | ~유형·구분·종류코드(FK 아닌 것)는 codes.json 에 값 목록 | 논리 newCodes 162 미등재 | 0 | 수정 후 통과(F1) |
| L6 | 대문자 | 엔터티·속성 phyNm `^[A-Z0-9_]+$` | 0 | 0 | 통과 |
| L7 | 사전 약어만 사용 | 재생성 사전 기준 phyNm 토큰 ∈ words.json | 논리 신규 단어 49 미등재(토큰 기준 다수) | **0** | 수정 후 통과(F1) |
| L8 | 속성 = 표준용어 | attrNm ∈ terms.json 이고 phyNm·domNm 일치 | 논리 신규 용어 628 미등재 | 0 | 수정 후 통과(F1) |
| L9 | 도메인 적합 | domNm ∈ domains.json, 값이 담기는 정밀도 | 환율·외화금액이 04 PAY 관문 임시 도메인(율N12_4·금액N18_3, 원장 이름 규칙 밖) | 환율N15_4·금액N18_4 | 수정 후 통과(F2) |
| L10 | 속성 순서 PK→FK→일반, seq 증가 | 규칙 2-9 | 1 엔터티(PAY 요금계산내역 — 청구년월이 복합 FK 인데 일반 위치) | 0 | 수정 후 통과(F4) |
| L11 | 시스템 칼럼 없음 | LST_MDDTM·LST_MDFR_ID·LST_RGDTM·LST_RGTR_ID 등 미포함(D7) | 0 | 0 | 통과 |
| L12 | 엔터티 phyNm·tblNm 형식 | phyNm = 접두어 없는 `<단어 약어>_<분류어 약어>`, tblNm = `PTL_<영역>_<단어 약어>_<사전 tblSfx>`(7영역 일관) | 214 모두 일치(최장 28자 `PTL_INV_CARD_ATMT_PAY_APRV_L` — 63자 한도 안) | 같음, 생성기가 두 키를 기계 계산 | 통과(F3 재발 방지) |
| L13 | FK 대상 존재 | 모든 fk(also 포함)의 대상 영역·엔터티·속성 실재, 대상 속성 = PK, 도메인 같음 | 446 FK 위반 0, 단 표기 형식 4종 혼재 | 449 FK 위반 0, 형식 1종 | 수정 후 통과(F5) |
| L14 | 관계 ↔ FK 일관 | rels 의 fkAttrs 실재·fk 보유, FK 마다 같은 부모 rels, idn ⇔ FK 전부 PK, opt ⇔ FK NULL 허용 | fkAttrs 에 fk 없는 속성 1(PAY 요금계산내역.청구년월), rels 표기 형식 2종(parent/child 접두 유무·fkAttr/fkAttrs) | 위반 0 · 관계 431 | 수정 후 통과(F4·F5) |
| L15 | 영역 간 관계 crossRels 등재 | 다른 영역 부모를 가리키는 rels·FK 전부 areas.json 에, crossRels 의 양끝 엔터티·대응 rels 실재 | 미등재 30 | 0(crossRels 121 = 필요 121) | 수정 후 통과(F6) |
| L16 | 다른 영역 요구 키 반영 | PRM.로밍사업자기본 국가코드 → PRD.로밍국가코드 / PAY.단말할부청구상세 → ORD.단말할부상세(EQP_INSTL_CTRT_NO+INSTL_TMS) / PRM.수수료환수내역 → ORD.해지신청내역(TRMN_APLY_NO) / INV crossRelReq 3 / PRD childReq 15 | 첫째 미반영(PRM L4 불수용), 나머지 반영돼 있음 | 전부 반영 | 수정 후 통과(F7) |
| L17 | 같은 속성명 = 같은 물리명·도메인 | 2절 교차 대조 | 영역 간 공유 102종 불일치 0, 같은 물리명·다른 용어 0 | 같음 | 통과 |
| L18 | 3NF 예외 인계 | normNote 214 전부, 반정규화 후보는 denormCandidates·normNote | normNote 214/214, denormCandidates ORD 6·PRM 4, normNote 반정규화 언급 22 | 같음 + 4절 인계표 | 통과 |
| L19 | 문서 = JSON | docs/04_logical_*.md 7개 | 형식 제각각(CUS·PRD·INV 형 / ORD·PRM 형 / PAY·COL 형), PRM·PAY 는 이번 수정과 어긋남 | 7개 같은 형식 재생성 | 수정 후 통과(F8) |
| L20 | JSON 형식(3절) | 7개 논리 + std 4개 + areas.json `JSON.parse` | 성공 | 성공 | 통과 |

## 2. 영역 간 같은 속성 교차 대조표 (최종)

3개 영역 이상에 나오는 24종(2개 영역 이상 공유 102종 전부 일치 — 같은 속성명은 표준용어 1건에서 물리명·도메인을 받으므로 기계 보장, 생성기 `도메인 조정 0`).

| 속성명 | 물리명 | 도메인 | 영역 | 출현 | 판정 |
|---|---|---|---|---|---|
| 적용시작일자 | APLCN_BGNG_DT | 일자C8 | PRD·CUS·PAY·INV·COL·PRM | 21 | 일치 |
| 적용종료일자 | APLCN_END_DT | 일자C8 | PRD·CUS·PAY·INV·COL·PRM | 21 | 일치 |
| 유효종료일시 | VLD_END_DTM | 일시TS | CUS·ORD·INV·COL·PRM | 24 | 일치 |
| 유효시작일시 | VLD_BGNG_DTM | 일시TS | CUS·ORD·INV·COL·PRM | 23 | 일치 |
| 청구계정번호 | BILL_ACNT_NO | 번호V20 | CUS·ORD·PAY·INV·COL | 21 | 일치 |
| 상품코드 | PROD_CD | 코드V20 | PRD·ORD·PAY·PRM | 27 | 일치 |
| 서비스관리번호 | SVC_MGMT_NO | 번호V20 | CUS·ORD·PAY·COL | 23 | 일치 |
| 사업자등록번호 | BRNO | 번호V20 | CUS·INV·COL·PRM | 4 | 일치 |
| 대표전화번호 | RPRS_TELNO | 전화번호V20 | CUS·INV·COL·PRM | 4 | 일치 |
| 고객번호 | CUST_NO | 번호V20 | CUS·ORD·COL | 27 | 일치 |
| 가입계약번호 | SBSC_CTRT_NO | 번호V20 | ORD·COL·PRM | 19 | 일치 |
| 청구번호 | BILL_NO | 번호V20 | PAY·INV·COL | 17 | 일치 |
| 단말모델코드 | EQP_MDL_CD | 코드V20 | PRD·ORD·PRM | 11 | 일치 |
| 요금항목코드 | CHRG_ITM_CD | 코드V10 | PRD·PAY·INV | 9 | 일치 |
| 집계일시 | AGG_DTM | 일시TS | PAY·INV·COL | 8 | 일치 |
| 정산년월 | STLM_YM | 년월C6 | INV·COL·PRM | 8 | 일치 |
| 부가가치세금액 | VAT_AMT | 금액N15 | PAY·INV·PRM | 7 | 일치 |
| 수납금액 | RCV_AMT | 금액N15 | CUS·INV·PRM | 6 | 일치 |
| 콘텐츠제공사번호 | CNTS_PRVD_CO_NO | 번호V20 | PRD·PAY·PRM | 5 | 일치 |
| 국가코드 | NATN_CD | 코드V10 | PRD·CUS·PRM | 5 | 일치 |
| 청구금액 | BILL_AMT | 금액N15 | CUS·PAY·PRM | 4 | 일치 |
| 세액 | TXAMT | 금액N15 | PAY·COL·PRM | 4 | 일치 |
| 전자세금계산서승인번호 | ELCTR_TXINV_APRV_NO | 번호V30 | PAY·INV·PRM | 3 | 일치 |
| 수수료대상금액 | FEE_TRGT_AMT | 금액N15 | INV·COL·PRM | 3 | 일치 |

환율·외화 금액(2영역, F2 교체 후) : 정산통화금액 STLM_CRNCY_AMT 금액N18_4(PAY 1·PRM 2) · 적용환율 APLCN_EXRT 환율N15_4(PAY 1·PRM 1) — 일치.

crossRels 영역 쌍 분포(121) : ORD→PRD 17 · PAY→ORD 16 · ORD→PRM 11 · INV→CUS 10 · ORD→CUS 7 · PRM→PRD 6 · COL→INV 6 · PAY→PRD 5 · INV→PAY 5 · COL→CUS 5 · PRM→ORD 4 · 기타 13쌍 29.

## 3. 수정 내역 (리더 직접 수정)

| # | 파일 | 내용 | 건수 | 근거 |
|---|---|---|---|---|
| F1 | tools/std_words.js·std_codes.js → model/std 4종 | 표준사전 2차 병합 : 논리 7개 newWords 55(중복·원장 기존 제외 **신규 49**), newTerms 628(→ 용어 674→**1,281**), newCodes 162(→ 코드 166→**326**). 같은 단어·같은 약어 다중 요청 1건화(구성 CMPS PRD·ORD, 요율 TRF PRD·PRM, 환율 EXRT PAY·PRM, 담당자 PIC CUS·PRM), 가맹점 MRCH·이자 INTR 은 1차 원장 기존 → 사용 전환. 담당자유형코드 CUS·PRM 값 목록 다름 → 합집합 1개(9값). 이전이용정지단계유형코드 = `@이용정지단계유형코드` | 단어 49 · 코드 원장 161행 | 한 단어 = 한 약어(생성기 중복 거부 통과), 한 용어 한 값 목록 |
| F1-b | 같은 원장 | CRDT(여신) ↔ COL 신용 : COL 은 합성어 `신용정보 CRINFO` — '신용' 단독 단어 없음, 약어 충돌 0 확인. PRD 요금항목분류유형코드 **폐기** : std_codes.js 값 목록 삭제, 개념 PRD 요금항목코드.요금항목분류유형코드 → 요금항목분류코드(CHRG_ITM_CLSF_CD, PRD 코드 엔터티 키) 개명(RENAME 역방향), docs/02_conceptual_PRD.md 2곳 동반 수정 | 코드 1 폐기 · 개념 속성 1 | 같은 개념 공통코드·코드 엔터티 이중 금지(INV G2 와 일치) |
| F2 | std_build.js DOMAINS · PAY·PRM.json | 도메인 `환율N15_4`(대표도메인 환율 — 환율을 속성 분류어 A:환율 로 등재)·`금액N18_4`(외화·SDR) 신설, 04 PAY 관문 임시 `율N12_4`·`금액N18_3` 폐기 → 정산통화금액 3·적용환율 2 교체 | 도메인 2 · 속성 5 | 율N5_2(999.99) 로는 환율 1,350.25 불가, 원장 이름 규칙(대표도메인+변형) 준수 |
| F3 | tools/std_build.js | 생성기 2차화 : 개념·논리 모델 함께 순회(속성 phyNm·domNm 재계산), 엔터티 phyNm(K1)·tblNm(테이블 미리보기) 두 키 동시 계산 — 1차 생성기는 phyNm 에 테이블명을 덮어써 02 관문이 k1.js 로 되돌렸던 원인 제거. FK `attr`·관계 `fkAttrs` 도 속성 개명 동기화 | 1 | 02 관문 승계 이슈 1 "사전에서 기계 변환". 재실행 멱등(변경 0) |
| F4 | PAY.json 요금계산내역 | 사용량월집계 복합 FK(서비스관리번호+청구년월+사용서비스유형코드) 중 청구년월에 fk 부여, 서비스관리번호 fk 에 `also`(회선기본 + 사용량월집계 겸용), 속성 순서 PK→FK→일반 재배열·seq 재부여 | FK 2 · 엔터티 1 | 규칙 2-9, 관계 fkAttrs ⇔ fk 일관 |
| F5 | 7개 논리 JSON | 표기 형식 통일 : fk = `{area, ent, attr[, also]}`(ent 는 영역 접두 없는 엔터티명 — ORD·PAY·PRM 의 `"CUS.고객기본"`, COL 의 키 순서 차이 해소), rels = `parent`·`child` 모두 `<영역>.<엔터티>` + `fkAttrs` 배열(ORD·PRM 의 `fkAttr` 단수·`parentEntId` 제거) | fk 387 · rels 152 | 3절 "모든 단계 공통 키" — 물리 단계 파서가 영역 7개를 한 규칙으로 읽게 |
| F6 | areas.json | 다른 영역 부모를 가리키는 rels·FK 중 crossRels 미등재 30 + F7 1 = **31건 추가**(from = 자식, to = 부모, card N:1/1:1, note 에 관계명·선택·STL 표시 + '(03 논리 관문 추가)'), `summary.crossRelCnt` 121 | 31 | 6절 "주제영역 간 관계 양끝 존재" |
| F7 | PRM.json 로밍사업자기본 | **국가코드 NATN_CD(방문망 국가) FK → PRD.로밍국가코드** 추가(PK 다음 seq 2, 필수), 관계·normNote·결정 L4-R(PRM L4 불수용 번복)·requestsToOtherAreas 처리 표시, PRD childReq 15건 `reflected` 표시(전부 자식 rels 존재 확인) | 속성 1 · 관계 1 · crossRel 1 | TADIG 망 국가와 파트너 법인 소재국(파트너기본.국가코드)은 다른 사실(그룹 사업자) → 이행 종속 아님, 로밍 요율 권역 조회 경로. PRD 요구 반영 |
| F7-b | (확인만) | PAY 단말할부청구상세 PK = 단말할부계약번호+할부회차 → ORD 단말할부상세 1:1 식별, PRM 수수료환수내역.해지신청번호 → ORD 해지신청내역(선택), INV 환불계좌상세→CUS 청구계정기본·카드자동납부승인내역→PAY 청구기본·지로수납내역→PAY 청구기본 crossRels·rels 양끝 존재 | 0 | 04 영역 관문이 이미 반영 |
| F8 | docs/04_logical_*.md 7개 | JSON 에서 같은 형식으로 재생성(1 엔터티 목록 · 2 엔터티별 속성(FK 표기 `<영역>.<엔터티>.<속성>`·정규화) · 3 관계 · 4 영역 간 관계 · 5 Mermaid ERD · 6 결정 메모 · 7 물리 단계 인계 · 8 표준사전 반영 · 부록 원 문서의 정규화·물리 인계 절 원문). docs/03_standards.md 2차 수량·결정(1·3·4·6절 갱신 + 8절 신설) | 문서 8 | 문서 = JSON |
| F9 | tools 영역 생성기 4종 | `lgl_CUS_build.js`·`logical_INV_build.js`·`logical_PAY.js`(점검 모드 없이 항상 기록하던 생성기)·`logical_PRM_build.js` 첫머리에 재실행 차단 가드(`--force-after-03` 없으면 종료) | 4 | 내장 명세로 JSON 을 다시 쓰면 F1~F7 이 되돌아감 — 이후 논리 JSON 이 정본 |
| F10 | 7개 논리 JSON | `newWords`·`newTerms`·`newCodes` 빈 배열(형식 유지) + `stdMerged` 에 영역별 등재 수 | 7 | 병합 후 '등재됨' 표시 |

수정 합계 : 표준 단어 49 · 용어 +607 · 코드 +160(폐기 1) · 도메인 2 신설/2 폐기 · 속성 7(F2 5·F7 1·F1-b 개념 1) · FK 부여 2 · 형식 통일 539(fk 387·rels 152) · crossRels 31 · 문서 8 · 생성기 5(std_build 1·가드 4).

## 4. 물리 단계 인계 사항

1. **테이블명** = 각 엔터티 `tblNm`(`PTL_<영역>_<약어>_<접미어>`), PostgreSQL DDL 은 소문자. PK `PK_<테이블>`·인덱스 `X_<테이블>_NN`·FK `FK_<자식>_NN`(정의만, D6). 최장 28자라 63자 절단 불필요.
2. **도메인 → 타입** : `model/std/domains.json` 정본. 외화·SDR = `금액N18_4` NUMERIC(18,4), 환율 = `환율N15_4` NUMERIC(15,4), 일자C8 CHAR(8)(CONTEXT 2-10 — 저장소 CHAR 금지 규칙은 cafe.pi 운영 DB 한정, pitel 은 표준 도메인 정본).
3. **반정규화 후보**(물리에서만 결정, 사유·건수 기록) : ORD 6(가입상품기본.서비스관리번호 — 개념 O4·회선 단위 요금계산·파티셔닝 근거, 가입계약기본.서비스번호, 서비스번호기본.서비스번호할당횟수 등) · PRM 4(정산기본.파트너번호·정산확정일시, 세금계산서기본.파트너번호, 원화정산금액) · normNote 의 반정규화 언급 22개 엔터티(CUS 고객멤버십기본 포인트잔액 등 파생값 — 각 문서 2절 "정규화" 줄과 7절·부록).
4. **복합 FK·겸용 FK** : PAY 요금계산내역.서비스관리번호는 회선기본 FK 와 사용량월집계 복합 FK(+청구년월+사용서비스유형코드)를 겸함(`fk.also`) — FK 정의 2개로 분리 생성.
5. **서브타입** : PRM 파트너기본 ↔ 대리점·판매점·콘텐츠제공사·통신사업자·로밍사업자(1:1 식별), CUS 고객기본 ↔ 개인·법인고객상세. 통합(롤업) 시 **로밍사업자기본.국가코드(방문망 국가)와 파트너기본.국가코드(법인 소재국)가 같은 칼럼명** → 롤업하면 역할명(예 방문망국가코드)으로 바꿀 것. 분리 유지가 기본 권장.
6. **파티셔닝 후보(T4)** : PAY 원시사용내역·사용내역·사용량일집계·요금계산내역·청구상세, INV 수납기본·수납배분상세, COL 미납상세·연체가산금내역 — 키는 일시·청구년월(S6 최근 파티션 쏠림 대비, D8 2010~2026).
7. **공통코드 값** : codes.json 326(값 1,617). 담당자유형코드는 CUS·PRM 합집합 9값 — 데이터 생성 시 영역별로 쓰는 값 부분집합(CUS 계약·요금·기술·총괄 / PRM 정산·영업·기술·세무·법무·기타)을 편향으로 반영.
8. **crossRels** = 주제영역 간 관계만(121). 영역 안 관계는 각 논리 JSON rels 가 정본.
9. **논리 JSON 이 정본** : 영역 생성기 4종은 가드로 막혀 있음. 고칠 일이 있으면 JSON 을 고치고 `node tools/std_build.js --write` 로 표준 동기화(새 단어는 원장 먼저).

## 5. 승인 판정

**승인(수정 후, FIXED)** — 최종 재점검(`check.js`, 현재 파일) **위반 0** : 엔터티 214 · 속성 2,096 · FK 449 · 관계 431 · crossRels 121(필요 121) · 미등재 약어 0 · 용어 불일치 0 · 속성 순서 위반 0 · idn/opt ⇔ FK 불일치 0. 표준 생성기 재실행 변경 0(멱등). 7개 논리 JSON + std 4종 + areas.json `JSON.parse` 성공.

다음 단계(물리 모델, subagent_physical_modeler) 착수 조건 : 4절 인계 1~9, `model/physical/<AREA>.json`·`ddl/` 은 CONTEXT 3절 형식, DDL 은 pitel_dev 실제 실행 성공이 관문 기준.
