-- 019_sitemap_auth_lnk_try.sql — 연동 코드 입력 실패 이력 (무차별 대입 방어, 2026-10-25 — seminar.pi sql/002 와 같은 구조)
-- DA-APPROVED: 마스터 지시 2026-10-25 "1번부터 진행"(연동 코드 보안 보강, 자동 보안 리뷰 HIGH) — 신규 이력 테이블 1개(sys_ 접두·_hist), sys_user 무변경. DA 사후 리뷰 대상
-- 선행 : 003_sitemap_auth_link.sql. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 설계 :
--  · 사용 : POST /api/auth/link-complete 가 Google sub 별 최근 15분 실패 건수를 세어 5건을 넘거나 전체 계정 합계가 30건을 넘으면 429(LINK_TRY_LIMIT) — 시도를 먼저 'N' 으로 기록한 뒤 센다(동시 요청 경합 차단)
--  · 시도마다 1행 — 처음엔 succ_yn='N', 연동 성공 시 'Y' 로 갱신. 물리 삭제 없음, 오래된 행 정리는 논리삭제 배치(후속)
--  · 6자리 코드는 값 공간이 100만이라 IP(메모리) 제한만으로는 여러 IP·여러 인스턴스 분산 시도를 막지 못함 → DB 공유 카운터
BEGIN;

CREATE TABLE IF NOT EXISTS sys_auth_lnk_try_hist (
  try_id        UUID         NOT NULL DEFAULT gen_random_uuid(),           -- 시도ID
  prvd_cd       VARCHAR(20)  NOT NULL,                                     -- 제공자코드: GOOGLE
  prvd_sub_txt  TEXT         NOT NULL,                                     -- 제공자 식별자(Google sub)
  succ_yn       CHAR(1)      NOT NULL DEFAULT 'N',                         -- 성공여부(기본 N, 연동 성공 시 Y)
  del_yn        CHAR(1)      NOT NULL DEFAULT 'N',                         -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 등록자ID
  reg_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 등록일시(= 시도 일시)
  modr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 변경자ID
  mod_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 변경일시
  CONSTRAINT pk_sys_auth_lnk_try_hist PRIMARY KEY (try_id),
  CONSTRAINT sys_auth_lnk_try_hist_prvd_cd_check CHECK (prvd_cd IN ('GOOGLE')),
  CONSTRAINT sys_auth_lnk_try_hist_succ_yn_check CHECK (succ_yn IN ('Y', 'N')),
  CONSTRAINT sys_auth_lnk_try_hist_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE sys_auth_lnk_try_hist IS '연동 코드 입력 실패 이력 — Google sub 당 최근 실패 건수로 무차별 대입 차단(link-complete)';

-- 조회 : (제공자, sub) 최근 실패 건수 — reg_dtm 범위 스캔
CREATE INDEX IF NOT EXISTS x_sys_auth_lnk_try_hist_01
  ON sys_auth_lnk_try_hist (prvd_cd, prvd_sub_txt, reg_dtm) WHERE succ_yn = 'N';
-- 조회 : 모든 계정 합계 최근 실패 건수(30건 초과 시 429 — 계정 다수 동원 우회 차단, seminar.pi sql/003 과 같은 인덱스)
CREATE INDEX IF NOT EXISTS x_sys_auth_lnk_try_hist_02
  ON sys_auth_lnk_try_hist (prvd_cd, reg_dtm) WHERE succ_yn = 'N';

SELECT fn_grant_svc_only('TABLE', 'sys_auth_lnk_try_hist');

COMMIT;
