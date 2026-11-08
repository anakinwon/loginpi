-- sql/111_ops_checklist.sql
-- DA-APPROVED: 신규 도메인 'ops'(운영/operations) + 'chk'(체크/checklist) 등재.
--   운영 준비 점검 항목 관리용 내부 어드민 테이블. 기존 도메인(bean_·mps_·msg_·sys_)과 무관한
--   운영 메타 영역이라 'ops_' 접두사 신설. 'chk'는 점검 항목(checklist item) 표준약어.
--
-- 목적: 일반인 Open Beta 사전 준비 체크리스트를 관리자 페이지(/admin/checklist)에서 항목별로
--   상태(미착수·진행중·완료·해당없음)·메모 관리. 점검 결과를 시드(완료 건은 DONE).
--   ⚠️ 환경 정책(sql/111 자체도): staging Supabase 먼저 적용·검증 후 운영 적용. git-only.
--
-- 멱등: item_key UNIQUE + ON CONFLICT DO NOTHING → 재실행 안전, 신규 항목만 추가.

CREATE TABLE IF NOT EXISTS public.ops_checklist (
  chk_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key  VARCHAR(40) NOT NULL UNIQUE,                 -- 안정 식별자(멱등 시드)
  sect_cd   VARCHAR(4)  NOT NULL,                        -- 섹션 코드 '0','A'..'H'
  sect_nm   TEXT        NOT NULL,                        -- 섹션명
  title     TEXT        NOT NULL,                        -- 항목 내용
  prio_cd   VARCHAR(10) NOT NULL DEFAULT 'IMPORTANT',    -- BLOCKING/IMPORTANT/RECOMMEND
  owner_cd  VARCHAR(10) NOT NULL DEFAULT 'CODE',         -- CODE/MASTER/EXTERNAL
  status_cd VARCHAR(10) NOT NULL DEFAULT 'TODO',         -- TODO/DOING/DONE/NA
  note_txt  TEXT,
  sort_ord  INT         NOT NULL DEFAULT 0,
  del_yn    CHAR(1)     NOT NULL DEFAULT 'N',
  del_dtm   TIMESTAMPTZ,
  regr_id   TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id   TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_ops_prio   CHECK (prio_cd  IN ('BLOCKING','IMPORTANT','RECOMMEND')),
  CONSTRAINT chk_ops_owner  CHECK (owner_cd IN ('CODE','MASTER','EXTERNAL')),
  CONSTRAINT chk_ops_status CHECK (status_cd IN ('TODO','DOING','DONE','NA'))
);

COMMENT ON TABLE  public.ops_checklist          IS 'Open Beta 운영 준비 체크리스트 — /admin/checklist 관리. 상태/메모 토글, 진척 집계';
COMMENT ON COLUMN public.ops_checklist.status_cd IS 'TODO 미착수 · DOING 진행중 · DONE 완료 · NA 해당없음';

CREATE INDEX IF NOT EXISTS idx_ops_checklist_sort ON public.ops_checklist(sort_ord) WHERE del_yn = 'N';

-- ── 시드(점검 결과 반영) ── 멱등: ON CONFLICT(item_key) DO NOTHING
INSERT INTO public.ops_checklist (item_key, sect_cd, sect_nm, title, prio_cd, owner_cd, status_cd, sort_ord) VALUES
-- 0. 환경 구성 (Local→Staging→운영)
('ENV_AUDIT',      '0','환경 구성(Local→Staging→운영)','현 Supabase/Vercel 환경 분리 실태 확인','BLOCKING','MASTER','TODO',10),
('ENV_STG_DB',     '0','환경 구성(Local→Staging→운영)','별도 staging Supabase 신설 + 전체 스키마 동기화','BLOCKING','MASTER','TODO',20),
('ENV_SCOPE',      '0','환경 구성(Local→Staging→운영)','Vercel env 환경범위(Dev/Preview/Prod) 분리','BLOCKING','MASTER','TODO',30),
('ENV_PROMOTE',    '0','환경 구성(Local→Staging→운영)','승격 흐름 확립(로컬→Preview 실기기검증→운영)','BLOCKING','MASTER','TODO',40),
('ENV_SQL_GATE',   '0','환경 구성(Local→Staging→운영)','SQL 마이그레이션 게이트(staging 선적용→검증→운영)','BLOCKING','MASTER','TODO',50),
('ENV_PI_KEYS',    '0','환경 구성(Local→Staging→운영)','Pi testnet/mainnet 키 환경별 분리','BLOCKING','MASTER','TODO',60),
('ENV_NO_DESTROY', '0','환경 구성(Local→Staging→운영)','운영 파괴적 작업 금지(물리 DELETE 금지 유지)','IMPORTANT','CODE','DONE',70),
-- A. 핵심가치 실기기
('A_LOGIN',        'A','핵심가치 Pi Browser 실기기','Pi Browser 로그인(Pi+Google 코드연동) 검증','BLOCKING','MASTER','TODO',110),
('A_PAY',          'A','핵심가치 Pi Browser 실기기','Pi 결제 실기기: 주문(에스크로)·구독·Bean 충전','BLOCKING','MASTER','TODO',120),
('A_CAFE',         'A','핵심가치 Pi Browser 실기기','카페 입장·채팅·자동번역·선물(직접입력)·이벤트 미션','BLOCKING','MASTER','TODO',130),
('A_HOME_OK',      'A','핵심가치 Pi Browser 실기기','ko·en 홈 무크래시 재검증(deepMerge 수정 후)','BLOCKING','MASTER','TODO',140),
-- B. Pi 레드라인
('B_REDLINE',      'B','Pi 정책 레드라인','Pi 로그인·Pi 결제 전용·도박 없음·브랜딩 준수','BLOCKING','CODE','DONE',210),
('B_BEAN_MSG',     'B','Pi 정책 레드라인','Bean=내부 적립금(외부환전 불가) 메시지 일관성','IMPORTANT','CODE','DOING',220),
-- C. 법무·규제
('C_LAW_REVIEW',   'C','법무·규제','약관 7종 변호사/법무사 최종 검수(현 AI 초안)','BLOCKING','EXTERNAL','TODO',310),
('C_LAW_FILL',     'C','법무·규제','약관 미기입값(사업자번호·위치책임자·동의서 작성일) 채움','BLOCKING','MASTER','TODO',320),
('C_BIZ_REG',      'C','법무·규제','사업자등록 + 통신판매업 신고','BLOCKING','EXTERNAL','TODO',330),
('C_VASP',         'C','법무·규제','VASP 신고 여부 법률 자문','BLOCKING','EXTERNAL','TODO',340),
('C_CONSENT_UI',   'C','법무·규제','가입 동의 UI(약관·개인정보·마케팅) 구현','BLOCKING','CODE','TODO',350),
('C_AGE_GATE',     'C','법무·규제','연령 게이트(만14세·미성년 법정대리인 동의)','BLOCKING','CODE','TODO',360),
('C_LBS_CONSENT',  'C','법무·규제','위치(LBS) 동의 다이얼로그+API+철회','BLOCKING','CODE','DONE',370),
-- D. 자금·데이터 무결성
('D_SQL_APPLY',    'D','자금·데이터 무결성','미적용 SQL 적용+검증(101·107·108·109·110)','BLOCKING','MASTER','TODO',410),
('D_BAL_CRON',     'D','자금·데이터 무결성','Bean 항등식 모니터링 cron(fn_bean_balance_check)','BLOCKING','CODE','TODO',420),
('D_BAL_CARD',     'D','자금·데이터 무결성','어드민 항등식 diff 카드 노출','IMPORTANT','CODE','TODO',430),
('D_NO_LEAK',      'D','자금·데이터 무결성','과발행/이중지급 차단(CHECK·FOR UPDATE·diff===0)','BLOCKING','CODE','DONE',440),
('D_A2U_SEED',     'D','자금·데이터 무결성','A2U 정산 프로덕션 시드(PI_WALLET_PRIVATE_SEED)','BLOCKING','MASTER','TODO',450),
-- E. 배포·인프라
('E_ENV_PROD',     'E','배포·인프라','프로덕션 env(CRON_SECRET·WALLET_SEED·API_KEY·SECRET류) 등록','BLOCKING','MASTER','TODO',510),
('E_TURN',         'E','배포·인프라','PiVoice TURN 2키(Cloudflare) 등록','BLOCKING','MASTER','TODO',520),
('E_VERCEL_SEC',   'E','배포·인프라','Vercel Firewall/BotID 설정·Pro 플랜·도메인 연결','BLOCKING','MASTER','TODO',530),
('E_CRON_CHECK',   'E','배포·인프라','cron 5종 동작 확인(정산·재평가·자동완료·보상·캠페인)','IMPORTANT','MASTER','TODO',540),
-- F. 안정성·UX
('F_ERR_PAGE',     'F','안정성·UX','error.tsx·not-found.tsx(+[locale]/error.tsx) 생성','IMPORTANT','CODE','TODO',610),
('F_EMPTY',        'F','안정성·UX','Empty state·로딩 전 화면 전수 점검','IMPORTANT','CODE','TODO',620),
('F_PERF',         'F','안정성·UX','SHOP window.Pi 가드·CAFE WS 폴백·MAP 마커 클러스터링','RECOMMEND','CODE','TODO',630),
-- G. 운영·고객지원
('G_REPORT',       'G','운영·고객지원','신고(report) 기능(게시물/댓글/상점 + 처리추적)','IMPORTANT','CODE','TODO',710),
('G_FAQ',          'G','운영·고객지원','FAQ 페이지 + 지원채널(이메일·텔레그램) 노출','IMPORTANT','CODE','TODO',720),
('G_ALERT',        'G','운영·고객지원','운영/장애/부정거래 알림 경로','IMPORTANT','CODE','TODO',730),
('G_NOTIFY_DONE',  'G','운영·고객지원','판매자 텔레그램 주문 알림·결제 영수증 메일','IMPORTANT','CODE','DONE',740),
-- H. 콘텐츠·온보딩·이벤트
('H_HOME_DOC',     'H','콘텐츠·온보딩·이벤트','홈 기술 백서(8카드)+사용설명서(8주제) 다국어','RECOMMEND','CODE','DONE',810),
('H_PLEDGE',       'H','콘텐츠·온보딩·이벤트','테스트넷→메인넷 Bean 1:1 승계 공약(+정책문서화 권장)','RECOMMEND','CODE','DONE',820),
('H_EVENT1',       'H','콘텐츠·온보딩·이벤트','Event#1(10미션 5,000 Bean) 운영중','IMPORTANT','MASTER','DONE',830),
('H_EVENT2',       'H','콘텐츠·온보딩·이벤트','Event#2(매장 온보딩 10,000 Bean) 재원·지급 재확인','IMPORTANT','MASTER','TODO',840),
('H_LOCALE',       'H','콘텐츠·온보딩·이벤트','비-ko 20개 locale 1차 공개 언어 범위 결정','RECOMMEND','MASTER','TODO',850)
ON CONFLICT (item_key) DO NOTHING;

-- 검증:
--   SELECT status_cd, count(*) FROM public.ops_checklist WHERE del_yn='N' GROUP BY status_cd;
--   SELECT sect_cd, count(*) FILTER (WHERE status_cd='DONE') AS done, count(*) AS total
--     FROM public.ops_checklist WHERE del_yn='N' AND status_cd<>'NA' GROUP BY sect_cd ORDER BY sect_cd;
