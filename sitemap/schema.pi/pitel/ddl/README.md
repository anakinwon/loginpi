# Pi통신 과금 DDL — 실행 방법·순서

> 대상 : PostgreSQL 17 (로컬 Docker `pitel-pg`, 포트 55432) · 적재 대상 DB `pitel`(public) · 검증 DB `pitel_dev`
> 정본 순서 : `00_run_order.txt` · 결정 근거 : `../CONTEXT.md` D6(FK 제약 없음)·D7(시스템 칼럼 4개는 DDL 끝)·D14(적재 순서)

## 1. 파일 구성

| 파일 | 내용 |
|---|---|
| `<NN>_<area>_tables.sql` | CREATE TABLE(+RANGE 파티션 하위) — PK·인덱스 없음, `IF NOT EXISTS` 로 재실행 안전 |
| `<NN>_<area>_constraints.sql` | PK(`pk_<테이블>`)·인덱스(`x_<테이블>_NN`) — 데이터 적재 **뒤** 실행, 재실행 안전 |

주제영역 순서 : 10 PRD 상품 → 20 CUS 고객 → 30 ORD 가입 → 40 PAY 청구 → 50 INV 수납 → 60 COL 미납 → 70 PRM 파트너.
파일은 스키마 이름을 쓰지 않는다 — 실행 전 `SET search_path` 로 대상 스키마를 정한다. FK 제약은 어떤 파일에도 없다(설계 = `model/physical/*.json` `fks`).

## 2. 실행 순서 (D14)

1. 테이블 7개 파일(10~70) → 2. 데이터 적재(datagen) → 3. 제약 7개 파일(10~70) → 4. `ANALYZE`

```bash
cd sitemap/schema.pi/pitel/ddl
# 1단계 : 테이블
for f in $(grep -v '^#' 00_run_order.txt | grep _tables); do
  ( echo "SET search_path TO public;"; cat $f ) | docker exec -i pitel-pg psql -U postgres -d pitel -q -v ON_ERROR_STOP=1 || break
done
# 2단계 : 데이터 적재 (datagen 워크플로)
# 3단계 : PK·인덱스
for f in $(grep -v '^#' 00_run_order.txt | grep _constraints); do
  ( echo "SET search_path TO public;"; cat $f ) | docker exec -i pitel-pg psql -U postgres -d pitel -q -v ON_ERROR_STOP=1 || break
done
docker exec pitel-pg psql -U postgres -d pitel -c "ANALYZE;"
```

검증만 할 때는 `pitel_dev` 에 `chk_<이름>` 스키마를 만들어 `search_path` 를 그 스키마로 두고 같은 순서로 돌린다.

## 3. 주의

- **삭제는 테이블별로** : 파티션 하위가 2,306개라 `DROP SCHEMA … CASCADE` 한 번은 `max_locks_per_transaction` 초과로 실패한다. 상위 테이블마다 `DROP TABLE … CASCADE` 를 따로(자동 커밋) 실행한다.
- 파티션 범위 = 2010-01 부터(일부 테이블은 2027년 말까지 여유), 상위 38개 모두 DEFAULT 파티션이 있어 범위 밖 일자도 적재 오류 없이 DEFAULT 로 들어간다 — 적재 뒤 DEFAULT 건수를 확인할 것.
- 제약 파일은 대량 적재 전에 돌리지 않는다(인덱스 유지 비용).
