# 시나리오 S1 실행 기록 : Pi통신 과금 PostgreSQL → Oracle 물리모델·초기 데이터

> 요구사항 : dbms.pi `docs/PRD.md` 11.6 ORA-R01~R06 · 일정 : dbms.pi `docs/ROADMAP.md` 'Oracle 실증 트랙'(계획 11-16~11-19, 2026-11-15 수행)
> 실행 : 2026-11-15 UTC 00:00~ · 수행 : 아소카 · 같은 PC·같은 배율·같은 생성 규칙으로 PostgreSQL 과 Oracle 을 차례로 실행하고 단계마다 같은 방식으로 시간을 쟀다

재현 순서(이 폴더의 부모 `pitel/` 에서) :

```bash
node oracle/ddl-oracle.mjs                 # Oracle DDL 생성(ModelPi genDdl + 조각·인덱스 규칙) → oracle/ddl/
node oracle/s1.mjs all --target pg         # PostgreSQL 배율 0.01 : 준비 → 테이블 → 함수 → 적재 → PK·인덱스 → 통계 → 검증
node oracle/s1.mjs all --target oracle     # Oracle 같은 7단계
node oracle/s1.mjs fncheck                 # 생성 함수 21개 × 키 10,000개 대조
node oracle/s1.mjs compare                 # 214테이블 전 행 체크섬 대조
node oracle/s1.mjs report                  # 단계별 시간·결과 비교표
```

## 1. 요약

| 항목 | PostgreSQL 17 | Oracle 21c |
|---|---:|---:|
| 7단계 합계 | 5분 0초 | 40분 1초 (8.0배) |
| 데이터 생성·적재 | 2분 16초 | 34분 29초 (15.2배) |
| 행 · 조각 · PK · 보조 인덱스 | 12,170,698 · 2,306 · 214 · 318 | 같음 |
| 크기 | 3.11 GB | 14.94 GB |

- Oracle 판 물리모델과 초기 데이터를 기존 생성 규칙 그대로 만들었다. 건수·조각·PK·인덱스는 PostgreSQL 과 모두 같다
- 214테이블 전 행을 대조했다. 문자·숫자 칼럼 1,855개는 모든 행이 같다. 일시 칼럼 269개 가운데 155개에서 일부 행이 1마이크로초 다르다(표본 칼럼 94,013행 중 7행). 원인은 두 DB 의 거듭제곱 함수(POWER)가 마지막 1비트 다르게 계산하는 경우다
- Oracle 적재가 느린 이유는 생성 함수 실행 방식이다. PostgreSQL 은 SQL 함수를 질의 안에 펼쳐 C 함수로 바로 계산하고, Oracle 은 행·칼럼마다 PL/SQL 함수를 해석 실행한다
- ORA-R06 통과 기준은 2026-11-15 마스터 결정으로 '일시 칼럼 1µs 이내 허용' 으로 고쳤다(9절). 엄격한 동일성은 S3 복제에서 본다

## 2. 실행 환경

| 항목 | PostgreSQL | Oracle |
|---|---|---|
| 제품 | PostgreSQL 17.12 (`postgres:17`) | Oracle Database 21c Enterprise Edition 21.3.0.0.0 (`nomhiro1204/oracle21c`) |
| 컨테이너 | `pitel-pg` 포트 55432 | `oracle21c` 포트 1521, CDB `ORCLCDB` · PDB `ORCLPDB` |
| 대상 | DB `pitel_dev` 스키마 `ptl_s001`(운영 pitel DB 와 분리) | 사용자 `PITEL`, bigfile 테이블스페이스 `PITEL_DATA` |
| CPU · 메모리 | 8코어, Docker 전체 7.6GB 를 두 컨테이너가 나눠 씀 | 같음 |
| 메모리 설정 | shared_buffers 2GB, work_mem 64MB, maintenance_work_mem 1GB | SGA 1,536MB, PGA 512MB |
| 문자셋 | UTF8 | AL32UTF8, 세션 `NLS_LENGTH_SEMANTICS` CHAR |
| 로그 | `wal_level` logical, `synchronous_commit` off | NOARCHIVELOG |
| 배율 | 0.01 : 214테이블 목표 12,170,698행 | 같음 |
| 동시 실행 | 적재 6, PK·인덱스 영역 3 | 같음 |

## 3. 단계별로 한 일

| 단계 | PostgreSQL | Oracle |
|---|---|---|
| 준비 | `CREATE SCHEMA ptl_s001` | 사용자·테이블스페이스 삭제 뒤 다시 만듦, 권한(세션·테이블·프로시저·타입, `DBMS_CRYPTO`) |
| 테이블·조각 | `ddl/*_tables.sql`(pitel 생성기 `tools/*` 산출, 조각은 DO 블록 반복) | `oracle/ddl/*_tables.sql`(ModelPi `genDdl` Oracle 0001 + 조각 절) |
| 생성 함수 | `datagen/00_gen_functions.sql` : SQL 함수 20개 + PL/pgSQL 1개 | `oracle/gen_pkg.sql` : PL/SQL 패키지 `GEN`(같은 계산, INTERPRETED·최적화 3) |
| 적재 | `INSERT … SELECT … FROM generate_series` 테이블당 1문 | `INSERT /*+ APPEND */ … SELECT … FROM TABLE(gen.series)` 테이블당 1문 |
| PK·인덱스 | `ADD PRIMARY KEY` + `CREATE INDEX`(부분 인덱스 96개 포함) | 유일 인덱스(조각 테이블 `LOCAL`) → `ADD CONSTRAINT … USING INDEX`, 보조 인덱스 318개 |
| 통계 | `ANALYZE` | `DBMS_STATS.GATHER_SCHEMA_STATS` |
| 검증 | 테이블별 `count(*)` + 카탈로그(조각·PK·인덱스·크기·DEFAULT 조각 행) | 같음 |

## 4. 소요 시간 비교

`node oracle/s1.mjs report` 출력. PostgreSQL 은 UTC 00:06:19~00:11:19, Oracle 은 00:21:33 시작(적재 00:21:57~00:56:26). PK·인덱스·통계·검증은 1차 실패 정리 뒤 00:59~01:05 에 다시 쟀다(8절).

| 단계 | PostgreSQL 17 | Oracle 21c | Oracle ÷ PostgreSQL |
|---|---:|---:|---:|
| 준비(스키마·사용자) | 0.3초 | 13.6초 | 39.07배 |
| 테이블·조각 생성 | 3.5초 | 9.8초 | 2.82배 |
| 생성 함수 설치 | 0.1초 | 0.5초 | 3.89배 |
| 데이터 생성·적재 | 2분 16초 | 34분 29초 | 15.16배 |
| PK·인덱스 | 32.6초 | 2분 52초 | 5.30배 |
| 통계 수집 | 1분 53초 | 1분 53초 | 1.00배 |
| 건수 검증 | 13.8초 | 22.8초 | 1.65배 |
| 합계 | 5분 0초 | 40분 1초 | 8.00배 |

적재 1차(원형 이식)와 2차(튜닝) 테이블별 소요 : 1차는 7테이블 완료 뒤 중단

| 테이블 | 행 | PostgreSQL | Oracle 1차 | Oracle 2차 |
|---|---:|---:|---:|---:|
| PTL_COL_EXOFTRMN_M | 7,051 | 0.7초 | 25.1초 (36.0배) | 9.1초 (13.1배) |
| PTL_COL_RCVB_TRNSF_M | 4,701 | 0.4초 | 11.5초 (27.6배) | 4.1초 (9.8배) |
| PTL_COL_DIV_PAY_AGRMT_M | 9,401 | 0.6초 | 12.6초 (20.4배) | 7.0초 (11.2배) |
| PTL_COL_SUSP_M | 28,204 | 2.4초 | 70.5초 (30.0배) | 35.3초 (15.0배) |

생성 함수 1회 비용(20만 회 호출 측정, 빈 반복 시간 뺌) : `gen.u` 1차 8.4µs → 2차 5.2µs, `gen.wcode` 2차 6.4µs. PostgreSQL 은 `gen.u`·`gen.recent_dtm` 10만 회씩이 컨테이너 호출 포함 0.29초.

## 5. 결과 비교

| 결과 | PostgreSQL 17 | Oracle 21c |
|---|---:|---:|
| 테이블 | 214 | 214 |
| 행 | 12,170,698 | 12,170,698 |
| 조각 | 2,306 | 2,306 |
| PK | 214 | 214 |
| 보조 인덱스 | 318 | 318 |
| DEFAULT 조각 행 / 개수 | 0 / 38 | 0 / 38 |
| 크기(테이블+인덱스+LOB) | 3.11 GB | 14.94 GB |

테이블별 행 수 214개 모두 `datagen plan` 목표와 같다(두 DB 공통).

Oracle 크기 내역(`user_segments`) : 조각 세그먼트는 데이터가 적어도 첫 익스텐트 8MB 를 잡는다.

| 세그먼트 | 개수 | 합계 | 8MB 정확히 |
|---|---:|---:|---:|
| TABLE PARTITION | 1,268 | 10.85 GB | 1,257 |
| LOB PARTITION | 223 | 1.87 GB | 223 |
| INDEX PARTITION | 5,584 | 1.12 GB | 3 |
| TABLE | 176 | 0.67 GB | 5 |
| INDEX | 428 | 0.40 GB | 1 |
| LOBSEGMENT · LOBINDEX | 22 | 0.02 GB | 0 |

빈 조각 1,038개는 세그먼트를 만들지 않았다(지연 세그먼트 생성). 배율 0.01 처럼 조각당 행이 적으면 첫 익스텐트가 크기 대부분을 차지하므로, 실제 데이터 양 비교는 배율 1 에서 다시 본다.

## 6. 데이터 동일성

**생성 함수 대조(ORA-R04)** : 21개 함수 × 키 10,000개(1~5,000 과 104,729 의 배수 5,000개, 약 5억까지)를 두 DB 에서 계산해 비교

| 결과 | 함수 |
|---|---|
| 10,000개 모두 같음 | h53(해시) · uniform · skew 2종 · wpick · wcode · after_dtm · month_edge · ymd · fmt · orphan · person_nm · corp_nm · phone · amt · dirty · memo(1,000자·CLOB) · f2n 반올림 · dtm_to_k |
| 3개 다름 | recent_dtm : 키가 행 수보다 훨씬 큰 범위 밖 값(2079년 이후 일시)에서 1µs. 데이터 범위(키 ≤ 행 수) 키 5,004개는 모두 같음 |

**전 행 대조(ORA-R06)** : 칼럼마다 MD5 → 행 해시 → 앞 60비트 합(순서와 무관한 체크섬), 칼럼별 합도 함께. 시스템 칼럼 4개는 뺐다(기본값이 다름, 7절)

| 항목 | 값 |
|---|---:|
| 대조 테이블 · 행 | 214 · 12,170,698 |
| 행 수 일치 테이블 | 214 |
| 모든 칼럼이 같은 테이블 | 106 |
| 일시 칼럼만 다른 테이블 | 108 |
| 다른 칼럼(전체 2,124개 중) | 155 (모두 TIMESTAMP, 전체 TIMESTAMP 269개 중) |
| 문자·숫자 칼럼(VARCHAR 1,208 · CHAR 278 · NUMERIC 369) | 전 행 같음 |
| 대조 소요 | 2,224초(두 DB 동시, 테이블 4개씩) |

다른 정도(표본, 행 단위 비교) : `PTL_COL_UNPD_M` 94,013행 중 `UNPD_OCRN_DTM` 7행(+1µs 4행, −1µs 3행, 0.0074%), `CMPLPAY_DTM` 1행(−1µs).

원인(확인) : 다른 행의 키에서 난수 `gen.u` 는 두 DB 의 비트가 같고, 일시 곡선의 `POWER(x, 0.22)` 결과가 마지막 1비트(1 ULP) 다르다. 이 값에 기간(약 5.3 × 10^11µs)을 곱한 뒤 마이크로초로 반올림하는 경계에서 1µs 가 갈린다. 같은 값으로 계산되는 일자(CHAR(8)) 칼럼은 모두 같다.

| 키 | PostgreSQL POWER 비트 | Oracle POWER 비트 | gen.u 비트(두 DB 같음) |
|---|---|---|---|
| 19633 | 3fe6ac399bdc34cc | 3fe6ac399bdc34cb | 3fe69cb06be5b9af |
| 36600 | 3fea009e8c86b49f | 3fea009e8c86b4a0 | 3fe72ca31cb6e983 |
| 38554 | 3fea4d33b229e30c | 3fea4d33b229e30d | 3fb88505ecedbef8 |
| 100(같은 예) | 3fcc6197d09385a0 | 3fcc6197d09385a0 | 3fed678e674b9ba4 |

## 7. 이식하며 바뀐 것

| 항목 | PostgreSQL | Oracle | 근거·영향 |
|---|---|---|---|
| 문자 타입 | `VARCHAR(n)` · `CHAR(n)` | `VARCHAR2(n CHAR)` · `CHAR(n CHAR)` | schema.pi `std_tp_map`. ModelPi 는 길이 단위를 적지 않아 세션 `NLS_LENGTH_SEMANTICS` 를 CHAR 로 두고 실행(한글 3바이트) |
| 숫자·일시 | `NUMERIC(p,s)` · `TIMESTAMP` | `NUMBER(p,s)` · `TIMESTAMP` | `std_tp_map` |
| 긴 문자 14칼럼 | `VARCHAR(4000)` | `CLOB` | VARCHAR2 상한 4,000바이트. 메모 데이터는 한글 섞여 최대 약 5,300바이트 |
| 부분 인덱스 96개 | `CREATE INDEX … WHERE` | 70개 일반 인덱스, 26개 함수 기반 인덱스 | Oracle 에 부분 인덱스가 없다. `c IS NOT NULL` + 칼럼 c 하나는 일반 인덱스로 결과가 같고(B-tree 는 키가 모두 NULL 인 행을 담지 않음), 나머지는 `CASE WHEN 조건 THEN 칼럼 END` 로 크기·내용을 맞춤. 질의도 같은 식을 써야 인덱스를 탄다 |
| 이름 10개 | 30자 넘는 PK·인덱스 이름 | ModelPi 규칙으로 끝을 자름(예 `PK_PTL_INV_CARD_ATMT_PAY_APRV_`, `X_PTL_INV_CASH_RCIPT_PBLCN__01`) | ModelPi Oracle 프로파일 이름 상한 30자(DA 표준). 잘린 끝이 `_` 로 남거나 `__` 가 생김 |
| 조각 경계 | `FROM (하한) TO (상한)` + `DEFAULT` | `VALUES LESS THAN (상한)` + `MAXVALUE` 조각 `PDEF` | 하한 아래 값이 PostgreSQL 은 DEFAULT 로, Oracle 은 첫 조각으로 감. 데이터에 2010년 이전 값이 없어 결과 같음(DEFAULT 조각 행 0) |
| DEFAULT 조각 이름 | `_pdef` 22개 · `_pdflt` 11개 · `_def` 5개 | `PDEF` 38개 | PostgreSQL DDL 은 영역마다 생성기가 달라 이름이 섞임. 검증은 경계식으로 찾음 |
| 시스템 칼럼 기본값 | `'SYSTEM'` · `CURRENT_TIMESTAMP` | `'ADMIN'` · `SYSTIMESTAMP` | pitel DDL 과 ModelPi 규칙이 다름. 데이터 대조에서 시스템 칼럼은 뺐다 |
| 정수 나눗셈·나머지 | `a / b` · `a % b` | `TRUNC(a / b)` · `MOD(a, b)` | Oracle `/` 는 소수 나눗셈 |
| 배열 인자 | `ARRAY[...]::float8[]` | `'90\|10'` 문자열(세션 캐시) | PL/SQL 함수에 SQL 배열을 행마다 만들면 느림 |
| NULL 섞기 | `gen.null_p(값, …)`(다형 함수) | `CASE WHEN gen.u(…) < p THEN NULL ELSE 값 END` | Oracle 함수는 다형 인자가 없음 |
| 키 생성 | `generate_series` | 파이프라인 함수 `gen.series` | |
| 실수 → 숫자 | `float8::numeric`(유효숫자 15자리) | `gen.f2n` 이 15자리로 바꾼 뒤 NUMBER | 비율 칼럼 반올림 결과를 맞추려고 |
| 일시 비교 리터럴 1건 | `vld_end_dtm = '9999-12-31 23:59:59'` | `vld_end_dtm = TIMESTAMP '9999-12-31 23:59:59'` | Oracle 은 문자열을 세션 NLS 형식으로 일시 변환(ORA-01847), 함수 기반 인덱스는 결정적 식만 허용 |
| 구간 곱 | `interval * float8`(PostgreSQL interval_mul) | 같은 계산(일·초 나머지·마이크로초 짝수 반올림)을 PL/SQL 로 | 일시 칼럼 값을 마이크로초까지 맞추려고 |

## 8. 실행 중 생긴 문제와 조치 (UTC, 시간순)

| 시각 | 증상 | 원인 | 조치 |
|---|---|---|---|
| 00:04 | `ORA-02236: invalid file name`(테이블스페이스 생성) | 이미지에 OMF(`db_create_file_dest`) 미설정 | 데이터 파일 경로를 PDB `USERS` 파일과 같은 폴더로 지정 |
| 00:04 | `ORA-00600 [pesldl03_MMap: errno 1 … Operation not permitted]`(NATIVE 컴파일) | 컨테이너가 실행 가능 메모리 매핑을 막음 | INTERPRETED 로 컴파일. 운영급 서버에서는 NATIVE 를 다시 볼 것 |
| 00:05 | `ORA-01405: fetched column value is NULL`(함수 대조) | `STANDARD_HASH`·`DBMS_CRYPTO.HASH` 에 NULL 입력 | NULL 을 CASE 로 먼저 거름 |
| 00:05 | 함수 대조에서 한글 이름 4건 깨짐 | 실행기(node)가 출력 조각 경계에서 UTF-8 글자를 갈라 읽음. 데이터 문제 아님 | 표준출력을 UTF-8 로 해독(`setEncoding`) 뒤 재대조 일치 |
| 00:11 | PostgreSQL 검증에서 DEFAULT 조각 22/38 | PostgreSQL DDL 의 DEFAULT 조각 이름이 3가지 | 이름 대신 경계식(`DEFAULT`)으로 찾음 → 0/38 |
| 00:12~00:15 | Oracle 1차 적재가 테이블당 PostgreSQL 의 14~36배 | PL/SQL 해석 실행, NUMBER 정수 연산, 호출마다 배열 복사 | 7테이블 완료 뒤 중단. `KILL SESSION`·`DISCONNECT` 뒤에도 세션이 PL/SQL 안에서 돌아 OS 프로세스 4개를 종료 |
| 00:17 | `pitel-pg` 정지(fast shutdown, 종료 코드 137, OOM 아님) | 외부 정지 요청. 이 작업의 명령은 이 컨테이너를 멈추지 않는다. 요청 주체는 확인 못 함 | `docker start`, 데이터 보존 확인(`ptl_cus_cust_m` 23,503행) |
| 00:18~00:21 | 해시 튜닝 중 `ORA-06502`(SIMPLE_INTEGER) | `SIMPLE_INTEGER` OUT 인자는 NULL 로 시작 | IN OUT 으로 바꿈. 해시 15만 건 1차와 같은 값 확인 |
| 00:56 | `ORA-01847`(PK·인덱스 단계) | 부분 인덱스 조건 `vld_end_dtm = '9999-12-31 23:59:59'` 의 문자열 → 일시 암묵 변환이 세션 NLS 형식을 따름 | 생성기가 일시 문자열을 `TIMESTAMP '…'` 리터럴로 바꿈(1건). 만들다 만 PK 88·인덱스 157 삭제 뒤 PK·인덱스·통계·검증 재실행 |
| 01:06 | 1차 전 행 대조에서 132테이블 '다름' | 넓은 테이블의 Oracle 대조 SQL 한 줄이 sqlplus 상한 2,499자를 넘어 `SP2-0027` 로 실행되지 않음(대조 도구 결함) | 식마다 줄을 나눠 재대조 → 실제 차이는 일시 칼럼 1µs(6절) |

## 9. 해석과 결정

**적재 15배** : PostgreSQL `gen.*` 21개 중 20개는 `LANGUAGE sql` 함수라 플래너가 질의 안에 펼친다. `EXPLAIN VERBOSE` 에서 `gen.uniform(k, 12, 40)` 은 `1 + floor(hashint8extended(k, 12) … * 40)` 식으로 바뀌어 C 함수가 바로 돈다. Oracle PL/SQL 함수는 SQL 에 펼쳐지지 않아 행·칼럼마다 SQL → PL/SQL 전환과 해석 실행을 거친다. 해시를 32비트 정수(SIMPLE_INTEGER)로 바꾸고 배열 복사를 없애 1차보다 2~3배 빨라졌다. 남은 개선 후보는 NATIVE 컴파일(컨테이너 `/dev/shm` 실행 허용 필요), 21c 스칼라 SQL 매크로로 단순 함수 펼치기, 생성을 DB 밖 워커로 옮기기다. 이번 범위에서는 시험하지 않았다.

**PK·인덱스 5.3배** : Oracle 은 조각 테이블 PK·인덱스를 `LOCAL` 로 만들어 인덱스 조각 세그먼트가 5,584개 생겼다. 조각마다 세그먼트를 만드는 비용이 큰 몫으로 보인다(추론, 세그먼트 수 대비 시간 측정으로 확인 가능).

**통계 같음** : 두 DB 모두 표본 통계라 행 수보다 테이블·조각 수에 따라 시간이 정해진다.

**결정(2026-11-15 마스터, 권장안 채택) : ORA-R06 통과 기준** : '불일치 0건' 은 일시 칼럼 1µs 차이 때문에 충족하지 못했다. 원인은 두 엔진의 수학 함수 구현 차이이고, 생성 데이터를 엔진마다 따로 만들 때만 생긴다. S3(PostgreSQL → Oracle 복제)는 값이 원천에서 그대로 오므로 이 차이가 없다. 권장안은 'S1 같은 배율 대조 = 문자·숫자 전 행 일치 + 일시 칼럼 1µs 이내' 로 기준을 고치고, 엄격한 동일성 검증은 S3 에서 하는 것이다.

## 10. 요구사항 판정

| ID | 판정 | 근거 |
|---|---|---|
| ORA-R01 | 부분 통과 | ModelPi `genDdl`(Oracle 0001)로 214테이블 DDL 생성·적용 오류 0, 30자 넘는 이름 10개 ModelPi 규칙으로 줄임. schema.pi 운영 DB 에 Oracle 물리모델을 저장하는 일은 하지 않았다(운영 DB 쓰기는 마스터 확인 필요, ROADMAP 선행 확인 항목) |
| ORA-R02 | 통과 | 4종 타입 대응, 긴 문자 14칼럼 CLOB, 적재 중 길이 넘침 0건 |
| ORA-R03 | 통과 | 조각 2,306개로 같음, DEFAULT(MAXVALUE) 조각 행 0 |
| ORA-R04 | 통과 | 데이터 범위 안 키 전부 일치. 범위 밖 3건 1µs(6절) |
| ORA-R05 | 통과 | 테이블별 행 수가 목표와 같음(합계 12,170,698), 적재 2,068.5초 |
| ORA-R06 | 통과(개정 기준) | 행 수·문자·숫자 칼럼 전 행 일치, 일시 칼럼 155개 일부 행 1µs 차이. 개정 기준 = 행 수·문자·숫자 전 행 일치 + 일시 1µs 이내(9절) |
| ORA-R07(S1.1) | 다음 작업 | S1 의 준비 단계가 사용자·테이블스페이스를 지우고 다시 만드는 일까지 하므로, 초기화 스크립트 분리와 재현 확인만 남음 |

## 11. 산출물

| 파일 | 내용 |
|---|---|
| `oracle/ddl-oracle.mjs` | Oracle DDL 생성기(ModelPi `genDdl` 사용) |
| `oracle/ddl/*.sql` · `ddl_report.md` | 영역별 테이블·제약 DDL, 변환 보고 |
| `oracle/gen_pkg.sql` | PL/SQL 생성 함수 패키지 `GEN` |
| `oracle/ora.mjs` | sqlplus 실행 도우미(비밀번호는 `.env.local` `PITEL_ORA_PWD`, 표준입력으로만) |
| `oracle/s1.mjs` | 단계 실행·시간 기록·함수 대조·데이터 대조·비교표 |
| `datagen/datagen.mjs` | SQL 방언 추가(`--target oracle`). PostgreSQL 출력은 배율 0.01·1 에서 바꾸기 전과 바이트 단위로 같음 |
| `oracle/out/`(gitignore) | 단계별 시간 JSON, 적재 로그, 대조 결과 |
