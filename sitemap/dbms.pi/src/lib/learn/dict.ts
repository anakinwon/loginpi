// DBA 학습 10-3 DBMS 비교 사전(PRD 12 §10-3) — Oracle·Tibero·PostgreSQL 문법·타입·함수 대조(정적, 자체 작성)
//  연결이 있으면 화면이 schema.pi /dbms-profiles 의 실제 타입 매핑(std_tp_map)을 함께 보여준다. filterDict = 검색(순수 함수)

export type DictCat = 'TYPE' | 'FUNC' | 'PAGING' | 'SEQ' | 'DATE' | 'SYNTAX'
export const DICT_CATS: DictCat[] = ['TYPE', 'FUNC', 'PAGING', 'SEQ', 'DATE', 'SYNTAX']

export type DictRow = { cat: DictCat; item: string; oracle: string; tibero: string; pg: string; note?: string }

export const DICT: DictRow[] = [
  { cat: 'TYPE', item: '가변 문자열', oracle: 'VARCHAR2(n)', tibero: 'VARCHAR2(n) / VARCHAR(n)', pg: 'VARCHAR(n) / TEXT', note: 'Oracle·Tibero 는 빈 문자열 = NULL, PostgreSQL 은 구분' },
  { cat: 'TYPE', item: '정수·숫자', oracle: 'NUMBER(p,s)', tibero: 'NUMBER(p,s)', pg: 'NUMERIC(p,s) / INTEGER / BIGINT' },
  { cat: 'TYPE', item: '날짜+시간', oracle: 'DATE(초까지) / TIMESTAMP', tibero: 'DATE / TIMESTAMP', pg: 'TIMESTAMP / TIMESTAMPTZ', note: 'PostgreSQL DATE 는 시간 없음' },
  { cat: 'TYPE', item: '대용량 문자', oracle: 'CLOB', tibero: 'CLOB', pg: 'TEXT' },
  { cat: 'TYPE', item: '이진', oracle: 'BLOB / RAW(n)', tibero: 'BLOB / RAW(n)', pg: 'BYTEA' },
  { cat: 'TYPE', item: '참·거짓', oracle: 'BOOLEAN(23ai~, 그 전엔 CHAR(1))', tibero: 'CHAR(1) 관례', pg: 'BOOLEAN', note: 'DA 표준은 _yn CHAR(1) Y/N' },
  { cat: 'FUNC', item: 'NULL 대체', oracle: 'NVL(a, b)', tibero: 'NVL(a, b)', pg: 'COALESCE(a, b)' },
  { cat: 'FUNC', item: '조건 분기', oracle: 'DECODE(x, 1, a, b)', tibero: 'DECODE(x, 1, a, b)', pg: 'CASE WHEN x = 1 THEN a ELSE b END' },
  { cat: 'FUNC', item: '문자열 붙이기', oracle: "a || b / CONCAT(a, b)", tibero: 'a || b', pg: 'a || b / CONCAT(a, b)', note: 'PG 의 || 는 NULL 이 섞이면 NULL, CONCAT 은 무시' },
  { cat: 'FUNC', item: '부분 문자열', oracle: 'SUBSTR(s, 1, 3)', tibero: 'SUBSTR(s, 1, 3)', pg: 'SUBSTR(s, 1, 3) / SUBSTRING(s FROM 1 FOR 3)' },
  { cat: 'FUNC', item: '문자 → 숫자', oracle: 'TO_NUMBER(s)', tibero: 'TO_NUMBER(s)', pg: "s::numeric / TO_NUMBER(s, '999')" },
  { cat: 'PAGING', item: '상위 N건', oracle: 'FETCH FIRST n ROWS ONLY (12c~) / ROWNUM <= n', tibero: 'ROWNUM <= n / FETCH FIRST n ROWS ONLY', pg: 'LIMIT n / FETCH FIRST n ROWS ONLY' },
  { cat: 'PAGING', item: '건너뛰기', oracle: 'OFFSET m ROWS FETCH NEXT n ROWS ONLY', tibero: 'ROWNUM 중첩 인라인 뷰', pg: 'OFFSET m LIMIT n', note: '깊은 페이지는 키셋 페이징 권장' },
  { cat: 'SEQ', item: '다음 값', oracle: 'seq.NEXTVAL', tibero: 'seq.NEXTVAL', pg: "nextval('seq')" },
  { cat: 'SEQ', item: '자동 증가 칼럼', oracle: 'GENERATED AS IDENTITY (12c~)', tibero: '시퀀스 + 트리거 관례', pg: 'GENERATED ALWAYS AS IDENTITY / SERIAL' },
  { cat: 'DATE', item: '현재 일시', oracle: 'SYSDATE / SYSTIMESTAMP', tibero: 'SYSDATE / SYSTIMESTAMP', pg: 'CURRENT_TIMESTAMP / now()', note: 'PG now() 는 트랜잭션 시작 시각' },
  { cat: 'DATE', item: '날짜 → 문자', oracle: "TO_CHAR(d, 'YYYYMMDD')", tibero: "TO_CHAR(d, 'YYYYMMDD')", pg: "TO_CHAR(d, 'YYYYMMDD')" },
  { cat: 'DATE', item: '날짜 더하기', oracle: 'd + 1 / ADD_MONTHS(d, 1)', tibero: 'd + 1 / ADD_MONTHS(d, 1)', pg: "d + INTERVAL '1 day' / d + INTERVAL '1 month'" },
  { cat: 'DATE', item: '일 단위 절삭', oracle: 'TRUNC(d)', tibero: 'TRUNC(d)', pg: "date_trunc('day', d)" },
  { cat: 'SYNTAX', item: '더미 테이블', oracle: 'SELECT 1 FROM DUAL', tibero: 'SELECT 1 FROM DUAL', pg: 'SELECT 1' },
  { cat: 'SYNTAX', item: '외부 조인', oracle: 'LEFT JOIN / (+) 구문', tibero: 'LEFT JOIN / (+) 구문', pg: 'LEFT JOIN 만', note: '(+) 는 이식성 위해 쓰지 않음' },
  { cat: 'SYNTAX', item: 'MERGE·UPSERT', oracle: 'MERGE INTO', tibero: 'MERGE INTO', pg: 'INSERT ... ON CONFLICT DO UPDATE / MERGE(15~)' },
  { cat: 'SYNTAX', item: '계층 조회', oracle: 'CONNECT BY PRIOR', tibero: 'CONNECT BY PRIOR', pg: 'WITH RECURSIVE' },
]

// 분류·검색어 필터(대소문자 무시, 항목·세 DBMS 표기·비고 전체 대상)
export function filterDict(rows: DictRow[], cat: DictCat | 'ALL', term: string): DictRow[] {
  const t = term.trim().toLowerCase()
  return rows.filter(
    (r) =>
      (cat === 'ALL' || r.cat === cat) &&
      (!t || [r.item, r.oracle, r.tibero, r.pg, r.note ?? ''].some((v) => v.toLowerCase().includes(t))),
  )
}
