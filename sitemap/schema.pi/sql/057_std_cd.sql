-- 057_std_cd.sql : 표준코드(reqst.md FR-14 = 제안서 P04, MASTER_ROADMAP 1단계 잔여) — 코드(표준용어 1개 = 코드 1개)·코드값
-- DA-APPROVED: 마스터 지시 2026-10-19 '남은 로드맵 진행' — 표준코드 신규 테이블 2종(설정 데이터, 승인 절차 없음·감사 이력)
-- 설계 :
--  · std_cd 1행 = 코드 1개. 코드명·물리명은 연결한 표준용어(term_id)에서 가져온다(표준 선행 — 표준 밖 코드명 생성 불가), 분류체계 안 용어당 1개
--    코드분류명(cd_cls_nm) = 코드를 묶는 분류(예 : 공통·결제·회원) 텍스트
--  · std_cd_val 1행 = 코드값 1개(코드값·코드값명·정렬순서·사용여부), 코드 안 코드값 유일
--  · 코드값 길이 ≤ 용어 도메인 길이, 코드형(CD) 도메인 용어만 = 앱 검사(src/lib/std-code.ts)
BEGIN;

CREATE TABLE IF NOT EXISTS std_cd (
  cd_id             UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 코드ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  term_id           UUID         NOT NULL,                                 -- 용어ID(코드명·물리명 출처)
  cd_cls_nm         VARCHAR(200),                                          -- 코드분류명
  cd_desc           TEXT,                                                  -- 코드설명
  use_yn            CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 사용여부
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호(낙관적 잠금)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_cd_pkey PRIMARY KEY (cd_id),
  CONSTRAINT std_cd_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_cd_std_term_id_fkey FOREIGN KEY (term_id) REFERENCES std_term (term_id),
  CONSTRAINT std_cd_use_yn_check CHECK (use_yn IN ('Y','N')),
  CONSTRAINT std_cd_del_yn_check CHECK (del_yn IN ('Y','N'))
);
COMMENT ON TABLE std_cd IS '표준코드 — 1행 = 코드 1개, 코드명·물리명 = 연결 표준용어';
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_cd_area_term_actv ON std_cd (area_id, term_id) WHERE del_yn = 'N';

CREATE TABLE IF NOT EXISTS std_cd_val (
  cd_val_id         UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 코드값ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  cd_id             UUID         NOT NULL,                                 -- 코드ID
  cd_val            VARCHAR(100) NOT NULL,                                 -- 코드값
  cd_val_nm         VARCHAR(400) NOT NULL,                                 -- 코드값명
  cd_val_desc       TEXT,                                                  -- 코드값설명
  sort_seq          INT          NOT NULL DEFAULT 0,                       -- 정렬순서
  use_yn            CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 사용여부
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호(낙관적 잠금)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT std_cd_val_pkey PRIMARY KEY (cd_val_id),
  CONSTRAINT std_cd_val_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_cd_val_std_cd_id_fkey FOREIGN KEY (cd_id) REFERENCES std_cd (cd_id),
  CONSTRAINT std_cd_val_use_yn_check CHECK (use_yn IN ('Y','N')),
  CONSTRAINT std_cd_val_del_yn_check CHECK (del_yn IN ('Y','N'))
);
COMMENT ON TABLE std_cd_val IS '표준코드값 — 1행 = 코드값 1개(코드 안 유일)';
CREATE UNIQUE INDEX IF NOT EXISTS ux_std_cd_val_cd_val_actv ON std_cd_val (cd_id, cd_val) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_std_cd_val_cd_sort ON std_cd_val (cd_id, sort_seq) WHERE del_yn = 'N';

SELECT fn_add_mod_dtm_trg(t), fn_grant_svc_only('TABLE', t) FROM unnest(ARRAY['std_cd', 'std_cd_val']) AS t;

COMMIT;
