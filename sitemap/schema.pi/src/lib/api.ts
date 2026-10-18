// schema.pi API 공용 — 오류 응답 카탈로그, 본문 검증, 현재 사용자·분류체계 역할 확인, 감사 이력 기록
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { getAppUser } from './auth'
import { db } from './db'
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
  ENT_AGG_SUFFIX: '집계 엔터티는 \'집계\'로 끝나야 합니다(정의서 §8.4)',
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
  SUBJ_NOT_LGC: '작성완료 상태인 엔터티만 물리 모델로 전환할 수 있습니다',
  PHY_PENDING: '물리 모델에 반영되지 않은 논리 변경이 있습니다 — 논리 변경 반영 후 완료하십시오',
  PHY_COL_INVALID: '이 테이블의 칼럼이 아닙니다',
  PHY_COL_DEFAULT: '기본값은 숫자·작은따옴표 문자열(\'값\')·CURRENT_TIMESTAMP·CURRENT_DATE(PostgreSQL 은 TRUE·FALSE, Oracle·Tibero 는 SYSDATE·SYSTIMESTAMP 추가)만 쓸 수 있습니다',
  PHY_COL_PK_NULL: '주키 칼럼은 NULL 을 허용할 수 없습니다',
  PHY_COL_SYS: '시스템 칼럼은 순서·NULL·기본값을 바꿀 수 없습니다',
  PHY_COL_SEQ: '칼럼 순서가 겹치거나 시스템 칼럼보다 뒤에 있습니다',
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
  SQL_WRITE_DENIED: '쓰기 문장(INSERT·UPDATE·DELETE·DDL 등)은 데이터아키텍트만 실행할 수 있습니다 — 조회 전용 권한입니다',
  SQL_TXN_DENIED: '트랜잭션 제어 문장(BEGIN·COMMIT·ROLLBACK·SET TRANSACTION 등)은 실행할 수 없습니다 — 실행마다 자동 커밋, 한 번에 되돌리려면 \'한 트랜잭션\' 옵션을 쓰십시오',
  SQL_CONFIRM: '위험한 문장이 있습니다 — 확인 후 다시 실행하십시오',
  SQL_RDONLY_REQUIRED: '데이터아키텍트가 \'조회 전용 계정\'으로 지정한 접속에서만 실행할 수 있습니다(SELECT 권한만 가진 DB 계정)',
  SQL_MANUAL_ORA_DDL: 'Oracle DDL·PL/SQL 블록·CALL 은 실행 중 커밋될 수 있어 MANUAL 에서 쓸 수 없습니다 — AUTO 로 바꿔 실행하십시오',
  SQL_AGT_UNSUPPORTED: '로컬 에이전트 접속은 SQL 편집기에서 아직 쓸 수 없습니다(서버 직접 접속만)',
  DA_LOCKED: '처리 중인 DDL 실행 요청이 있어 데이터아키텍트를 바꾸거나 뺄 수 없습니다 — 요청을 처리·취소한 뒤 변경하십시오',
} as const
export type ErrorCode = keyof typeof ERRORS
export const errMsg = (c: ErrorCode) => ERRORS[c]

export const apiError = (code: ErrorCode, status: number) =>
  NextResponse.json({ ok: false, code, message: ERRORS[code] }, { status })

// PostgreSQL 오류 → API 오류(23505 유일 위반은 호출자가 지정한 코드로)
// 유일 위반 메시지 → 오류 코드(sql/014 물리명 인덱스, sql/016 대체 표기 트리거)
export function dupCodeOf(msg: string | undefined, fallback: ErrorCode): ErrorCode {
  const m = msg ?? ''
  if (/std_dic_alias/.test(m)) return 'WORD_IS_SYNONYM'
  if (/std_dic_rel_word/.test(m)) return 'ALIAS_IS_WORD'
  if (/std_dic_rel_dup/.test(m)) return 'ALIAS_DUP'
  if (/tbl_sfx/.test(m)) return 'TBL_SFX_DUP'
  return /phy_nm/.test(m) ? 'WORD_DUP_PHYSICAL' : fallback
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
}
export async function requireAreaRole(areaId: string, perm: Perm): Promise<AreaAuth | NextResponse> {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const { data, error } = await db()
    .from('std_area_mbr')
    .select('mbr_role_cd')
    .eq('area_id', areaId)
    .eq('usr_id', user.usr_id)
    .eq('del_yn', 'N')
    .maybeSingle()
  if (error) return dbError(error)
  if (!data) return apiError('FORBIDDEN', 403)
  const role = data.mbr_role_cd as MbrRole
  const perms = effPerms(role, 'P4') // 요금제 연결 전(R2) = 역할 권한 그대로
  return perms.includes(perm) ? { user, role, perms } : apiError('FORBIDDEN', 403)
}

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
