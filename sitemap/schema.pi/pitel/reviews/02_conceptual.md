# 02 개념 모델 관문 리뷰 — masteragent_da_coordinator

> 2026-11-07 · 대상 `model/conceptual/{PRD,CUS,ORD,PAY,INV,COL,PRM}.json`, `docs/02_conceptual_*.md`(작성 subagent_subject_modeler), `model/areas.json` crossRels · 기준 `CONTEXT.md` D1~D15·2절·3절·6절, 01 관문 지시(reviews/01_plan.md 4절)
> 마스터 위임 자동 승인 모드 — 결함은 리더가 직접 수정(6절). 점검·수정 도구는 저장소 밖 `%TEMP%/pitel02/`(check.js·fix.js·k1.js·gen-docs.js), 수정 전 사본 `%TEMP%/pitel02/bak/`
> **동시 작업 기록** : 관문 수정 직후(15:56) 표준사전 단계(model/std 생성)가 같은 개념 JSON 7개에 표준단어 사전을 적용해 다시 썼다. 표준사전 결과가 단어 약어의 정본이므로 그대로 승계하고, 이 관문 결정 K1(엔터티 물리명 형식)과 어긋난 부분만 재적용했다(F1-b). 최종 점검은 두 단계가 모두 반영된 현재 파일 기준이다.

## 1. 점검표

| # | 항목 | 기준 | 수정 전 | 최종 | 판정 |
|---|---|---|---|---|---|
| C1 | 핵심 엔터티 수 | 영역마다 핵심 약 10(D3) | 7영역 × 10 = 70 | 70 | 통과 |
| C2 | 엔터티 물리명 형식(K1) | 접두어 없는 `<약어>_<분류어 약어>`, 분류어 7영역 통일 | 3가지 형식 혼재 — PRD·CUS·PRM `_BAS`형, ORD·PAY·INV `PTL_<영역>_…`(접미 없음·`_M/_L/_D/_T/_C`), COL `UNPD_M`형. 위반 70건 | 위반 0 | 수정 후 통과(F1) |
| C3 | 유형 약어(K2) | 유형 = `TY`, 상태 = `~STTS_TY_CD` | PAY `_TP_` 19건 | 0 | 수정 후 통과(F2) |
| C4 | 일자 약어(K3) | 일자 = `_DT`(YMD 금지), 도메인 일자C8 | CUS `_YMD` 7건 | 0 | 수정 후 통과(F3) |
| C5 | 참조 키 이름(K4) | 같은 키 = 소유 영역 속성명·물리명·도메인 | 9건 + extKeys 2건 + 부모 키 누락 3건(아래 F4) | 0 | 수정 후 통과(F4) |
| C6 | 단어 충돌(K5) | 대리점 AGNC ↔ 수납대행기관, 사업자 BZMN ↔ BZOPR | 2건 | 0 | 수정 후 통과(F5) |
| C7 | 공통코드 이름 3종(K6) | ~구분·~종류·~유형코드만(식별 코드 제외) | CUS 고객등급코드 2·등급변경사유코드 1 | 0 | 수정 후 통과(F6) |
| C8 | 필수 4종(규칙 2-5) | 주식별자·~명·~일시·~상태유형코드 각 1 | PAY 상태 10건이 `_TP_`(형식 위반) | 0 | 수정 후 통과(F2) |
| C9 | 관계 양끝(6절) | 모든 rels 의 toEnt 실재 + 핵심↔핵심 반대쪽 rels + 영역 간 관계 crossRels 등재 | toEnt 실재 0 위반 / 반대쪽 누락 47 / crossRels 누락 27 | 0 / 0 / 0 | 수정 후 통과(F7·F8) |
| C10 | 교차 관계 제안(K7) | 부가서비스→PRM 콘텐츠제공사, PRM 단말재고→PRD 단말모델, PRM 유심재고→PRD 유심상품 + PAY 의 PRM 쪽 rels | areas.json 미등재 3, PAY JSON 에 PRM 쪽 없음 3 | 등재·양끝 | 수정 후 통과(F8) |
| C11 | moduleCd STL | areas.json moduleCd 대상 핵심 엔터티에 `moduleCd:"STL"` | PRM 정산기본·세금계산서기본 표시됨 | 2/2 + 기본 엔터티 예약 관계 4건 STL 표시 | 통과 |
| C12 | JSON 형식(3절) | `area, entities[entNm, phyNm, tp, def, keyAttrs[attrNm, phyNm, role, domNm], rels[toEnt, toArea, card, idn, opt, nm]]` | 7개 필수 키 충족, COL 메타(areaNm·stg·ver·author) 없음 | 7/7 `JSON.parse` 성공, COL 메타 보강 | 통과 |
| C13 | 같은 속성명 → 같은 물리명·도메인(교차 대조) | 2절 표 | 불일치 10종 | 영역 간 공유 46종 전부 일치, 같은 물리명·다른 속성명 0 | 수정 후 통과 |
| C14 | 표준사전 정합(후속 단계 대조) | 속성 물리명 토큰 ∈ words.json, 속성 = terms.json | (표준사전 생성 전) | 미등재 토큰 0 · 약어 중복 0 · terms 불일치 0 | 통과 |
| C15 | 문서 = JSON | docs/02_conceptual_*.md 7개 | ORD·PAY·COL 은 형식이 제각각, 4개도 JSON 과 물리명 어긋남 | 7개 모두 JSON 에서 CUS 형식으로 재생성 | 수정 후 통과(F9) |

## 2. 영역 간 같은 속성 교차 대조표 (최종, 2개 영역 이상에 나오는 속성 46종)

| 속성명 | 물리명 | 도메인 | 영역 | 출현 | 판정 |
|---|---|---|---|---|---|
| 가입계약번호 | SBSC_CTRT_NO | 번호V20 | ORD·COL | 7 | 일치 |
| 가입상품번호 | SBSC_PROD_NO | 번호V20 | ORD·PAY | 2 | 일치 |
| 결합유형코드 | CMBN_TY_CD | 코드V10 | PRD·ORD | 2 | 일치 |
| 고객번호 | CUST_NO | 번호V20 | CUS·ORD·COL | 12 | 일치 |
| 공급가액 | SPLYAMT | 금액N15 | PAY·PRM | 3 | 일치 |
| 공시지원금 | PBANC_SUBSD | 금액N15 | PRD·ORD | 2 | 일치 |
| 과세유형코드 | TXTN_TY_CD | 코드V10 | PRD·PAY | 3 | 일치 |
| 국가코드 | NATN_CD | 코드V10 | CUS·PRM | 2 | 일치 |
| 납부기한일자 | PAY_TMLMT_DT | 일자C8 | PAY·INV·COL | 3 | 일치 |
| 납부자번호 | PYR_NO | 번호V20 | CUS·INV | 3 | 일치 |
| 단말모델코드 | EQP_MDL_CD | 코드V20 | PRD·ORD | 3 | 일치 |
| 단말출고가격 | EQP_SHPM_PRC | 금액N15 | PRD·ORD | 2 | 일치 |
| 대리점번호 | AGNC_NO | 번호V20 | ORD·PRM | 3 | 일치 |
| 대표자명 | RPRSV_NM | 명V100 | CUS·PRM | 2 | 일치 |
| 대표전화번호 | RPRS_TELNO | 전화번호V20 | CUS·PRM | 2 | 일치 |
| 법인등록번호 | CRNO | 번호V20 | CUS·PRM | 2 | 일치 |
| 부가가치세금액 | VAT_AMT | 금액N15 | PAY·PRM | 3 | 일치 |
| 사업자등록번호 | BRNO | 번호V20 | CUS·PRM | 2 | 일치 |
| 상품유형코드 | PROD_TY_CD | 코드V10 | PRD·ORD | 2 | 일치 |
| 상품코드 | PROD_CD | 코드V20 | PRD·ORD | 10 | 일치 |
| 서비스관리번호 | SVC_MGMT_NO | 번호V20 | ORD·PAY·COL | 9 | 일치 |
| 서비스번호 | SVC_NO | 번호V20 | ORD·PAY | 8 | 일치 |
| 선택약정할인율 | CHC_AGRMT_DSCNT_RT | 율N5_2 | PRD·ORD | 2 | 일치 |
| 세액 | TXAMT | 금액N15 | PAY·PRM | 2 | 일치 |
| 수납배분우선순위 | RCV_ALLC_PRRT | 순번N5 | PRD·PAY·INV | 3 | 일치 |
| 약정개월수 | AGRMT_MCNT | 수N5 | PRD·ORD | 2 | 일치 |
| 요금항목명 | CHRG_ITM_NM | 명V100 | PRD·PAY | 3 | 일치 |
| 요금항목코드 | CHRG_ITM_CD | 코드V10 | PRD·PAY·INV | 5 | 일치 |
| 유효시작일시 | VLD_BGNG_DTM | 일시TS | ORD·COL | 3 | 일치 |
| 유효종료일시 | VLD_END_DTM | 일시TS | ORD·INV·COL | 4 | 일치 |
| 이용정지번호 | SUSP_NO | 번호V20 | ORD·COL | 3 | 일치 |
| 적용시작일자 | APLCN_BGNG_DT | 일자C8 | CUS·PAY·INV | 5 | 일치 |
| 적용종료일자 | APLCN_END_DT | 일자C8 | CUS·PAY·INV | 5 | 일치 |
| 전자세금계산서승인번호 | ELCTR_TXINV_APRV_NO | 번호V30 | PAY·PRM | 2 | 일치 |
| 지역코드 | RGN_CD | 코드V10 | CUS·PRM | 3 | 일치 |
| 직권해지번호 | EXOFTRMN_NO | 번호V20 | ORD·COL | 2 | 일치 |
| 청구계정번호 | BILL_ACNT_NO | 번호V20 | CUS·ORD·PAY·INV·COL | 13 | 일치 |
| 청구년월 | BILL_YM | 년월C6 | PAY·INV·COL | 9 | 일치 |
| 청구번호 | BILL_NO | 번호V20 | PAY·INV·COL | 9 | 일치 |
| 청구상세순번 | BILL_DTL_SEQ | 순번N5 | PAY·COL | 4 | 일치 |
| 청구주기코드 | BILL_CYCL_CD | 코드V10 | CUS·PAY | 4 | 일치 |
| 콘텐츠제공사번호 | CNTS_PRVD_CO_NO | 번호V20 | PRD·PRM | 2 | 일치 |
| 통신사업자번호 | CARR_NO | 번호V20 | ORD·PRM | 2 | 일치 |
| 판매점번호 | SHOP_NO | 번호V20 | ORD·PRM | 3 | 일치 |
| 할인금액 | DSCNT_AMT | 금액N15 | PRD·PAY | 2 | 일치 |
| IMSI번호 | IMSI_NO | 번호V20 | ORD·PAY | 2 | 일치 |

수정 전 불일치 10종(관문이 고친 것) : 공시지원금액(PBANC_SPRT_AMT↔ANNC_SUBSD_AMT) · 요금항목코드(INV CHRG_ITEM_CD) · 과세유형코드(TAXN_TY_CD↔TXTN_TP_CD↔TXTN_TY_CD) · 납부자번호(INV PAYR_NO) · 적용시작일자·적용종료일자(CUS APLCN_…_YMD) · 서비스번호(PAY 전화번호V20↔ORD 번호V20) · 가입상품번호(PAY SBSC_PRD_NO) · 청구상세순번(COL 순번N10↔PAY 순번N5) · 납부기한일자(COL PAY_TMLMT_DT↔PAY PAY_DDLN_DT). 이 밖에 이름이 달라 기계 대조에 안 걸린 동의어 2건(INV 납기일자 = 납부기한일자, PAY 국제이동가입자식별번호 = ORD IMSI)도 통일.

## 3. 수정 내역 (리더 직접 수정)

| # | 파일 | 내용 | 건수 | 근거 |
|---|---|---|---|---|
| F1-a | ORD·PAY·INV·COL.json | 엔터티 물리명을 `<약어>_<분류어 약어>`로 — 예 `PTL_ORD_SBSC_CTRT`→`SBSC_CTRT_BAS`, `PTL_PAY_BILL_M`→`BILL_BAS`, `PTL_INV_RCPT`→`RCPT_BAS`, `UNPD_M`→`UNPD_BAS` | 40 | K1. 분류어 약어는 기본 BAS·상세 DTL·내역 DTLS·코드 CD·집계 AGG(지시 기본값 = PRD·CUS·PRM 30건이 이미 쓰던 다수안), 이력은 관문 시점 HST |
| F1-b | 7개 JSON | 표준사전 단계가 엔터티 물리명을 테이블명(`PTL_COL_UNPD_M` 등)으로 바꿔 놓은 것을 K1 형식으로 되돌리고 그 테이블명은 새 키 `tblNm`(물리 미리보기)에 보존. 분류어 약어는 표준단어 사전 값을 따름 → **이력 = HIST**(사전 정본, 관문 시점 HST 대체) | 70 | K1 "접두어는 물리 단계". 사전(words.json)의 분류어 약어·`tblSfx` 로 기계 변환(`k1.js`)이라 두 이름이 항상 같은 원천 |
| F2 | PAY.json | `_TP_CD` → `_TY_CD`(상태유형코드 10 포함) | 19 | K2 |
| F3 | CUS.json | `_YMD` → `_DT`(최초가입·휴면전환·외국인체류만료·설립·동의만료·적용시작/종료일자) | 7 | K3 |
| F4 | PAY·INV·COL.json | 참조 키 소유 영역 이름으로 : PAY 가입상품번호 `SBSC_PRD_NO`→`SBSC_PROD_NO`, PAY extKeys 할인상품 `상품코드 PRD_CD/코드V10`→`할인상품코드 DSCNT_PROD_CD/코드V20`, PAY extKeys 단말할부상세 `TRMNL_INSTL_NO`→`EQP_INSTL_CTRT_NO`(단말 = EQP), INV 요금항목코드 `CHRG_ITEM_CD`→`CHRG_ITM_CD`, INV 납부자번호 `PAYR_NO`→`PYR_NO`, COL 이용정지 `회선번호 LINE_NO`→`서비스관리번호 SVC_MGMT_NO`(ORD 결정 O1), PAY 서비스번호 도메인 4건 `전화번호V20`→`번호V20`(ORD), COL 청구상세순번 `순번N10`→`순번N5`(PAY) / 부모 키 보존 속성 추가 : PAY 요금계산내역 `서비스관리번호`·`사용서비스유형코드`(사용량월집계 N:1 의 부모 복합키), PRD 할인상품기본 `제휴파트너번호`(PRM 파트너기본 1:N 의 반대쪽) | 11 + 추가 3 | K4 "같은 키는 소유 영역 이름". 부모 키가 자식에 없으면 데이터 생성 부모 키 공식(5절)이 정의되지 않음 |
| F5 | INV·(표준사전) | 수납대행기관번호 `RCPT_AGNC_NO`→ 관문 `RCPT_PRXY_INST_NO` → 표준사전 최종 `RCV_AGT_INST_NO`(대행 = AGT, 기관 = INST) — 대리점 AGNC 와 충돌 해소. 사업자 : CUS 사업자(사업자등록 주체)와 PRM 로밍·번호이동 사업자는 둘 다 '사업으로 등록된 주체'라 뜻이 같다고 판정 → 표준사전이 `사업자 = BZMN`(정의 '사업자(로밍·번호이동 사업자 포함)') 하나로 통일, `BZOPR` 폐기(`ROAM_BZMN_BAS`) | 2 | K5. 통신사업자(CARR)는 별도 합성어로 유지 |
| F6 | CUS.json | 고객등급코드 → **고객등급유형코드** `CUST_GRD_TY_CD`(고객기본·고객등급이력), 등급변경사유코드 → **등급변경사유유형코드**, codeCandidates 용어명 동반 수정 | 3 | K6. 식별 코드(코드 엔터티 PK·역할명, 외부 표준 코드 국가·통화·업종·TADIG·망식별·번호이동사업자·비용센터)는 공통코드 아님 — 3종 규칙 대상 밖으로 판정(표준사전이 네트워크요소코드·수납채널코드 등 일부를 ~유형코드로 추가 전환) |
| F7 | 7개 JSON | 핵심↔핵심 관계의 반대쪽 rels 추가(추가된 쪽 기준 INV 17·COL 13·CUS 10·ORD 5·PAY 2, 카디널리티 역전·식별 여부 승계, 부모 쪽 선택) | 47 | 6절 "관계 양끝 존재". INV·COL 은 자식 쪽만 있었음 |
| F8 | areas.json·PAY·PRM·INV·COL·CUS·PRD·ORD.json | crossRels 27건 추가(45→**72**, `summary.crossRelCnt` 갱신) — K7 3건(부가서비스기본→PRM.콘텐츠제공사기본, PRM.단말재고내역→PRD.단말모델기본, PRM.유심재고내역→PRD.유심상품기본) 포함. 다른 영역 **기본** 엔터티를 가리키는 핵심 관계 12건은 그 영역 JSON 의 새 키 `basicEntRels`(논리 단계 엔터티의 예약 관계, STL 이면 moduleCd 표시)에 반대쪽 기록 — PAY 의 PRM 쪽 3건(로밍사용내역→로밍사업자기본, 소액결제청구상세·콘텐츠이용요금내역→콘텐츠제공사기본, 모두 STL) 포함 | 27 + 12 | K7·6절. 핵심 엔터티 수(10)는 그대로 두고 양끝을 맞추는 최소 형식 |
| F9 | docs/02_conceptual_*.md 7개 | JSON 에서 CUS 형식(1 핵심 엔터티·2 참조 키·3 속성·4 관계·5 ERD·6 공통코드·7 도메인·8 결정 메모·9 관문 반영)으로 일괄 재생성(`gen-docs.js`). ORD·PAY·COL 은 형식 통일, 원 작성 문서의 결정 메모·범위·논리 단계 메모는 8.1 절로 이관(물리명 치환) | 7 | 6절 "JSON 형식 준수"·문서 = JSON. 결정 이력 원문(`decisions`·`refPkRule.mismatch`)은 고치지 않고 '[02 관문 해소]' 표기만 붙임 |
| F10 | 7개 JSON | 단어 약어 충돌 50건 관문 정리(공시 PBANC·지원금 SUBSD, 과세 TXTN, 청구서 ≠ 청구, 수령 ≠ 수납, 접수 ≠ 수납, 착신 ≠ 수신, 적용 APLY, 기준 STD, 반영 RFLT, 약정 AGRMT, 완료 CMPTN, 암호화값 ENCPT_VL, 누계 → 누적, 원천 → 원인, 변경전 → 이전, 일련번호 → 순번(CUS 3), 청구주기 등록일시 이름, INV 일C2→일N2 등) — 이후 표준사전이 같은 충돌을 사전 단위로 재판정(예 수납 RCV·회수 RTRVL·청구서 INVC·월 MM·순번 SEQ·정산 STLM·파트너 PRTNR)했으므로 **사전 값이 최종** | 50 | 규칙 2-1 표준 먼저. 관문은 '한 단어 = 한 약어'만 맞추고 약어 값 결정은 사전이 정본 |

수정 합계(관문 직접) : 엔터티 물리명 110(F1-a 40 + F1-b 70) · 속성 이름·도메인 103(K2 19 · K3 7 · K4 11 · K5 2 · K6 3 · 단어 충돌 50 · 부모 키 추가 3 + extKeys 2 + 기타 6) · 관계 86(반대쪽 47 + 기본 예약 12 + crossRels 27) · 문서 7.

## 4. 승인 판정

**승인(수정 후, FIXED)** — 최종 재점검(`check.js`, 현재 파일) **위반 0**, 7개 개념 JSON + areas.json `JSON.parse` 성공, 표준사전 대조(토큰·용어·약어 중복) 불일치 0.

다음 단계(논리 모델, subagent_logical_modeler) 착수 조건·승계 이슈 :
1. 엔터티 물리명은 `phyNm`(`<약어>_<분류어 약어>`), 테이블명은 물리 단계에서 `PTL_<영역>_` + 약어 + 사전 `tblSfx`(이미 `tblNm` 에 미리보기). 두 이름을 손으로 고치지 말고 사전에서 기계 변환할 것.
2. **K1 지시(이력 = HST)와 표준사전(이력 = HIST)의 차이** — 사전을 정본으로 승계했다. 마스터가 HST 를 고집하면 words.json 한 줄만 고치고 k1.js 로 재생성.
3. `basicEntRels` 12건은 논리 단계에서 해당 기본 엔터티를 만들 때 `rels` 로 옮기고 키를 지운다(PAY 6·PRM 4·COL 1·INV 1).
4. 공통코드 식별 코드 판정 목록(외부 표준 코드 8종 + 코드 엔터티 역할명)은 표준사전 `codes.json` 에서 공통코드 3종과 별도 분류로 확정할 것.
5. 표준사전 단계가 바꾼 한글 속성명(예 공시지원금액→공시지원금, 폐점일자→폐쇄일자, 과세유형코드(PRM)→사업자과세유형코드, 정지해제일시→이용정지해제일시 등 `_build_log.txt`)은 01 문서·areas.json 서술에 남은 옛 표기와 대조해 논리 단계에서 정리.
6. 남은 형식 확장 키(`tblNm`·`basicEntRels`·`extKeys`·`refPkRule`·`codeCandidates`)는 3절 형식의 허용 확장으로 유지(01 관문과 같은 판단).
