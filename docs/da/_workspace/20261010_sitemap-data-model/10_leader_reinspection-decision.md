# 10_leader_reinspection-decision — 전 객체 재점검 위반 처리 판정 (#10)

- 대상 : `09_standards_reinspection.md`(standards #9) + quality 사전 스캔(information_schema) / 판정자 : leader / 판정일 2026-10-10
- 기준 : 정본 `데이터표준규칙.md` **v2.4**(§1-3 단일 표준단어 금지, §10 #22), `00_input.md` §3-2(점검 범위 = 전 객체, 마스터 확정 `usr_id`·`role_cd`, 그 외 baseline 개명 임의 확정 금지)

## 0. 리더 자기 원인 기록

1차 승인(01 r1~r4, 02 r1, 04 r1)에서 리더는 승계 객체(000 `sys_user`·001)를 점검 대상에서 뺐다. 00_input 의 "승계 대상, 재정의 금지"를 "점검 제외"로 읽었고, 승인서에 점검 범위·컬럼 수를 밝히지 않아 누락이 드러나지 않았다(정본 §10 #22 원인 ⑥의 승인 단계 몫). 이번부터 승인서마다 **점검 컬럼 수(전체/신규/승계)** 를 기재한다.

## 1. 점검 범위 확인 — 승계 객체 누락 0

| 구분 | standards 09 | quality 스캔 | 일치 |
|---|---|---|---|
| 전체 테이블 컬럼 | 212 | 212(14 테이블) | ✅ |
| 신규(02) | 152 | 152 | ✅ |
| 승계 000 `sys_user` | 15 | 15 | ✅ |
| 승계 001(`site_mst`·`site_rpt`·`stat_site_dly`) | 45 | 45 | ✅ |
| 위반 | 7(전부 000) | 단일 단어 2 + 도메인 미종결 3(사전 등재 미검사) | ✅ 09 ⊇ quality |
| 함수 인자(참고) | 13개 중 위반 3 | — | — |

main 지시대로 001 컬럼과 baseline 원형 컬럼(`display_name`·`pi_username`·`pi_wallet_address` 등)이 모두 09 에 포함됐음을 확인했다. 001·02 위반 0.

## 2. 위반별 처리 판정

| # | 객체 | 위반 | 판정 | 반영 |
|---|---|---|---|---|
| V1 | `sys_user.id` | 단일 단어(도메인 단독) P1 | **이번 개명 → `usr_id`**(마스터 확정) | 모델·DDL 초안·ERD |
| V2 | `sys_user.role` | 단일 단어·도메인 미종결·미등재 P1 | **이번 개명 → `role_cd`**(마스터 확정). 단어 ROLE 등재 — 4자는 마스터 지정 이름이라 v2.3 2~3자 원칙의 예외로 기록 | 〃, CHECK `sys_user_role_cd_check` |
| V3 | `sys_user.pi_username` | 도메인 미종결 | **[확인중 : 마스터]** 개명안 `pi_usr_nm`. 확정 전 **grandfathered**(사유 : 공용 baseline 계약 + REQ-11 불변 업무 키·활성 UNIQUE `ux_sys_user_pi_username_actv`, 추적처 : 이 판정서 §4 상신 목록 → 정본 §10 잔여 위반) | 모델 문서 변경표에 개명안·영향 기재만, DDL 미반영 |
| V4 | `sys_user.pi_wallet_address` | 도메인 미종결 | [확인중 : 마스터] 개명안 `pi_wlt_adr_txt`(신규 WLT·ADR) — grandfathered(동일 추적처) | 〃 |
| V5 | `sys_user.display_name` | 도메인 미종결 | [확인중 : 마스터] 개명안 `dsp_nm`(신규 DSP) — grandfathered | 〃 |
| V6 | `sys_user.last_login_dtm` | 미등재 단어(LAST·LOGIN) | [확인중 : 마스터] 개명안 `lst_lgn_dtm`(LST = cafe 사용례 last, LGN 신규) — grandfathered | 〃 |
| V7 | `sys_user.rejoin_dtm` | 미등재 단어(REJOIN) | [확인중 : 마스터] 개명안 `rjn_dtm`(RJN 신규) — grandfathered | 〃 |

**J-2 판정** : standards 의 "같은 배포에서 함께 개명" 권고는 합리적이지만, 마스터가 정하지 않은 baseline 개명은 리더가 확정할 수 없다(§3-2). 따라서 **권고 의견을 붙여 마스터 상신**하고, 결정 전까지 모델·DDL 은 현행명을 유지한다. 동반 영향(특히 V3 = `@pi/auth` 사용자 매칭·UNIQUE 인덱스)은 상신 자료에 명시한다.

## 3. 함수 인자 (J-3)

| 객체 | 판정 | 근거 |
|---|---|---|
| 02 신규 함수 인자(`p_rpt_id`·`p_rpt_sts_cd`·`p_prcs_cont`·`p_prcs_usr_id`·`p_usr_id`) | 적합 | §1-3 형식 충족 |
| 001 `fn_sel_stat_site_chg(p_days)` | **이번 개명 → `p_day_cnt`** | sitemap 소유 객체(공용 baseline 아님)라 리더 권한. Part A 에서 `DROP FUNCTION IF EXISTS fn_sel_stat_site_chg(INT)` 후 같은 본문으로 재생성 + `fn_grant_svc_only` 재호출(001 파일 무수정 원칙 유지). 앱 동반 : `src/app/api/bubbles/route.ts:108` `{ p_days }` → `{ p_day_cnt }` **같은 배포 필수**(미반영 시 PGRST202 로 버블 증감 조회 실패) |
| 001 `fn_inc_stat_site_dly(p_site_id, p_cnt_tp_cd)` | 적합 | |
| 000 `fn_grant_svc_only(p_kind, p_obj)` | [확인중 : 마스터] 개명안 `p_obj_tp_cd`·`p_obj_nm` — grandfathered(공용 baseline, 위치 인자 호출이라 실영향 없음) | |

함수 인자에도 §1-3 을 적용한다(J-3 수용) — 인자명은 PostgREST 이름 호출 계약이라 컬럼과 같은 강도로 다룬다.

## 4. J-4

`sys_user` 테이블명의 USER 는 정본 §2-1 위반 사례표가 표준 결과로 명시 — 판정 외(수용).

## 5. 동반 변경 (usr_id·role_cd·p_day_cnt 확정분)

- 02 DDL 초안 : `REFERENCES sys_user (id)` 4곳 → `(usr_id)`, 주석·COMMENT 의 `sys_user.id` → `sys_user.usr_id`, `role` 언급 → `role_cd`. FK 컬럼명 `*_usr_id`·제약명 `<자식>_sys_user_id_fkey` 는 표준이라 유지.
- 001 `REFERENCES sys_user (id)` 2곳 : 001 은 이 잡에서 수정하지 않는다. 운영 미적용 상태이므로 **구현 단계에서 000 개명과 같은 배포로 001 텍스트도 수정**(또는 000 이 RENAME 하면 FK 는 자동 추종) — 모델 문서 동반 변경표에 기재.
- 구현 단계 동반(00_input §3-2) : `packages/pi-db/sql/000_baseline.sql`(컬럼·CHECK), `@pi/auth`·`@pi/db`, sitemap 코드의 `sys_user` 조회 11곳(`id`→`usr_id`, `role`→`role_cd`, 임베드 `sys_user(...)` 선택 컬럼 포함), `bubbles/route.ts:108`. cafe.pi DB 는 범위 밖.
- 표준단어 등재 : ROLE 1개(확정분). WLT·ADR·DSP·LST·LGN·RJN 은 V3~V7 확정 시에만.

## 6. modeler 지시 요약

02 r3(DDL·모델)·최종 문서 1.1 에 §2 V1·V2, §3 `p_day_cnt`, §5 동반 변경표, V3~V7·000 함수 인자 [확인중]·grandfathered 표를 반영. 승인 요청 시 점검 컬럼 수(전체/신규/승계)와 PGlite 재검증(000 개명본을 잡 임시 사본으로 적용 — 실제 000 파일 수정 금지) 결과 첨부.

---

## 7. 마스터 확정 반영 (2026-10-10, 본 판정 이후 도착 — 아래가 §2·§3 에 우선)

| 항목 | 마스터 확정 | 판정 갱신 |
|---|---|---|
| J-2 (V3~V7) | **이번에 함께 개명**(sitemap DB 대상, cafe.pi DB 미변경) | [확인중]·grandfathered 해제 → **이번 개명 확정** : `pi_username→pi_usr_nm` · `pi_wallet_address→pi_wlt_adr_txt` · `display_name→dsp_nm` · `last_login_dtm→lst_lgn_dtm` · `rejoin_dtm→rjn_dtm`. 리더 명칭 재검토 결과 5건 모두 정본 v2.4 적합(단어 2개 이상·표준 도메인 종결·신규 단어 2~3자) — 수정 없음. `pi_wlt_adr_txt` = PI(파이)·WLT(지갑)·ADR(주소)·txt(텍스트 도메인) : 주소는 표준 도메인이 아니므로 단어 ADR + 도메인 txt 구성이 맞고, `key` 도메인은 비밀키 오인 소지로 배제(standards 판단 수용). 동반 : 활성 UNIQUE `ux_sys_user_pi_username_actv → ux_sys_user_pi_usr_nm_actv`, COMMENT·주석 |
| 세션 필드 | 세션 필드명(`userId`·`role`) **유지**, DB 컬럼만 개명 — `@pi/db` 조회 계층에서 매핑 | 모델 문서 동반 변경표에 "세션·API 응답 필드 불변, 조회 계층 매핑(usr_id→userId, role_cd→role)" 명기. sitemap 코드 11곳은 DB 컬럼 참조만 수정 |
| J-3 | 함수 인자 규칙은 **신규 함수만**, 기존 2개 함수 인자 grandfathered | §3 갱신 : 001 `fn_sel_stat_site_chg(p_days)` **개명 취소 → grandfathered**(사유 : 기존 함수 계약·앱 이름 호출, 추적처 : 정본 §10 잔여 위반). Part A 의 DROP·재생성과 `bubbles/route.ts:108` 동반 변경 **철회**. 000 `fn_grant_svc_only(p_kind, p_obj)` grandfathered. 02 신규 함수 인자는 적합 유지 |

- 표준단어 등재 확정 : ROLE(권한, 마스터 지정 4자 예외) · WLT(지갑) · ADR(주소) · DSP(표시) · LST(최종) · LGN(로그인) · RJN(재가입) — standards 에 확정 통보(01 §8 등재 SQL 반영 대상).
- 이번 개명 확정 합계(테이블 컬럼) : 7건 전부(V1~V7). grandfathered 잔여 : 함수 인자 3개(`p_days`·`p_kind`·`p_obj`).
