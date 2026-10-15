# DA팀 작업 지시 (2026-07-10)

**작업 유형**: 품질 전수조사 (감사) — 팀 소집: quality + standards (리더=오케스트레이터)
**범위**: sql/102 ~ sql/174 (2026-06-23 횡단7차 점검 이후분)
**기준**: docs/da/데이터표준규칙.md · docs/da/품질점검기준서.md
**점검 항목**: 시스템 컬럼 4종(regr_id/reg_dtm/modr_id/mod_dtm) · 논리삭제(del_yn/del_dtm) · 명명규칙(접두사·도메인 약어) · 표준용어 · DA-APPROVED 예외 적정성
**제약**: git 정본 검사만 (DB 적용·수정 금지)
**산출**: _workspace/01_quality_gate.md · 01_standards_naming-review.md → 리더 통합 → docs/da/reports/
