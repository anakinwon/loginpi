-- 006_seminar_pymnt_ent_uidx.sql — 세미나 입장 결제(SMN_ENT) 이중 결제 차단 부분 유일 인덱스(R-P5, @pi/payments README '이중 결제 차단')
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-26) — pi_pymnt 인덱스 1개(x_pi_pymnt_01) 추가만, 테이블·함수 무변경. DA 사후 리뷰 대상
-- 선행 : packages/pi-db/sql/010_pi_pymnt.sql · 004·005. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod
--
-- 대상 키 = (결제자 usr_id, meta smn_id) — approvedTargetIndexSql({ nn:'01', metaKey:'smn_id', types:['SMN_ENT'] }) 출력에 usr_id 를 앞에 더했다.
--   패키지 출력 그대로(smn_id 단독)면 "세미나 1개당 진행 중 결제 1건" 이 되어 여러 청중이 동시에 결제하지 못한다(정원 30 인데 1명씩만).
--   세미나 입장의 "같은 대상" 은 사람 × 세미나 — fn_chk_smn_cap(005)의 사용자당 점유 1개 규칙과 같은 단위
-- 위반(23505) = 같은 사람이 같은 세미나에 동시 approve 2건 → insertApprovedPayment 가 busy → approvePayment 가 Pi 취소 + ALREADY_PAID(409)
-- 시간 창 없음(fn_chk_smn_cap 은 10분) : 서명 전 이탈한 APPROVED 는 다음 로그인 때 미완료 결제 복구(pi-auth-root → /api/payments/cancel)가
--   CANCELED 로 정리해 이 인덱스에서 빠진다. Pi 도 미완료 결제가 남아 있으면 새 createPayment 를 거부하므로 같은 시점에 막힌다
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS x_pi_pymnt_01
  ON pi_pymnt (usr_id, (meta_val ->> 'smn_id'))
  WHERE pymnt_sts_cd = 'APPROVED' AND del_yn = 'N' AND pymnt_tp_cd IN ('SMN_ENT');
COMMENT ON INDEX x_pi_pymnt_01 IS '유일 — 세미나 입장(SMN_ENT) 진행 중(APPROVED) 결제 사용자·세미나당 1건(R-P5 이중 결제 차단)';

COMMIT;

-- 검증 (적용 후 수동 실행)
-- SELECT indexdef FROM pg_indexes WHERE indexname = 'x_pi_pymnt_01';     → usr_id, (meta_val ->> 'smn_id') … WHERE … 'SMN_ENT'
