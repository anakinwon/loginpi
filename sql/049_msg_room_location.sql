-- DA-APPROVED: msg_room 위치 컬럼 추가 — LBS 동의자 카페 생성 시 자동 저장
-- loc_tp_cd='05'(카페생성) 신규 사용. latd_crd/lngt_crd DA 표준용어(037 확정).

ALTER TABLE msg_room
  ADD COLUMN IF NOT EXISTS latd_crd NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS lngt_crd NUMERIC(11,8);

COMMENT ON COLUMN msg_room.latd_crd IS 'WGS84 위도좌표값 — 카페 생성 위치 (LBS 동의자만, 표준용어 latd_crd)';
COMMENT ON COLUMN msg_room.lngt_crd IS 'WGS84 경도좌표값 — 카페 생성 위치 (LBS 동의자만, 표준용어 lngt_crd)';

CREATE INDEX IF NOT EXISTS idx_msg_room_location
  ON msg_room(latd_crd, lngt_crd)
  WHERE latd_crd IS NOT NULL AND lngt_crd IS NOT NULL AND del_yn = 'N';
