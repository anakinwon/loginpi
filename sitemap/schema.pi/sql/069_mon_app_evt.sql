-- 069_mon_app_evt.sql : 애플리케이션 모니터링 — 느린·오류 요청 개별 이력(마스터 지시 2026-10-21 "느린 요청이 어느 화면인지 모르면 조치를 할 수가 없다", "요청 분포의 오류가 뭔지 확인")
-- DA-APPROVED: 마스터 지시 2026-10-21 — 신규 1테이블(mon_ 접두 = 모니터링 주제영역), _hist(추가 전용 로그 — del_yn 면제·보관 기간 지난 행 물리 삭제 허용, 정본 §4 예외, sql/068 과 동일), 시스템 컬럼 4개 맨 끝, service_role 전용
--   약어 EVT(이벤트)·OCCR(발생)·SCR(화면)·STS(상태)·RSP(응답). 응답시간은 밀리초 숫자(…_val). FK 없음(RI 물리 미구현 결정 — usr_id 는 sys_user.usr_id 값만 보관)
-- 수집 : 브라우저 RUM 표본(POST /api/mon/app) 중 느림(1초 이상)·오류(4xx·5xx·네트워크 실패)만 1요청 1행, 보내는 한 번에 최대 50행. 보관 7일(수집 때 지난 행 삭제)
--   오류 원인 본문(서버 메시지)은 Resource Timing 으로 알 수 없으므로 상태번호만 저장
BEGIN;

CREATE TABLE IF NOT EXISTS mon_app_evt_hist (
  evt_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 이벤트ID
  occr_dtm          TIMESTAMPTZ  NOT NULL,                                 -- 발생일시(요청이 끝난 시각)
  evt_cd            VARCHAR(10)  NOT NULL,                                 -- 이벤트코드(SLOW 느림·ERR 오류, 오류면서 느리면 ERR)
  scr_txt           VARCHAR(200),                                          -- 화면경로(요청이 나온 화면, UUID·숫자 → :id 정규화)
  route_txt         VARCHAR(200) NOT NULL,                                 -- API 경로(UUID·숫자 → :id 정규화, 질의 문자열 제외)
  sts_no            INT          NOT NULL,                                 -- 상태번호(HTTP 상태, 0 = 네트워크 실패·알 수 없음)
  rsp_val           INT          NOT NULL,                                 -- 응답값(밀리초)
  usr_id            UUID,                                                  -- 사용자ID(보고한 로그인 사용자, sys_user.usr_id)
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT pk_mon_app_evt_hist PRIMARY KEY (evt_id),
  CONSTRAINT mon_app_evt_hist_evt_cd_check CHECK (evt_cd IN ('SLOW', 'ERR'))
);
CREATE INDEX IF NOT EXISTS x_mon_app_evt_hist_01 ON mon_app_evt_hist (occr_dtm);

SELECT fn_add_mod_dtm_trg('mon_app_evt_hist');
SELECT fn_grant_svc_only('TABLE', 'mon_app_evt_hist');

COMMENT ON TABLE mon_app_evt_hist IS '애플리케이션 모니터링 이벤트 이력 — 느린(1초 이상)·오류 요청 개별 행(화면경로·API 경로·상태번호·응답값), 보관 7일';
COMMENT ON COLUMN mon_app_evt_hist.evt_id IS '이벤트ID';
COMMENT ON COLUMN mon_app_evt_hist.occr_dtm IS '발생일시(요청이 끝난 시각)';
COMMENT ON COLUMN mon_app_evt_hist.evt_cd IS '이벤트코드(SLOW 느림·ERR 오류, 오류면서 느리면 ERR)';
COMMENT ON COLUMN mon_app_evt_hist.scr_txt IS '화면경로(요청이 나온 화면, :id 정규화)';
COMMENT ON COLUMN mon_app_evt_hist.route_txt IS 'API 경로(:id 정규화)';
COMMENT ON COLUMN mon_app_evt_hist.sts_no IS '상태번호(HTTP 상태, 0 = 네트워크 실패)';
COMMENT ON COLUMN mon_app_evt_hist.rsp_val IS '응답값(밀리초)';
COMMENT ON COLUMN mon_app_evt_hist.usr_id IS '사용자ID(보고한 로그인 사용자)';
COMMENT ON COLUMN mon_app_evt_hist.regr_id IS '등록자ID';
COMMENT ON COLUMN mon_app_evt_hist.reg_dtm IS '등록일시';
COMMENT ON COLUMN mon_app_evt_hist.modr_id IS '변경자ID';
COMMENT ON COLUMN mon_app_evt_hist.mod_dtm IS '변경일시';
COMMENT ON INDEX x_mon_app_evt_hist_01 IS '시간 조회(최신 이벤트·보관 기간 정리)';

COMMIT;

NOTIFY pgrst, 'reload schema';
