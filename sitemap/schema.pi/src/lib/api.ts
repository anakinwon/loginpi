// schema.pi API 공용 — 오류 응답 카탈로그, 본문 검증, 현재 사용자·분류체계 역할 확인, 감사 이력 기록
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { getSessionUser } from './auth'
import { db } from './db'
import { can, type MbrRole, type Perm } from './roles'

const ERRORS = {
  INVALID_INPUT: '입력값이 올바르지 않습니다',
  AUTH_REQUIRED: '로그인이 필요합니다',
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
  LAST_SETTINGS_ROLE: '설정 권한자(시스템담당자·데이터아키텍트)가 한 명은 있어야 합니다',
  APV_LEGACY: '승인 절차 도입 이전의 등록 신청입니다. 반려한 뒤 다시 신청하십시오',
  STS_NOT_EDITABLE: '승인대기 중인 데이터는 고칠 수 없습니다(신청을 취소한 뒤 다시 등록하십시오)',
  CONFLICT_SKIP: '반영 중 같은 이름이 먼저 저장되어 건너뜀',
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

// 현재 사용자 — Pi 세션(쿠키 OR X-Pi-Token 헤더, src/lib/auth.ts) 우선. 비운영 빌드에서만 개발 임시 사용자(쿠키 dev_user → DEV_USER_PI_NM) 폴백
export async function currentUser(): Promise<CurrentUser | null> {
  const pi = await getSessionUser()
  if (pi) return { usr_id: pi.usr_id, pi_usr_nm: pi.pi_usr_nm }
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

// 분류체계 권한 확인(권한표 src/lib/roles.ts) — 사용자·역할 또는 오류 응답
export async function requireAreaRole(
  areaId: string,
  perm: Perm,
): Promise<{ user: CurrentUser; role: MbrRole } | NextResponse> {
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
  return can(role, perm) ? { user, role } : apiError('FORBIDDEN', 403)
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
