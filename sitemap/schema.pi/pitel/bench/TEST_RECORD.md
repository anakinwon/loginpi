# DBMS 4종 11억 행 초기 적재 실증 : 실행 기록 · 문제 해결(Troubleshoot) · 재시험 절차

> 작성 2026-11-15. 비교 방식 정본 = dbms.pi `docs/PRD.md` 11.7. 보고서 : `public/restore/compare_pos_with_Oracle_scale1.html`(결과), `public/restore/dbms_load_troubleshoot.html`(이 문서의 보고서판).
> 이 문서는 다음 재시험 때 그대로 따라 하도록 쓴다. 시각은 한국 시간(KST).

## 1. 결과 한눈에

| DBMS | 결과 | 데이터 적재 시간 | 실행 | 기록 |
|---|---|---:|---|---|
| PostgreSQL 17.12 | 완료(기준선) | 8,569초 (2시간 22분 49초) | 1회 | `database/datagen_pitel-pg.log`, `REBUILD.md` |
| Oracle 21.3 EE | 완료 | 7,120초 (1시간 58분 40초, 0.83배) | 배율 1 3회(앞 2회 중단) + 배율 0.01 1회(실패 사례) | `oracle/out/`, `oracle/S1_LOG.md` |
| MS-SQL 2022 | **테스트 불가** | 측정 못 함 | 2회 모두 중단 | `mssql/MSSQL_LOG.md`, `mssql/out/` |
| MySQL 26.10 | **테스트 불가** | 측정 못 함 | 1회 중단 | `mysql/MYSQL_LOG.md`, `mysql/out/` |

같은 조건 : 배율 1(테이블 214 · 파티션 2,306 · 1,101,170,707행), 같은 작업 단위 2,086개를 같은 순서로 동시 7개, 일반 INSERT, 준비 단계(테이블 생성 등)를 뺀 데이터 적재 시간만 비교, 측정 중 다른 DB 컨테이너 정지. 생성 규칙은 같고 계산 방식(해시 함수 등)은 엔진마다 다르다.

## 2. 실행 이력 (시간순)

| # | 일시 | DBMS | 설정 | 결과 | 경과 | 도달 | 로그 |
|---|---|---|---|---|---:|---|---|
| 1 | 11-14 08:19 ~ 10:42 | PostgreSQL | shared_buffers 2GB, max_wal_size 16GB, synchronous_commit off | 완료 | 8,569초 | 100% | `database/datagen_pitel-pg.log` |
| 2 | 11-15 09:04 ~ 10:06 | Oracle | 배율 0.01 (승인 없이 축소) | **실패 사례**(비교 무효) | 2,068.5초 | 1,217만 행 | `oracle/out/s1_*`, `oracle/S1_LOG.md` |
| 3 | 11-15 11:59 ~ 12:04 | Oracle | SGA 3GB · PGA 1GB | 중단(마스터 지시 : PGA 비율 7:3 으로 올리고 재시작) | 4분 20초 | 작업 단위 26 | `oracle/out/full_load_pga1g_stopped.log` |
| 4 | 11-15 12:07 ~ 12:23 | Oracle | SGA 3GB · PGA 1,317MB · DBWR 1 | 중단(free buffer waits, 마스터 선택 : DBWR 4 + SETALL 로 재시작) | 16분 21초 | 작업 단위 44 | `oracle/out/full_load_dbwr1_stopped.log` |
| 5 | 11-15 12:26 ~ 14:24 | Oracle | SGA 3GB · PGA 1,317MB · DBWR 4 · SETALL · redo 4GB×4 | **완료** · 214테이블 건수 일치 | 7,120초 | 100% | `oracle/out/full_load.log` |
| 6 | 11-15 15:08 ~ 16:05 | MS-SQL | 메모리 4,317MB · MAXDOP 1 | 중단(메모리 할당 대기 · 잠금 메모리 부족) | 56분 43초 | 33.1% | `mssql/out/full_load_grant_wait_stopped.log` |
| 7 | 11-15 17:00 ~ 17:56 | MS-SQL | + MAX_GRANT_PERCENT 12 · PAGLOCK | 중단(PC 메모리 부족으로 적재 프로세스 강제 종료) | 56분 6초 | 62.3% | `mssql/out/full_load_mem_reaped_stopped.log` |
| 8 | 11-15 18:18 ~ 19:47 | MySQL | 버퍼 풀 3GB · redo 16GB · 바이너리 로그 켬 | 중단(Docker Desktop 무응답) | 1시간 29분 16초 | 75.2% | `mysql/out/full_load.log` |

중단된 실행의 '실패' 건수는 멈출 때 진행 중이던 작업 단위가 끊긴 것이다(SQL 오류 아님). 예외 : 6번의 실패 4건은 MS-SQL 오류 1204 · 701.

## 3. 문제 해결 기록 (Troubleshoot)

형식 : 증상 → 원인 → 조치 → 다음에 할 일. 같은 증상을 만나면 '다음에 할 일'부터 본다.

### 3.1 진행 방식

| ID | 증상 | 원인 | 조치 | 다음에 할 일 |
|---|---|---|---|---|
| TS-01 | 11억 행 비교를 1,217만 행(배율 0.01)으로 돌려 보고 | 오래 걸릴 것으로 보고 승인 없이 규모를 줄임 | 결과를 실패 사례로 보존(상단 실패 표지), 배율 1 로 처음부터 다시 | 규모 축소는 마스터 승인 때만. 줄였으면 보고 맨 앞에 크게 밝힘 |
| TS-02 | 근거 없는 '36시간' 소요 추정을 말함 | 측정 전 추정을 사실처럼 씀 | 철회 | 숫자는 측정값만. 추정은 '추정'이라고 쓰고 확정 방법을 함께 적음 |
| TS-03 | 요청한 방식 대신 덤프 이관 등 다른 방식을 권함 | 시간 걱정으로 비교 방식을 바꾸려 함 | 같은 생성 방식으로 진행 | 생성 방식은 같게, 엔진 특성에 맞춘 계산 방식만 다르게. 덤프·복사 이관은 비교가 아님 |
| TS-04 | '조각'이라는 말이 두 뜻으로 쓰임 | 작업 단위와 파티션을 같은 말로 부름 | 용어 분리 | 작업 단위 = datagen 이 한 번에 넣는 단위(2,086개), 파티션 = DB 저장 단위(2,306개) |

### 3.2 Oracle 21c

| ID | 증상 | 원인 | 조치 | 다음에 할 일 |
|---|---|---|---|---|
| TS-05 | `ORA-02236: invalid file name`(테이블스페이스 생성) | 이미지에 OMF(`db_create_file_dest`) 미설정 | 데이터 파일 경로를 PDB `USERS` 파일과 같은 폴더로 지정 | `oracle/s1.mjs setup` 이 처리 |
| TS-06 | PL/SQL 생성 함수로 적재하니 PostgreSQL 의 14~36배 느림, NATIVE 컴파일은 `ORA-00600 [pesldl03_MMap]` | 컨테이너가 실행 가능 메모리 매핑을 막아 해석 실행만 가능, 함수 호출 비용 | gen.* 를 Oracle 내장 함수 식으로 펼침(`oracle/inline.mjs`) | 엔진마다 생성식은 '질의 안에 펼쳐지는' 형태로 만든다 |
| TS-07 | `ORA-01847`(PK · 인덱스 단계) | 부분 인덱스 조건의 일시 문자열이 세션 NLS 형식으로 변환됨 | 생성기가 `TIMESTAMP '…'` 리터럴로 바꿈 | `oracle/ddl-oracle.mjs` 가 처리 |
| TS-08 | 대조 SQL 이 `SP2-0027` 로 실행 안 됨 | sqlplus 한 줄 상한 2,499자 | 문자열 상수 밖 공백에서 줄 나눔(`wrapLines`) | 긴 생성 SQL 은 줄을 나눠 보낸다 |
| TS-09 | `ORA-01940`(사용자 삭제 불가) | DBeaver 등 다른 세션이 접속 중 | 마스터 지시('강제로')로 계정 잠금 → 세션 종료 → 삭제 | 초기화 전 외부 도구 접속을 끊는다 |
| TS-10 | `ORA-56747`(PDB 에서 PGA 변경 거부) | PGA 는 PDB 단위로 이 값 변경 불가 | CDB 루트에서 `pga_aggregate_target` 설정 | 메모리 설정은 CDB 루트에서 |
| TS-11 | 적재가 `free buffer waits` 로 막힘(실행 4번) | DBWR 1개, 비동기 I/O 꺼짐(filesystemio_options) | 마스터 선택 : db_writer_processes 4 · filesystemio_options SETALL, SHUTDOWN ABORT · STARTUP 뒤 처음부터 | Oracle 시험 전 DBWR · 비동기 I/O 를 먼저 맞춘다 |
| TS-12 | 함수 대조 `ORA-01405` · `ORA-06502` | 해시 함수에 NULL 입력, SIMPLE_INTEGER OUT 인자 | NULL 을 CASE 로 거름, IN OUT 으로 | S1 대조 도구 한정 |

### 3.3 MS-SQL 2022

| ID | 증상 | 원인 | 조치 | 다음에 할 일 |
|---|---|---|---|---|
| TS-13 | `Incorrect syntax near '\|'` | T-SQL 에 `\|\|` 연결 연산자 없음 | 칼럼 식마다 CONCAT 으로 변환(`mssql/inline.mjs concatFix`) | 방언마다 문자열 연결 방식을 먼저 시험 |
| TS-14 | `Msg 7705`(파티션 경계값 형 변환 오류, 175번째) | sqlcmd 가 약 4,000자 넘는 줄을 잘라 값이 깨짐 | 경계값 한 줄에 하나, 적재 SQL 은 1,000자 단위로 줄 나눔 | 긴 SQL 은 줄을 나눠 보낸다 |
| TS-15 | `Msg 2628`(문자열 잘림, CHAR(2) 칼럼 6개) | UTF-8 정렬의 char(n) 은 바이트 수, 한글 2자 = 6바이트 | 마스터 선택 : CHAR(n) → nchar(n) | 타입 대응표 : VARCHAR(n) → varchar(n×3), CHAR(n) → nchar(n) |
| TS-16 | master DB 에서 한글이 `???` | master 정렬이 UTF-8 아님 | pitel DB 를 Korean_100_CI_AS_SC_UTF8 로 생성 | 시험 DB 는 UTF-8 정렬로 |
| TS-17 | 세션 7개 중 6개가 `RESOURCE_SEMAPHORE` 대기(최대 716초), 사실상 동시 1개(실행 6번) | 파티션 INSERT 정렬용 메모리를 크게 요청, varchar(n×3) 선언으로 행 크기 추정이 커짐 | 마스터 선택 : `OPTION (MAX_GRANT_PERCENT = 12)` 후 처음부터 | `sys.dm_exec_requests` 대기 종류를 첫 10분에 확인 |
| TS-18 | `Msg 1204`(잠금 메모리 부족) · `Msg 701`(메모리 부족) | 같은 테이블 동시 적재라 잠금 상향이 막혀 행 잠금 수백만 개가 메모리에 쌓임 | `INSERT … WITH (PAGLOCK)` | 대량 동시 적재는 잠금 단위를 먼저 정한다 |
| TS-19 | 적재 프로세스가 56분에 강제 종료(실행 7번) | PC 여유 메모리 부족(16,057MB 중 3,372MB)으로 Claude Code 가 백그라운드 작업을 자동 종료 | 기록 후 마스터 지시로 초기화 | 적재는 `bench/launch.mjs` 를 Windows WMI 독립 프로세스로 띄운다(5절) |

### 3.4 MySQL 26.10

| ID | 증상 | 원인 | 조치 | 다음에 할 일 |
|---|---|---|---|---|
| TS-20 | 해시 값이 MS-SQL 과 다르게 나올 위험 | MySQL `^`(XOR)가 곱셈보다 먼저 계산됨 | 해시 식에 괄호를 모두 적음(`mysql/inline.mjs`). 결과가 MS-SQL 과 같은 값임을 확인 | 연산자 우선순위를 방언마다 확인 |
| TS-21 | `\|\|` 가 논리 OR 로 동작 | MySQL 기본 sql_mode | 세션마다 `PIPES_AS_CONCAT`(`mysql/my.mjs`) | 같음 |
| TS-22 | CONCAT 결과가 NULL 이 될 위험(회사명 접미어 없음) | MySQL CONCAT 은 NULL 이 섞이면 NULL | 빈 접미어를 NULL 대신 '' 로 | 같음 |
| TS-23 | 테이블 이름 대소문자 | Linux MySQL 은 테이블 이름 대소문자 구분, datagen 은 소문자로 넣음 | DDL 을 소문자로 생성 | `mysql/setup.mjs` 가 처리 |
| TS-24 | 89분에 진행 멈춤, `docker exec` 가 엔진 API 500, `docker ps` 30초 무응답(실행 8번) | Docker Desktop 무응답. WSL 메모리 사용이 586MB 로 줄어 있었음(정상이면 3GB 이상) | 마스터 지시로 적재 종료, 테스트 불가 기록. Docker 재시작 · DB 정리 안 함 | 재시험 전 WSL · Docker 메모리 한도 점검(6절) |

### 3.5 실행 환경 · 도구

| ID | 증상 | 원인 | 조치 | 다음에 할 일 |
|---|---|---|---|---|
| TS-25 | 끝났는데 진행 보고가 99.9% | 끝 시각(`exit` 줄)이 초 단위라 마지막 완료(밀리초)가 빠짐 | 끝났으면 전부 집계(`bench/progress.mjs`) | 수정됨 |
| TS-26 | 분석용 plan.json 이 다른 방언 SQL 로 바뀜 | `datagen plan --target mssql/mysql` 이 같은 파일을 덮어씀 | 점검 뒤 `plan --scale 1` 로 PostgreSQL plan 을 다시 만들고 바이트 대조 | 방언 plan 은 복사본으로 쓰고 끝나면 PostgreSQL plan 복원 |
| TS-27 | `docker exec … /opt/…` 경로가 `C:/Program Files/…` 로 바뀜 | Git Bash 경로 자동 변환 | `MSYS_NO_PATHCONV=1` | Git Bash 에서 컨테이너 경로를 쓸 때 항상 |
| TS-28 | 한글 이름 일부가 깨져 보임 | 실행기가 출력 조각 경계에서 UTF-8 글자를 갈라 읽음 | 표준출력 `setEncoding('utf8')` | 실행 도우미 3종(ora · ms · my)에 적용됨 |
| TS-29 | 시간대별 표 일부 크기 '기록 없음' | 진행 감시(30분 만료)를 다시 거는 사이 크기 측정이 빠짐 | 다음 기록부터 이어짐 | 완료율 · 건수는 로그에서 다시 계산되어 빠지지 않는다 |
| TS-30 | S1 중 `pitel-pg` 가 정지(종료 코드 137) | 외부 정지 요청(주체 확인 못 함) | `docker start`, 데이터 보존 확인 | 시험 중 다른 도구가 컨테이너를 건드리지 않게 한다 |
| TS-31 | 실증 뒤 C 드라이브 여유 8GB(952GB 중), DB 를 지워도 늘지 않음 | Docker 데이터 디스크 `docker_data.vhdx` 가 864GB 로 커짐. 이 파일은 안에서 지운 공간을 Windows 에 돌려주지 않는 형식(희소 파일 아님). MySQL 적재 중 디스크가 차서 Docker 가 멈춘 것으로 본다(TS-24) | MySQL · MS-SQL pitel 흔적 삭제(MySQL 은 데이터 볼륨 재초기화), fstrim 으로 디스크 안 사용량 763GB → 501GB. 파일 압축은 관리자 권한 `Optimize-VHD` 필요 | 시험 전 Docker Desktop 디스크 크기 한도를 정하고, 끝나면 `wsl --shutdown` 뒤 관리자 PowerShell `Optimize-VHD -Path <vhdx> -Mode Full` |
| TS-32 | 2026-11-15 마스터가 Docker Desktop 을 삭제, PostgreSQL · Oracle 데이터 소멸 | 디스크 확보를 위해 Docker 전체 삭제(vhdx 864GB 포함), 남은 폴더(`%LOCALAPPDATA%\Docker` · `%APPDATA%\Docker` · `.docker`)도 지움 | C 드라이브 여유 9GB → 876GB. `C:\ProgramData\DockerDesktop` 빈 폴더만 남음(관리자 권한) | 재시험은 Docker 재설치 → PostgreSQL `REBUILD.md`(약 3시간 30분) · Oracle 재적재부터. 실행 기록은 `bench/runs/`(git) 에 보관됨 |

## 4. DBMS 별 설정 대응표 (다음 시험의 출발점)

| 항목 | PostgreSQL 17 | Oracle 21c | MS-SQL 2022 | MySQL 26.10 |
|---|---|---|---|---|
| 메모리 | shared_buffers 2GB · work_mem 64MB | SGA 3GB(버퍼 캐시 2,336MB) · PGA 1,317MB | max server memory 4,317MB | innodb_buffer_pool_size 3,072MB |
| 로그 | max_wal_size 16GB · synchronous_commit off · full_page_writes on | redo 4GB × 4 | 로그 16GB · SIMPLE | redo 16GB · 바이너리 로그 켬 |
| 쓰기 | 기본 | DBWR 4 · SETALL | 기본 | doublewrite 켬 |
| VARCHAR(n) | 그대로 | VARCHAR2(n) · CHAR 의미(n > 1,333 은 CLOB) | varchar(n×3) UTF-8(n×3 > 8,000 은 max) | VARCHAR(n) utf8mb4 |
| CHAR(n) | 그대로 | CHAR(n) | nchar(n) | CHAR(n) |
| 키 생성 | generate_series | CONNECT BY 10만 × 묶음 | GENERATE_SERIES | 숫자표 pitel_seq 10만 × 묶음 |
| 생성식 | SQL 함수(가중 선택만 plpgsql) | 내장 식 인라인 | 내장 식 인라인 · CONCAT | 내장 식 인라인 · PIPES_AS_CONCAT |
| 특이 힌트 | 없음 | 없음 | MAXDOP 1 · MAX_GRANT_PERCENT 12 · PAGLOCK | 없음 |
| 준비 도구 | `database/` | `oracle/s1.mjs` | `mssql/setup.mjs` | `mysql/setup.mjs` |

## 5. 재시험 절차 (그대로 따라 한다)

```bash
cd sitemap/schema.pi/pitel
# 0) 다른 DB 컨테이너 정지 : 측정할 컨테이너만 켠다
docker ps --format '{{.Names}} {{.Status}}'
# 1) 준비(DB 재생성 · 테이블 · 파티션) : 시간 비교 대상 아님
node mssql/setup.mjs --yes        # 또는 node mysql/setup.mjs --yes · node oracle/s1.mjs setup tables --target oracle
# 2) 기능 점검 : 테이블마다 키 2,000개. 점검 뒤 1) 을 다시 실행해 비운다
node datagen/datagen.mjs plan --scale 1 --target mssql && cp datagen/out/plan.json /tmp/plan_ms.json
node mssql/smoke.mjs /tmp/plan_ms.json
node datagen/datagen.mjs plan --scale 1   # PostgreSQL plan 복원(TS-26)
# 3) 진행 상태 파일이 남아 있으면 지운다(남으면 완료로 건너뜀)
ls datagen/state/
# 4) 적재 : 로그 첫 줄에 설정을 적고, Windows 독립 프로세스로 띄운다(TS-19)
echo "시작 $(date -u +%Y-%m-%dT%H:%M:%SZ) <설정 요약>" > mssql/out/full_load.log
#    PowerShell : Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '"<node 경로>" bench\launch.mjs mssql/out/full_load.log run --target mssql --scale 1 --jobs 7'; CurrentDirectory = '<pitel 경로>' }
# 5) 5분마다 진행 보고(주제영역별 · 10분 시간대별 두 표)
node bench/progress.mjs --target mssql --log mssql/out/full_load.log
# 6) 끝나면 : 로그 '끝 · 성공 N · 실패 0 · 초' 와 'exit 0' 확인 → 테이블별 COUNT(*) 대조 → 분석 · 보고서
node bench/analyze.mjs --log mssql/out/full_load.log > mssql/out/full_analysis.json
```

## 6. 재시험 전 점검표

| # | 점검 | 기준 | 이번에 걸린 문제 |
|---|---|---|---|
| 1 | PC 여유 메모리 | 측정 DB 메모리 + 4GB 이상 여유 | TS-19 |
| 2 | WSL · Docker 메모리 한도(`%UserProfile%\.wslconfig` memory) | 측정 DB 메모리 + 2GB 이상, PC 전체의 70% 이하 | TS-19 · TS-24 |
| 3 | 다른 DB 컨테이너 정지 | 측정 컨테이너만 실행 | 같은 조건 |
| 4 | 디스크 여유 · Docker 디스크 한도 | 300GB 이상(데이터 약 175GB + 로그 · 임시), Docker 디스크는 DBMS 하나 시험 뒤 정리 | TS-31 |
| 5 | 적재 실행 방식 | `bench/launch.mjs` WMI 독립 프로세스 | TS-19 |
| 6 | 첫 10분 대기 종류 확인 | 대기가 한쪽(메모리 · 잠금 · 쓰기)에 몰리지 않음 | TS-11 · TS-17 · TS-18 |
| 7 | 진행 상태 파일 | `datagen/state/<db>_*` 없음 | 이어 넣기 방지 |
| 8 | 외부 도구 접속 | DBeaver 등 끊김 | TS-09 |
| 9 | 규모 | 배율 1 · 1,101,170,707행 | TS-01 |
| 10 | 생성식 동일(PostgreSQL) | `gen.wpick`(plpgsql) 을 다른 3종처럼 CASE 로 인라인 — 그대로 두면 PostgreSQL 만 함수 호출 비용을 진다(7-1절 참고 지표) | 2026-11-21 조건 차이 ① |
| 11 | 문자열 타입 동일(Oracle) | `MAX_STRING_SIZE=EXTENDED` 로 VARCHAR2(32767) 사용, CLOB 전환(n > 1,333) 없음 — CLOB 테이블 13개가 행 8.4% 로 Oracle 작업초의 35.9%(7-1절 실측 분해) | 2026-11-21 조건 차이 ② |
| 12 | 로그 설정 동일 | MySQL 바이너리 로그 · MS-SQL 복구 모델 · PostgreSQL wal_level · Oracle 메모리를 같은 수준으로 맞추고 로그 첫 줄에 기록 | 2026-11-21 조건 차이 |

## 7. 분석 사례 : 수납(INV) 영역은 왜 PostgreSQL 이 빨랐나

행당 비용 모형(테이블 133개 최소제곱, µs/행) : PostgreSQL = 고정 6.87 + 가중 선택 14.07 × 회수 + 그 밖의 함수 0.86 × 회수, Oracle = 고정 13.85 + 가중 선택 0.49 × 회수 + 그 밖의 함수 1.33 × 회수. Oracle 이 유리한 항목은 가중 선택 하나다.

| 영역 | 행당 가중 선택 | 행당 그 밖의 함수 | 시간 배수(Oracle ÷ PG) |
|---|---:|---:|---:|
| CUS | 3.41 | 17.6 | 0.65 |
| ORD | 2.29 | 21.3 | 0.64 |
| COL | 2.48 | 18.1 | 0.75 |
| PAY | 1.95 | 24.9 | 0.92 |
| INV | 1.43 | 25.5 | 1.06 |

INV 행의 57% 를 차지하는 `ptl_inv_rcv_allc_d`(5,641만 행, 가중 선택 1 · 그 밖의 함수 25, 1.33배) · `ptl_inv_rcv_m`(4,701만 행, 1 · 34, 1.35배)은 가중 선택이 적고 일반 함수가 많아 Oracle 의 큰 고정 비용과 함수 비용이 드러났다. 모형 계산(`ptl_inv_rcv_m`) : PostgreSQL ≈ 50µs, Oracle ≈ 60µs. 같은 INV 안에서도 가중 선택 3~4개 테이블은 Oracle 이 0.53~0.55배 시간에 끝냈다.

## 7-1. 새 PC 4종 실측 순위와 재측정 참고 지표 (2026-11-22, 실행 9~12 근거)

**순위 = 실측만 쓴다(확정)** : 1 MS-SQL 46분 44초 · 2 Oracle 49분 54초 · 3 MySQL 50분 15초 · 4 PostgreSQL 70분 0초. 아래 지표는 4종의 생성·저장 조건이 서로 달랐던 점을 찾은 **재측정용 참고 자료**이며 순위·결과로 인용하지 않는다(가정값으로 순위를 매기지 않는다, 마스터 지시 2026-11-22). 마스터 예상 순위(Oracle > PostgreSQL > MS-SQL > MySQL)의 검증은 6절 점검표 10~12번을 지킨 재측정 실측으로만 한다.

| 조건 차이 | 실측 분해(로그 조각 시간 합) | 추정(모형, 참고) |
|---|---|---|
| ① PostgreSQL 판만 가중 선택을 PL/pgSQL 함수 `gen.wpick` 으로 호출(다른 3종 = CASE 인라인, 호출마다 `SELECT sum(w) FROM unnest(weights)` 실행) | 영역별 PostgreSQL ÷ MS-SQL 시간이 행당 가중 선택 수가 많은 CUS(3.41개) 1.89배 · COL(2.48개) 1.96배 · ORD(2.29개) 1.79배, 적은 INV(1.43개) · PRM(1.34개) 1.40배 | 테이블 149개 회귀 : 가중 선택 9.75µs/회(다른 3종 ≈ 0), 22.99억 회 × 9.75µs ≈ PostgreSQL 작업 시간의 36%, 이 항을 넣으면 R² 0.857 → 0.930 |
| ② Oracle 판만 14개 칼럼(테이블 13개, 9,198만 행 = 8.4%)을 CLOB 로(`MAX_STRING_SIZE=STANDARD` 의 4,000바이트 한도), 생성식 `NVL(memo, TO_CLOB(…))` 가 행마다 임시 LOB 생성 | LOB 테이블 13개 작업초 Oracle 15,621 · MS-SQL 3,783 · PostgreSQL 5,266 · MySQL 3,447 = Oracle 작업 시간의 35.9%. 나머지 201개는 Oracle 27,946 · MS-SQL 38,055 · PostgreSQL 57,512 · MySQL 41,715 | 임시 LOB 가 원인이라는 판단은 이전 PC(11-15) 대기 1위 `direct path write` 1,926초에서 나온 추정. 새 PC 대기는 측정 안 함 |

- 작업초 = 작업 단위마다 '시작 ~ 완료' 시간의 합(동시 15개가 겹쳐 실제 경과 시간보다 크다). 작업초 비율을 경과 시간으로 바꾼 값은 만들지 않는다
- 다음 실측 : 점검표 10~12번 적용 뒤 4종을 같은 순서로 다시 재고, 그 실측 순위를 이 절 아래에 새 실행 번호로 남긴다. 새 PC Oracle 대기 이벤트도 함께 잰다

## 8. 산출물 위치

| 구분 | 파일 |
|---|---|
| 비교 방식 정본 | dbms.pi `docs/PRD.md` 11.6 · 11.7, `docs/ROADMAP.md` 실증 트랙 |
| 결과 보고서 | `public/restore/compare_pos_with_Oracle_scale1.html`(생성기 `bench/report-oracle.mjs`) |
| 실패 사례 보고서 | `public/restore/compare_pos_with_Oracle.html`(배율 0.01) |
| 문제 해결 보고서 | `public/restore/dbms_load_troubleshoot.html`(생성기 `bench/report-troubleshoot.mjs`) |
| 측정 도구 | `bench/progress.mjs` · `bench/analyze.mjs` · `bench/launch.mjs` |
| DBMS 별 | `oracle/`(S1_LOG.md · inline.mjs · ora.mjs · s1.mjs) · `mssql/`(MSSQL_LOG.md · setup · smoke · inline · ms) · `mysql/`(MYSQL_LOG.md · setup · smoke · inline · my) |
| 실행 로그(보관본) | `bench/runs/` : 2절 실행 번호를 붙인 사본(1 PostgreSQL · 3~5 Oracle · 6~7 MS-SQL · 8 MySQL, Oracle 대기 이벤트 · 건수 대조 · 분석 JSON 포함). 2번(배율 0.01 실패 사례)은 `2_oracle_scale001_*`, 설명은 `oracle/S1_LOG.md` |
| 실행 로그(원본) | `oracle/out/` · `mssql/out/` · `mysql/out/` · `database/*.log`(git 제외, 이 PC 에만 있음) |
