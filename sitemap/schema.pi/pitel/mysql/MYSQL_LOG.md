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
