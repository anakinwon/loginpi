# 09_standards_reinspection — sitemap.pi 1차 모델 전 객체 명명 재점검 (#9)

- 잡 : `20261010_sitemap-data-model` / 작성 : standards / 작성일 2026-10-10 / 판정 : leader (요청)
- 지시 : team-lead #9, `00_input.md` §3-2(점검 범위 정정 — "재정의 금지 ≠ 점검 제외"), 정본 `docs/da/데이터표준규칙.md` v2.4(§1-3 단일 표준단어 금지, §10 #22)
- 기준 : 정본 v2.4 §1-2 도메인 26종 · §1-3(최소 `표준단어1_표준도메인`) · §9 약어표(v2.3 `mv`·`ord` 포함) · v2.3 `ord` 도메인 신규 금지 / `01_standards_dictionary.md` r3(leader r4 승인) 등재·재사용 단어 + §10 V-1(MBR) / r3 폐기 약어(ordr·move·vrfy·prnt·root·hold·lftm·cncl·aply·list·bndl·sprk·infl·sanc·rlse·knd)
- **점검 범위 = 모델에 등장하는 전 객체, 승계분 면제 없음**
  - `packages/pi-db/sql/000_baseline.sql` — sys_user + 공용 함수 `fn_grant_svc_only`
  - `sitemap/sitemap.pi/sql/001_sitemap_phase1.sql` — site_mst·site_rpt·stat_site_dly + RPC 2개
  - `docs/da/_workspace/20261010_sitemap-data-model/02_modeler_ddl.sql`(r1-a) — 신규 10테이블 + site_mst ALTER ADD 5컬럼 + 함수 14개
- 방법 : 스크립트 전수 lint(CREATE TABLE·ALTER ADD COLUMN 컬럼, 함수 인자, RETURNS TABLE 컬럼)를 돌린 뒤, 위반 행과 FK·주석·앱 호출 동반 변경 지점을 수동으로 확인했다. 스크립트에는 1차 lint 와 달리 **cafe 원형 면제 목록(LEGACY)이 없다**.
- 한계 : 운영 std_dic 역검증은 하지 못했다(비밀 파일 가드). "등재" 판정 기준은 정본 문서와 01 승인 사전이다.

## 0. 1차 점검 누락 원인 — 표준담당 몫

정본 §10 #22 의 원인 6겹 가운데 ⑥(입력서 "승계 대상, 재정의 금지")에 표준담당도 같은 방식으로 따랐다.
- 01 사전 §1-1 은 `sys_user` 를 "baseline 승계, 재정의·확장 금지"로, §4 는 "As-Is 001·baseline 컬럼은 그대로 둔다(재명명 금지)"로 적었다. 그 뒤 신규 후보만 표준용어 표에 올렸다.
- 1차 명명 검증 스크립트(`lint-ddl.mjs`)에는 `LEGACY` 면제 목록(`id`·`role`·`display_name`·`pi_username`·`pi_wallet_address`·`last_login_dtm`·`rejoin_dtm` 등)이 있어서 baseline 원형 컬럼을 검사 대상에서 아예 뺐다.
- 결과적으로 표준담당 단계에서도 `sys_user.id`·`role` 을 잡지 못했다. 이번 재점검은 면제 목록을 지우고 세 파일 전부를 같은 규칙으로 돌렸다.

## 1. 집계

| 구분 | 대상 | 점검 수 | 위반 | 비고 |
|---|---|---|---|---|
| **테이블 컬럼 전체** | 15개 테이블(sys_user 포함) | **212** | **7** | 부록 A 에 전 컬럼 목록 |
| └ 신규(02) | 10테이블 + site_mst ALTER 5 | 152 | 0 | r1-a 명명 검증 결과와 동일 |
| └ 승계(000·001) | sys_user 15 · site_mst 21 · site_rpt 14 · stat_site_dly 10 | 60 | 7 | 7건 전부 000 sys_user. 001 컬럼 45개는 위반 0 |
| 함수 인자·반환 컬럼(참고) | 000·001·02 함수 | 13 | 3 | 컬럼이 아니므로 위 집계와 분리(§3) |

위반 유형별(컬럼 7건, 한 컬럼에 여러 유형이 겹칠 수 있음) : 단일 표준단어 2(id·role) / 도메인 미종결 4(pi_username·pi_wallet_address·display_name·role) / 미등재 단어 6(username·wallet·address·display·name·role·last·login·rejoin — 9단어) / 폐기 약어 0 / 신규 `_ord` 0 / `_yn` 외 CHAR 0.

## 2. 위반 목록 — 테이블 컬럼

| 테이블.컬럼 | 출처 | 위반 유형 | 권장명 | 비고 |
|---|---|---|---|---|
| sys_user.id | 000 | 단일 표준단어(도메인 단독, §1-3 v2.4) | **`usr_id`** | **마스터 확정**(00_input §3-2). FK 참조 6곳이 대상 컬럼을 따라 바뀐다(§4). PK 제약명 `sys_user_pkey` 는 그대로 |
| sys_user.role | 000 | 단일 표준단어 + 도메인 미종결 + 미등재 단어(ROLE) | **`role_cd`** | **마스터 확정**. 값은 ADMIN·USER 고정 코드. 새 단어 ROLE(권한) 등재 필요(§5) — 4자지만 마스터가 정한 이름이라 v2.3 2~3자 원칙의 예외로 기록. CHECK 제약명 `sys_user_role_check` → `sys_user_role_cd_check` |
| sys_user.pi_username | 000 | 도메인 미종결 + 미등재 단어(USERNAME) | `pi_usr_nm` | 새 단어 없음(PI·USR·NM). 활성 UNIQUE 인덱스 `ux_sys_user_pi_username_actv` → `ux_sys_user_pi_usr_nm_actv`. 루트 CLAUDE.md·TROUBLESHOOT 에서 "pi_username 철칙"을 인용하는 곳이 많아 문서 동반 갱신 필요. [마스터 확인 필요 — §6] |
| sys_user.pi_wallet_address | 000 | 도메인 미종결 + 미등재 단어(WALLET·ADDRESS) | `pi_wlt_adr_txt` | 새 단어 WLT(지갑)·ADR(주소). 도메인 txt(지갑 주소 문자열). `key` 도메인은 비밀키로 오해될 수 있어 쓰지 않음. [마스터 확인 필요] |
| sys_user.display_name | 000 | 도메인 미종결 + 미등재 단어(DISPLAY·NAME) | `dsp_nm` | 새 단어 DSP(표시) — 01 에서 보류했던 노출(DSPL)을 v2.3 3자로 대체해 "표시·노출"을 함께 담는다. [마스터 확인 필요] |
| sys_user.last_login_dtm | 000 | 미등재 단어(LAST·LOGIN) | `lst_lgn_dtm` | 새 단어 LST(최종) — cafe `lst_read_msg_id` 사용례와 같은 뜻(01 W13 에서 정가로 쓰지 않은 이유와 일관). LGN(로그인) 신규. [마스터 확인 필요] |
| sys_user.rejoin_dtm | 000 | 미등재 단어(REJOIN) | `rjn_dtm` | 새 단어 RJN(재가입). 루트 CLAUDE.md "재가입 부활(`rejoin_dtm`)" 문서 동반 갱신. [마스터 확인 필요] |

통과로 판정한 승계 컬럼 중 확인할 만한 것
- `sys_user.pi_uid` : PI + 도메인 uid(외부 시스템 식별자). 2단어로 통과.
- `sys_user.del_rsn_cd` : DEL·RSN + cd. 통과.
- 001 의 45컬럼은 전부 2단어 이상 + 도메인 종결 + 01 승인 단어(SITE·OWNR·RJCT 등 001 등재 대기분)라 통과. 단 001 단어 16개는 운영 std_dic 에 아직 없고 01 §8 등재 SQL 로 올라갈 예정이다.

## 3. 참고 — 함수 인자·반환 컬럼 (테이블 컬럼 아님)

| 함수.인자 | 출처 | 위반 유형 | 권장명 | 비고 |
|---|---|---|---|---|
| fn_grant_svc_only(p_kind) | 000 | 단일 단어 + 도메인 미종결 + 미등재(KIND) | `p_obj_tp_cd` | KIND 는 TP 와 이음동의(01 KND 판정과 같음). 새 단어 OBJ(객체). 공용 함수라 cafe·sitemap SQL 의 호출이 전부 위치 인자라서 이름만 바꾸면 호출부 영향 없음 |
| fn_grant_svc_only(p_obj) | 000 | 단일 단어 + 도메인 미종결 + 미등재(OBJ) | `p_obj_nm` | 위와 같음 |
| fn_sel_stat_site_chg(p_days) | 001 | 단일 단어 + 도메인 미종결(D3 에서 반려한 `days`) | `p_day_cnt` | ⚠ 앱이 이름으로 호출 : `sitemap/sitemap.pi/src/app/api/bubbles/route.ts:108` `rpc('fn_sel_stat_site_chg', { p_days })` — 개명하면 같은 배포에서 앱도 수정해야 함 |

- 그 밖의 인자·반환 컬럼 10개(`p_site_id`·`p_cnt_tp_cd`·`p_usr_id`·RETURNS `site_id`·`cur_view_cnt`·`prev_view_cnt` 등)는 통과.
- 정본 §1-3 은 "컬럼명"을 대상으로 적고 있어, 함수 인자에 같은 규칙을 적용할지는 정본에 명시돼 있지 않다 → [DA 판정 필요 — §6 J-3].

## 4. 개명 동반 변경 지점 (usr_id·role_cd 확정분 기준)

| 위치 | 현재 | 변경 |
|---|---|---|
| 001:86 | `site_mst_sys_user_id_fkey … REFERENCES sys_user (id)` | `REFERENCES sys_user (usr_id)` (제약명 유지 — 정본 §5 `<자식>_<부모>_id_fkey`) |
| 001:202 | `site_rpt_sys_user_id_fkey … REFERENCES sys_user (id)` | `(usr_id)` |
| 02:52 | `site_mst_vrf_usr_id_fkey … REFERENCES sys_user (id)` | `(usr_id)` |
| 02:483·484 | `usr_snc_tgt_usr_id_fkey`·`usr_snc_prcs_usr_id_fkey … (id)` | `(usr_id)` |
| 02:560 | `fee_ord_sys_user_id_fkey … (id)` | `(usr_id)` |
| 주석·COMMENT "→ sys_user.id" | 001:74·114·188 / 02:28·57·78·104·466·474·501·502·535·598 | "sys_user.usr_id" (13곳) |
| 000 | 컬럼 `id`·`role`, CHECK `sys_user_role_check`, 주석·COMMENT | `usr_id`·`role_cd`, `sys_user_role_cd_check` |
| 코드(구현 단계, 00_input §3-2) | `@pi/auth`·`@pi/db`(upsertPiUser·getSessionUser·isAdmin)·sitemap 의 sys_user 조회 11곳 | 같은 배포에서 변경. PostgREST 임베드 `sys_user(pi_username)`(00_requirements REQ-04) 는 pi_username 개명 시 함께 변경 |

FK 컬럼명(`ownr_usr_id`·`rptr_usr_id`·`vrf_usr_id`·`tgt_usr_id`·`prcs_usr_id`·`ord_usr_id`)은 이미 `<역할>_usr_id` 형식(정본 §3-3 v2.4 예시)이라 바꾸지 않는다.

## 5. 표준단어 등재안 (권장명 채택 시)

| 한글명 | 약어 | 영문 | 의미 | 사용 용어 | 동의어·충돌 점검 |
|---|---|---|---|---|---|
| 권한 | ROLE | role | 사용자 권한 등급 | `role_cd` | 마스터 확정 이름. v2.3 의 2~3자 원칙 예외(현장 최빈형). RL 은 현장에서 쓰지 않음 |
| 지갑 | WLT | wallet | Pi 지갑 | `pi_wlt_adr_txt` | cafe 사용례 `bean_token_wallet`(원형) 외 없음. 통화 어휘(BEAN·TOKEN) 아님 |
| 주소 | ADR | address | 주소 문자열 | `pi_wlt_adr_txt` | 우편주소 등 다른 용도로도 쓸 수 있는 일반 단어. 충돌 없음 |
| 표시 | DSP | display | 화면 표시·노출 | `dsp_nm` | 01 의 DSPL(노출, 보류)을 대체. 충돌 없음 |
| 최종 | LST | last | 마지막 | `lst_lgn_dtm` | cafe `lst_read_msg_id` 와 같은 뜻 — 기존 사용례 정식화. END(종료)와는 뜻이 다름 |
| 로그인 | LGN | login | 로그인 | `lst_lgn_dtm` | 충돌 없음 |
| 재가입 | RJN | rejoin | 탈퇴 후 행 부활 | `rjn_dtm` | RJCT(반려)와 첫 글자가 같지만 별개 |
| 객체 | OBJ | object | DB 객체(테이블·함수) | `p_obj_tp_cd`·`p_obj_nm` | 함수 인자 적용 판정(J-3) 시에만 |

등재 SQL(01 §8 형식, 멱등) 초안 — 판정 후 01 §8 에 합칠 것:
```sql
-- ('권한','ROLE','role','사용자 권한 등급 — role_cd(ADMIN·USER)'),
-- ('지갑','WLT','wallet','Pi 지갑'), ('주소','ADR','address','주소 문자열'),
-- ('표시','DSP','display','화면 표시·노출'), ('최종','LST','last','마지막(최종)'),
-- ('로그인','LGN','login','로그인'), ('재가입','RJN','rejoin','탈퇴 후 행 부활'),
-- ('객체','OBJ','object','DB 객체 — J-3 판정 시')
```

## 6. 판정 요청

| # | 쟁점 | standards 권고 |
|---|---|---|
| J-1 | `usr_id`·`role_cd` | 마스터 확정 — 모델 문서·DDL·ERD 반영(modeler), 실제 000·코드는 구현 단계 같은 배포(00_input §3-2) |
| J-2 | 마스터 미확정 승계 위반 5건(pi_username·pi_wallet_address·display_name·last_login_dtm·rejoin_dtm) — 고칠지, grandfathered 로 둘지 | **같은 배포에서 함께 개명을 권고.** `@pi/db`·`@pi/auth` 를 id·role 때문에 어차피 고치므로, 이번에 함께 바꾸면 sys_user 개명이 한 번에 끝난다(둘로 나누면 공용 패키지를 두 번 바꿔야 함). 그대로 두면 `grandfathered(사유: 공용 패키지·cafe 동일 코드 계약, 추적처: 정본 §10 잔여 위반 sys_user(display_name 등))` 로 기록. **마스터 상신 대상** |
| J-3 | 함수 인자(p_kind·p_obj·p_days)에 §1-3 을 적용할지 | 적용을 권고. 비용이 작다 — p_kind·p_obj 는 호출이 위치 인자라 영향 없고, p_days 는 앱 1곳만 고치면 된다. 적용하지 않으면 grandfathered(추적처 01 §10) |
| J-4 | `sys_user` 테이블명의 USER(USR 아님) | 판정 외 — 정본 §2-1 수정 이력이 `users → sys_user` 를 표준 예로 직접 확정했다. 참고로만 기록 |

## 부록 A. 전 컬럼 점검 목록 (212개, 굵게 = 위반)

| 출처 | 테이블 | 컬럼 수 | 컬럼(굵게 = 위반) |
|---|---|---|---|
| 000 | sys_user | 15 | **id** · pi_uid · **pi_username** · **pi_wallet_address** · **display_name** · **role** · **last_login_dtm** · **rejoin_dtm** · del_rsn_cd · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 001 | site_mst | 21 | site_id · site_dom_nm · site_nm · site_ctgr_cd · site_desc · site_img_url · site_sts_cd · rjct_rsn_cd · rjct_rsn_cont · apv_dtm · ownr_usr_id · own_site_yn · plan_cd · pvt_cntc_txt · pub_cntc_txt · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 001 | site_rpt | 14 | rpt_id · site_id · rptr_usr_id · rpt_rsn_cd · rpt_cont · rpt_sts_cd · prcs_dtm · prcs_cont · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 001 | stat_site_dly | 10 | site_id · stat_dt · view_cnt · clck_cnt · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 02 | site_sts_hist | 15 | hist_id · site_id · old_sts_cd · new_sts_cd · chg_rsn_cd · chg_rsn_cont · site_dom_nm · chgr_id · chg_dtm · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 02 | sys_cfg | 11 | cfg_id · cfg_key · cfg_val · cfg_desc · use_yn · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 02 | sys_cfg_chg_hist | 15 | hist_id · cfg_tbl_nm · cfg_tgt_id · chg_actn_cd · old_val · new_val · chg_rsn_cont · chgr_id · chg_dtm · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 02 | promo_fee_cfg | 11 | promo_fee_id · promo_actv_yn · promo_bgn_dtm · promo_end_dtm · chg_rsn_cont · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 02 | fee_plan | 22 | fee_plan_id · fee_plan_cd · fee_tp_cd · use_day_cnt · lft_yn · subscr_yn · pi_amt · nrm_pi_amt · stk_cnt · stk_scp_cd · promo_apl_yn · apl_bgn_dtm · apl_end_dtm · use_yn · sort_seq · fee_plan_desc · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 02 | fee_plan_bnd | 9 | bnd_id · bnd_plan_cd · item_plan_cd · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 02 | usr_snc | 16 | snc_id · tgt_usr_id · snc_tp_cd · snc_sts_cd · snc_rsn_cd · snc_rsn_cont · snc_bgn_dtm · snc_end_dtm · rel_dtm · prcs_usr_id · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 02 | fee_ord | 25 | ord_id · ord_usr_id · site_id · fee_plan_cd · site_ctgr_cd · ord_pi_amt · nrm_pi_amt · promo_apl_yn · pymnt_id · ord_sts_cd · ord_tp_cd · use_bgn_dtm · use_end_dtm · hld_expr_dtm · upr_ord_id · subscr_cnl_yn · rvk_rsn_cd · rvk_dtm · snc_id · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 02 | fee_ord_hist | 13 | hist_id · ord_id · old_sts_cd · new_sts_cd · chg_rsn_cd · chgr_id · chg_dtm · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 02 | site_img | 10 | img_id · site_id · img_url · img_seq · del_yn · del_dtm · regr_id · reg_dtm · modr_id · mod_dtm |
| 02 | site_mst(ALTER ADD) | 5 | site_mv_url · vrf_yn · vrf_dtm · vrf_usr_id · vrf_dom_nm |

재현 : `node lint2.mjs 000=packages/pi-db/sql/000_baseline.sql 001=sitemap/sitemap.pi/sql/001_sitemap_phase1.sql 02=docs/da/_workspace/20261010_sitemap-data-model/02_modeler_ddl.sql` (스크립트는 standards 작업 임시 디렉토리 — 판정 후 필요하면 잡 `tools/` 로 옮긴다)
