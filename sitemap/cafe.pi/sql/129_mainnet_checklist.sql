-- DA-APPROVED: 메인넷 출시 체크리스트 — ops_checklist(sql/111) 동일 스키마 패턴 차용.
--   'mainnet'은 Pi Network 고유 네트워크명(고정 용어). 상태/메모 관리용 운영 테이블. (2026-06-26)
-- 정본 문서: docs/MAINNET_READINESS_CHECKLIST.md
--   시드 = 액션 중심: Part E(실행 액션) + Part C-1(Pi 직접 확인) + Part B(공식 등록 절차)
-- DA 표준: 시스템 컬럼 4개(DEFAULT 'ADMIN') + 논리삭제(del_yn/del_dtm).

CREATE TABLE IF NOT EXISTS public.mainnet_checklist (
  chk_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key  TEXT        NOT NULL UNIQUE,                 -- 안정적 항목 코드(예: E-1) — ON CONFLICT 멱등 시드용
  sect_cd   TEXT        NOT NULL,                        -- ACTION | CONFIRM | PROC
  sect_nm   TEXT        NOT NULL,
  title     TEXT        NOT NULL,
  desc_txt  TEXT,                                        -- 공식 근거/상세
  ref_txt   TEXT,                                        -- 정본 문서 참조(예: A-3 · C-1-A)
  prio_cd   TEXT        NOT NULL DEFAULT 'IMPORTANT' CHECK (prio_cd  IN ('BLOCKING','IMPORTANT','RECOMMEND')),
  owner_cd  TEXT        NOT NULL DEFAULT 'MASTER'    CHECK (owner_cd  IN ('CODE','MASTER','EXTERNAL')),
  status_cd TEXT        NOT NULL DEFAULT 'TODO'      CHECK (status_cd IN ('TODO','DOING','DONE','NA')),
  note_txt  TEXT,
  sort_ord  INTEGER     NOT NULL DEFAULT 0,
  del_yn    CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm   TIMESTAMPTZ,
  regr_id   TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id   TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mainnet_chk_sort ON public.mainnet_checklist(sort_ord) WHERE del_yn='N';

COMMENT ON TABLE public.mainnet_checklist IS '메인넷 출시 준비 체크리스트(정본: docs/MAINNET_READINESS_CHECKLIST.md)';

-- 시드 — 멱등(item_key 충돌 시 무시). 상태는 모두 TODO로 시작해 마스터가 진행에 따라 갱신.
INSERT INTO public.mainnet_checklist (item_key, sect_cd, sect_nm, title, desc_txt, ref_txt, prio_cd, owner_cd, sort_ord) VALUES
  -- ── Part E. 실행 액션 ──────────────────────────────────────────────
  ('E-1','ACTION','실행 액션','본인 Pi KYC 완료 확인','메인넷 지갑은 Pi KYC + 초대 기반 슬롯이 전제. 본인 KYC 완료 및 슬롯 확보를 확인.','B-2-1 · A-2','BLOCKING','MASTER',10),
  ('E-2','ACTION','실행 액션','A-3 상표 결정 (라이선스 또는 개명)','공식: 앱 이름은 "Pi App_Name" 형태 금지. Dev Portal의 Trademark Licensing Agreement 체결 또는 Pi 접두 개명 중 택1.','A-3 · C-1-A','BLOCKING','MASTER',20),
  ('E-3','ACTION','실행 액션','메인넷 Developer Portal 프로젝트 신규 생성','App Network=Mainnet 선택(등록 후 비가역). testnet 프로젝트와 별도로 생성.','B-2-2 · B-3','BLOCKING','MASTER',30),
  ('E-4','ACTION','실행 액션','앱 URL 확보 + 도메인 검증','validation-key.txt를 호스팅 도메인에 배치. 타 프로젝트와 검증 URL 중복 불가.','B-1-12 · B-2-3','BLOCKING','MASTER',40),
  ('E-5','ACTION','실행 액션','메인넷 API Key 발급 → Vercel PI_API_KEY','Testnet 키는 메인넷 호출 실패. 메인넷 프로젝트에서 신규 발급 후 환경변수 갱신.','B-2-4','BLOCKING','MASTER',50),
  ('E-6','ACTION','실행 액션','등록 지갑 = A2U 정산 지갑 일치','프로젝트 등록 Pioneer 지갑이 모든 메인넷 송금에 사용됨. PI_WALLET_PRIVATE_SEED와 일치 확인.','B-3','BLOCKING','MASTER',60),
  ('E-7','ACTION','실행 액션','Vercel 환경변수 + Cron 등록','필수 env(PI_SESSION_SECRET·AUTH_SECRET·CRON_SECRET 등) + Cron(settle 5분·bean-mint·구독 처리).','D-2 · D-4','IMPORTANT','MASTER',70),
  ('E-8','ACTION','실행 액션','Pi Browser 실기기 로그인·결제 검증 (P0)','핵심가치 #1·#2. 실기기에서 Pi 로그인 → 결제 COMPLETED → 세션 유지까지 확인.','D-1','BLOCKING','MASTER',80),
  ('E-9','ACTION','실행 액션','U2A 트랜잭션 1건 생태계 연결 확인','Developer Portal 체크리스트 마지막 단계: U2A 결제 1건으로 생태계 연결 확인.','B-1-13','IMPORTANT','MASTER',90),
  ('E-10','ACTION','실행 액션','등재 신청 제출','요건 A-1~A-7 충족 상태에서 Ecosystem 등재 신청 제출.','A 전체','BLOCKING','MASTER',100),
  -- ── Part C-1. Pi 직접 확인 ─────────────────────────────────────────
  ('C-A','CONFIRM','Pi 직접 확인','[상표] Pi 접두 허용·라벨 적용범위 질의','질문 (a) 라이선스로도 prefix "PiCafé" 유지 가능한가 (b) 규칙이 등록 앱 이름만인가 앱 내부 라벨까지인가 (c) Dev Portal 신청 위치·자격·수수료·기간.','C-1-A','BLOCKING','EXTERNAL',110),
  ('C-B','CONFIRM','Pi 직접 확인','[로그인] 일반브라우저 Google 경로 허용 질의','Pi Auth 주력, Google은 비-PiBrowser 웹·연동용. 등재 앱에서 Google 완전 제거 필요 여부 확인.','C-1-B','IMPORTANT','EXTERNAL',120),
  ('C-C','CONFIRM','Pi 직접 확인','[외부앱] Telegram 알림 연동 necessity 질의','Pi Browser 푸시 부재로 Telegram 주문알림 사용. no-external-redirect 예외(necessity) 인정 여부.','C-1-C','IMPORTANT','EXTERNAL',130),
  ('C-D','CONFIRM','Pi 직접 확인','[데이터] 수집항목 필수성 매핑표 작성','실명·전화·주소·카카오ID·위치 각 항목의 필수 기능 매핑 후 Pi에 적정성 질의.','C-1-D','IMPORTANT','MASTER',140),
  -- ── Part B. 공식 등록 절차(핵심 단계) ──────────────────────────────
  ('B-5','PROC','공식 등록 절차','앱 등록 — App Network 선택 (비가역)','Checklist 5단계. 이메일 인증 후 진행. 네트워크는 등록 후 변경 불가.','B-1-5','IMPORTANT','MASTER',150),
  ('B-7','PROC','공식 등록 절차','지갑 생성 (wallet.pi 접근 확인)','Checklist 7단계. wallet.pi에서 접근 확인 후 진행.','B-1-7','IMPORTANT','MASTER',160),
  ('B-10','PROC','공식 등록 절차','샌드박스 실행 검증 (sandbox=true)','Checklist 10단계. Pi Mining App에서 인가.','B-1-10','RECOMMEND','CODE',170),
  ('B-11','PROC','공식 등록 절차','프로덕션 배포 (Production URL)','Checklist 11단계. Production URL 입력 후 Pi Browser 접근.','B-1-11','IMPORTANT','MASTER',180),
  ('B-12','PROC','공식 등록 절차','도메인 소유 검증 (validation-key.txt)','Checklist 12단계. validation-key.txt 파일을 호스팅 도메인에 배치.','B-1-12','IMPORTANT','MASTER',190)
ON CONFLICT (item_key) DO NOTHING;
