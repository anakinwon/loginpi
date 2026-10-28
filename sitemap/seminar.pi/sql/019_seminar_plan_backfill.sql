-- 019 열린 세미나 요금제 채워 넣기 — 018 은 기존 세미나를 모두 FREE 로 묶었다. 유료 이용권을 가진 개최자의 진행·예정 세미나가
--  무료 1시간 소진으로 끊기거나 AI 가 꺼지지 않게, 그 개최자의 남은 시간이 있는 유료 요금제(늦게 끝나는 쪽, 같으면 연간)로 옮긴다(검토 지적 2026-10-29)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-29) — 데이터 갱신만(스키마 변경 없음), 2회 멱등(FREE 인 열린 세미나만 대상)
-- 선행 : 018. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod
BEGIN;

UPDATE smn_mst s
   SET plan_cd = b.plan_cd, modr_id = 'MIGRATE', mod_dtm = CURRENT_TIMESTAMP
  FROM (
    SELECT DISTINCT ON (p.usr_id) p.usr_id, p.plan_cd
      FROM smn_hst_pln p
     WHERE p.del_yn = 'N' AND p.plan_cd IN ('M', 'Y')
       AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
       AND p.use_sec_cnt < p.grnt_sec_cnt
     ORDER BY p.usr_id, p.end_dtm DESC, (p.plan_cd = 'Y') DESC
  ) b
 WHERE s.hst_usr_id = b.usr_id
   AND s.del_yn = 'N'
   AND s.plan_cd = 'FREE'
   AND s.smn_sts_cd IN ('SCHEDULED', 'LIVE');

COMMIT;
