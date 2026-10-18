// 분류체계 역할 R&R 7종과 권한표(화면·서버 공용, 서버 전용 import 없음) — 코드 정의 정본은 DB std_cmn_cd(MBR_ROLE, sql/012)
// 승인 1단계 : 승인권자(DA·STD)는 승인 화면에서 본인 신청도 승인 가능(처리자 = 신청자로 기록)
// 등록·수정·삭제 시 즉시 승인(SELF_APPROVE)은 DA만 선택 가능, 그 외는 반드시 승인 화면을 거친다(2026-10-16 마스터 지시)
export const ROLES = ['SYS', 'DA', 'STD', 'MDL', 'QLT', 'MIG', 'VIEWER'] as const
export type MbrRole = (typeof ROLES)[number]
export type Perm = 'VIEW' | 'REQUEST' | 'APPROVE' | 'SELF_APPROVE' | 'BULK' | 'SETTINGS' | 'DDL_APPROVE' | 'DB_CONN_ADMIN' | 'SQL_QUERY' | 'SQL_WRITE'

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
  SYS: '분류체계 설정·도메인그룹·약어·멤버 관리, 조회. 표준 데이터 신청·승인 없음',
  DA: '표준 정책 총괄 : 단어·도메인·용어 신청·승인(신청 시 즉시 승인 선택 가능), 일괄등록, 설정·멤버 관리',
  STD: '단어·도메인·용어 신청·승인(1단계 승인권자), 일괄등록',
  MDL: '단어·도메인·용어 등록·수정·삭제 신청(승인권 없음), 본인 신청 취소',
  QLT: '조회·엑셀 내려받기(품질 진단 기능은 향후 단계)',
  MIG: '조회·엑셀 내려받기(이행 매핑용)',
  VIEWER: '조회만',
}

export const PERM: Record<Perm, readonly MbrRole[]> = {
  VIEW: ROLES,
  REQUEST: ['DA', 'STD', 'MDL'],
  APPROVE: ['DA', 'STD'],
  SELF_APPROVE: ['DA'],
  BULK: ['DA', 'STD'],
  SETTINGS: ['SYS', 'DA'],
  // DDL 직접 실행(2026-10-18) : 실행 요청 = REQUEST, 승인(자기 승인 금지)·접속 프로파일·에이전트 토큰 관리 = DA
  DDL_APPROVE: ['DA'],
  DB_CONN_ADMIN: ['DA'],
  // SQL 편집기(2026-10-18) : 조회 = 데이터 담당 역할(READ ONLY 트랜잭션 강제), 쓰기(DML·DDL) 즉시 실행 = DA 만(마스터 결정 'DBeaver 처럼 전부 즉시')
  SQL_QUERY: ['DA', 'STD', 'MDL', 'QLT', 'MIG'],
  SQL_WRITE: ['DA'],
}
export const can = (role: string | null | undefined, perm: Perm) => !!role && (PERM[perm] as readonly string[]).includes(role)

export const STS_NM: Record<string, string> = { REQ: '승인대기', CNFM: '승인완료', RJCT: '반려', DSCD: '폐기' }
export const APV_STS_NM: Record<string, string> = { REQ: '대기', APV: '승인', RJCT: '반려', CNCL: '취소' }
export const ACT_NM: Record<string, string> = { INS: '등록', UPD: '수정', DEL: '삭제' }
