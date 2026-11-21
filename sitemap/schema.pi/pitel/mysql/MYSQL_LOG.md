# MySQL 배율 1 초기 적재 실행 기록 (2026-11-15)

> 결론 : **테스트 불가**. 적재 중 Docker Desktop 이 응답을 멈춰 끊김 없는 한 번의 데이터 적재 시간을 얻지 못했다. 마스터 지시(2026-11-15 "멈추고 테스트 불가 기록")로 적재 프로그램을 종료했다. Docker 재시작·DB 정리는 하지 않았다.
> 비교 방식 정본 : dbms.pi `docs/PRD.md` 11.7. 대상 순서 Oracle(완료) → MS-SQL(테스트 불가, `../mssql/MSSQL_LOG.md`) → MySQL(이 기록).

## 1. 시험 조건

| 항목 | 값 |
|---|---|
| 제품 | MySQL 26.10 (Docker `mysql`), 컨테이너 CPU 8 |
| 규모 | 배율 1 : 테이블 214개 · 파티션 2,306개 · 1,101,170,707행 · 작업 단위 2,086개 · 동시 7개 |
| DB | `pitel`, utf8mb4 · utf8mb4_0900_ai_ci, InnoDB |
| 메모리·로그 | innodb_buffer_pool_size 3,072 MB, innodb_redo_log_capacity 16 GB, 바이너리 로그 켬 · sync_binlog 1 · innodb_flush_log_at_trx_commit 1 · doublewrite 켬(기본값) |
| 타입 | VARCHAR(n)·CHAR(n) 그대로(utf8mb4 길이 = 글자 수), NUMERIC → DECIMAL, TIMESTAMP → DATETIME(6), 행 크기 한도로 TEXT 로 바꾼 칼럼 0 |
| 생성 | `datagen.mjs run --target mysql` : gen.* 를 MySQL 내장 식으로 펼침(`mysql/inline.mjs`), `||` 는 세션 PIPES_AS_CONCAT, 키 = 숫자표 pitel_seq(0~99,999) 2단 결합, 일반 INSERT |
| 실행 | 적재 프로그램을 Windows WMI 독립 프로세스로 실행(`bench/launch.mjs`) : MS-SQL 2차 중단(도구의 메모리 부족 자동 종료) 대응 |
| 다른 DB | `pitel-pg` · `oracle21c` · `sql-server` 정지 |
| 사전 점검 | 해시 분포 10칸 ±0.6% · 시드 간 상관 0.002 이하, 테이블마다 키 2,000개 기능 점검 214개 성공(`mysql/smoke.mjs`), 점검 뒤 DB 재생성 |

## 2. 실행 경과

| 항목 | 값 |
|---|---|
| 시각 | 2026-11-15 18:18 ~ 19:47(KST) 마지막 완료, 약 89분 16초 |
| 완료 | 작업 단위 1,528 / 2,086 · 827,902,121행(75.2%) |
| 실패 | 0건 |
| 10분 단위 완료율 | 10분 9.1% · 20분 21.9% · 30분 28.5% · 40분 35.2% · 50분 46.2% · 60분 58.1% · 70분 62.6% · 80분 68.0% |
| 같은 시점 비교(참고) | 80분 : PostgreSQL 54.1% · Oracle 64.2% · MySQL 68.0% |
| 영역 진행 | COL·CUS·INV·ORD 100%, PAY 진행 중(85분 시점 39.1%), PRD·PRM 시작 전 |

## 3. 중단

| 항목 | 값 |
|---|---|
| 증상 | 진행 보고 도구의 `docker exec` 가 Docker 엔진 API 500 오류(`/containers/mysql/json`)를 받은 뒤 `docker ps` 도 30초 안에 응답 없음. 적재 로그는 19:47:46(KST) 뒤로 10분 넘게 진행 없음 |
| 관측 | Docker 를 돌리는 WSL 가상머신 메모리 사용이 586 MB 로 줄어 있었다(버퍼 풀 3 GB 를 쓰는 MySQL 이 정상 실행 중이면 나올 수 없는 값). 3306 포트 연결은 되었으나 Docker 중계 프로세스일 수 있어 MySQL 생존은 확인하지 못했다. PC 여유 메모리 7,949 MB |
| 조치 | 적재 프로그램(launch·datagen) 종료, 로그 끝에 중단 줄 기록. Docker 재시작·컨테이너·DB 정리는 하지 않음 |
| 로그 | `mysql/out/full_load.log` |

## 4. 정리

- 데이터 적재 시간을 끝까지 재지 못해 PostgreSQL(8,569초)·Oracle(7,120초)과 비교할 수 없다. 중간 완료율은 참고값이며 비교 결론에 쓰지 않는다
- MS-SQL(메모리 이상 2회)과 MySQL(Docker 무응답)이 모두 적재 중 실행 환경 문제로 끝나지 못했다. 재시험 전에 호스트 메모리(16 GB)와 Docker Desktop·WSL 메모리 한도를 먼저 점검해야 한다
- Docker 가 회복된 뒤의 MySQL `pitel` DB 상태(부분 적재 데이터)는 확인하지 않았다

---

# 새 PC 조건 1차 측정 : MySQL 배율 1 순수 데이터 생성 (2026-11-21, 완료)

> 새 PC · 새 조건으로 4종을 다시 비교한다(마스터 결정 2026-11-21). 순서 MySQL → MS-SQL → PostgreSQL → Oracle, 비교 구간 = 순수 데이터 생성 시간만(PK·인덱스·통계 제외). 위 2026-11-15 기록(이전 PC)과는 조건이 달라 직접 비교하지 않는다.

## 1. 조건

| 항목 | 값 |
|---|---|
| PC | Windows 11 · 메모리 32 GB · 논리 CPU 16 · C: 여유 764 GB |
| Docker | 29.9.3 · WSL 3.0.5 · `.wslconfig` 없음(기본값) = 16 CPU · 16.4 GB |
| 제품 | MySQL 26.10.0 (Docker `mysql`) |
| 규모 | 배율 1 : 테이블 214 · 파티션 2,306 · 1,101,170,707행 · 작업 단위 2,086 |
| 동시 | `--jobs 15` (CPU − 1) |
| 메모리·로그 | innodb_buffer_pool_size 8,192 MB(Docker 메모리 50%) · innodb_redo_log_capacity 16 GB · **바이너리 로그 끔**(마스터 선택, `/etc/mysql/conf.d/pitel.cnf` `disable-log-bin`) · doublewrite 켬 · flush_log_at_trx_commit 1 |
| 생성 | `datagen.mjs run --target mysql`, 일반 INSERT, 생성식 인라인(`mysql/inline.mjs`) |
| 실행 | `bench/launch.mjs` WMI 독립 프로세스 + 실행 중 절전 막기(이 PC AC 절전 5분) |
| 다른 DB | postgres · sql-server · oracle21c 정지 |
| 사전 점검 | 테이블마다 키 2,000개 기능 점검 214개 성공(32초), 점검 뒤 DB 재생성 |

## 2. 결과

**데이터 생성 3,016초 (50분 16초)** · 2026-11-21 10:23:43 ~ 11:13:59(KST) · 작업 단위 2,086 성공 · 실패 0 · 최종 크기(테이블스페이스) 198.3 GB

| 주제영역 | 작업 단위 | 시작(KST) | 끝(KST) | 생성 시간 | 작업 단위 소요 합 | 행 | 행/초 |
|---|---:|---:|---:|---:|---:|---:|---:|
| COL | 334 | 10:23:43 | 10:31:20 | 0:07:37 | 1:31:49 | 214,810,094 | 469,814 |
| CUS | 350 | 10:28:53 | 10:32:25 | 0:03:32 | 0:33:06 | 75,886,548 | 358,057 |
| INV | 302 | 10:31:50 | 10:41:18 | 0:09:28 | 2:17:55 | 182,206,586 | 320,673 |
| ORD | 446 | 10:41:11 | 10:49:38 | 0:08:27 | 1:55:28 | 181,680,272 | 358,412 |
| PAY | 382 | 10:48:24 | 11:12:18 | 0:23:54 | 5:38:10 | 386,093,910 | 269,170 |
| PRD | 46 | 11:10:50 | 11:11:23 | 0:00:33 | 0:01:40 | 2,931,840 | 88,741 |
| PRM | 226 | 11:11:10 | 11:13:59 | 0:02:49 | 0:34:34 | 57,561,457 | 341,206 |
| 전체 | 2,086 | 10:23:43 | 11:13:59 | 0:50:15 | 12:32:42 | 1,101,170,707 | 365,177 |

- 생성 시간 = 영역 첫 작업 단위 시작 ~ 마지막 완료. 영역끼리 겹쳐 진행되므로 합은 전체보다 크다. 비교 기준값 = 전체 줄
- 10분 누적 완료율 : 10분 28.2% · 20분 46.4% · 30분 62.1% · 40분 73.4% · 50분 98.7%
- 영역 표의 행 수 = 작업 단위 목표 행(로그 기준). 실제 건수는 3절

## 3. 검증과 생성 결함 1건

- 측정 직후 테이블별 COUNT(*) : 214개 중 **14개가 3~4행 부족(합 43행)**. 원인 : MySQL `/` 결과가 소수 4자리(`div_precision_increment`)라 키 묶음 수 `CEIL((to − from + 1) / 100000)` 가 4행 이하 작업 단위(2010년)에서 0 → 0행 INSERT(오류 아님). 다른 DBMS 키 생성식은 해당 없음
- 수정 : `datagen.mjs` MySQL 키 조건을 정수 `(to − from) DIV 100000` 으로. 빠진 2010년 작업 단위 14개만 state 에서 지우고 다시 넣음(1초, `mysql/out/fill_2010_chunks.log`) → **214개 전부 일치 · 합계 1,101,170,707**
- 측정 시간(3,016초)에는 이 보충 1초가 들어 있지 않다. 43행은 전체의 0.000004% 라 시간 비교 결론에 영향 없음

## 4. 기록 위치

| 구분 | 파일 |
|---|---|
| 실행 로그(보관본) | `bench/runs/9_mysql_newpc_20261121_complete.log` · `_report.md` · `_verify_count.log` |
| 원본(gitignore) | `mysql/out/full_load.log` · `full_load.size.jsonl` · `full_load.report.md` · `full_load_verify_count.log`(보충 전) · `fill_2010_chunks.log` |
| 진행 보고 | `node bench/progress.mjs --target mysql --log mysql/out/full_load.log`(셋째 표 = 주제영역별 생성 시간) |
