// 분류체계 역할 R&R 7종 × 요금제 5종 권한표(화면·서버 공용, 서버 전용 import 없음) — 역할 코드 정본은 DB std_cmn_cd(MBR_ROLE, sql/012·048)
// 2026-10-18 마스터 지시(권한·요금제 표) : 실제 권한 = 멤버 역할 권한 ∩ 분류체계 요금제 권한(교집합). 전역 ADMIN 도 결제한 요금제만(2026-10-19 마스터 지시 — 결제 안 된 권한 모두 제거)
// 승인 1단계 : 승인권자(SYS·DA)는 승인 화면에서 본인 신청도 승인 가능(처리자 = 신청자로 기록), 즉시 승인(SELF_APPROVE)도 SYS·DA
export const ROLES = ['SYS', 'DA', 'STD', 'MDL', 'QLT', 'MIG', 'VIEWER'] as const
export type MbrRole = (typeof ROLES)[number]

// 표 칸 — 권한 6종(CRUD = SQL 편집기 DML·DDL 쓰기) + 메뉴 4종(1 SQL 편집기·2 표준·3 모델링·4 설정)
//  설정 서브메뉴 4단(마스터 표 '설정 Sub_Menu vs Role' 2026-10-19) : MENU_SET 설정·이력 / MENU_BAN 금칙어·금칙어 일괄등록 / MENU_CHK 표준 점검·리버스 / MENU_ADM 멤버·승인
export const BASE_PERMS = ['APPROVE', 'SELF_APPROVE', 'SETTINGS', 'BULK', 'REQUEST', 'CRUD', 'MENU_SQL', 'MENU_STD', 'MENU_MODEL', 'MENU_SET', 'MENU_BAN', 'MENU_CHK', 'MENU_ADM'] as const
type BasePerm = (typeof BASE_PERMS)[number]
// 파생 권한(표 밖) — 서버 경로·화면은 이 이름으로 판정
//  VIEW = 멤버, STD_VIEW·MODEL_VIEW·SET_VIEW = 메뉴, STD_REQ·MODEL_EDIT = 신청 ∧ 메뉴, SQL_QUERY = 메뉴1,
//  DDL_APPROVE = 승인, DB_CONN_ADMIN = 승인 ∧ 설정(접속 비밀번호 관리 — 설정만 가진 역할에는 주지 않음)
//  설정 서브메뉴 : SET_VIEW = 설정·이력, BAN_VIEW = 금칙어 조회, BAN_EDIT = 금칙어 등록·삭제·일괄(금칙어 메뉴 ∧ 일괄등록), CHK_VIEW = 표준 점검·리버스, ADM_VIEW = 멤버·승인 메뉴, MBR_ADMIN = 멤버 관리(멤버 메뉴 ∧ 설정)
export type Perm = BasePerm | 'VIEW' | 'STD_VIEW' | 'STD_REQ' | 'MODEL_VIEW' | 'MODEL_EDIT' | 'SET_VIEW' | 'BAN_VIEW' | 'BAN_EDIT' | 'CHK_VIEW' | 'ADM_VIEW' | 'MBR_ADMIN' | 'SQL_QUERY' | 'DDL_APPROVE' | 'DB_CONN_ADMIN'

export const ROLE_NM: Record<MbrRole, string> = {
  SYS: '시스템담당자',
  DA: '데이터아키텍트',
  STD: '표준담당자',
  MDL: '모델러',
  QLT: '품질담당자',
  MIG: '이행담당자',
  VIEWER: '조회자',
}
export const ROLE_DESC: Record<MbrRole, string> = {
  SYS: '분류체계 설정·도메인그룹·약어·멤버 관리, 신청·승인(즉시 승인 포함), 일괄등록, SQL 쓰기, 모든 메뉴',
  DA: '표준 정책 총괄 : 단어·도메인·용어 신청·승인(신청 시 즉시 승인 선택 가능), 일괄등록, 설정·멤버 관리, SQL 쓰기, 모든 메뉴',
  STD: '단어·도메인·용어 신청, 일괄등록, 설정, SQL 쓰기, 모든 메뉴(승인권 없음)',
  MDL: '단어·도메인·용어·모델 등록·수정·삭제 신청, 일괄등록, 설정, SQL 쓰기, 모든 메뉴(승인권 없음)',
  QLT: '신청·SQL 쓰기, SQL 편집기·모델링·설정 메뉴(품질 진단 기능은 향후 단계)',
  MIG: '신청·SQL 쓰기, SQL 편집기 메뉴(이행 매핑용)',
  VIEWER: '표준사전 조회만',
}

const ALL = BASE_PERMS
const SET_MENUS: readonly BasePerm[] = ['MENU_SET', 'MENU_BAN', 'MENU_CHK', 'MENU_ADM'] // 역할은 설정 메뉴를 묶음으로(요금제가 단계를 나눔)
const MENUS: readonly BasePerm[] = ['MENU_SQL', 'MENU_STD', 'MENU_MODEL', ...SET_MENUS]
export const ROLE_PERMS: Record<MbrRole, readonly BasePerm[]> = {
  SYS: ALL,
  DA: ALL,
  STD: ['SETTINGS', 'BULK', 'REQUEST', 'CRUD', ...MENUS],
  MDL: ['SETTINGS', 'BULK', 'REQUEST', 'CRUD', ...MENUS],
  QLT: ['REQUEST', 'CRUD', 'MENU_SQL', 'MENU_MODEL', ...SET_MENUS],
  MIG: ['REQUEST', 'CRUD', 'MENU_SQL'],
  VIEWER: ['MENU_STD'],
}

// 요금제 — FREE = 요금제 없음·만료(표준사전 조회만), 가격 정본은 DB sys_fee_plan(sql/049)
export const PLANS = ['FREE', 'P1', 'P2', 'P3', 'P4'] as const
export type PlanCd = (typeof PLANS)[number]
export const PLAN_NM: Record<PlanCd, string> = { FREE: '무료(조회)', P1: '개발자', P2: '표준담당자', P3: '모델러', P4: 'DA' }
export const PLAN_PERMS: Record<PlanCd, readonly BasePerm[]> = {
  // 설정 서브메뉴(2026-10-19 마스터 표) : 개발자 = 설정·이력 / 표준담당자 = + 금칙어·금칙어 일괄등록 / 모델러 = + 표준 점검·리버스 / DA = + 멤버·승인
  FREE: ['MENU_STD'],
  P1: ['SETTINGS', 'CRUD', 'MENU_SQL', 'MENU_SET'],
  P2: ['SETTINGS', 'BULK', 'REQUEST', 'CRUD', 'MENU_SQL', 'MENU_STD', 'MENU_SET', 'MENU_BAN'],
  P3: ['SETTINGS', 'BULK', 'REQUEST', 'CRUD', 'MENU_SQL', 'MENU_STD', 'MENU_MODEL', 'MENU_SET', 'MENU_BAN', 'MENU_CHK'],
  P4: ALL,
}

const isRole = (r: unknown): r is MbrRole => typeof r === 'string' && (ROLES as readonly string[]).includes(r)
export const isPlan = (p: unknown): p is PlanCd => typeof p === 'string' && (PLANS as readonly string[]).includes(p)

// 실제 권한 = 역할 ∩ 요금제 + 파생 권한. 멤버 아님(역할 없음·구 코드) = 빈 목록
export function effPerms(role: string | null | undefined, plan: string | null | undefined): Perm[] {
  if (!isRole(role)) return []
  const p = new Set<BasePerm>(PLAN_PERMS[isPlan(plan) ? plan : 'FREE'])
  const b = new Set(ROLE_PERMS[role].filter((x) => p.has(x)))
  const out: Perm[] = ['VIEW', ...b]
  const both = (x: BasePerm, y: BasePerm) => b.has(x) && b.has(y)
  if (b.has('MENU_STD')) out.push('STD_VIEW')
  if (both('REQUEST', 'MENU_STD')) out.push('STD_REQ')
  if (b.has('MENU_MODEL')) out.push('MODEL_VIEW')
  if (both('REQUEST', 'MENU_MODEL')) out.push('MODEL_EDIT')
  if (b.has('MENU_SET')) out.push('SET_VIEW')
  if (b.has('MENU_BAN')) out.push('BAN_VIEW')
  if (both('MENU_BAN', 'BULK')) out.push('BAN_EDIT')
  if (b.has('MENU_CHK')) out.push('CHK_VIEW')
  if (b.has('MENU_ADM')) out.push('ADM_VIEW')
  if (both('MENU_ADM', 'SETTINGS')) out.push('MBR_ADMIN')
  if (b.has('MENU_SQL')) out.push('SQL_QUERY')
  if (b.has('APPROVE')) out.push('DDL_APPROVE')
  if (both('APPROVE', 'SETTINGS')) out.push('DB_CONN_ADMIN')
  return out
}

// 역할만 본 권한(요금제 무관 = 요금제4) — 권한 상승 판정·역할 설명용
export const can = (role: string | null | undefined, perm: Perm) => effPerms(role, 'P4').includes(perm)

// 역할 지정·변경 가능 = 대상 역할(지금·바꿀)의 표 권한이 모두 내 역할 표 권한 안(MDL 이 자기·남을 DA 로 못 올림)
export function canAssign(myRole: string | null | undefined, ...targets: (string | null | undefined)[]) {
  if (!isRole(myRole) || !ROLE_PERMS[myRole].includes('SETTINGS')) return false
  return targets.every((t) => isRole(t) && ROLE_PERMS[t].every((x) => ROLE_PERMS[myRole].includes(x)))
}

export const STS_NM: Record<string, string> = { REQ: '승인대기', CNFM: '승인완료', RJCT: '반려', DSCD: '폐기' }
export const APV_STS_NM: Record<string, string> = { REQ: '대기', APV: '승인', RJCT: '반려', CNCL: '취소' }
export const ACT_NM: Record<string, string> = { INS: '등록', UPD: '수정', DEL: '삭제' }
