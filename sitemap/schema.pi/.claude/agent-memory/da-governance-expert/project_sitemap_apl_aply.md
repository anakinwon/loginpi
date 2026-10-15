---
name: sitemap-apl-aply-homonym
description: sitemap.pi 표준사전에서 APL=적용(W10) 선점 — 신청은 APLY(aply_dtm)로 구분, sys_cfg 는 cfg_key·cfg_val JSONB 로 사전 승인됨
metadata:
  type: project
---
sitemap.pi DA 사전(docs/da/_workspace/20261010_sitemap-data-model/01_standards_dictionary.md W10)은 APL 을 "적용"(apl_bgn_dtm·promo_apl_yn)에 배정했다. 2026-10-13 sql/012 리뷰에서 "신청"은 APLY(aply_dtm)로 별도 등재하도록 판정 — apl 을 신청에 쓰면 ORD/ord 와 같은 동음이의 사고.
같은 사전은 sys_cfg 를 cfg_key(TEXT)·cfg_val(JSONB, 정본 §1-2 val 도메인)·키값 UPPER_SNAKE 로 승인해 두었다. 012 초안은 cfg_cd·cfg_val TEXT·점 표기 키로 이탈해 P1 지적.

**Why:** 사이트 간 사전·정본 도메인 타입 일관성. sitemap 은 별도 DB라 std_dic 테이블 대신 사전 문서가 등재 수단.
**How to apply:** sitemap DDL 에서 신청/적용 단어, sys_cfg 컬럼이 나오면 이 판정과 대조. 또 상태 코드 교체 시 기존 RPC(fn_prcs_site_rpt 등) 본문의 상태 리터럴까지 grep 할 것 — [[sitemap-status-literal-grep]]
