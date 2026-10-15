# 품질 게이트 재현 스크립트 (quality, 2026-10-10)

DDL 초안을 PGlite(PostgreSQL 16 WASM)에 `000_baseline → 001 → 02_modeler_ddl` 순서로 적용하고 업무 규칙을 단언으로 검증한다. 원본은 잡 임시 디렉토리에 있었고, 회귀 검사용으로 여기에 보존했다.

| 파일 | 기대값 기준 | 내용 |
|---|---|---|
| `gate_r1.mjs` | 03_quality_gate_r1 (수정 전) | Q-P2-3 중복 신규 주문·Q-P3-2 GRACE_DAY 누락·Q-P3-3 501자 사유 결함 **재현** |
| `gate_r2.mjs` | 03_quality_gate_r2 (수정 후, 22/22, 구 컬럼명 `id`·`role`) | 위 결함이 거절·예외로 바뀌었는지와 기존 단언 회귀 확인 |
| `gate.mjs` | 03_quality_gate_r3 (`sys_user` 7컬럼 개명본) | `node gate.mjs <repo_root> new\|rename` — new 31·rename 33 단언. 000·001은 메모리 치환(new) 또는 최종 문서 §10-2 델타(rename)로 적용, 실제 파일 무수정 |
| `scan_all.mjs` | r3 | 전 객체 컬럼을 출처(000/001/02)별로 세고 단일 토큰·도메인 미종결·함수 인자를 보고. `node scan_all.mjs <repo_root> [02경로] [000사본] [001사본]` |
| `compare_r3.mjs` + `rename_prelude.sql` | r3 | 델타 = 독립 프렐류드, 신규 DB 경로 vs 기적용 DB 경로, 델타 멱등을 스키마 전체 비교 |

**실행 (저장소 밖 임시 폴더 권장 — 저장소에 의존성 추가 금지):**

```bash
mkdir pg-gate && cd pg-gate && npm i @electric-sql/pglite
cp <이 폴더>/gate.mjs . && node gate.mjs
```

스크립트 안의 SQL 파일 경로가 실행 위치와 맞는지 먼저 확인할 것. 한계: PGlite 는 단일 연결이라 동시 트랜잭션(2세션 동시 approve, R2-1)은 검증하지 못한다 — 운영 적용 전 Supabase 에서 별도 테스트.
