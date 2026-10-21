// schema.pi API 공용 — 오류 응답 카탈로그, 본문 검증, 현재 사용자·분류체계 역할 확인, 감사 이력 기록
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { getAppUser } from './auth'
import { db } from './db'
import { areaPlan, type AreaPlan } from './plan'
import { effPerms, type MbrRole, type Perm } from './roles'

const ERRORS = {
  INVALID_INPUT: '입력값이 올바르지 않습니다',
  AUTH_REQUIRED: '로그인이 필요합니다',
  AUTH_PI_REQUIRED: 'Pi Browser 에서 Pi 계정으로 로그인해야 합니다',
  AUTH_GOOGLE_REQUIRED: 'Google 로그인이 필요합니다',
  LINK_ALREADY_LINKED: '이미 연동된 계정입니다',
  LINK_CODE_INVALID: '연동 코드가 올바르지 않거나 만료되었습니다',
  LINK_CODE_GEN_FAILED: '연동 코드를 만들지 못했습니다. 다시 시도하십시오',
  LINK_CODE_LOCKED: '연동 코드 오류가 반복되어 10분간 잠겼습니다. 잠시 뒤 다시 시도하십시오',
  FORBIDDEN: '권한이 없습니다',
  NOT_FOUND: '대상을 찾을 수 없습니다',
  NOT_SUPPORTED: '이 DBMS 에서는 지원하지 않는 항목입니다',
  AREA_DUP_NM: '같은 이름의 분류체계가 이미 있습니다',
  WORD_DUP_LOGICAL: '같은 논리명의 단어가 이미 있습니다(동음이의어 금지 : 복합어로 구분)',
  WORD_DUP_PHYSICAL: '같은 물리명(영문 약어)의 단어가 이미 있습니다(이음동의어 금지 : 약어를 달리 정의)',
  WORD_IS_SYNONYM: '기존 표준단어의 대체 표기(이음동의어·금칙어)입니다(동의어 금지 : 표준단어를 사용)',
  ALIAS_IS_WORD: '표준단어로 등록된 이름은 금칙어·이음동의어로 둘 수 없습니다',
  TBL_SFX_DUP: '같은 테이블 접미어를 쓰는 엔터티 분류어가 이미 있습니다',
  TBL_SFX_NOT_ENT: '테이블 접미어는 엔터티 분류어(금칙어 제외)에만 지정할 수 있습니다',
  SUBJ_DUP: '같은 이름 또는 같은 약어의 주제영역이 이미 있습니다',
  PRJ_DUP: '같은 이름의 프로젝트가 이미 있습니다',
  PRJ_IN_USE: '주제영역이 있는 프로젝트는 삭제할 수 없습니다',
  SUBJ_NOT_WORD: '주제영역명은 승인완료 표준단어(또는 표준단어 조합)여야 합니다 : 표준단어를 먼저 등록하십시오',
  SUBJ_IN_USE: '하위 주제영역 또는 엔터티가 있는 주제영역은 삭제할 수 없습니다',
  ENT_DUP: '같은 이름의 엔터티가 이미 있습니다',
  ENT_WORD_INVALID: '엔터티 이름은 승인완료 표준단어로만 구성할 수 있습니다(미등록 단어는 표준단어 신청)',
  ENT_FORBIDDEN_WORD: '금칙어는 엔터티 이름에 쓸 수 없습니다',
  ENT_LAST_ATTR: '엔터티 이름은 속성 분류어(도메인 단어)로 끝날 수 없습니다(테이블명은 속성 불필요)',
  ATTR_DUP: '이 엔터티에 같은 용어의 속성이 이미 있습니다',
  ATTR_TERM_INVALID: '속성은 이 분류체계의 승인완료 표준용어만 쓸 수 있습니다(미등록 용어는 표준용어 신청)',
  ATTR_ORDER_STALE: '속성 목록이 바뀌었습니다. 다시 불러온 뒤 순서를 바꾸십시오',
  ATTR_ORDER_PK: '주식별자는 항상 일반 속성보다 앞에 있어야 합니다',
  ATTR_PK_ESNTL: '주식별자는 필수 속성이어야 합니다',
  ATTR_FK_LOCKED: '관계로 상속된 속성은 용어를 바꿀 수 없습니다 — 관계·부모 식별자를 바꾸십시오',
  ENT_SUBJ_PRJ: '엔터티는 같은 프로젝트의 주제영역으로만 옮길 수 있습니다',
  REL_DUP: '같은 부모·자식·관계명의 관계가 이미 있습니다',
  REL_ENT_INVALID: '부모·자식 엔터티는 같은 프로젝트의 활성 엔터티여야 합니다',
  REL_NM_IDNT: 'N:M 관계는 식별 관계가 될 수 없습니다(물리 단계에서 교차 엔터티로 해소)',
  REL_SELF_IDNT: '자기참조 관계는 식별 관계가 될 수 없습니다',
  REL_SELF_OPT: '자기참조 관계는 부모가 선택이어야 합니다(최상위 행에는 부모가 없음)',
  REL_SELF_NM: '자기참조 N:M 은 역할명이 필요해 자동 해소할 수 없습니다 — 엔터티를 추가한 뒤 관계 2개와 역할명 FK 로 직접 해소하십시오',
  REL_NOT_NM: 'N:M 관계만 교차 엔터티로 해소할 수 있습니다',
  PHY_GATE: '논리 모델 점검을 통과해야 물리 모델로 전환할 수 있습니다(N:M 0·FK 누락 0·수정 필요 0·주식별자 누락 0)',
  PHY_ISSUES: '변환할 수 없는 항목이 있습니다(도메인·타입 매핑·이름 한도) — 목록을 고친 뒤 다시 전환하십시오',
  PHY_DUP: '이 프로젝트에 같은 DBMS 의 물리 모델이 이미 있습니다',
  SUBJ_LOCKED: '작성완료 상태인 엔터티·테이블은 편집할 수 없습니다 — 완료 취소 후 편집하십시오',
  STAGE_GATE: '완료 조건을 충족하지 않습니다 — 사유를 해결한 뒤 다시 완료하십시오',
  PHY_NO_REL: '물리 전환은 관계(Relationship)가 1개 이상 있는 엔터티만 할 수 있습니다 — 관계를 먼저 만드십시오(특수한 경우 DA 예외 적용 가능)',
  SUBJ_NOT_LGC: '작성완료 상태인 엔터티만 물리 모델로 전환할 수 있습니다',
  PHY_PENDING: '물리 모델에 반영되지 않은 논리 변경이 있습니다 — 논리 변경 반영 후 완료하십시오',
  PHY_COL_INVALID: '이 테이블의 칼럼이 아닙니다',
  PHY_COL_DEFAULT: '기본값은 숫자·작은따옴표 문자열(\'값\')·CURRENT_TIMESTAMP·CURRENT_DATE(PostgreSQL 은 TRUE·FALSE, Oracle·Tibero 는 SYSDATE·SYSTIMESTAMP 추가)만 쓸 수 있습니다',
  PHY_COL_PK_NULL: '주키 칼럼은 NULL 을 허용할 수 없습니다',
  PHY_COL_SYS: '시스템 칼럼은 순서·NULL·기본값을 바꿀 수 없습니다',
  PHY_COL_SEQ: '칼럼 순서가 겹치거나 시스템 칼럼보다 뒤에 있습니다',
  PHY_IDX_COL: '인덱스 칼럼은 이 테이블의 칼럼을 중복 없이 1~16개 골라야 합니다',
  PHY_IDX_DUP: '같은 칼럼 구성(순서 포함)의 인덱스 또는 PK 가 이미 있습니다',
  PHY_IDX_MAX: '이 테이블의 인덱스 이름 번호(01~99)를 모두 썼습니다 — 쓰지 않는 인덱스를 삭제하십시오',
  MON_DB_PG_ONLY: '데이터베이스 모니터링은 PostgreSQL 서버 직접 접속만 지원합니다(Oracle·Tibero·에이전트 접속은 이후 단계)',
  MON_URL_INVALID: 'http:// 또는 https:// 로 시작하는 주소를 입력하십시오(계정 정보 포함 금지, 2,000자 이내)',
  MON_URL_MAX: 'URL 은 분류체계당 100개까지 등록할 수 있습니다',
  MON_ADMIN_ONLY: '애플리케이션 모니터링은 전역 관리자만 볼 수 있습니다(schema.pi 전체 트래픽)',
  MON_AI_OFF: '이 AI 모델 제공사의 API 키가 서버에 없습니다(설정 > AI 분석 모델에서 키 상태 확인)',
  MON_AI_MDL_DUP: '같은 제공사·모델명이 이미 등록되어 있습니다',
  MON_AI_MDL_GONE: '선택한 AI 모델이 삭제되었습니다 — 다시 불러온 뒤 고르십시오',
  MON_AI_FAIL: 'AI 원인 분석에 실패했습니다 — 잠시 뒤 다시 시도하십시오',
  MON_FIX_OFF: 'GitHub 토큰(GITHUB_TOKEN)이 서버에 없어 수정안 PR 을 만들 수 없습니다',
  MON_FIX_FILE: '이 해결 방안의 파일을 고칠 수 없습니다(이 앱 src 아래 ts·tsx, 저장소 master 에 있는 4만 자 이하 파일만)',
  MON_FIX_GH: 'GitHub 작업에 실패했습니다(토큰 권한 Contents·Pull requests 쓰기·저장소 확인)',
  MON_FIX_NOT_AI: '모니터링 AI 수정안 PR(fix/mon-ai-*)만 이 화면에서 승인할 수 있습니다',
  MON_FIX_CLOSED: '이미 병합되었거나 닫힌 PR 입니다',
  MON_FIX_BUSY: '이 PR 은 다른 승인이 처리 중이거나 이미 처리되었습니다 — AI 수정 이력에서 상태를 확인하십시오',
  MON_FIX_CHANGED: 'PR 이 AI 가 만든 뒤 바뀌었습니다(커밋 추가) — 이 화면에서는 승인할 수 없습니다. GitHub 에서 검토 후 병합하십시오',
  MON_FIX_CONFLICT: '병합할 수 없습니다(충돌 또는 검토 뒤 PR 이 바뀜) — GitHub 에서 확인하십시오',
  MON_FIX_PROD_FF: 'master 에는 병합했지만 운영 브랜치가 master 와 갈라져 있어 운영 배포를 하지 못했습니다 — 운영 브랜치를 확인하십시오',
  VER_CAPPED: '모델이 너무 커서(엔터티 500·속성 5,000 초과) 버전으로 저장할 수 없습니다',
  REL_FK_IN_USE: '이 관계로 상속한 속성이 있어 부모·자식 엔터티를 바꿀 수 없습니다 — 관계를 삭제한 뒤 다시 등록하십시오',
  ATTR_SRC_INVALID: '원천 속성은 이 관계 부모 엔터티의 주식별자여야 합니다',
  REL_IDNT_OPT: '식별 관계는 부모가 필수입니다(자식 식별자 일부가 비어 있을 수 없음)',
  ALIAS_DUP: '이미 다른 표준단어의 금칙어·이음동의어로 등록된 표기입니다',
  DOM_DUP_NM: '같은 도메인명이 이미 있습니다',
  APV_NOT_WAITING: '처리 대기 중인 요청이 아닙니다',
  APV_WAIT_EXISTS: '같은 대상에 처리 대기 중인 요청이 있습니다',
  NO_CHANGE: '바뀐 내용이 없습니다',
  DOM_KEY_NOT_WORD: '대표도메인명이 표준단어로 등록되어 있지 않습니다(표준단어를 먼저 등록하십시오)',
  DOM_KEY_NOT_ATTR: '대표도메인명 단어가 속성 분류어(도메인 사용)로 지정되어 있지 않습니다',
  DOM_KEY_NOT_REG: '대표도메인으로 지정된 단어가 아닙니다(대표도메인 관리에서 지정 신청 후 승인)',
  DOM_KEY_FORBID: '금칙어는 대표도메인으로 지정할 수 없습니다',
  DOM_KEY_IN_USE: '도메인에서 사용 중인 대표도메인은 지정을 해제할 수 없습니다',
  DOM_GRP_REQUIRED: '도메인그룹을 지정해야 합니다',
  GRP_DUP_NM: '같은 이름의 도메인그룹이 이미 있습니다',
  GRP_IN_USE: '도메인에서 사용 중인 도메인그룹은 삭제할 수 없습니다',
  CD_DUP_TERM: '이 표준용어의 코드가 이미 있습니다',
  CD_TERM_INVALID: '코드형(CD) 도메인을 쓰는 확정 표준용어만 코드로 등록할 수 있습니다',
  CD_IN_USE: '코드값이 있는 코드는 삭제할 수 없습니다 — 코드값을 먼저 삭제하십시오',
  CD_VAL_DUP: '같은 코드값이 이미 있습니다',
  CD_VAL_TOO_LONG: '코드값이 용어 도메인 길이보다 깁니다',
  CD_NAME_NOT_COMMON: '공통코드는 ~구분코드·~종류코드·~유형코드 3종만 등록할 수 있습니다 — 그 외 코드(상태코드 등)는 별도 기본테이블(기준 엔터티)로 관리하십시오',
  CD_DIV_TOO_MANY: '구분코드는 값이 2~3개로 고정된 코드만 씁니다 — 4개 이상이거나 늘어날 수 있으면 유형코드로 정의하십시오',
  CD_VAL_NM_DUP: '같은 코드값명이 이미 있습니다(코드 인스턴스는 상호 배타)',
  TERM_IN_USE_CD: '공통코드(코드기본)에서 쓰는 용어는 삭제하거나 도메인을 바꿀 수 없습니다 — 표준코드에서 코드기본을 먼저 삭제하십시오',
  CD_VAL_KEY_FIXED: '코드값은 주식별자라 바꿀 수 없습니다 — 삭제한 뒤 새 코드값으로 등록하십시오',
  CD_BAS_RJCT: '반려된 코드기본에는 코드상세를 등록할 수 없습니다 — 코드기본을 재신청한 뒤 등록하십시오',
  ABBR_DUP_NM: '같은 논리명의 약어가 이미 있습니다',
  SEP_LOCKED: '등록된 용어가 있어 구분자를 바꿀 수 없습니다(기존 물리 용어명과 불일치)',
  WORD_IN_USE: '용어 또는 도메인(대표도메인명)에서 사용 중인 단어는 이름·분류어·금칙 여부를 바꾸거나 삭제할 수 없습니다',
  DOM_IN_USE: '용어에서 사용 중인 도메인은 구조를 바꾸거나 삭제할 수 없습니다',
  MBR_DUP: '이미 참여 중인 사용자입니다',
  TERM_DUP_NM: '같은 이름의 용어가 이미 있습니다',
  TERM_WORD_INVALID: '용어 구성 단어가 없거나 확정되지 않았습니다',
  TERM_DOM_MISMATCH: '용어의 끝 단어와 대표도메인명이 같은 도메인만 지정할 수 있습니다',
  TERM_SINGLE_WORD: '용어는 표준단어 2개 이상으로 구성해야 합니다',
  TERM_FORBIDDEN_WORD: '금칙어는 용어에 사용할 수 없습니다',
  TERM_LAST_NOT_ATTR: '용어는 속성 분류어로 끝나야 합니다',
  VERSION_CONFLICT: '다른 사용자가 먼저 수정했습니다. 다시 불러온 뒤 수정하십시오',
  DB_FAILED: '데이터 처리 중 오류가 발생했습니다',
  DUP_IN_FILE: '파일 안에 같은 이름이 앞 행에 있습니다',
  TERM_NAME_MISMATCH: '영문약어명으로 찾은 단어의 결합이 용어명과 다릅니다',
  DOM_NOT_FOUND: '연결할 도메인이 없습니다(도메인을 먼저 일괄등록하십시오)',
  HEADER_MISSING: 'CSV 필수 헤더가 없습니다',
  LAST_SETTINGS_ROLE: '설정 권한자(시스템담당자·데이터아키텍트·표준담당자·모델러)가 한 명은 있어야 합니다',
  ROLE_ESCALATE: '본인 역할보다 권한이 많은 역할은 지정·변경할 수 없습니다',
  PAY_PAYER: '요금제 결제는 이 분류체계의 시스템담당자·데이터아키텍트만 할 수 있습니다',
  PAY_MISMATCH: '결제 정보가 요청과 맞지 않습니다(분류체계·요금제·결제자)',
  PAY_AMOUNT: '결제 금액이 요금표와 다릅니다',
  PAY_UPGRADE: '업그레이드할 수 없습니다 — 지금 결제한 요금제보다 높은 요금제만, 남은 결제 기간이 있을 때 가능합니다',
  PAY_SUBSCRIBED: '구독 중인 분류체계는 업그레이드와 현재 요금제 선결제(미리 연장)만 결제할 수 있습니다 — 다른 요금제는 만료 뒤 결제하십시오',
  PAY_DUP: '이 분류체계에 진행 중인 다른 요금제 결제가 있습니다 — 완료 또는 취소 후 다시 시도하십시오',
  PAY_PI_FAILED: 'Pi 결제 서버 처리에 실패했습니다 — 잠시 후 다시 시도하십시오',
  PAY_PI_KEY: '결제 서버 설정(PI_API_KEY)이 없습니다 — 운영 환경변수를 확인하십시오',
  PAY_PI_SESSION: 'Pi 계정으로 로그인해야 결제할 수 있습니다(Pi Browser)',
  PLAN_OR_ROLE: '이 기능은 분류체계 요금제 또는 멤버 역할 권한이 없습니다(요금제 화면에서 확인)',
  APV_LEGACY: '승인 절차 도입 이전의 등록 신청입니다. 반려한 뒤 다시 신청하십시오',
  STS_NOT_EDITABLE: '승인대기 중인 데이터는 고칠 수 없습니다(신청을 취소한 뒤 다시 등록하십시오)',
  CONFLICT_SKIP: '반영 중 같은 이름이 먼저 저장되어 건너뜀',
  DB_CONN_DISABLED: 'DB 접속 기능이 꺼져 있습니다(서버 암호화 키 DB_PROFILE_KEY 미설정 또는 서버 직접 실행 끔)',
  DB_CONN_BLOCKED: '허용되지 않는 접속 대상입니다(사설·내부 주소는 로컬 에이전트로 실행)',
  DB_CONN_FAIL: 'DB 에 접속하지 못했습니다(주소·포트·계정·방화벽을 확인하십시오)',
  DB_CONN_CHANGED: '요청 뒤 접속 정보가 바뀌었습니다 — 새로 요청하십시오',
  DB_CONN_BUSY: '처리 중인 실행 요청이 있는 접속은 바꾸거나 삭제할 수 없습니다',
  DB_CONN_MISMATCH: '접속 DBMS 가 물리 모델 DBMS 와 다릅니다',
  DDL_CHANGED: '요청 뒤 모델이 바뀌어 DDL 이 달라졌습니다 — 새로 요청하십시오',
  DDL_GATE: '실행할 수 없는 테이블·이름이 있습니다 — 미리보기의 차단 사유를 해결하십시오',
  DDL_STMT_DENIED: '허용되지 않은 형태의 문장이 있어 실행하지 않았습니다',
  DDL_SELF_APPROVE: '본인이 요청한 실행은 승인할 수 없습니다(다른 데이터아키텍트 승인)',
  DDL_REQ_STATE: '지금 상태에서는 할 수 없는 처리입니다 — 다시 불러오십시오',
  DDL_LIVE_EXISTS: '이 접속에 승인·실행 중인 요청이 이미 있습니다',
  AGT_UNAUTH: '에이전트 인증에 실패했습니다',
  AGT_OUTDATED: '로컬 에이전트가 오래되었습니다 — 1.2.0 이상으로 다시 빌드하십시오(일반 인덱스 CREATE INDEX 지원)',
  SQL_WRITE_DENIED: '쓰기 문장(INSERT·UPDATE·DELETE·DDL 등)은 CRUD 권한(멤버 역할 ∩ 분류체계 요금제)이 있어야 실행할 수 있습니다 — 지금은 조회만 가능합니다',
  SQL_TXN_DENIED: '트랜잭션 제어 문장(BEGIN·COMMIT·ROLLBACK·SET TRANSACTION 등)은 실행할 수 없습니다 — 실행마다 자동 커밋, 한 번에 되돌리려면 \'한 트랜잭션\' 옵션을 쓰십시오',
  SQL_CONFIRM: '위험한 문장이 있습니다 — 확인 후 다시 실행하십시오',
  SQL_RDONLY_REQUIRED: '데이터아키텍트가 \'조회 전용 계정\'으로 지정한 접속에서만 실행할 수 있습니다(SELECT 권한만 가진 DB 계정)',
  SQL_MANUAL_ORA_DDL: 'Oracle DDL·PL/SQL 블록·CALL 은 실행 중 커밋될 수 있어 MANUAL 에서 쓸 수 없습니다 — AUTO 로 바꿔 실행하십시오',
  SQL_AGT_UNSUPPORTED: '로컬 에이전트 접속은 SQL 편집기에서 아직 쓸 수 없습니다(서버 직접 접속만)',
  SQL_TAB_LIMIT: '현재 요금제의 SQL 탭 개수 상한에 도달했습니다 — 탭을 닫거나 요금제를 올리십시오',
  SQL_TAB_NM_DUP: '같은 이름의 SQL 탭이 이미 열려 있습니다',
  DA_LOCKED: '처리 중인 DDL 실행 요청이 있어 데이터아키텍트를 바꾸거나 뺄 수 없습니다 — 요청을 처리·취소한 뒤 변경하십시오',
} as const
export type ErrorCode = keyof typeof ERRORS
export const errMsg = (c: ErrorCode) => ERRORS[c]

export const apiError = (code: ErrorCode, status: number) =>
  NextResponse.json({ ok: false, code, message: ERRORS[code] }, { status })

// PostgreSQL 오류 → API 오류(23505 유일 위반은 호출자가 지정한 코드로)
// 오류 코드 판정에 쓰는 유일 인덱스 이름(sql/066 명명 규칙 x_<테이블>_NN) — 이름을 바꾸면 여기만 고친다
// ponytail: 두 번째 값 = sql/066 이전 구 이름(코드 먼저 배포 → 마이그레이션 적용 사이 호환), 066 이 운영에 적용된 뒤 정리 때 제거
export const UQ = {
  DIC_PHY: ['x_std_dic_03', 'ux_std_dic_area_phy_nm_actv'], // 단어 물리명(sql/014)
  DIC_TBL_SFX: ['x_std_dic_05', 'ux_std_dic_area_tbl_sfx_actv'], // 테이블 접미어(sql/017)
  TERM_PHY: ['x_std_term_02', 'ux_std_term_area_phy_nm_actv'], // 용어 물리명
  APV_KEY_WAIT: ['x_std_apv_req_03', 'ux_std_apv_req_key_wait'], // 자연키 대상 처리 대기 요청(sql/061)
  PHY_MDL_DBMS: ['x_mdl_phy_mdl_01', 'ux_mdl_phy_mdl_prj_dbms_actv'], // 프로젝트 × DBMS 물리 모델
} as const
// PostgreSQL 23505 메시지 = duplicate key value violates unique constraint "<인덱스명>"
export const uqHit = (msg: string | undefined, names: readonly string[]) => names.some((n) => (msg ?? '').includes(`"${n}"`))

// 유일 위반 메시지 → 오류 코드(sql/014 물리명 인덱스, sql/016 대체 표기 트리거)
export function dupCodeOf(msg: string | undefined, fallback: ErrorCode): ErrorCode {
  const m = msg ?? ''
  if (/std_dic_alias/.test(m)) return 'WORD_IS_SYNONYM'
  if (/std_dic_rel_word/.test(m)) return 'ALIAS_IS_WORD'
  if (/std_dic_rel_dup/.test(m)) return 'ALIAS_DUP'
  if (uqHit(m, UQ.DIC_TBL_SFX)) return 'TBL_SFX_DUP'
  return uqHit(m, [...UQ.DIC_PHY, ...UQ.TERM_PHY]) ? 'WORD_DUP_PHYSICAL' : fallback
}

export function dbError(e: { code?: string; message?: string }, dupCode?: ErrorCode) {
  if (e.code === 'MLK01') return apiError('SUBJ_LOCKED', 409) // 완료 주제영역 편집 잠금(sql/031 트리거)
  if (e.code === 'MDB01') return apiError('DB_CONN_BUSY', 409) // 처리 중 요청이 걸린 접속(sql/038)
  if (e.code === 'MDB02') return apiError('DA_LOCKED', 409) // 처리 중 DDL 요청이 있는 분류체계의 DA 변경(sql/044)
  if (e.code === '23514') return apiError('INVALID_INPUT', 400) // CHECK·트리거 규칙 위반(형식·2레벨 등)
  if (e.code === '23505' && (dupCode || /std_dic_/.test(e.message ?? ''))) return apiError(dupCodeOf(e.message, dupCode ?? 'INVALID_INPUT'), 409)
  console.error('[db]', e.code, e.message)
  return apiError('DB_FAILED', 500)
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T | NextResponse> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError('INVALID_INPUT', 400)
  }
  const r = schema.safeParse(raw)
  return r.success ? r.data : apiError('INVALID_INPUT', 400)
}

export const DEV_COOKIE = 'dev_user'
export const DEV_USER_RE = /^[a-z0-9_]{3,30}$/

export interface CurrentUser {
  usr_id: string
  pi_usr_nm: string
}

// 현재 사용자 — 통합 세션(Pi 쿠키 OR X-Pi-Token → Google 연동 세션, src/lib/auth.ts getAppUser) 우선. 비운영 빌드에서만 개발 임시 사용자(쿠키 dev_user → DEV_USER_PI_NM) 폴백
export async function currentUser(): Promise<CurrentUser | null> {
  const u = await getAppUser()
  if (u) return { usr_id: u.usr_id, pi_usr_nm: u.pi_usr_nm }
  if (process.env.NODE_ENV === 'production') return null
  const nm = (await cookies()).get(DEV_COOKIE)?.value || process.env.DEV_USER_PI_NM
  if (!nm || !DEV_USER_RE.test(nm)) return null
  // 활성 사용자명 유일은 부분 인덱스라 upsert 충돌 대상으로 쓸 수 없어 조회 후 생성
  const got = await db().from('sys_user').select('usr_id, pi_usr_nm').eq('pi_usr_nm', nm).eq('del_yn', 'N').maybeSingle()
  if (got.error) throw got.error
  if (got.data) return got.data
  const ins = await db()
    .from('sys_user')
    .insert({ pi_usr_nm: nm, dsp_nm: nm, regr_id: 'DEV', modr_id: 'DEV' })
    .select('usr_id, pi_usr_nm')
    .single()
  if (ins.error) throw ins.error
  return ins.data
}

// 분류체계 권한 확인(권한표 src/lib/roles.ts) — 실제 권한 = 역할 ∩ 요금제(effPerms). 사용자·역할·권한 목록 또는 오류 응답
export interface AreaAuth {
  user: CurrentUser
  role: MbrRole
  perms: Perm[]
  plan: AreaPlan
}
// 권한 조회 결과 단기 캐시(사용자×분류체계, 30초) — 몰린 요청이 DB 를 매번 왕복하지 않게 함. 성공 결과만 저장(오류·비멤버는 저장 안 함)
const AUTH_TTL_MS = 30_000
const AUTH_CACHE_MAX = 5000
const authCache = new Map<string, { at: number; role: MbrRole; plan: AreaPlan }>()

export async function requireAreaRole(areaId: string, perm: Perm): Promise<AreaAuth | NextResponse> {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const key = `${user.usr_id}:${areaId}`
  const hit = authCache.get(key)
  if (hit && Date.now() - hit.at < AUTH_TTL_MS) {
    const perms = effPerms(hit.role, hit.plan.plan)
    return perms.includes(perm) ? { user, role: hit.role, perms, plan: hit.plan } : apiError(perm === 'VIEW' ? 'FORBIDDEN' : 'PLAN_OR_ROLE', 403)
  }
  // 멤버 역할·요금제 조회를 병렬로 실행(직렬 왕복 누적 방지) — 오류 판정 순서는 기존과 같음
  const [m, p] = await Promise.all([
    db().from('std_area_mbr').select('mbr_role_cd').eq('area_id', areaId).eq('usr_id', user.usr_id).eq('del_yn', 'N').maybeSingle(),
    areaPlan(areaId).then(
      (plan) => ({ plan }),
      (e) => ({ err: e as { code?: string; message?: string } }),
    ),
  ])
  if (m.error) return dbError(m.error)
  if (!m.data) return apiError('FORBIDDEN', 403)
  if ('err' in p) return dbError(p.err)
  const plan: AreaPlan = p.plan
  const role = m.data.mbr_role_cd as MbrRole
  if (authCache.size >= AUTH_CACHE_MAX) authCache.clear()
  authCache.set(key, { at: Date.now(), role, plan })
  const perms = effPerms(role, plan.plan)
  return perms.includes(perm) ? { user, role, perms, plan } : apiError(perm === 'VIEW' ? 'FORBIDDEN' : 'PLAN_OR_ROLE', 403)
}

// 목록 검색어 → ILIKE 부분일치 패턴. PostgREST or() 구분자(, ( ))·LIKE 메타(%)·이스케이프(\)만 제거하고 '_' 는 남김 — '_' 는 한 글자 일치라 물리명(CUST_STTS_TPCD)으로도 찾힘(2026-10-20, 전엔 '_' 를 지워 0건)
// LIKE 메타문자(% _ \) 이스케이프 — 정확 일치·접두 일치용(중복 검사·접두 후보), '_' 를 지우면 판정이 어긋남(2026-10-20)
export const likeEsc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
export const likeQ = (q: string) => `%${q.replace(/[%,()\\]/g, '')}%`

export async function audit(row: {
  area_id: string
  tgt_tp_cd: string
  tgt_id: string
  act_cd: 'INS' | 'UPD' | 'DEL'
  bfr_val?: unknown
  aftr_val?: unknown
  usr_id: string
}) {
  const { error } = await db().from('std_audit_log').insert({ ...row, regr_id: row.usr_id, modr_id: row.usr_id })
  if (error) console.error('[audit]', error.code, error.message)
}
