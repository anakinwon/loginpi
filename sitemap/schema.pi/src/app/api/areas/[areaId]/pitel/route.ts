// 스키마 생성 사례(Pi통신 과금 PTL) 요약 본문 — GET : SET_VIEW(설정·이력과 같은 단) 권한자에게만 정적 문구를 준다(화면 = [locale]/areas/[areaId]/pitel, DB 조회는 권한 확인뿐)
// 수치 근거 src 는 sitemap/schema.pi/pitel/ 기준 경로:줄 — 응답에는 넣지 않는다(R-P3 쓰는 값만). 단계 순서는 화면 아이콘 배열과 같다
// 수치는 pitel 리뷰·문서 원문 값만 옮긴다(새 수치 금지), 미확정 값은 [확인중]·[TBD](화면이 빨강 표시)
import { NextResponse } from 'next/server'
import { requireAreaRole } from '@/lib/api'

type Ctx = { params: Promise<{ areaId: string }> }
type Metric = { label: string; value: string; src: string }
type Step = { nm: string; badge: string; summary: string; metrics: Metric[]; notes: [text: string, src: string][] }

const STEPS: Step[] = [
  {
    nm: '스키마생성 프로젝트 계획',
    badge: 'FIXED',
    summary: 'Pi통신 과금 시스템(접두 PTL)의 범위·DBMS·규모·규칙을 D1~D15로 착수 당일(2026-11-07) 확정하고, 7개 주제영역과 정산 업무 모듈 STL을 정의했다',
    metrics: [
      { label: '주제영역', value: '7개(PRD 상품·CUS 고객·ORD 가입·PAY 청구·INV 수납·COL 미납·PRM 파트너) + 업무 모듈 STL', src: 'CONTEXT.md:24, docs/01_subject_areas.md:10' },
      { label: '엔터티 예산', value: '200~230개(주제영역마다 핵심 약 10 + 기본·일반 약 20)', src: 'CONTEXT.md:23' },
      { label: '엔터티 후보(계획 관문)', value: '214개 = 핵심 70, PRM만 34개(+13%)', src: 'reviews/01_plan.md:11' },
      { label: 'STL 정산 엔터티', value: '25개(PRM 19·PAY 3·INV 2·COL 1)', src: 'reviews/01_plan.md:12' },
      { label: '주제영역 간 관계(crossRels)', value: '37건 → 관문 수정 후 45건', src: 'reviews/01_plan.md:17' },
      { label: '실무 핵심 항목 대응', value: '36/36', src: 'reviews/01_plan.md:14' },
      { label: '데이터 기간', value: '2010-01-01 ~ 2026-10-31', src: 'CONTEXT.md:28' },
      { label: '데이터 규모 목표', value: '전체 약 10억~12억 행, 인덱스 포함 디스크 220GB 이하', src: 'CONTEXT.md:29' },
    ],
    notes: [
      ['대상 DBMS는 PostgreSQL 17이다. 로컬 Docker pitel-pg(포트 55432)를 쓰고, 적재는 DB pitel, 검증은 pitel_dev에서 한다. wal_level=logical을 켜 두어 CDC에 대비했다', 'CONTEXT.md:22'],
      ['참조무결성은 설계에만 둔다. DDL에는 FK 제약을 만들지 않고, FK 칼럼에는 인덱스를 설계한다(D6)', 'CONTEXT.md:26'],
      ['시스템 칼럼 4개(LST_MDDTM·LST_MDFR_ID·LST_RGDTM·LST_RGTR_ID)는 DDL을 만들 때만 붙인다(D7)', 'CONTEXT.md:27'],
      ["정산은 주제영역이 아니라 업무 모듈 STL로 두고 moduleCd:'STL'로 표시한다(D15)", 'CONTEXT.md:34'],
      ["적재 순서는 테이블(PK·인덱스 없이) → 데이터 → PK·인덱스 → ANALYZE다(D14). 운영 방식은 마스터 위임 자동 승인 모드이고, 계획 관문은 '승인(수정 후, FIXED)'이다", 'CONTEXT.md:35, reviews/01_plan.md:38'],
    ],
  },
  {
    nm: '개념모델',
    badge: 'FIXED',
    summary: '7개 주제영역에서 핵심 엔터티 70개와 주요 속성·관계를 정의했고, 관문에서 형식·명명·관계 양끝 결함을 직접 고쳐 위반 0으로 승인했다',
    metrics: [
      { label: '핵심 엔터티', value: '70개(7영역 × 10)', src: 'reviews/02_conceptual.md:11' },
      { label: '주제영역 간 관계', value: '45건 → 72건(27건 추가)', src: 'reviews/02_conceptual.md:92' },
      { label: '관문 직접 수정', value: '엔터티 물리명 110 · 속성 이름·도메인 103 · 관계 86 · 문서 7', src: 'reviews/02_conceptual.md:96' },
      { label: '영역 간 공유 속성', value: '46종 모두 물리명·도메인 일치', src: 'reviews/02_conceptual.md:23' },
      { label: '최종 위반', value: '0', src: 'reviews/02_conceptual.md:100' },
    ],
    notes: [
      ["엔터티 물리명을 '<약어>_<분류어 약어>' 하나의 형식으로 통일했다. 수정 전에는 3가지 형식이 섞여 위반이 70건이었다", 'reviews/02_conceptual.md:12'],
      ['유형은 TY, 상태는 ~STTS_TY_CD, 일자는 _DT로 통일했다', 'reviews/02_conceptual.md:13~14'],
      ['같은 키는 소유 영역의 속성명·물리명·도메인을 쓴다(K4). 데이터 생성 공식을 위해 부모 키 보존 속성 3개를 추가했다', 'reviews/02_conceptual.md:88'],
      ['약어 충돌 50건은 관문에서 정리했고, 약어 값은 표준사전을 최종 기준으로 삼았다', 'reviews/02_conceptual.md:94'],
      ["판정은 '승인(수정 후, FIXED)'이다", 'reviews/02_conceptual.md:100'],
    ],
  },
  {
    nm: '논리모델(표준사전 포함)',
    badge: 'FIXED',
    summary: '표준사전(단어·도메인·용어·공통코드)을 만들고, 기본·일반 엔터티까지 포함한 214개 엔터티를 3NF로 정규화했다. 영역별 관문 7개와 통합 관문을 모두 FIXED로 통과했다',
    metrics: [
      { label: '엔터티', value: '214개(핵심 70 / 논리 144)', src: 'docs/00_SUMMARY.md:30' },
      { label: '속성', value: '2,096개', src: 'reviews/03_logical.md:100' },
      { label: 'FK · 관계 · crossRels', value: 'FK 449 · 관계 431 · crossRels 121(필요 121)', src: 'reviews/03_logical.md:100' },
      { label: '표준단어', value: '410개', src: 'docs/03_standards.md:12' },
      { label: '표준도메인', value: '36개', src: 'docs/03_standards.md:13' },
      { label: '표준용어', value: '1,281개', src: 'docs/03_standards.md:14' },
      { label: '공통코드', value: '326개(값 1,617 — 유형 313·구분 11·종류 2)', src: 'docs/03_standards.md:15' },
    ],
    notes: [
      ["약어 원칙은 '한 단어 = 한 약어'다. 합성어는 '_' 없이 붙인다(MNP·ATRF·TXINV 등). 수납 = RCV, 미납 = UNPD로 정했다", 'docs/03_standards.md:22~36'],
      ['표준사전은 생성기(tools/std_build.js)로 만들고, 재실행 시 변경 0으로 멱등성을 확인했다', 'docs/03_standards.md:18'],
      ['반정규화 후보는 물리 단계로 넘겼다. ORD 6건, PRM 4건, normNote 반정규화 언급 22건이다', 'reviews/03_logical.md:90'],
      ['영역별 관문 판정: COL·CUS·PAY는 조건 없이 통과, INV·ORD·PRD·PRM은 수정 후 승인이다. 통합 관문(05_integrate)은 FIXED로, 교차 관계 결함 9건과 FK 표기 6개 파일을 고쳤다', 'reviews/04_logical_*.md 판정 줄, reviews/05_integrate.md:8'],
      ["논리 관문 최종 결과는 위반 0, '승인(수정 후, FIXED)'이다", 'reviews/03_logical.md:100'],
    ],
  },
  {
    nm: '물리모델',
    badge: 'FIXED(조건부)',
    summary: '엔터티 1개를 테이블 1개로 옮긴 214개 테이블에 PK·보조 인덱스·FK 정의(설계만)·RANGE 파티션·반정규화를 설계했다',
    metrics: [
      { label: '테이블 / 칼럼', value: '214 / 2,124(속성보다 28개 많음 = 반정규화·파티션 키 PK 확장)', src: 'docs/00_SUMMARY.md:30, 32' },
      { label: 'PK · 보조 인덱스 · 합계', value: '214 · 318(유일 2 포함) · 532', src: 'docs/00_SUMMARY.md:58~60' },
      { label: 'FK 정의(DDL 미생성)', value: '434개', src: 'docs/00_SUMMARY.md:15, 30' },
      { label: '파티션 테이블', value: '38개(월 8 · 연 30, 하위 2,306개, 모두 DEFAULT 1개 포함)', src: 'docs/00_SUMMARY.md:45~50' },
      { label: '영역별 설계 예상 행(estRows)', value: 'PRD 5,687,500 · CUS 161,365,000 · ORD 386,500,000 · PAY 821,170,230 · INV 약 3.88억 · COL 456,937,220 · PRM 122,054,500', src: 'docs/05_physical_PRD.md:4 · CUS.md:8 · ORD.md:13 · PAY.md:41 · INV.md:9 · COL.md:4 · PRM.md:13' },
    ],
    notes: [
      ['월 파티션은 2010-01~2027-12(하위 217개), 연 파티션은 2010~2027(하위 19개)이다. 파티션 키는 모두 PK 끝에 넣었다', 'docs/00_SUMMARY.md:49~50, 52'],
      ['PK 선두 칼럼과 같은 FK에는 별도 인덱스를 만들지 않았다. 저선택도 상태 칼럼에는 단독 인덱스를 두지 않았다', 'docs/05_physical_CUS.md:17, docs/05_physical_PRD.md:14'],
      ['PRD는 파티션과 반정규화가 모두 없다. 모두 기준 테이블(T1~T2)이기 때문이다', 'docs/05_physical_PRD.md:10~11'],
      ['영역별 관문 판정: PAY·PRD는 APPROVED, CUS·COL·INV·ORD·PRM은 FIXED다. 교차 FK의 부모 PK(파티션 키) 보정, 접미어 수정, FK 인덱스 보강을 했다', 'reviews/08_design_approval.md:17'],
      ['설계 최종 승인은 FIXED(조건부)다. 파티션 표기 결함 51건을 고쳤고, 데이터 생성 착수를 승인했다. 조건 C1~C3을 남겼다', 'reviews/08_design_approval.md:6'],
    ],
  },
  {
    nm: '물리DB구축',
    badge: '오류 0',
    summary: 'DDL을 pitel_dev에서 통합 실행하고 재실행해 오류 0을 확인했다. 이후 로컬 pitel(public)에는 테이블만 만들었고, PK·인덱스는 적재 뒤로 미뤘다',
    metrics: [
      { label: '통합 실행 · 재실행 오류', value: '0 · 0(멱등)', src: 'reviews/06_ddl.md:8' },
      { label: 'DB 실측 vs 물리 JSON', value: '테이블 214 · 파티션 상위 38 · PK 214 · 인덱스 532 모두 일치, FK 제약 0', src: 'reviews/06_ddl.md:16~22' },
      { label: '영역별 파티션 하위', value: 'CUS 369 · ORD 76 · PAY 1,237 · INV 510 · COL 95 · PRM 19 = 2,306', src: 'reviews/06_ddl.md:30~36' },
      { label: 'pitel public 적용 결과', value: '테이블 214 · 하위 2,306 · 인덱스 0 · PK 0 · 데이터 0행', src: 'reviews/06_ddl.md:43' },
    ],
    notes: [
      ['파일은 영역마다 2개다. <NN>_<area>_tables.sql(PK·인덱스 없음)과 <NN>_<area>_constraints.sql(적재 뒤 실행)이며, 순서는 10 PRD → 70 PRM이다', 'ddl/README.md:8~13'],
      ['DDL 파일에는 스키마 이름이 없다. 실행 전에 SET search_path로 대상 스키마를 정한다', 'ddl/README.md:14'],
      ['파티션 하위 테이블이 많아 DROP SCHEMA CASCADE는 잠금 한도를 넘는다. 그래서 테이블별로 삭제하는 절차를 문서화했다(설정은 바꾸지 않음)', 'reviews/06_ddl.md:42, ddl/README.md:38'],
      ['제약 파일은 대량 적재 전에 돌리지 않는다', 'ddl/README.md:40'],
    ],
  },
  {
    nm: '초기데이터구축 계획',
    badge: '약 11억 행',
    summary: '생성기(datagen.mjs + gen 스키마 SQL 함수)로 214개 테이블을 2,086조각으로 나눠 약 11억 행을 만드는 계획이다. 성능에 악영향을 주는 편향 S1~S14를 일부러 넣는다',
    metrics: [
      { label: '목표 행(배율 1.0)', value: '1,101,170,707행', src: 'docs/06_datagen.md:38' },
      { label: '영역별 목표 행', value: 'PRD 2,931,840 · CUS 75,886,548 · ORD 181,680,272 · PAY 386,093,910(35.1%) · INV 182,206,586 · COL 214,810,094 · PRM 57,561,457', src: 'docs/06_datagen.md:31~37' },
      { label: 'STL 25개 테이블', value: '60,704,422행', src: 'docs/06_datagen.md:53' },
      { label: '조각(shard)', value: '2,086 = 17조각 테이블 117개(1,989) + 1조각 테이블 97개(97)', src: 'docs/06_datagen.md:117' },
      { label: '상위 20개 테이블', value: '631,767,870행(57.4%), 최대 ptl_pay_use_l 70,509,807', src: 'docs/06_datagen.md:57, 61' },
      { label: '검증 배율 0.001', value: '214개 테이블 · 2,270,702행', src: 'docs/06_datagen.md:41' },
      { label: '예상 크기', value: '인덱스 포함 220GB 이하(상한), 영역별 크기는 [TBD]', src: 'docs/06_datagen.md:40' },
    ],
    notes: [
      ["행 수 산정: 예상 10만 행 이하인 기준 테이블은 고정한다. 나머지는 '예상 행 × (1.1e9 / 큰 테이블 예상 합계) × 배율'로 줄인다", 'docs/06_datagen.md:25'],
      ['결정적 키 공식을 쓴다. gen.u(k, salt) 해시로 값을 정해 random()을 쓰지 않으므로 재실행해도 같은 데이터가 나온다. 자식은 부모 번호를 편향 함수로 골라 조인 없이 병렬로 생성한다', 'docs/06_datagen.md:109~110'],
      ['조각 기준: 100만 행 미만 테이블은 1조각, 그 이상은 연도(2010~2026)별 17조각이다. 재개 상태 파일로 재시작할 수 있다', 'docs/06_datagen.md:118, 125'],
      ['편향 S1~S14 적용표가 있다. S3은 첫 코드값 98%, S5는 선택 FK NULL 30%·선택 칼럼 NULL 60%, S9는 0.5% 확률로 1~4KB 메모, S11은 고아 행 0.05%다. S10 등 코드로 확인되지 않은 목표는 [확인중]이다', 'docs/06_datagen.md:90~103'],
      ['데이터와 메타를 분리한다(마스터 결정 2026-11-11). 약 11억 행 데이터는 로컬 pitel-pg에만 두고, schema.pi 운영에는 메타만 올린다', 'docs/06_datagen.md:18~21'],
    ],
  },
  {
    nm: '실행',
    badge: '2,086/2,086 성공',
    summary: '실행기(run-init.mjs)가 생성기를 동시 7개로 돌려 2,086조각을 모두 성공시켰다. 이어서 PK·인덱스와 ANALYZE를 적용했다(2026-11-07 21:37 ~ 11-08 03:49). 생성·제약 단계별 소요는 리뷰 문서에 없고, gitignore 대상 실행 로그에만 있다',
    metrics: [
      { label: '생성기 기동', value: '2026-11-07 21:37:58, --scale 1 --jobs 7, 조각 2,086개 · 목표 1,101,170,707행 · 동시 7', src: 'database/run-init.log:29~30' },
      { label: '데이터 생성 결과', value: '성공 2,086 · 실패 0 · 17,015초(약 4시간 44분), 2026-11-08 02:21:36 종료', src: 'database/run-init.log:425' },
      { label: 'PK·인덱스 적용', value: '3개 영역 동시 시작 02:21:36, 마지막 PAY 03:36:50 완료(PAY 1시간 15분 14초 · INV 56분 47초 · ORD 31분 30초 · COL 25분 45초 · PRM 10분 23초 · CUS 8분 22초 · PRD 22초)', src: 'database/run-init.log:427~517' },
      { label: 'ANALYZE(전체)', value: '13분 04초', src: 'database/run-init.log:532' },
      { label: '적재 뒤 DB 크기(실행 감시값)', value: '274.5GB(십진, pg_database_size ÷ 1e9) = 256GiB(pg_size_pretty 표기)로 같은 크기', src: 'database/run-init.log:516, database/run-init.mjs:150, reviews/10_constraints_apply.md:99' },
      { label: '실행기 회차', value: '7회차까지 재시작. 검증 단계는 5회차 실패(08:59) · 6회차 EPERM 실패(10:16) 뒤 7회차에 8분 23초로 완료', src: 'database/run-init.log:48, 843~853, 931, 951' },
    ],
    notes: [
      ['본 적재 명령은 node database/run-init.mjs start이다. 내부에서 datagen.mjs run --db prod --yes --schema public --scale 1 --jobs 7을 호출한다. --db prod는 로컬 pitel DB다', 'docs/06_datagen.md:140~144'],
      ['생성기 기본 병렬은 6이지만 본 적재 실행기는 7을 썼다', 'docs/06_datagen.md:121'],
      ['실행기 사전점검: 복제 슬롯 0, 본 DB 테이블 214·0행, 1% 시험 비율 r=0.628', 'database/run-init.log:3~5, 13'],
      ["데이터 생성 뒤 디스크 게이트(2026-11-08 02:21:36, 제약 후 남는 공간 195.9GB)에서 보조 인덱스를 미루지 않고 '전부 생성'으로 판정했다", 'database/run-init.log:426, database/run-init.mjs:458~463'],
      ['제약은 실행기가 7개 영역에 적용했다(2026-11-08 02:21~03:36)', 'database/run-init.log:427~517'],
      ['리뷰 문서에는 적재 종료(02:21)·ANALYZE 날짜·FK 검증 실행(2026-11-08 09:02~15:40)만 있고, 생성·제약 단계별 소요는 gitignore 대상 로그(database/run-init.log)에만 있다', 'reviews/09_datagen_verify.md:19, 37, sitemap/schema.pi/.gitignore:13'],
    ],
  },
  {
    nm: '결과검증',
    badge: 'FIXED(조건부)',
    summary: '행 수·관계·제약은 기준을 충족했다. 편향은 PASS 6 / FAIL 4이고, S6은 생성 결함(파티션 테이블 15개가 2010년 파티션에 몰림)이다. 데이터 단계 마감은 FIXED(조건부)로 승인됐다',
    metrics: [
      { label: '행 수', value: '214/214 테이블, 계획 1,101,170,707 · 추정 1,101,170,710(+3), ±5% 이탈 0', src: 'reviews/09_datagen_verify.md:26~28' },
      { label: '표본 정확 건수', value: '3개 테이블 모두 계획·추정과 같음(예: ptl_ord_sbsc_ctrt_m 6,110,850)', src: 'reviews/09_datagen_verify.md:30' },
      { label: '고아율(S11)', value: 'FK 434개 · 자식 행 2,682,339,017 · 고아 1,036,121 = 0.039%(주입 FK 0.0499%), 1% 초과 FK 0', src: 'reviews/09_datagen_verify.md:41~43' },
      { label: 'PK·인덱스', value: '532개 적용(이름·칼럼 차이 0, 무효 0)', src: 'reviews/10_constraints_apply.md:10~16' },
      { label: 'DEFAULT 파티션', value: '38개 모두 0건(정확 count)', src: 'reviews/10_constraints_apply.md:18, 87' },
      { label: '편향', value: 'PASS 6(S1 상위 0.01%·S3·S4 최근 3년·S9·S11·S14) / FAIL 4(S1 법인 100만+ 실측 530,241 · S2 실측 0.0368 · S5 90% 이상 22칼럼 · S6) / 미점검 S7·S8·S10·S12·S13', src: 'reviews/09_datagen_verify.md:6, 54~72' },
      { label: 'S6 결함', value: '파티션 테이블 38개 중 15개가 2010년 파티션 1~3개에 몰림', src: 'reviews/09_datagen_verify.md:74~82' },
      { label: 'DB 크기', value: '256GB(GiB, pg_size_pretty) = 274.5GB(십진)', src: 'reviews/10_constraints_apply.md:99, database/run-init.log:516' },
      { label: 'schema.pi 작성중', value: '87/214(완료 127), C1 적용 전 91', src: 'reviews/11_phase2_approval.md:91, 66~67' },
    ],
    notes: [
      ['제약 적용 확인(2026-11-11): PK 214 + 보조 318 = 532가 이미 적용돼 있어 실행한 DDL은 0건이다. 부분 인덱스 96, 무효 인덱스 0이다', 'reviews/10_constraints_apply.md:4, 10~17'],
      ["S6 원인 추정: PK에 들어간 일시 칼럼이 recent_dtm 대신 '순번 % 2' 공식으로 만들어졌다(예: ptl_pay_chrg_calc_l 47,006,538행이 201002~201003에 몰림)", 'reviews/09_datagen_verify.md:81~82'],
      ['S6 처리: 기록만 하고 재생성은 하지 않는다(마스터 결정 2026-11-11). 생성기 수정은 후속 과제다', 'reviews/11_phase2_approval.md:26, 137'],
      ["C1: INV 청구년월 5건을 논리 모델에서 제거하고, 물리 denorm(BILL_YM)은 유지한다. C2(FK 상속 역할명 4건)는 '작성중'으로 수용한다. C3(25자 넘는 테이블명 3건)은 현행 유지다", 'reviews/11_phase2_approval.md:35, 72~87'],
      ["남은 정규화 의심(5a 76쌍 · 5b 87건)은 앱 휴리스틱의 오탐 성격으로 보고 '작성중'으로 수용했다", 'reviews/11_phase2_approval.md:43, 58~59'],
      ['판정은 FIXED(조건부)다. 운영 schema.pi(public)에는 메타만 올리며, 실행은 마스터가 직접 한다([확인중])', 'reviews/11_phase2_approval.md:6, 97~100'],
    ],
  },
]

// 남은 일(근거는 각 항목 src)
const OPEN: [text: string, src: string][] = [
  ['S6 생성기 수정(PK 일시 칼럼을 recent_dtm 계열로)과 15개 테이블 재생성 여부 — 재생성은 별도 결정', 'reviews/11_phase2_approval.md:137, reviews/09_datagen_verify.md:99'],
  ['편향 미점검 항목: S2 부가서비스 미사용, S4 말일·1일·장애일, S7·S8·S10·S12·S13 — verify.mjs에 지표 추가 필요', 'reviews/09_datagen_verify.md:100'],
  ['S1·S2·S5 목표 미달이 의도된 조정인지 결정 필요', 'reviews/09_datagen_verify.md:101'],
  ['고아 0건 FK 124개가 설계 의도인지 대조 필요', 'reviews/09_datagen_verify.md:102'],
  ['FK 434건 검증은 2026-11-08 결과를 그대로 썼다. 전체를 다시 돌리면 약 1시간 23분 걸린다', 'reviews/09_datagen_verify.md:97'],
  ['schema.pi 운영 메타 적재: 마스터가 직접 실행한다. 실행 전 확인할 것은 운영 ref 대조, public 스키마, 백업 설정 [확인중], C1 이후 속성·칼럼 건수 [확인중]', 'reviews/11_phase2_approval.md:100, 119~128'],
  ['PRM 정규화 의심 건수는 세지 않았다([확인중])', 'reviews/11_phase2_approval.md:60'],
  ['후속 과제: 앱 정규화 판정 개선, 논리 생성기 폐기 또는 표준사전 동기화, verify.mjs --state 옵션, 판정 증거 상한', 'reviews/11_phase2_approval.md:136~140'],
  ['영역별 예상 크기는 [TBD]다', 'docs/06_datagen.md:40'],
  ['다음 세션 과제: CDC 파이프라인 → 데이터 레이크 → AI 분석 센터', 'docs/00_SUMMARY.md:85'],
]

// 수치 읽을 때 주의 — 문서마다 다르게 적힌 값의 정정
const FIXES: [text: string, src: string][] = [
  ["'샘플 12억 건'은 실제와 다르다. 적재 행 수는 계획 1,101,170,707행, 실측 추정 1,101,170,710행으로 약 11.0억 행이다. 12억은 D9 목표 범위 '약 10억~12억 행'의 상한일 뿐이다. FK 검증의 '자식 행 2,682,339,017'은 FK 434개마다 자식 행을 중복해 센 값이라 테이블 행 수가 아니다", 'docs/06_datagen.md:38, reviews/09_datagen_verify.md:27, 41, CONTEXT.md:29'],
  ['디스크가 목표를 넘었다. 실측 256GB(pg_size_pretty, GiB)와 실행 감시값 274.5GB(십진)는 단위 차이일 뿐 같은 크기이며, 목표 인덱스 포함 220GB 이하(D9)보다 크다. 220GB의 단위(십진·GiB)는 [확인중]', 'CONTEXT.md:29, docs/06_datagen.md:40, reviews/10_constraints_apply.md:99, database/run-init.log:516'],
  ["CONTEXT D12에는 schema.pi 반영 대상이 '주제영역 6'으로 적혀 있다. 실제는 7개다", 'CONTEXT.md:32, 24, docs/00_SUMMARY.md:30'],
  ["생성 병렬도 표기가 다르다. CONTEXT 5절은 '병렬(동시 6)', 실제 본 적재는 동시 7", 'CONTEXT.md:93, docs/06_datagen.md:121, database/run-init.log:30'],
  ["docs/00_SUMMARY.md 6절의 'DB 현황 데이터 0행·인덱스 0·PK 0'은 2026-11-07 적재 전 시점 값이라 지금과 맞지 않는다. 현재 상태: 11억 행, 532 적용", 'docs/00_SUMMARY.md:62~64, reviews/10_constraints_apply.md:4'],
  ['단계마다 FK·인덱스 수치가 다르다. 논리 FK 449·관계 431, 물리 FK 정의 434, 적재기 복제 시험 기대값 FK 430·인덱스 309·완료 123. README 기대값은 C1 이전 값이라 그대로 쓰지 말라고 되어 있다', 'reviews/03_logical.md:100, docs/00_SUMMARY.md:15, loader/README.md:36, reviews/11_phase2_approval.md:128'],
  ['작성중 엔터티 수는 loader/README.md의 91개에서 C1 반영 뒤 87개(완료 127)로 줄었다', 'loader/README.md:41, reviews/11_phase2_approval.md:91'],
  ['CONTEXT 5절의 편향 목표 수치 중 일부는 생성기 상수와 다르다. S5 선택 칼럼 NULL은 목표 90~99%, 코드 60%다. S1 법인 100만+, S2 요금제 35%, S6 10~20배는 코드에서 확인되지 않았다. S6은 정상 월 파티션에서도 약 4,150배로 나왔다', 'docs/06_datagen.md:90~103, reviews/09_datagen_verify.md:64'],
]

const LEAD = 'PostgreSQL 17 · 주제영역 7 + 정산 모듈 STL · 테이블 214 · 데이터 약 11억 행 — 계획부터 결과검증까지 8단계 요약(2026-11-07 착수, 2026-11-11 데이터 단계 마감 승인)'
const txt = (a: [text: string, src: string][]) => a.map(([t]) => t)
// 정적 응답 본문 — 모듈 로드 때 한 번 만든다(요청마다 재계산 없음, R-P2)
const BODY = { ok: true, lead: LEAD, steps: STEPS.map(({ metrics, notes, ...s }) => ({ ...s, metrics: metrics.map(({ label, value }) => ({ label, value })), notes: txt(notes) })), open: txt(OPEN), fixes: txt(FIXES) }

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'SET_VIEW')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(BODY)
}
