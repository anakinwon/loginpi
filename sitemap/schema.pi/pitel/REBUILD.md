# pitel 샘플 DB 원클릭 재구축 매뉴얼

> 대상 : 마스터 · 작성 2026-11-12 · 스크립트 `sitemap/schema.pi/pitel/rebuild.mjs`
> PC 포맷 뒤 지난 주말(2026-11-07~08)에 만든 pitel DB 를 명령 하나로 똑같이 다시 만드는 방법.

## 1. 무엇을 만드나

- 내 PC 의 Docker 에 PostgreSQL 17 컨테이너 `pitel-pg`(포트 55432)를 만들고, DB `pitel` 에 Pi통신 과금 테이블 214개(파티션 하위 2,306개)를 만든다.
- 생성기로 테스트 데이터 약 **11억 행**(1,101,170,707행)을 넣고 PK·인덱스 532개를 만든 뒤 ANALYZE·검증까지 한다.
- 데이터는 난수 대신 해시 공식으로 만들어서 **다시 만들어도 값·건수가 지난 주말과 같다**(`docs/06_datagen.md` 4.1절 '결정적 키 공식' 109행). 행이 저장된 물리 순서와 통계 수치만 조금 다를 수 있다.

## 2. 준비물

| 준비물 | 받는 곳 | 확인 명령(이 표의 명령만 PowerShell·Git Bash 둘 다 됨) | 기대 결과 |
|---|---|---|---|
| Docker Desktop(WSL2 엔진) | <https://www.docker.com/products/docker-desktop/> | `docker version --format '{{.Server.Version}}'` | 버전 숫자(이 PC 29.9.3 — 2026-11-12 `docker version` 실행). 오류면 Docker Desktop 을 켜고 고래 아이콘이 멈출 때까지 기다림 |
| Git | <https://git-scm.com/download/win> | `git --version` | 버전 숫자 |
| Node.js 22 이상(LTS) | <https://nodejs.org/ko/download> | `node -v` | `v22.x` 이상(이 PC v24.15.0 — 2026-11-12 `node -v` 실행) |
| pnpm 11(메타 적재 때만 필요) | Node 에 들어 있는 corepack 으로 켬 : `corepack enable` | `pnpm -v` | `11.x` |
| 디스크 여유 | — | `node rebuild.mjs plan` 의 '디스크' 줄 | 배율 1 = **C: 여유 약 331GB 이상** |

- 링크 확인일 2026-11-12.
- psql 은 설치하지 않아도 된다. 모든 명령이 컨테이너 안의 psql(`docker exec`)을 쓴다.
- Docker Desktop 첫 실행 때 WSL2 설치를 물으면 설치하고 PC 를 다시 켠다.
- CPU·메모리 : WSL2 엔진에서는 Docker Desktop 설정 > Resources 에 CPU·메모리 조절 칸이 없고 `%UserProfile%\.wslconfig` 로 정한다(`[wsl2]` 아래 `processors=8` · `memory=8GB`, 적용은 PowerShell `wsl --shutdown` 뒤 Docker Desktop 재시작). 출처 : <https://docs.docker.com/desktop/settings-and-maintenance/settings/> · <https://learn.microsoft.com/windows/wsl/wsl-config> (확인일 2026-11-12)
- 이 PC 는 `.wslconfig` 없이 기본값으로 `docker info` = **8 CPU · 메모리 8.16GB(7.6GiB)** 이다(2026-11-12 실행). 새 PC 도 `docker info --format '{{.NCPU}} {{.MemTotal}}'` 가 이 근처면 지난 주말과 같은 조건이다. 생성기 동시 수(`--jobs`)는 CPU − 1 로 자동으로 정해진다.

## 3. 포맷 뒤 새 PC 에서 하는 순서

**이 문서의 3절부터 나오는 명령은 전부 Git Bash 에서 실행한다**(`rm -f`·`<<'SQL'` 등은 PowerShell 에서 동작하지 않는다).

**⓪ 포맷 전(지금 PC 에서) — 반드시 먼저** : `rebuild.mjs`·`REBUILD.md`·`datagen/datagen.mjs`·`datagen/verify.mjs` 수정분이 커밋되어 원격에 올라갔는지 확인한다. 올라가지 않았으면 새 PC 에서 받은 저장소에 `rebuild.mjs` 가 없어 이 문서 전체를 실행할 수 없다.

```bash
git status --short sitemap/schema.pi/pitel   # 아무것도 안 나와야 함(커밋 완료)
git fetch && git log origin/master..HEAD --oneline   # 아무것도 안 나와야 함(푸시 완료)
```

- 푸시는 push-guard 훅 때문에 Claude 가 할 수 없다. 마스터가 직접 `! git push` 로 올린다(아직 안 올린 커밋 예 : 2026-11-12 기준 `8af158ac` 1건).

```bash
# ① 저장소 받기(새 PC, Git Bash)
git clone https://github.com/anakinwon/loginpi.git
cd loginpi/sitemap/schema.pi/pitel

# ② 계획만 보기 — 아무것도 바꾸지 않고 사전점검·예상 소요·디스크를 출력
node rebuild.mjs plan

# ③ 원클릭 재구축(약 7시간 40분, 창을 닫지 말 것)
node rebuild.mjs
```

- `.env.local`(DB 접속 주소)은 저장소에 없다. ③ 이 무작위 비밀번호로 새로 만든다. 예전 비밀번호를 찾을 필요가 없다.
- 실행 중에는 Windows 절전에 들어가지 않는다. 스크립트가 끝나면 원래대로 돌아오고, 전원 설정 자체는 바꾸지 않는다.
- 끝나면 마지막에 '재구축 끝 — 단계별 소요' 표가 나온다. 결과 확인은 9절을 본다.
- ⓪ 커밋·푸시만 확인하면 그 밖에 백업할 것은 없다. 지난 주말 실측 수치(5절)는 이 문서에 옮겨 두었다. 원본 로그(`database/*.log`)는 gitignore 대상이라 포맷하면 사라진다.

## 4. 명령과 옵션

| 명령 | 하는 일 |
|---|---|
| `node rebuild.mjs plan` | 계획·사전점검·예상 소요·디스크만 출력(컨테이너·DB 를 바꾸지 않음) |
| `node rebuild.mjs` | 실행. 중간에 끊겼으면 끊긴 단계부터 이어서 |
| `node rebuild.mjs --from <단계>` | 그 단계부터 다시 |
| `node rebuild.mjs --reset --yes` | 초기화 : 컨테이너·볼륨·진행 기록을 지우고 처음부터 다시. **볼륨 데이터 영구 삭제, 되돌릴 수 없음, 다시 만들려면 약 7시간 40분** |
| `node rebuild.mjs --help` / `--selftest` | 도움말 / 스크립트 자체 점검 |

| 옵션 | 기본값(= 지난 주말) | 설명 |
|---|---|---|
| `--scale N` | `1`(약 11억 행) | 데이터 배율. 시험할 때는 `0.001`(약 227만 행) |
| `--jobs N` | Docker CPU − 1(지난 주말 7) | 데이터 생성 동시 세션 수 |
| `--verify-conc N` | `1` | 검증 동시 쿼리 수. `3` 은 `--shm 1g` 에서 공유 메모리 부족으로 실패한 이력이 있다(10절) |
| `--name` | `pitel-pg` | 컨테이너 이름 |
| `--port` | `55432` | PC 쪽 포트 |
| `--volume` | `pitel-pgdata` | 데이터 볼륨 |
| `--image` | `postgres:17` | 이미지 |
| `--shm` | `1g` | 컨테이너 공유 메모리(`/dev/shm`) |
| `--pg k=v,k=v` | 아래 15개 | postgres 설정을 덮어쓰거나 추가. 예 `--pg max_locks_per_transaction=256` |

기본 postgres 설정 15개(지난 주말 `docker inspect pitel-pg` 와 같음) : `shared_buffers=2GB` · `maintenance_work_mem=1GB` · `work_mem=64MB` · `max_wal_size=16GB` · `checkpoint_timeout=30min` · `wal_level=logical` · `max_replication_slots=10` · `max_wal_senders=10` · `synchronous_commit=off` · `max_parallel_workers_per_gather=4` · `max_worker_processes=16` · `effective_cache_size=4GB` · `random_page_cost=1.1` · `shared_preload_libraries=pg_stat_statements` · `track_io_timing=on`.

단계 이름(`--from` 에 씀) :

| # | 단계 | 내용 | 다시 해도 안전한가 |
|---|---|---|---|
| 1 | `container` | 컨테이너가 없으면 만들고, 있으면 그대로 쓴다. 준비될 때까지 기다림. 실행할 때마다 먼저 확인 | 안전 |
| 2 | `db` | DB `pitel`·`pitel_dev` 생성, `pg_stat_statements` 확장 | 안전(있으면 건너뜀) |
| 3 | `ddl` | gen 함수 21개 + 테이블 214개(PK·인덱스 없음) | 안전(IF NOT EXISTS) |
| 4 | `data` | 생성기(`datagen/datagen.mjs`)로 적재. 적재하는 동안 autovacuum 을 끔 | 이어서 실행 : 끝난 조각은 건너뛰고, 끊겼던 표는 건수를 대조해 중복이면 비우고 다시 넣음 |
| 5 | `constraints` | PK 214 + 보조 인덱스 318 = 532(`ddl/*_constraints.sql`, 큰 영역부터 동시 3) | 안전(이미 있으면 건너뜀) |
| 6 | `analyze` | 전체 ANALYZE, autovacuum 원래대로 | 안전 |
| 7 | `verify` | FK 434건 고아 비율 + 편향 지표 3건(`datagen/verify.mjs`) | 실패 뒤 다시 하면 남은 건만, 그 밖에는 처음부터 |
| 8 | `summary` | 테이블·행·인덱스·DEFAULT 파티션을 집계하고 기준과 대조 | 안전(읽기만) |

## 5. 소요 시간·디스크(지난 주말 배율 1 실측)

| 단계 | 실측 | 근거 |
|---|---|---|
| 데이터 적재 | **4시간 43분**(17,015초, 2,086 조각, 동시 7, 실패 0) | datagen.log 끝줄, 2026-11-07 21:37 → 11-08 02:21 |
| PK·인덱스 | **1시간 15분**(청구 1시간 15분 · 수납 57분 · 가입 32분 · 미납 26분 · 파트너 10분 · 고객 8분 · 상품 22초) | run-init.log |
| ANALYZE | **13분** | run-init.log |
| 검증 | 실제로 걸린 시간 **약 1시간 23분**(동시 3, 1시간 15분 + 남은 10건을 동시 1 로 8분) | reviews/09 3.1절 |
| 합계 | **약 7시간 40분** | 처음부터 동시 1 로 하는 검증은 실측이 없다 <span style="color:red">[확인중 : 배율 1 동시 1 검증 실측]</span> |

| 디스크 | 값 |
|---|---|
| 적재 직후 DB | 175GB |
| PK·인덱스·ANALYZE 뒤 DB | **274.6GB**(10진, run-init.log) = `pg_size_pretty` 표시 256GB(2진 GiB) — 같은 크기. 2026-11-12 `pg_database_size('pitel')` = 274,551,805,619바이트 |
| 필요 여유(스크립트 판정) | DB 275GB × 배율 + WAL 16GB + 예비 40GB = **배율 1 에서 약 331GB** |
| Docker 디스크 파일 | `%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx`. 데이터를 지워도 **저절로 줄지 않는다**(지난 주말 220GB → 410GB) |

## 6. 초기화와 이어서 하기

- **처음부터 다시(초기화)** : `node rebuild.mjs --reset --yes` — **볼륨 데이터 영구 삭제, 되돌릴 수 없음, 다시 만들려면 약 7시간 40분**
  - 지우는 대상(컨테이너 이름·볼륨·진행 기록 파일)을 먼저 화면에 출력하고 실행한다.
  - `--yes` 가 없으면 대상만 출력하고 아무것도 지우지 않은 채 멈춘다.
  - `.env.local` 은 지우지 않으며, 새 컨테이너도 그 파일의 비밀번호를 그대로 쓴다.
- **지우기만** 하고 다시 만들지 않으려면(예 : 디스크 확보) — `docker volume rm` 은 **볼륨 데이터 영구 삭제, 되돌릴 수 없음, 다시 만들려면 약 7시간 40분** :
  ```bash
  docker rm -f pitel-pg
  docker volume rm pitel-pgdata
  ```
- **이어서 하기** : 창이 닫혔거나 오류로 멈췄으면 원인을 해결하고 같은 명령(`node rebuild.mjs`)을 다시 실행한다. 끝난 단계는 건너뛴다. 멈출 때 화면에 '다시 : …' 줄로 다시 칠 명령이 나온다.
- **특정 단계부터** : 예 `node rebuild.mjs --from verify`(검증만 다시), `--from constraints`(인덱스부터 다시).
- **컨테이너·볼륨이 없어졌을 때** : 진행 기록이 남아 있어도(전부 완료 포함) 빈 DB 로 보고 `db` 단계부터 다시 한다. 이때 `--from` 은 무시된다.
- **이미 데이터가 있는 DB 보호** : 이 스크립트의 진행 기록 없이 데이터가 들어 있는 컨테이너(예 : 지난 주말의 `pitel-pg`)에 실행하면 사전점검의 '기존 데이터' 항목에서 멈춘다. 다시 만들려면 `--reset --yes`, 일부 단계만 하려면 `--from <단계>` 를 쓴다.
- **배율을 바꾸려면** 초기화가 필요하다. 진행 기록과 배율이 다르면 실행하지 않는다.

## 7. 작게 먼저 시험하기(배율 0.001, 약 227만 행)

지금 쓰는 `pitel-pg` 를 건드리지 않도록 이름·포트·볼륨을 바꿔서 시험한다. 예상 약 6분(plan 출력), 2026-11-12 시험 실측 367초 · DB 641 MB.

```bash
node rebuild.mjs plan --name pitel-pg-rbtest --port 55439 --volume pitel-rbtest-data --scale 0.001
node rebuild.mjs      --name pitel-pg-rbtest --port 55439 --volume pitel-rbtest-data --scale 0.001
# 끝나면 시험 자원만 지움
docker rm -f pitel-pg-rbtest
docker volume rm pitel-rbtest-data
rm -f datagen/state/rebuild_pitel-pg-rbtest.json datagen/state/pitel-pg-rbtest_* datagen/state/verify_pitel-pg-rbtest.json
rm -f database/*_pitel-pg-rbtest.log
node datagen/datagen.mjs plan --scale 1   # 시험이 덮어쓴 미리보기 파일을 본 배율로 되돌림
```

- 컨테이너 이름이 `pitel-pg` 가 아니면 생성기·검증의 진행 기록이 이름별 파일로 따로 저장된다(`datagen/state/<이름>_…`). 본 기록과 섞이지 않는다.
- 배율 0.001 에서도 테이블 214개와 인덱스 532개는 그대로다. 행 수만 줄어든다.
- `.env.local` 이 없을 때 시험이 먼저 만들면 접속 주소 포트는 시험 포트가 아니라 본 구축 기본 포트(55432)로 적힌다. 본 재구축 뒤 DBeaver 등 외부 도구가 그대로 쓸 수 있다.
- 시험 실행은 `datagen/out/plan.json`·`volume.md`(미리보기 파일, gitignore)를 그 배율 내용으로 덮어쓴다. 본 배율로 다시 보려면 `node datagen/datagen.mjs plan --scale 1` 을 실행한다.

## 8. schema.pi 운영 메타 적재 — 마스터 직접

`rebuild.mjs` 는 **로컬 pitel DB 만** 만든다. schema.pi 운영 DB 에 모델 메타(분류체계·표준·모델·ERD)를 넣는 적재기(`loader/load-schema-pi.mjs`)는 실행하지 않는다. 11억 행 데이터는 운영에 올리지 않는다.

- 절차·점검표 : [`reviews/11_phase2_approval.md` 6절](reviews/11_phase2_approval.md) · [`loader/README.md` '운영 적용 절차'](loader/README.md)
- 적재기는 저장소 루트에서 `pnpm install` 을 해야 쓸 수 있다(`sitemap/schema.pi/node_modules` 의 `postgres` 패키지 필요).
- 운영 DB 접속 주소는 환경변수 `SCHEMA_DATABASE_URL` 로만 넘긴다. 값은 화면이나 문서에 적지 않는다.

## 9. 결과 확인

`summary` 단계는 '자동 대조 = 예' 인 항목을 대조한다. 하나라도 다르면 실패로 끝난다. '아니오' 항목은 화면·로그에 값만 출력한다.

| 항목 | 기대값(배율 1) | 자동 대조 |
|---|---|---|
| 테이블(최상위) | 214 | 예 |
| 파티션 하위 | 2,306(배율과 무관) | 예 |
| PK / 보조 인덱스 / 합계 | 214 / 318 / **532**, 무효 인덱스 0 | 예 |
| DEFAULT 파티션 | 38개, **0행** | 예(0행만) |
| 추정 행 수(ANALYZE 의 reltuples) | 그 배율의 목표(`datagen plan` 합계, 배율 1 = 1,101,170,707 · 배율 0.001 = 2,270,702)와 차이 0.01% 이하. 배율 1 실측 = 1,101,169,280(2026-11-12 `pitel-pg` 읽기 전용 조회, 아래 셋째 SQL), 차이 0.00013% | 예 |
| DB 크기 | 약 275GB(`pg_size_pretty` 256GB, 배율 0.001 = 641 MB) | 아니오 |
| 검증 | FK 434건 완료, 고아 비율 목표 약 0.05% | 아니오(`verify` 단계가 미완료면 그 단계에서 실패) |
| 편향 지표 | 검증 출력은 S4·S1·S9 값 3개뿐이다(PASS/FAIL 표시 없음). 배율 0.001 실측 S4 0.596 · S1 0.459 · S9 167(2026-11-12, 3회 같음). 배율 1 기준값과 S2·S5·S6 FAIL 재현 여부는 `reviews/09_datagen_verify.md` 4절(생성기 결함 수정은 후속 과제 `reviews/11` 2절) | 아니오 |

직접 확인하려면 아래를 실행한다(읽기 전용).

```bash
docker exec -i pitel-pg psql -U postgres -d pitel -At <<'SQL'
SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p') AND NOT relispartition AND relname LIKE 'ptl\_%';
SELECT count(*) FILTER (WHERE x.indisprimary), count(*) FILTER (WHERE NOT x.indisprimary) FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid WHERE t.relnamespace='public'::regnamespace AND t.relname LIKE 'ptl\_%' AND NOT t.relispartition;
SELECT round(sum(reltuples))::bigint FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND reltuples>0;
SELECT pg_size_pretty(pg_database_size('pitel'));
SQL
```

더 자세한 점검 SQL 은 `reviews/10_constraints_apply.md` 2절에 있다.

## 10. 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| 사전점검 '[실패] Docker 엔진' | Docker Desktop 이 꺼져 있음 | Docker Desktop 을 켜고 1~2분 기다린 뒤 다시 실행 |
| 사전점검 '[실패] 포트 55432 비어 있음' | 다른 프로그램·컨테이너가 같은 포트를 씀 | `docker ps` 로 확인하고 정리하거나 `--port 55433` 처럼 다른 포트 사용 |
| 사전점검 '[실패] 디스크' | 여유 공간 부족 | 공간을 비우거나 `--scale` 을 낮춤. Docker 디스크 파일은 데이터를 지워도 저절로 줄지 않으므로, 필요하면 Docker Desktop 설정 > Resources > Advanced 에서 디스크 위치·크기를 조정. 판정은 C: 기준이며 처음 적재할 때 부족하면 실행이 멈춘다. 디스크 이미지를 다른 드라이브로 옮긴 경우의 우회 방법은 <span style="color:red">[TBD]</span> |
| 사전점검 '[실패] 기존 데이터' | 이미 구축된 DB | 다시 만들려면 `--reset --yes`, 일부만 하려면 `--from <단계>` |
| 창이 닫힘·PC 재부팅·오류로 멈춤 | — | 같은 명령을 다시 실행하면 끊긴 단계부터 이어서 한다. 데이터 단계는 끝난 조각을 건너뛰고, 끊겼던 표는 건수를 대조해 중복이면 다시 넣는다 |
| 검증에서 `could not resize shared memory segment … No space left on device` | `/dev/shm` 1GB 에 동시 쿼리가 많음(2026-11-08 사례) | 검증만 실패했으면 `node rebuild.mjs --from verify`(동시 1, 기본값)로 남은 건만 다시 — 권장. 공유 메모리 확대(`--shm 4g --verify-conc 3`)는 **처음 구축할 때만** 쓴다. 이미 적재한 뒤 `--reset --yes` 를 붙이면 **볼륨 데이터 영구 삭제, 되돌릴 수 없음, 다시 만들려면 약 7시간 40분** |
| `out of shared memory`(DROP SCHEMA 등) | 파티션 2,306개라 잠금 수가 기본 64 를 넘음 | 이 스크립트는 볼륨을 통째로 지우므로 생기지 않는다. 직접 스키마를 지울 때는 테이블별로 지우거나 `--pg max_locks_per_transaction=256` 으로 컨테이너를 만듦 |
| 중간에 그만두었더니 autovacuum 이 꺼져 있음 | 데이터 단계가 끄고 analyze 단계가 켬 | `node rebuild.mjs --from analyze` 를 실행하거나 `ALTER SYSTEM RESET autovacuum; SELECT pg_reload_conf();` |

## 11. 파일·기록 위치(전부 gitignore — 포맷하면 사라짐)

| 파일 | 내용 |
|---|---|
| `database/rebuild_<컨테이너>.log` | 단계별 시작·종료 시각, 소요, 행 수 |
| `datagen/state/rebuild_<컨테이너>.json` | 단계 진행 기록(이어서 하기 근거) |
| `database/datagen_<컨테이너>.log` | 생성기 조각별 상세 로그 |
| `datagen/state/<db>_public_<배율>.json` | 생성기가 끝낸 조각 목록(컨테이너가 `pitel-pg` 가 아니면 앞에 `<컨테이너>_`) |
| `database/verify_state.json` · `database/verify.log` | 검증 진행·로그(다른 컨테이너는 `datagen/state/verify_<컨테이너>.json` · `database/verify_<컨테이너>.log`) |
| `.env.local` | DB 접속 주소(비밀번호 포함, 커밋 금지) |

- 지난 주말 본 적재를 맡았던 `database/run-init.mjs`(분리 실행·디스크 감시)는 그대로 남아 있다. 그 실행기는 1% 시험 결과와 테이블 214개가 미리 있어야 하므로, 재구축에는 이 문서의 `rebuild.mjs` 를 쓴다.

## 12. 재구축 실측 기록(포맷 뒤 새 PC)

원본 로그 `database/rebuild_pitel-pg.log` 는 gitignore 라 포맷하면 사라지므로 단계별 소요를 여기에 옮겨 둔다. 수치는 로그의 '단계 완료' 줄에서만 옮긴다.

**1회차 — 2026-11-14 (PC 포맷 직후)**

| 조건 | 값 |
|---|---|
| 환경 | Windows 11 · WSL 3.0.5 · Docker 29.9.3 · Node v26.13.1 · `docker info` 8 CPU · 8.2GB(`.wslconfig` 없음) · PostgreSQL 17.12 |
| 동시 실행 | 다른 컨테이너 없음 — 같은 Docker 에 있던 샘플 DB 5종(oracle21c 4.1GB 등 합계 약 5.6GB)은 메모리 부족 방지로 재구축 동안 `docker stop` |
| 포트 | WSL 기동 뒤 55334~55533 이 Windows 동적 예약에 잡혀 55432 가 '사용 중'으로 판정됨 → `netsh int ipv4 add excludedportrange protocol=tcp startport=55432 numberofports=8`(관리자, winnat 정지·재시작 사이)로 고정 |
| 실행 방법 | 별도 콘솔 창(`node rebuild.mjs`, 기본 옵션) — Claude 세션과 무관하게 계속 실행 |

시험(배율 0.001, 7절 명령) : 2026-11-14 08:12:54 → 08:15:21 · **2분 27초**(plan 예상 6분) · 행 2,270,702 · 인덱스 532 · DEFAULT 0행 · DB 651 MB · 고아 0.030% — summary 자동 대조 전부 일치.

본 구축(배율 1) : 시작 2026-11-14 08:19:24

| 단계 | 새 PC 실측 | 지난 주말 실측(5절) |
|---|---|---|
| container | 3초 | — |
| db | 1초 | — |
| ddl | 3초 | — |
| data | **2시간 22분 50초** (08:19:32 → 10:42:21) | 4시간 43분 |
| constraints | **44분 24초** | 1시간 15분 |
| analyze | **8분 34초** | 13분 |
| verify | **20분 34초** | 약 1시간 23분(동시 3 + 1) |
| summary | 0초 | — |
| 합계 | **3시간 36분 30초** (08:19:24 → 11:55:54) | 약 7시간 40분 |

결과(summary·verify 자동 대조) : 테이블 214 · 파티션 하위 2,306 · 추정 행 1,101,161,856(목표 1,101,170,707 · 차이 0.0008%) · PK 214 + 보조 318 = 인덱스 532 · 무효 인덱스 0 · DEFAULT 파티션 38개 0행 · DB 264 GB · FK 434개 고아 1,036,121 / 2,682,339,017(0.039%, 1% 초과 FK 0) · S4 0.596 · S1 0.464 · S9 225,791 — 전부 기대값 일치. 지난 주말 대비 약 53% 단축(7시간 40분 → 3시간 37분).
