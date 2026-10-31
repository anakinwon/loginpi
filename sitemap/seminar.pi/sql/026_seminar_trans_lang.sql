-- 026 자막 번역 언어 등록 — 청중이 보고 있는 번역 언어를 세미나별로 남겨, 발표자 음성 조각을 글로 바꿀 때 서버가 그 언어들로 **한 번에** 번역한다
--   (청중 화면의 번역 왕복 0.9초 + RTT 2회 제거 — 마스터 결정 A안 2026-10-31 "자막·더빙 아직 늦어"). 실측 : STT 단독 1.5~2.1초 vs STT+번역 2개 1.8~2.3초
-- DA-APPROVED: 아소카 결정(마스터 결정 A 2026-10-31) — 테이블 1개(smn_trans_lang) 신규, 함수 없음. 시스템 컬럼 4·del_yn/del_dtm, PK pk_·인덱스 x_ 규칙. DA 사후 리뷰 대상
-- 선행 : 008(smn_mst). 적용 : node scripts/db-migrate.mjs --app seminar --tier prod (2회 멱등)
--
-- 쓰임 : 청중 화면이 번역 자막을 켠 동안 POST /api/speech/lang 으로 4분마다 갱신(upsert) → /api/speech/chunk 가 최근 10분 안 언어 최대 5개를 읽어
--   외부 AI 음성→글 호출에 번역 대상으로 넣는다. 행은 지우지 않는다(논리삭제 규칙) — 활성 판정은 lst_req_dtm 으로만. 번역 과금은 그 조각을 말한 사람(개최자·패널) 몫
BEGIN;

CREATE TABLE IF NOT EXISTS smn_trans_lang (
  smn_id        UUID          NOT NULL,                                   -- 세미나ID → smn_mst.smn_id
  lang_cd       VARCHAR(16)   NOT NULL,                                   -- 언어코드(번역 대상, translate-rules TRANSLATE_LANGS 값)
  lst_req_dtm   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 최종요청일시(청중 화면이 4분마다 갱신 — 10분 안이면 활성)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_trans_lang PRIMARY KEY (smn_id, lang_cd),
  CONSTRAINT smn_trans_lang_smn_mst_id_fkey FOREIGN KEY (smn_id) REFERENCES smn_mst (smn_id),
  CONSTRAINT smn_trans_lang_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_trans_lang IS '자막 번역 언어 — 세미나 × 번역 대상 언어 1행. 청중 화면이 번역 자막을 켠 동안 4분마다 lst_req_dtm 갱신, 음성 조각 전사(/api/speech/chunk)가 최근 10분 안 언어(최대 5)로 서버 선번역';
COMMENT ON COLUMN smn_trans_lang.smn_id IS '세미나ID(smn_mst)';
COMMENT ON COLUMN smn_trans_lang.lang_cd IS '언어코드 — 번역 대상(TRANSLATE_LANGS, 예 en·ja·zh-TW)';
COMMENT ON COLUMN smn_trans_lang.lst_req_dtm IS '최종요청일시 — 청중 화면의 마지막 등록 시각, 10분 안이면 활성';

CREATE INDEX IF NOT EXISTS x_smn_trans_lang_01 ON smn_trans_lang (smn_id, lst_req_dtm DESC);
COMMENT ON INDEX x_smn_trans_lang_01 IS '세미나별 최근 요청 언어 조회(활성 10분·최대 5)';

SELECT fn_grant_svc_only('TABLE', 'smn_trans_lang');

COMMIT;
