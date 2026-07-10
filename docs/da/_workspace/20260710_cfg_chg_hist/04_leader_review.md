# 04. 리더 통합 검토·확정 — sys_cfg_chg_hist (da-leader, 2026-07-10)

## 최종 판정: ✅ 확정 (sql/176·177·178)

- 품질 게이트 PASS(P1 0건) + 표준 재검증 2회차 통과 + Hook 실검증 3종 exit 0·경고 0.
- 경계면 교차 비교 4종(DDL↔백필 컬럼·헬퍼 시그니처↔RPC 호출·멱등 가드↔인덱스·원천 실컬럼↔백필 SELECT) 전량 정합.

## 확정 산출물

| 파일 | 내용 | 적용 순서 |
|---|---|---|
| `sql/176_sys_cfg_chg_hist.sql` | 표준 등재(std_dic 10·std_dom 2) + 테이블·인덱스 4·헬퍼·뷰 | 1 |
| `sql/177_cfg_chg_hist_backfill.sql` | 사전 품질점검 + 백필 2건 + 검증 V1~V5 + 롤백 | 2 |
| `sql/178_cfg_chg_dual_write.sql` | fn_switch_fee_mode·fn_toggle_open_promo 이중기록 전환 | 3 |
| Hook·정본·스킬 동기화 | DOMAIN_SUFFIXES `val` + 정본 §1-2(val+소급 11종)·§6 예외 + da-qa-checklist 정규식 | 커밋 동시 |

⛔ **DB 적용은 마스터 전담** — 절차는 02_migration_plan.md §7 (스테이징 선적용 → V1~V6 검증 → 운영).

## 리더 판정 기록

### 이행담당 상신 5건 (02_migration_plan.md §8)
1. **백필 = 예 채택** — 소스 실재 건 100% 파생·임의값 0. 고아(null_row_id>0)는 자동 제외 + 마스터 보고.
2. **JSONB 규약 = 업무 컬럼 스냅샷 통일 채택** — DDL COMMENT에 규약 명문화(sql/176), 백필·이중기록 전 지점 동일.
3. **provenance 컬럼(src_audit_id) = 미채택** — 복합키 멱등 가드로 충분, 컬럼+SRC 단어 등재 추가 비용 > 이득. 필요 시 후속 ALTER로 확장 가능(비파괴).
4. **chg_actn_cd 파생규칙 = 채택** — 품질 게이트 이의 없음, 소스 실재 필드 파생 확인.
5. **이중기록 무기한 유지 = 채택** — 구 뷰 2종을 라우트가 소비 중. 구 audit 폐기는 신규 관리자 화면 검증 후 별도 로드맵.

### 표준담당 상신 2건
1. **정본↔Hook 불일치 = 소급 명문화 채택** — Hook 기존 11종(uid~tag)을 정본 §1-2에 소급 등재(v2.2). val은 신규 등재 4곳 동시 반영(Hook·정본·da-qa-checklist 정규식·std_dom SQL).
2. **DB 역검증 미수행 = 수용** — std_dic/std_dom 시드가 git에 없어 파일 기준 판정. 보완: 리더가 std_dic·std_dom **실컬럼을 앱 코드에서 검증**(words/domains route) — 표준담당 유추 스키마(dom_log_nm 등)가 실제(dom_nm·key_dom_phy_nm·data_type_cd)와 달라 등재 SQL을 실컬럼으로 정정함. 최종 확인은 마스터 적용 시 SELECT.

### 품질 게이트 P2·P3 처리
- Q1(val 미등록 P2): sql/176 §0 + Hook + 정본 + 스킬 4곳 동시 등재로 해소 → Hook 실검증 경고 0.
- Q2(mod_dtm 트리거 P2): 정본 §6에 append-only 예외 명문화 + 이행 롤백 UPDATE에 modr_id·mod_dtm 추가.
- Q3(인덱스명 P3): idx_sys_cfg_chg_hist_* 로 정정 채택(정본 §5·선례 정합).
- Q4(매핑표 문구 P3): "활성행만 대상, DEFAULT 'N' 적용"으로 정정.

### 팀원 간 상충 판정 1건
- 표준담당 2회차가 "이행 계획서에 cfg_row_id 9건 잔존" 지적 ↔ 이행담당 "0건" 보고 상충 → **리더가 디스크 실물 grep으로 판정: 0건(이행담당 정확)**. 원인=표준담당이 이행담당 수정 완료 이전 파일을 읽은 읽기 경합. 무효 처리.

## 프로세스 기록 (하네스 실전 1차)
- 검증 루프 1회(모델 수정→재검증), 교차 산출물 동기화 1회, 읽기 경합 판정 1회, 품질담당 완료 메시지 유실 1회(산출물은 완성 — 디스크 확인으로 복구).
- 개선점: ① _workspace 다중 세션 충돌 → 잡별 하위 디렉토리 규칙化 ② 팀원에게 "산출물 완성 후 반드시 리더에게 완료 메시지" 재강조 필요.
