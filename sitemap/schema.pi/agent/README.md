# schema.pi DDL 로컬 에이전트

schema.pi 의 **DDL 생성 화면에서 승인된 DDL** 을 **사내망·Tibero DB** 에 실행하는 프로그램입니다. 고객 PC(또는 DB 에 접근 가능한 서버)에서 실행합니다.

- 바깥으로만 접속합니다(HTTPS 로 서버에 작업을 물어봄). **들어오는 포트를 열 필요가 없습니다.**
- 실행 전에 서버와 똑같이 검사합니다.
  - 문장 해시가 승인된 것과 같은지 확인합니다.
  - 허용된 문장 형태인지 확인합니다. CREATE TABLE, COMMENT, PK 인덱스, PK, 시퀀스만 허용하고 FK·DROP·DML 은 거부합니다.
  - JDBC URL·JNDI 이름이 규칙에 맞는지 확인합니다.
- DB 비밀번호는 서버에 저장하지 않습니다. 이 PC 의 환경변수에만 둡니다.
- **이 PC 의 `allow.hosts` 에 적은 DB 호스트로만 접속합니다.** 서버 쪽 접속 정보가 바뀌어도 다른 호스트로는 비밀번호를 보내지 않습니다(설정이 비면 JDBC URL 접속을 모두 거부).
- 외부 라이브러리 없이 Java 17 이상 표준 기능만 사용합니다. JDBC 드라이버 jar 는 고객이 준비합니다(저장소에 포함하지 않음).

## 1. 준비

| 항목 | 내용 |
|---|---|
| Java | 17 이상(JRE 로 실행, 빌드는 JDK) |
| JDBC 드라이버 | PostgreSQL `postgresql-42.x.jar` · Oracle `ojdbc11.jar` · Tibero `tibero7-jdbc.jar`(DB 공급사에서 받음) |
| 서버 설정 | DDL 생성 화면 › **DB 접속** 탭(데이터아키텍트) |

## 2. 서버에서 에이전트·접속 등록

1. **DB 접속** 탭 › 로컬 에이전트 › 이름·유효 기간을 넣고 **에이전트 발급**을 누릅니다. 토큰 `spa_…` 은 **이때 한 번만** 보입니다.
2. **＋ 접속 추가**를 누르고 실행 방법을 **로컬 에이전트**로 고릅니다. 다음을 정한 뒤 저장합니다.
   - 사용할 에이전트
   - **JDBC URL**(예 `jdbc:tibero:thin:@10.0.0.5:8629:tibero`) 또는 **JNDI 이름**
   - 사용자
3. 접속 목록의 '대상' 칸에 비밀번호 환경변수 이름이 표시됩니다(`SCHEMAPI_PWD_1A2B3C4D` 형식).

> URL 에는 사용자·비밀번호를 넣지 않습니다. 넣으면 저장이 거부됩니다. PostgreSQL 인자는 `sslmode`·`ApplicationName`·`currentSchema`·`connectTimeout` 만 허용합니다.
> JNDI 는 `java:comp/env/…` 같은 로컬 이름만 허용합니다. `ldap:`·`rmi:` 같은 원격 조회는 거부합니다.

## 3. 빌드

```bash
./build.sh            # 리눅스·맥
powershell -File build.ps1   # Windows
```

`schemapi-agent.jar` 가 만들어지고 자체 검사(서버와 판정 일치)가 함께 실행됩니다.

## 4. 실행

```bash
# 리눅스·맥
export SCHEMAPI_AGENT_TOKEN='spa_…'
export SCHEMAPI_PWD_1A2B3C4D='DB 비밀번호'
cp agent.properties.example agent.properties   # allow.hosts 에 DB 호스트를 적음
java -cp "schemapi-agent.jar:tibero7-jdbc.jar" SchemaPiAgent agent.properties
```

```powershell
# Windows(PowerShell)
$env:SCHEMAPI_AGENT_TOKEN = 'spa_…'
$env:SCHEMAPI_PWD_1A2B3C4D = 'DB 비밀번호'
java -cp "schemapi-agent.jar;tibero7-jdbc.jar" SchemaPiAgent agent.properties
```

- `--once` : 한 번만 확인하고 끝냅니다(작업 스케줄러·cron 용).
- `--selftest <sql-guard.json>` : 문장 판정이 서버와 같은지 검사합니다.
- `--version` : 버전을 보여 줍니다.

Windows 콘솔에서 한글이 깨지면 `chcp 65001` 을 실행하고 `java -Dstdout.encoding=UTF-8 …` 처럼 실행합니다.

## 5. 동작

| 화면 | 에이전트 |
|---|---|
| 접속 목록 › **연결 시험** | 다음 확인 때 접속해 `SELECT 1` 을 실행하고 결과를 보고합니다(화면이 최대 60초 기다림, 요청은 10분 유지) |
| 요청 → 다른 DA **승인** | 다음 확인 때 가져가 실행하고, 문장별 결과를 보고합니다 |
| 실패 → **에이전트로 다시 실행** | 다음 확인 때 다시 가져갑니다(Oracle·Tibero 는 이미 성공한 문장을 건너뛰고 이어서 실행) |

- **PostgreSQL** 은 한 트랜잭션으로 실행합니다. 실패하면 전부 되돌립니다(되돌림 표시).
- **Oracle·Tibero** 는 DDL 이 문장마다 커밋되므로 실패 지점에서 멈춥니다(일부 실행). 다시 실행하면 이어서 진행합니다.

## 6. 보안 참고

- 토큰은 만료가 필수입니다. 유출이 의심되면 화면에서 **폐기**합니다(즉시 무효).
- 토큰과 비밀번호를 `agent.properties` 에 평문으로 두면 시작할 때 경고가 나옵니다. 환경변수를 사용하십시오.
- 서버 주소는 https 만 허용합니다(로컬 시험용 `localhost` 제외). HTTP/1.1 로 접속합니다.
- 접속 대상은 `allow.hosts` 로 고정합니다. 호스트가 목록에 없으면 실행·시험이 실패로 보고됩니다("allow.hosts 에 없는 호스트").
- 재실행·실행은 요청자 본인 또는 데이터아키텍트만 할 수 있습니다.
- 오류 메시지는 접속 주소·사용자를 가린 뒤 200자까지만 보고합니다.

## 7. 확인 상태

| 항목 | 상태 |
|---|---|
| PostgreSQL JDBC(42.7.4) 실행·되돌림·접속 시험 | 확인 완료(로컬 PostgreSQL) |
| Oracle·Tibero JDBC 실행 | [확인중 : 실제 DB] |
| JNDI 조회(JEUS·WebLogic 등 실제 WAS) | [확인중 : 실제 WAS] |
| Tibero `PRIMARY KEY … USING INDEX` 문법 | [확인중 : 티베로 기술지원] |
