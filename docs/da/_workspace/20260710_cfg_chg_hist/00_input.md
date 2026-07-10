# DA팀 작업 지시 (2026-07-10) — 설정 변경 감사 이력 테이블 설계

**작업 유형**: 신규 테이블 설계 (관계·이행 포함) — 팀 소집: modeler + standards + migration + quality (리더=오케스트레이터)
**요구**: 관리자 운영 설정 토글(fee_mode_config의 BEAN|PI 전환, promo_fee_config의 프로모 ON/OFF·기간 연장 등)의 변경 이력을 추적하는 감사 테이블. 변경 주체(관리자)·시각·대상 설정·전값·후값을 남긴다. 현재는 현재값만 있고 이력이 없어 "누가 언제 바꿨나" 추적 불가.
**참조**: sql/140_fee_mode_config.sql · sql/149_promo_fee_config.sql · docs/da/데이터표준규칙.md
**제약**: DDL은 git(sql/)만 — 운영 적용은 마스터. 물리 DELETE 금지. da-ddl-guard Hook 통과 필수.
**산출**: 01_modeler_model.md · 01_modeler_ddl.sql · 02_standards_naming-review.md · 02_migration_plan.md · 03_quality_gate.md → 리더 통합 → sql/176
**비고**: 하네스 실전 테스트 겸 실제 운영 필요 산출물. 상위 _workspace/00_input.md는 타 세션(품질 전수조사) 소유 — 건드리지 말 것.
