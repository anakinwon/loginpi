-- 008_seminar_meet_ext.sql — 회의 확장 기능 10종 기반 테이블 한 번에(계획 A-8) : 회의록·조각, 설문·선택지·투표, Q&A·추천, 출석, 음성 처리 사용량, 동의 기록
--   + 음성 조각 사용 판정 함수 fn_use_smn_vc(R-P5 — 대상 행 잠금 아래 권한·동의·분당 요청·분당 초·참가자 1인 상한·누적 상한)·정산 함수 fn_add_smn_vc_sec + Q&A 추천건수 동기화 트리거
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-27) — 접두사 smn_(004 신설) 테이블 10개·함수 3개 신규, 기존 테이블 무변경. 신규 표준단어 17개(아래), DA 사후 리뷰 대상
-- 선행 : 004·005·006·007. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod — 통합 단계에서(작성 시점 미적용)
--
-- 명명 점검(2026-10-27) : 이 실행 환경에 Agent 도구가 없어 da-standards 에이전트를 부르지 못했다 → 그 정의서(.claude/agents/da-standards.md)
--   체크리스트(정본 §1~§6) + 행안부 공통표준단어(docs/da/references/02.01, 20251101) 동음이의 대조 + da-ddl-guard 훅으로 대행 점검. 통합 때 DA 재검증 필요
--   → 메인 세션이 da-standards(명명·표준단어)·legal-compliance-advisor(/privacy 문안) 실제 검증을 마치기 전까지 이 파일 DB 미적용·/privacy 링크 미노출 유지
-- 신규 표준단어(정본 §1-1 v2.3 '자음 위주 2~3자' — 아소카 결정(마스터 위임), DA 사후 리뷰 시 §9 등재) :
--  · 회의록 NT  (note)                · 조각   SEG (segment)
--  · 화자   SPK (speaker, 행안부 발언자 SPKR)
--  · 설문   PLL (poll, 행안부 SRVY — POL=선적항·SVY=측량 동음 회피)
--  · 선택지 OPT (option)              · 투표   VT  (vote, 행안부 VOTE)
--  · 질문   QST (question, 행안부 QSTN — 설문 문항·Q&A 질문 공용)
--  · 질의응답 QNA (행안부 일치)       · 답변   ANS (행안부 일치)
--  · 추천   RCM (recommend, 행안부 RCMDTN)
--  · 출석   ATD (attendance, 행안부 참석자 ATD 와 같은 뜻 계열)
--  · 하트비트 HB (heartbeat)          · 음성   VC  (voice, 행안부 VOICE)
--  · 초     SEC (second)              · 동의   AGR (agree, 행안부 AGRE)
--  · 요청   REQ (request)  ⚠ 행안부 '소요'=REQ 동음 — 사후 리뷰 대상(004 ENT 선례와 같은 처리)
--  · 요약   SMR (summary, 행안부 SMRY)
--  기존 그대로 승계 : smn·ptc·ent·usr·start·end·del·lst(lst_lgn_dtm)·lang(lang_cd)·img(img_url)·ver·use·key(도메인)·cont(도메인)
--
-- 설계(계획서 .claude/plans/pasted-content-id-66a2-eager-clock.md A-1·A-5·A-6·A-8) :
--  · 회의록 smn_nt — 세미나 AI 회의록(smn_id)과 대면 노트(smn_id NULL, SubAgent2)를 같은 테이블로. 요약은 종료 시 1회(smr_val JSONB)
--  · 회의록 조각 smn_nt_seg — 5초 음성 조각 텍스트 1건 또는 스크린샷 1장. 화자명은 발화 시점 표시명 스냅샷
--    REA 근거 : Jitsi 자막 결과 메시지 = message_id·participant{id,name}·timestamp·transcript[0].text·language → 화자ID·화자명·내용·시각·언어 칼럼
--    (docs/rea/evidence/REA_04/aidb-rea-usage.json Q1)
--  · 설문 smn_pll·선택지 smn_pll_opt·투표 smn_pll_vt — 1인 1표(부분 유일 인덱스), 다시 투표 = 같은 행 opt_id UPDATE
--    REA 근거 : Jitsi 는 문항·선택지 500자, 선택지 2~255, 'Change vote'(haveVoted = lastVote 1개) — aidb Q3·jitsi-04 Q4. 우리는 선택지 2~10(화면 단순)
--  · Q&A smn_qna·추천 smn_qna_rcm — 1인 1추천(부분 유일 인덱스), 추천건수는 트리거가 원자 갱신(정렬·페이지네이션을 서버 인덱스로)
--  · 출석 smn_atd — 사용자당 세미나 1행 : 입장일시(첫 입장권) + 최종하트비트일시(60초). 재입장은 같은 행
--    REA 근거 : Jitsi 는 출석부 없이 서버 speakerstats(발언 시간)만 — 출석 모델은 우리 설계(aidb Q4)
--  · 음성 처리 사용량 smn_vc_use — (대상 × 사용자 × 분) 1행 : 요청건수·음성초건수. 대상 누적 초 = SUM, 분당 요청 = 현재 분 행
--    대상 = 세미나(smn_id) 또는 대면 노트(nt_id) 중 정확히 하나. 세미나 안 AI 회의록은 smn_id 로만 센다
--  · 동의 smn_agr — 사용자·대상·동의유형 활성 1행. 철회 = 논리삭제. 동의 당시 처리방침 버전을 남긴다
--    REA 근거 : Jitsi 녹화 동의(recordings.requireConsent)는 클라이언트 설정값일 뿐 서버 기록이 없고 meet.jit.si 는 false(aidb Q2) → 우리는 DB 기록(M-4 더 엄격)
--  · 물리 DELETE 금지 — 전 테이블 del_yn·del_dtm. FK 유지(PostgREST 임베디드 조인, 루트 CLAUDE.md FK 정책)
BEGIN;

-- ------------------------------------------------------------
-- 1. smn_nt — 회의록(세미나 AI 회의록 + 대면 노트)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_nt (
  nt_id         UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 회의록ID
  smn_id        UUID,                                                     -- 세미나ID → smn_mst.smn_id (NULL = 대면 노트)
  usr_id        UUID          NOT NULL,                                   -- 기록 시작 사용자ID → sys_user.usr_id
  nt_nm         VARCHAR(100)  NOT NULL,                                   -- 회의록명
  start_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 시작일시
  end_dtm       TIMESTAMPTZ,                                              -- 종료일시
  nt_sts_cd     VARCHAR(20)   NOT NULL DEFAULT 'RECORDING',               -- 회의록상태코드 : RECORDING → SUMMARIZING → DONE | FAILED
  smr_val       JSONB,                                                    -- 요약값 {points[], decisions[], todos[]}
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_nt PRIMARY KEY (nt_id),
  CONSTRAINT smn_nt_smn_mst_id_fkey FOREIGN KEY (smn_id) REFERENCES smn_mst (smn_id),
  CONSTRAINT smn_nt_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_nt_nt_nm_check CHECK (length(btrim(nt_nm)) > 0),
  CONSTRAINT smn_nt_nt_sts_cd_check CHECK (nt_sts_cd IN ('RECORDING', 'SUMMARIZING', 'DONE', 'FAILED')),
  CONSTRAINT smn_nt_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_nt IS '회의록 — 세미나 AI 회의록(smn_id) 또는 대면 노트(smn_id NULL). 발표자만 시작(M-4), 종료 시 요약 1회';
COMMENT ON COLUMN smn_nt.nt_id IS '회의록ID';
COMMENT ON COLUMN smn_nt.smn_id IS '세미나ID(smn_mst) — NULL = 대면 노트(화상 없이 마이크만)';
COMMENT ON COLUMN smn_nt.usr_id IS '기록 시작 사용자ID(sys_user) — 세미나 = 발표자, 대면 노트 = ADMIN';
COMMENT ON COLUMN smn_nt.nt_nm IS '회의록명(기본 = 세미나명 또는 대면 노트 일시)';
COMMENT ON COLUMN smn_nt.start_dtm IS '시작일시';
COMMENT ON COLUMN smn_nt.end_dtm IS '종료일시';
COMMENT ON COLUMN smn_nt.nt_sts_cd IS '회의록상태코드 RECORDING·SUMMARIZING·DONE·FAILED';
COMMENT ON COLUMN smn_nt.smr_val IS '요약값 JSONB {points[], decisions[], todos[]} — 외부 AI 요약 결과(국외 이전 항목, /privacy)';

CREATE INDEX IF NOT EXISTS x_smn_nt_01 ON smn_nt (smn_id, start_dtm DESC) WHERE del_yn = 'N' AND smn_id IS NOT NULL;
COMMENT ON INDEX x_smn_nt_01 IS '목록 — 세미나별 회의록(시작일시 역순)';
CREATE INDEX IF NOT EXISTS x_smn_nt_02 ON smn_nt (usr_id, start_dtm DESC) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_nt_02 IS '목록 — 내 회의록·최근 노트(사용자별 시작일시 역순, 10개 단위 페이지)';

-- ------------------------------------------------------------
-- 2. smn_nt_seg — 회의록 조각(발화 텍스트 1건 또는 스크린샷 1장)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_nt_seg (
  seg_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 조각ID
  nt_id         UUID          NOT NULL,                                   -- 회의록ID → smn_nt.nt_id
  spk_usr_id    UUID,                                                     -- 화자 사용자ID → sys_user.usr_id (스크린샷 = 올린 사람)
  spk_nm        VARCHAR(100)  NOT NULL DEFAULT '',                        -- 화자명(발화 시점 표시명 스냅샷)
  seg_cont      TEXT,                                                     -- 조각내용(발화 텍스트)
  lang_cd       VARCHAR(16),                                              -- 언어코드(감지 언어, BCP-47)
  img_key       TEXT,                                                     -- 이미지키(Storage 비공개 버킷 smn-note 객체 경로)
  seg_dtm       TIMESTAMPTZ   NOT NULL,                                   -- 조각일시(발화 시작 시각)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_nt_seg PRIMARY KEY (seg_id),
  CONSTRAINT smn_nt_seg_smn_nt_id_fkey FOREIGN KEY (nt_id) REFERENCES smn_nt (nt_id),
  CONSTRAINT smn_nt_seg_sys_user_id_fkey FOREIGN KEY (spk_usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_nt_seg_seg_cont_check CHECK (seg_cont IS NOT NULL OR img_key IS NOT NULL),
  CONSTRAINT smn_nt_seg_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_nt_seg IS '회의록 조각 — 5초 음성 조각 텍스트 또는 화면공유 스크린샷(분당 최대 2장, SubAgent7). 내용·이미지 중 하나 이상';
COMMENT ON COLUMN smn_nt_seg.seg_id IS '조각ID';
COMMENT ON COLUMN smn_nt_seg.nt_id IS '회의록ID(smn_nt)';
COMMENT ON COLUMN smn_nt_seg.spk_usr_id IS '화자 사용자ID(sys_user)';
COMMENT ON COLUMN smn_nt_seg.spk_nm IS '화자명 — 발화 시점 표시명 스냅샷(이후 이름 변경과 무관)';
COMMENT ON COLUMN smn_nt_seg.seg_cont IS '조각내용 — 음성→글 결과(국외 이전 항목)';
COMMENT ON COLUMN smn_nt_seg.lang_cd IS '언어코드 — 감지된 발화 언어(BCP-47)';
COMMENT ON COLUMN smn_nt_seg.img_key IS '이미지키 — Storage 비공개 버킷 smn-note 객체 경로(공개 URL 저장 금지, 서명 URL 로만 노출)';
COMMENT ON COLUMN smn_nt_seg.seg_dtm IS '조각일시 — 발화(조각) 시작 시각';

CREATE INDEX IF NOT EXISTS x_smn_nt_seg_01 ON smn_nt_seg (nt_id, seg_dtm) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_nt_seg_01 IS '조회 — 회의록별 조각 시각 순(회의록 화면·요약 입력)';

-- ------------------------------------------------------------
-- 3. smn_pll — 설문
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_pll (
  pll_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 설문ID
  smn_id        UUID          NOT NULL,                                   -- 세미나ID → smn_mst.smn_id
  qst_cont      VARCHAR(500)  NOT NULL,                                   -- 질문내용(설문 문항)
  pll_sts_cd    VARCHAR(20)   NOT NULL DEFAULT 'OPEN',                    -- 설문상태코드 : OPEN → CLOSED
  end_dtm       TIMESTAMPTZ,                                              -- 종료일시(마감)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID(= 만든 발표자 usr_id)
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_pll PRIMARY KEY (pll_id),
  CONSTRAINT smn_pll_smn_mst_id_fkey FOREIGN KEY (smn_id) REFERENCES smn_mst (smn_id),
  CONSTRAINT smn_pll_qst_cont_check CHECK (length(btrim(qst_cont)) > 0),
  CONSTRAINT smn_pll_pll_sts_cd_check CHECK (pll_sts_cd IN ('OPEN', 'CLOSED')),
  CONSTRAINT smn_pll_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_pll IS '설문 — 발표자 생성, 1인 1표(smn_pll_vt). 변경 후 엔진 app.send{refresh}';
COMMENT ON COLUMN smn_pll.pll_id IS '설문ID';
COMMENT ON COLUMN smn_pll.smn_id IS '세미나ID(smn_mst)';
COMMENT ON COLUMN smn_pll.qst_cont IS '질문내용 — 설문 문항(500자 이하)';
COMMENT ON COLUMN smn_pll.pll_sts_cd IS '설문상태코드 OPEN·CLOSED';
COMMENT ON COLUMN smn_pll.end_dtm IS '종료일시 — 마감 시각';

CREATE INDEX IF NOT EXISTS x_smn_pll_01 ON smn_pll (smn_id, reg_dtm DESC) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_pll_01 IS '목록 — 세미나별 설문(최신 순, 늦게 들어온 사람도 이력 조회)';

-- ------------------------------------------------------------
-- 4. smn_pll_opt — 설문 선택지
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_pll_opt (
  opt_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 선택지ID
  pll_id        UUID          NOT NULL,                                   -- 설문ID → smn_pll.pll_id
  opt_seq       INT           NOT NULL,                                   -- 선택지순번(1~10)
  opt_cont      VARCHAR(200)  NOT NULL,                                   -- 선택지내용
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_pll_opt PRIMARY KEY (opt_id),
  CONSTRAINT smn_pll_opt_smn_pll_id_fkey FOREIGN KEY (pll_id) REFERENCES smn_pll (pll_id),
  CONSTRAINT smn_pll_opt_opt_seq_check CHECK (opt_seq BETWEEN 1 AND 10),
  CONSTRAINT smn_pll_opt_opt_cont_check CHECK (length(btrim(opt_cont)) > 0),
  CONSTRAINT smn_pll_opt_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_pll_opt IS '설문 선택지 — 설문당 2~10개(최소 2개·내용 중복은 API 가 검증)';
COMMENT ON COLUMN smn_pll_opt.opt_id IS '선택지ID';
COMMENT ON COLUMN smn_pll_opt.pll_id IS '설문ID(smn_pll)';
COMMENT ON COLUMN smn_pll_opt.opt_seq IS '선택지순번 1~10(표시 순서)';
COMMENT ON COLUMN smn_pll_opt.opt_cont IS '선택지내용(200자 이하)';

CREATE UNIQUE INDEX IF NOT EXISTS x_smn_pll_opt_01 ON smn_pll_opt (pll_id, opt_seq) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_pll_opt_01 IS '유일 — 설문·순번 활성 1건(선택지 목록 순서 조회 겸용)';

-- ------------------------------------------------------------
-- 5. smn_pll_vt — 설문 투표(1인 1표)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_pll_vt (
  vt_id         UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 투표ID
  pll_id        UUID          NOT NULL,                                   -- 설문ID → smn_pll.pll_id
  opt_id        UUID          NOT NULL,                                   -- 선택지ID → smn_pll_opt.opt_id
  usr_id        UUID          NOT NULL,                                   -- 투표 사용자ID → sys_user.usr_id
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시(= 다시 투표 일시)
  CONSTRAINT pk_smn_pll_vt PRIMARY KEY (vt_id),
  CONSTRAINT smn_pll_vt_smn_pll_id_fkey FOREIGN KEY (pll_id) REFERENCES smn_pll (pll_id),
  CONSTRAINT smn_pll_vt_smn_pll_opt_id_fkey FOREIGN KEY (opt_id) REFERENCES smn_pll_opt (opt_id),
  CONSTRAINT smn_pll_vt_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_pll_vt_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_pll_vt IS '설문 투표 — 1인 1표(x_smn_pll_vt_01). 다시 투표 = 같은 행 opt_id UPDATE. 유일 제약이 부분 인덱스(WHERE del_yn=N)라 PostgREST upsert(onConflict) 불가(42P10) — SQL 함수에서 ON CONFLICT (pll_id, usr_id) WHERE del_yn = ''N'' DO UPDATE(fn_use_smn_vc 방식) 또는 INSERT 후 23505 면 UPDATE. opt_id 가 같은 설문 것인지는 API 가 확인';
COMMENT ON COLUMN smn_pll_vt.vt_id IS '투표ID';
COMMENT ON COLUMN smn_pll_vt.pll_id IS '설문ID(smn_pll)';
COMMENT ON COLUMN smn_pll_vt.opt_id IS '선택지ID(smn_pll_opt)';
COMMENT ON COLUMN smn_pll_vt.usr_id IS '투표 사용자ID(sys_user)';

CREATE UNIQUE INDEX IF NOT EXISTS x_smn_pll_vt_01 ON smn_pll_vt (pll_id, usr_id) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_pll_vt_01 IS '유일 — 설문·사용자 활성 1표(1인 1표, 설문별 집계 겸용)';

-- ------------------------------------------------------------
-- 6. smn_qna — Q&A 질문
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_qna (
  qna_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 질의응답ID
  smn_id        UUID          NOT NULL,                                   -- 세미나ID → smn_mst.smn_id
  usr_id        UUID          NOT NULL,                                   -- 질문 사용자ID → sys_user.usr_id
  qst_cont      VARCHAR(500)  NOT NULL,                                   -- 질문내용
  rcm_cnt       INT           NOT NULL DEFAULT 0,                         -- 추천건수(트리거 동기화)
  ans_dtm       TIMESTAMPTZ,                                              -- 답변일시(발표자 '답변함' 표시, NULL = 미답변)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_qna PRIMARY KEY (qna_id),
  CONSTRAINT smn_qna_smn_mst_id_fkey FOREIGN KEY (smn_id) REFERENCES smn_mst (smn_id),
  CONSTRAINT smn_qna_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_qna_qst_cont_check CHECK (length(btrim(qst_cont)) > 0),
  CONSTRAINT smn_qna_rcm_cnt_check CHECK (rcm_cnt >= 0),
  CONSTRAINT smn_qna_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_qna IS 'Q&A 질문 — 참가자 질문, 추천 많은 순 정렬(rcm_cnt), 발표자 답변 표시(ans_dtm)';
COMMENT ON COLUMN smn_qna.qna_id IS '질의응답ID';
COMMENT ON COLUMN smn_qna.smn_id IS '세미나ID(smn_mst)';
COMMENT ON COLUMN smn_qna.usr_id IS '질문 사용자ID(sys_user)';
COMMENT ON COLUMN smn_qna.qst_cont IS '질문내용(500자 이하)';
COMMENT ON COLUMN smn_qna.rcm_cnt IS '추천건수 — smn_qna_rcm 활성 행 수, 트리거 fn_sync_smn_qna_rcm_cnt 가 원자 갱신(직접 UPDATE 금지)';
COMMENT ON COLUMN smn_qna.ans_dtm IS '답변일시 — NULL = 미답변';

CREATE INDEX IF NOT EXISTS x_smn_qna_01 ON smn_qna (smn_id, rcm_cnt DESC, reg_dtm) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_qna_01 IS '목록 — 세미나별 추천 많은 순·오래된 순(서버 페이지네이션)';

-- ------------------------------------------------------------
-- 7. smn_qna_rcm — Q&A 추천(1인 1추천)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_qna_rcm (
  rcm_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 추천ID
  qna_id        UUID          NOT NULL,                                   -- 질의응답ID → smn_qna.qna_id
  usr_id        UUID          NOT NULL,                                   -- 추천 사용자ID → sys_user.usr_id
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부(= 추천 취소)
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_qna_rcm PRIMARY KEY (rcm_id),
  CONSTRAINT smn_qna_rcm_smn_qna_id_fkey FOREIGN KEY (qna_id) REFERENCES smn_qna (qna_id),
  CONSTRAINT smn_qna_rcm_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_qna_rcm_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_qna_rcm IS 'Q&A 추천 — 1인 1추천(x_smn_qna_rcm_01). 취소 = 논리삭제, 다시 추천 = 새 행';
COMMENT ON COLUMN smn_qna_rcm.rcm_id IS '추천ID';
COMMENT ON COLUMN smn_qna_rcm.qna_id IS '질의응답ID(smn_qna)';
COMMENT ON COLUMN smn_qna_rcm.usr_id IS '추천 사용자ID(sys_user)';

CREATE UNIQUE INDEX IF NOT EXISTS x_smn_qna_rcm_01 ON smn_qna_rcm (qna_id, usr_id) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_qna_rcm_01 IS '유일 — 질문·사용자 활성 1추천';

-- ------------------------------------------------------------
-- 8. smn_atd — 출석
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_atd (
  atd_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 출석ID
  smn_id        UUID          NOT NULL,                                   -- 세미나ID → smn_mst.smn_id
  usr_id        UUID          NOT NULL,                                   -- 출석 사용자ID → sys_user.usr_id
  ent_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 입장일시(첫 입장권 발급)
  lst_hb_dtm    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 최종하트비트일시(60초 간격)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_atd PRIMARY KEY (atd_id),
  CONSTRAINT smn_atd_smn_mst_id_fkey FOREIGN KEY (smn_id) REFERENCES smn_mst (smn_id),
  CONSTRAINT smn_atd_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_atd_lst_hb_dtm_check CHECK (lst_hb_dtm >= ent_dtm),
  CONSTRAINT smn_atd_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_atd IS '출석 — 사용자당 세미나 1행. 입장 = 첫 입장 보존(유일 제약이 부분 인덱스라 PostgREST upsert 불가 — INSERT 후 23505 면 무시, 또는 SQL 함수에서 ON CONFLICT (smn_id, usr_id) WHERE del_yn = ''N'' DO NOTHING), 하트비트 = lst_hb_dtm 만 갱신. 개최자 목록·CSV';
COMMENT ON COLUMN smn_atd.atd_id IS '출석ID';
COMMENT ON COLUMN smn_atd.smn_id IS '세미나ID(smn_mst)';
COMMENT ON COLUMN smn_atd.usr_id IS '출석 사용자ID(sys_user)';
COMMENT ON COLUMN smn_atd.ent_dtm IS '입장일시 — 첫 입장권 발급 시각';
COMMENT ON COLUMN smn_atd.lst_hb_dtm IS '최종하트비트일시 — 마지막으로 접속이 확인된 시각(60초 간격)';

CREATE UNIQUE INDEX IF NOT EXISTS x_smn_atd_01 ON smn_atd (smn_id, usr_id) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_atd_01 IS '유일 — 세미나·사용자 활성 출석 1행(출석부 목록 겸용)';

-- ------------------------------------------------------------
-- 9. smn_vc_use — 음성 처리 사용량(대상 × 사용자 × 분)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_vc_use (
  use_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 사용ID
  smn_id        UUID,                                                     -- 세미나ID → smn_mst.smn_id
  nt_id         UUID,                                                     -- 회의록ID → smn_nt.nt_id (대면 노트만)
  usr_id        UUID          NOT NULL,                                   -- 사용자ID → sys_user.usr_id
  use_dtm       TIMESTAMPTZ   NOT NULL,                                   -- 사용일시(분 단위로 자른 시각 = 버킷)
  req_cnt       INT           NOT NULL DEFAULT 0,                         -- 요청건수(그 분의 음성 조각 요청 수)
  vc_sec_cnt    INT           NOT NULL DEFAULT 0,                         -- 음성초건수(그 분에 처리한 음성 길이, 초)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_vc_use PRIMARY KEY (use_id),
  CONSTRAINT smn_vc_use_smn_mst_id_fkey FOREIGN KEY (smn_id) REFERENCES smn_mst (smn_id),
  CONSTRAINT smn_vc_use_smn_nt_id_fkey FOREIGN KEY (nt_id) REFERENCES smn_nt (nt_id),
  CONSTRAINT smn_vc_use_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_vc_use_smn_id_check CHECK ((smn_id IS NULL) <> (nt_id IS NULL)),
  CONSTRAINT smn_vc_use_req_cnt_check CHECK (req_cnt >= 0),
  CONSTRAINT smn_vc_use_vc_sec_cnt_check CHECK (vc_sec_cnt >= 0),
  CONSTRAINT smn_vc_use_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_vc_use IS '음성 처리 사용량 — (세미나 또는 대면 노트) × 사용자 × 분 1행. 누적 상한 = 대상 SUM(vc_sec_cnt) vs SPEECH_MAX_MIN, 분당 요청 = 현재 분 req_cnt. fn_use_smn_vc 만 쓴다';
COMMENT ON COLUMN smn_vc_use.use_id IS '사용ID';
COMMENT ON COLUMN smn_vc_use.smn_id IS '세미나ID(smn_mst) — nt_id 와 정확히 하나만';
COMMENT ON COLUMN smn_vc_use.nt_id IS '회의록ID(smn_nt) — 대면 노트(세미나 없음)만';
COMMENT ON COLUMN smn_vc_use.usr_id IS '사용자ID(sys_user) — 음성을 보낸 사람';
COMMENT ON COLUMN smn_vc_use.use_dtm IS '사용일시 — date_trunc(minute) 버킷';
COMMENT ON COLUMN smn_vc_use.req_cnt IS '요청건수 — 그 분의 음성 조각 요청 수(분당 상한 판정)';
COMMENT ON COLUMN smn_vc_use.vc_sec_cnt IS '음성초건수 — 그 분에 처리한 음성 길이(초, 올림)';

CREATE UNIQUE INDEX IF NOT EXISTS x_smn_vc_use_01 ON smn_vc_use (smn_id, usr_id, use_dtm) WHERE smn_id IS NOT NULL;
COMMENT ON INDEX x_smn_vc_use_01 IS '유일 — 세미나·사용자·분 1행(세미나별 누적 SUM 겸용)';
CREATE UNIQUE INDEX IF NOT EXISTS x_smn_vc_use_02 ON smn_vc_use (nt_id, usr_id, use_dtm) WHERE nt_id IS NOT NULL;
COMMENT ON INDEX x_smn_vc_use_02 IS '유일 — 대면 노트·사용자·분 1행(노트별 누적 SUM 겸용)';

-- ------------------------------------------------------------
-- 10. smn_agr — 동의 기록
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_agr (
  agr_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 동의ID
  usr_id        UUID          NOT NULL,                                   -- 동의 사용자ID → sys_user.usr_id
  smn_id        UUID,                                                     -- 세미나ID → smn_mst.smn_id
  nt_id         UUID,                                                     -- 회의록ID → smn_nt.nt_id (대면 노트만)
  agr_tp_cd     VARCHAR(20)   NOT NULL,                                   -- 동의유형코드 : SPEECH_XFER(음성 처리·국외 이전) · NOTE_NOTICE(대면 노트 참석자 고지 확인)
  agr_ver_cd    VARCHAR(20)   NOT NULL,                                   -- 동의버전코드(동의 시점 /privacy 문안 버전, 예 2026-10-27)
  agr_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 동의일시
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부(= 동의 철회)
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시(= 철회일시)
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_agr PRIMARY KEY (agr_id),
  CONSTRAINT smn_agr_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_agr_smn_mst_id_fkey FOREIGN KEY (smn_id) REFERENCES smn_mst (smn_id),
  CONSTRAINT smn_agr_smn_nt_id_fkey FOREIGN KEY (nt_id) REFERENCES smn_nt (nt_id),
  CONSTRAINT smn_agr_smn_id_check CHECK ((smn_id IS NULL) <> (nt_id IS NULL)),
  CONSTRAINT smn_agr_agr_tp_cd_check CHECK (agr_tp_cd IN ('SPEECH_XFER', 'NOTE_NOTICE')),
  CONSTRAINT smn_agr_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_agr IS '동의 기록 — 말하는 역할(발표자·무대 승격)이 마이크 켜기 전 1회(A-6). 청중은 마이크가 없어 고지만. 철회 = 논리삭제';
COMMENT ON COLUMN smn_agr.agr_id IS '동의ID';
COMMENT ON COLUMN smn_agr.usr_id IS '동의 사용자ID(sys_user)';
COMMENT ON COLUMN smn_agr.smn_id IS '세미나ID(smn_mst) — nt_id 와 정확히 하나만';
COMMENT ON COLUMN smn_agr.nt_id IS '회의록ID(smn_nt) — 대면 노트만';
COMMENT ON COLUMN smn_agr.agr_tp_cd IS '동의유형코드 SPEECH_XFER(음성 처리·국외 이전 동의)·NOTE_NOTICE(대면 노트 참석자 고지 확인)';
COMMENT ON COLUMN smn_agr.agr_ver_cd IS '동의버전코드 — 동의 시점 /privacy 문안 버전(src/lib/speech-rules.ts PRIVACY_VER)';
COMMENT ON COLUMN smn_agr.agr_dtm IS '동의일시';

CREATE UNIQUE INDEX IF NOT EXISTS x_smn_agr_01 ON smn_agr (smn_id, usr_id, agr_tp_cd) WHERE del_yn = 'N' AND smn_id IS NOT NULL;
COMMENT ON INDEX x_smn_agr_01 IS '유일 — 세미나·사용자·동의유형 활성 1건(음성 조각마다 동의 확인)';
CREATE UNIQUE INDEX IF NOT EXISTS x_smn_agr_02 ON smn_agr (nt_id, usr_id, agr_tp_cd) WHERE del_yn = 'N' AND nt_id IS NOT NULL;
COMMENT ON INDEX x_smn_agr_02 IS '유일 — 대면 노트·사용자·동의유형 활성 1건';

-- ------------------------------------------------------------
-- 11. mod_dtm 자동 갱신 트리거 — 테이블 10개(이름 규칙 §6 : fn_upd_<테이블>_mod_dtm · trg_<테이블>_mod_dtm)
-- ------------------------------------------------------------
-- 바깥 구분자를 $do$ 로 — 안쪽 '$b$ $f$' 가 이어 붙으면 '$$' 가 생겨 DO 블록이 끊긴다(PGlite 적용 시험에서 확인)
DO $do$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['smn_nt', 'smn_nt_seg', 'smn_pll', 'smn_pll_opt', 'smn_pll_vt',
                           'smn_qna', 'smn_qna_rcm', 'smn_atd', 'smn_vc_use', 'smn_agr'] LOOP
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION %I() RETURNS TRIGGER LANGUAGE plpgsql AS $b$
      BEGIN
        NEW.mod_dtm := CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $b$ $f$, 'fn_upd_' || t || '_mod_dtm');
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_mod_dtm', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION %I()',
                   'trg_' || t || '_mod_dtm', t, 'fn_upd_' || t || '_mod_dtm');
  END LOOP;
END;
$do$;

-- ------------------------------------------------------------
-- 12. fn_sync_smn_qna_rcm_cnt — 추천 추가·취소·재추천 시 smn_qna.rcm_cnt ±1(원자 UPDATE, R-P5 — 읽고 쓰기 경합 없음)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_smn_qna_rcm_cnt()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_d INT := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_d := CASE WHEN NEW.del_yn = 'N' THEN 1 ELSE 0 END;
  ELSIF NEW.del_yn IS DISTINCT FROM OLD.del_yn THEN
    v_d := CASE WHEN NEW.del_yn = 'N' THEN 1 ELSE -1 END;
  END IF;
  IF v_d <> 0 THEN
    UPDATE smn_qna q SET rcm_cnt = GREATEST(q.rcm_cnt + v_d, 0) WHERE q.qna_id = NEW.qna_id;
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION fn_sync_smn_qna_rcm_cnt() IS 'smn_qna_rcm INSERT·del_yn 변경 → smn_qna.rcm_cnt ±1(원자 UPDATE)';
DROP TRIGGER IF EXISTS trg_smn_qna_rcm_cnt ON smn_qna_rcm;
CREATE TRIGGER trg_smn_qna_rcm_cnt
  AFTER INSERT OR UPDATE OF del_yn ON smn_qna_rcm
  FOR EACH ROW EXECUTE FUNCTION fn_sync_smn_qna_rcm_cnt();

-- ------------------------------------------------------------
-- 13. fn_use_smn_vc — 음성 조각 1건 사용 판정 + 사용량 기록(R-P5 : 대상 행 FOR UPDATE 아래 권한·동의·분당 요청·누적 상한을 한 번에, 왕복 1회 R-P1·P2)
--     대상 = p_smn_id(세미나) 또는 p_nt_id(대면 노트) 중 정확히 하나
--     반환 : OK · INVALID(인자) · NOT_FOUND · NOT_LIVE(세미나 LIVE 아님 / 노트 RECORDING 아님) · FORBIDDEN · NO_AGR(동의 없음)
--            · RATE(그 분 요청 p_max_req 또는 음성 초 p_max_min_sec 초과) · QUOTA(대상 누적 p_max_sec 또는 참가자 1인 누적 p_max_usr_sec 초과)
--     세미나 권한 = 개최자 · ADMIN(발표자 입장권은 ADMIN 만, D-1) · 활성 참가 등록자(무대 승격 패널 — 승격 여부는 엔진 메모리라 DB 로 확인 불가)
--       → 개최자·ADMIN 이 아닌 참가자는 1인 누적 상한 p_max_usr_sec(앱 기본 = 전체의 1/4)로 묶는다 : 청중 1명이 세미나 상한을 다 써 발표자 자막이 끊기지 않게
--     대면 노트 권한 = 노트 시작자 본인(ADMIN 확인은 API)
--     p_sec = 앱의 과금 초(max(신고 길이, 128kbps 바이트 길이)). 호출 후 실제 음성이 더 길면 fn_add_smn_vc_sec 로 차이를 더 올린다
--     기록은 외부 AI 호출 '전' — 호출이 실패해도 사용량에 남는다(비용 상한을 보수적으로)
--     ponytail: 고정 1분 창이라 분 경계에서 순간 최대 2배 허용, 정확한 슬라이딩 창이 필요하면 요청 시각 로그 테이블로
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_use_smn_vc(
  p_smn_id UUID, p_nt_id UUID, p_usr_id UUID, p_sec INT, p_max_sec INT, p_max_req INT,
  p_max_min_sec INT, p_max_usr_sec INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_smn smn_mst%ROWTYPE;
  v_nt smn_nt%ROWTYPE;
  v_min TIMESTAMPTZ := date_trunc('minute', CURRENT_TIMESTAMP);
  v_req INT;
  v_min_sec INT;
  v_sum BIGINT;
  v_usr_sum BIGINT;
  v_ptc BOOLEAN := FALSE;
BEGIN
  IF (p_smn_id IS NULL) = (p_nt_id IS NULL) OR p_usr_id IS NULL
     OR p_sec IS NULL OR p_sec < 1 OR p_max_sec IS NULL OR p_max_req IS NULL
     OR p_max_min_sec IS NULL OR p_max_usr_sec IS NULL THEN
    RETURN 'INVALID';
  END IF;

  IF p_smn_id IS NOT NULL THEN
    SELECT * INTO v_smn FROM smn_mst s WHERE s.smn_id = p_smn_id AND s.del_yn = 'N' FOR UPDATE;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    IF v_smn.smn_sts_cd <> 'LIVE' THEN RETURN 'NOT_LIVE'; END IF;
    IF v_smn.hst_usr_id <> p_usr_id
       AND NOT EXISTS (SELECT 1 FROM sys_user u WHERE u.usr_id = p_usr_id AND u.role_cd = 'ADMIN' AND u.del_yn = 'N') THEN
      IF NOT EXISTS (SELECT 1 FROM smn_ptc p WHERE p.smn_id = p_smn_id AND p.usr_id = p_usr_id AND p.del_yn = 'N') THEN
        RETURN 'FORBIDDEN';
      END IF;
      v_ptc := TRUE;  -- 참가자 = 1인 누적 상한 대상
    END IF;
    IF NOT EXISTS (SELECT 1 FROM smn_agr a
                    WHERE a.smn_id = p_smn_id AND a.usr_id = p_usr_id AND a.agr_tp_cd = 'SPEECH_XFER' AND a.del_yn = 'N') THEN
      RETURN 'NO_AGR';
    END IF;
    SELECT u.req_cnt, u.vc_sec_cnt INTO v_req, v_min_sec FROM smn_vc_use u
     WHERE u.smn_id = p_smn_id AND u.usr_id = p_usr_id AND u.use_dtm = v_min;
    IF COALESCE(v_req, 0) >= p_max_req OR COALESCE(v_min_sec, 0) + p_sec > p_max_min_sec THEN RETURN 'RATE'; END IF;
    SELECT COALESCE(sum(u.vc_sec_cnt), 0), COALESCE(sum(u.vc_sec_cnt) FILTER (WHERE u.usr_id = p_usr_id), 0)
      INTO v_sum, v_usr_sum FROM smn_vc_use u WHERE u.smn_id = p_smn_id;
    IF v_sum + p_sec > p_max_sec OR (v_ptc AND v_usr_sum + p_sec > p_max_usr_sec) THEN RETURN 'QUOTA'; END IF;
    INSERT INTO smn_vc_use AS u (smn_id, usr_id, use_dtm, req_cnt, vc_sec_cnt, regr_id, modr_id)
    VALUES (p_smn_id, p_usr_id, v_min, 1, p_sec, p_usr_id::TEXT, p_usr_id::TEXT)
    ON CONFLICT (smn_id, usr_id, use_dtm) WHERE smn_id IS NOT NULL
    DO UPDATE SET req_cnt = u.req_cnt + 1, vc_sec_cnt = u.vc_sec_cnt + EXCLUDED.vc_sec_cnt, modr_id = EXCLUDED.modr_id;
    RETURN 'OK';
  END IF;

  SELECT * INTO v_nt FROM smn_nt n WHERE n.nt_id = p_nt_id AND n.del_yn = 'N' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF v_nt.smn_id IS NOT NULL OR v_nt.usr_id <> p_usr_id THEN RETURN 'FORBIDDEN'; END IF;
  IF v_nt.nt_sts_cd <> 'RECORDING' THEN RETURN 'NOT_LIVE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM smn_agr a
                  WHERE a.nt_id = p_nt_id AND a.usr_id = p_usr_id AND a.agr_tp_cd = 'NOTE_NOTICE' AND a.del_yn = 'N') THEN
    RETURN 'NO_AGR';
  END IF;
  SELECT u.req_cnt, u.vc_sec_cnt INTO v_req, v_min_sec FROM smn_vc_use u
   WHERE u.nt_id = p_nt_id AND u.usr_id = p_usr_id AND u.use_dtm = v_min;
  IF COALESCE(v_req, 0) >= p_max_req OR COALESCE(v_min_sec, 0) + p_sec > p_max_min_sec THEN RETURN 'RATE'; END IF;
  SELECT COALESCE(sum(u.vc_sec_cnt), 0) INTO v_sum FROM smn_vc_use u WHERE u.nt_id = p_nt_id;
  IF v_sum + p_sec > p_max_sec THEN RETURN 'QUOTA'; END IF;
  INSERT INTO smn_vc_use AS u (nt_id, usr_id, use_dtm, req_cnt, vc_sec_cnt, regr_id, modr_id)
  VALUES (p_nt_id, p_usr_id, v_min, 1, p_sec, p_usr_id::TEXT, p_usr_id::TEXT)
  ON CONFLICT (nt_id, usr_id, use_dtm) WHERE nt_id IS NOT NULL
  DO UPDATE SET req_cnt = u.req_cnt + 1, vc_sec_cnt = u.vc_sec_cnt + EXCLUDED.vc_sec_cnt, modr_id = EXCLUDED.modr_id;
  RETURN 'OK';
END;
$$;
COMMENT ON FUNCTION fn_use_smn_vc(UUID, UUID, UUID, INT, INT, INT, INT, INT) IS '음성 조각 사용 판정+기록 — 대상 행 잠금 후 권한·동의·분당 요청·분당 초·참가자 1인 누적·대상 누적 상한. OK·INVALID·NOT_FOUND·NOT_LIVE·FORBIDDEN·NO_AGR·RATE·QUOTA';

-- fn_add_smn_vc_sec — 호출 후 정산 : 외부 AI 가 센 실제 음성 길이가 과금 초보다 길 때 그 차이(초)를 현재 분 행에 더한다(요청건수는 그대로).
--   판정 없음(이미 쓴 비용의 기록) — 다음 조각부터 fn_use_smn_vc 의 RATE·QUOTA 에 반영. /api/speech/chunk 만 부른다
CREATE OR REPLACE FUNCTION fn_add_smn_vc_sec(p_smn_id UUID, p_nt_id UUID, p_usr_id UUID, p_sec INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_min TIMESTAMPTZ := date_trunc('minute', CURRENT_TIMESTAMP);
BEGIN
  IF (p_smn_id IS NULL) = (p_nt_id IS NULL) OR p_usr_id IS NULL OR p_sec IS NULL OR p_sec < 1 THEN
    RETURN;
  END IF;
  IF p_smn_id IS NOT NULL THEN
    INSERT INTO smn_vc_use AS u (smn_id, usr_id, use_dtm, req_cnt, vc_sec_cnt, regr_id, modr_id)
    VALUES (p_smn_id, p_usr_id, v_min, 0, p_sec, p_usr_id::TEXT, p_usr_id::TEXT)
    ON CONFLICT (smn_id, usr_id, use_dtm) WHERE smn_id IS NOT NULL
    DO UPDATE SET vc_sec_cnt = u.vc_sec_cnt + EXCLUDED.vc_sec_cnt, modr_id = EXCLUDED.modr_id;
  ELSE
    INSERT INTO smn_vc_use AS u (nt_id, usr_id, use_dtm, req_cnt, vc_sec_cnt, regr_id, modr_id)
    VALUES (p_nt_id, p_usr_id, v_min, 0, p_sec, p_usr_id::TEXT, p_usr_id::TEXT)
    ON CONFLICT (nt_id, usr_id, use_dtm) WHERE nt_id IS NOT NULL
    DO UPDATE SET vc_sec_cnt = u.vc_sec_cnt + EXCLUDED.vc_sec_cnt, modr_id = EXCLUDED.modr_id;
  END IF;
END;
$$;
COMMENT ON FUNCTION fn_add_smn_vc_sec(UUID, UUID, UUID, INT) IS '음성 사용량 정산 — 실제 음성 길이가 과금 초보다 길 때 차이를 현재 분 행에 가산(판정 없음)';

-- 함수 search_path = 생성 스키마 고정(004 와 같은 방식 — dev·stg·prod 가 같은 프로젝트의 다른 스키마)
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_use_smn_vc(UUID, UUID, UUID, INT, INT, INT, INT, INT) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_add_smn_vc_sec(UUID, UUID, UUID, INT) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_sync_smn_qna_rcm_cnt() SET search_path = %I, pg_temp', current_schema());
END;
$$;

-- ------------------------------------------------------------
-- 14. 권한 — 서버 전용 service_role (anon·authenticated 회수)
-- ------------------------------------------------------------
SELECT fn_grant_svc_only('TABLE', 'smn_nt');
SELECT fn_grant_svc_only('TABLE', 'smn_nt_seg');
SELECT fn_grant_svc_only('TABLE', 'smn_pll');
SELECT fn_grant_svc_only('TABLE', 'smn_pll_opt');
SELECT fn_grant_svc_only('TABLE', 'smn_pll_vt');
SELECT fn_grant_svc_only('TABLE', 'smn_qna');
SELECT fn_grant_svc_only('TABLE', 'smn_qna_rcm');
SELECT fn_grant_svc_only('TABLE', 'smn_atd');
SELECT fn_grant_svc_only('TABLE', 'smn_vc_use');
SELECT fn_grant_svc_only('TABLE', 'smn_agr');
SELECT fn_grant_svc_only('FUNCTION', 'fn_use_smn_vc(UUID, UUID, UUID, INT, INT, INT, INT, INT)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_add_smn_vc_sec(UUID, UUID, UUID, INT)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_sync_smn_qna_rcm_cnt()');

COMMIT;

-- ------------------------------------------------------------
-- 검증 (적용 후 수동 실행)
-- ------------------------------------------------------------
-- SELECT fn_use_smn_vc(NULL, NULL, '<usr_id>', 5, 7200, 20, 70, 1800);              → INVALID(대상 없음)
-- SELECT fn_use_smn_vc(gen_random_uuid(), NULL, '<usr_id>', 5, 7200, 20, 70, 1800); → NOT_FOUND
-- LIVE 세미나 + 동의 없음                                                     → NO_AGR
-- 동의 후 같은 분 21회째 또는 같은 분 누적 70초 초과                               → RATE
-- 참가자(개최자·ADMIN 아님) 1인 누적 1800초 초과 → QUOTA(개최자는 대상 누적 7200초까지)
-- SELECT fn_add_smn_vc_sec(<LIVE smn_id>, NULL, '<usr_id>', 30); → 같은 분 행 vc_sec_cnt +30, req_cnt 그대로
-- INSERT INTO smn_pll_vt 같은 (pll_id, usr_id) 활성 2건                       → 23505(x_smn_pll_vt_01)
-- INSERT INTO smn_qna_rcm 1건 → SELECT rcm_cnt FROM smn_qna                   → 1, 그 행 del_yn='Y' → 0
-- SELECT proconfig FROM pg_proc WHERE proname = 'fn_use_smn_vc';              → {search_path=<스키마>, pg_temp}
