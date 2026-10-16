// DBMS 프로파일(순수, 2026-10-17 마스터 지시) — 대상 DBMS 별 물리 생성 규칙(대소문자·식별자 길이·PK·시스템 컬럼·FK·인덱스·파티션·함수)과 업종 기반 DBMS 추천
// DBMS 선택 시점 = 2단계 결정 : 프로젝트 생성 시 대상 DBMS(예정) 필수 선언(mdl_prj.trgt_dbms_cd, sql/024) → 물리 모델(MD5)에서 프로젝트 × DBMS 로 확정
// 표준·개념·논리는 DBMS 무관(도메인 = 논리 데이터타입, DBMS별 타입은 std_tp_map). 1차 프로파일 3종, DDL 생성기(MD5-3)가 이 규칙을 그대로 사용
// ponytail: 코드 상수 — 운영 중 편집 요구가 생기면 DB 테이블화

export const DBMS_CDS = ['0014', '0001', '0013'] as const
export type DbmsCd = (typeof DBMS_CDS)[number]

export interface DbmsPrfl {
  cd: DbmsCd
  nm: string
  identCase: 'upper' | 'lower' // 물리 모델 전환 시 대·소문자 기본 제안값(선택 가능) — 그 전 단계는 항상 대문자
  identMax: number // 식별자 최대 길이(DA 기준)
  pk: string
  sysCols: string
  nowFn: string
  modDtm: string // 변경일시 갱신 방식
  fk: string
  idx: string
  partition: string
  funcs: string
}

const ORACLE: Omit<DbmsPrfl, 'cd' | 'nm'> = {
  identCase: 'upper',
  identMax: 30, // 정의서 §8.5(객체 30자 이내), 12.2+ 128바이트 허용이지만 DA 표준 우선
  pk: '본질 식별자 또는 NUMBER + 시퀀스, PK_테이블명',
  sysCols: 'REGR_ID·REG_DTM·MODR_ID·MOD_DTM(맨 끝)',
  nowFn: 'SYSDATE / SYSTIMESTAMP',
  modDtm: 'BEFORE UPDATE 트리거(PL/SQL)',
  fk: '물리 FK 생성 안 함(STD-08, 관계는 모델·메타에만)',
  idx: 'X_테이블명_NN, PK 포함 최대 5',
  partition: 'INTERVAL RANGE(일시)',
  funcs: 'NVL·DECODE·ROWNUM·TO_CHAR',
}
export const DBMS_PRFL: Record<DbmsCd, DbmsPrfl> = {
  '0014': {
    cd: '0014',
    nm: 'PostgreSQL',
    identCase: 'lower',
    identMax: 63,
    pk: 'UUID gen_random_uuid() 또는 본질 식별자, <테이블>_pkey',
    sysCols: 'regr_id·reg_dtm·modr_id·mod_dtm(맨 끝)',
    nowFn: 'CURRENT_TIMESTAMP',
    modDtm: '트리거 함수(plpgsql)',
    fk: '물리 FK 생성(PostgREST 조인, 정의서 §8.5)',
    idx: 'idx_<테이블>_<컬럼>, 6개 이상이면 사유',
    partition: '선언적 RANGE(PARTITION OF)',
    funcs: 'COALESCE·CASE·LIMIT·to_char',
  },
  '0001': { cd: '0001', nm: 'ORACLE', ...ORACLE },
  '0013': { cd: '0013', nm: 'TIBERO', ...ORACLE }, // Oracle 호환 가정 [확인중 : 티베로 기술지원]
}

export const isDbms = (v: unknown): v is DbmsCd => typeof v === 'string' && (DBMS_CDS as readonly string[]).includes(v)
export const dbmsList = () => DBMS_CDS.map((cd) => DBMS_PRFL[cd])

// 대·소문자 원칙(마스터 지시 2026-10-17) : 표준·개념·논리·물리 모델링까지 모든 이름은 DBMS 와 무관하게 대문자로 일관,
// 실제 물리 모델 전환(DDL 생성) 시점에만 사용자가 대문자/소문자를 선택 — 기본 제안 = 프로파일 identCase(Oracle·Tibero 대문자, PostgreSQL 소문자)
export type IdentCase = 'upper' | 'lower'
export const defaultCase = (cd?: string | null): IdentCase => (isDbms(cd) ? DBMS_PRFL[cd].identCase : 'upper')
export const renderIdent = (nm: string, c: IdentCase = 'upper') => (c === 'lower' ? nm.toLowerCase() : nm.toUpperCase())

// 업종 기반 대상 DBMS 추천(반자동 1차 규칙) — 금융·공공은 상용 RDBMS 운영 관행이 많아 Oracle 계열, 그 외는 PostgreSQL
export function recommendDbms(indstry?: string | null): { cd: DbmsCd; why: string } {
  if (indstry === 'FIN') return { cd: '0001', why: '금융 : 원장·정합성 중심 상용 RDBMS(Oracle) 운영 관행' }
  if (indstry === 'PUB') return { cd: '0001', why: '공공 : 기관 표준·기존 시스템 연계가 Oracle 계열(Oracle·Tibero) 중심' }
  return { cd: '0014', why: '오픈소스·클라우드 친화(PostgreSQL), 이 플랫폼 기본 DBMS' }
}
