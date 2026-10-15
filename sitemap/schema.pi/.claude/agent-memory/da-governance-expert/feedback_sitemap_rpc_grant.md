---
name: sitemap-rpc-grant-check
description: sitemap.pi 신규 RPC는 fn_grant_svc_only 누락 시 PUBLIC EXECUTE로 anon이 PostgREST RPC 호출 가능 — DDL 리뷰마다 확인
metadata:
  type: feedback
---
sitemap.pi DDL 리뷰 시 신규 함수(CREATE FUNCTION 새 시그니처)마다 `SELECT fn_grant_svc_only('FUNCTION', '<name>(<args>)')` 가 있는지 확인한다. 2026-10-13 sql/013(fn_cmpl_site_spk_pymnt)에서 누락을 P1으로 지적.

**Why:** RLS 비활성·service_role 전용 구조라 기본 PUBLIC EXECUTE가 남으면 anon 키로 결제 완료 RPC를 직접 호출할 수 있다. CREATE OR REPLACE(같은 시그니처 재정의)는 기존 권한을 유지하므로 재부여 불필요.
**How to apply:** 002 원칙("신규 객체마다 fn_grant_svc_only") 기준. 같은 리뷰에서 pi_pymnt 부분 인덱스 술어(del_yn='N' 포함 여부)도 012 선례와 대조 — [[sitemap-apl-aply-homonym]]
