// DBA 학습 10-1 SQLP·DAP 실습 문제 은행(PRD 12 §10-1, 결정 D9 — 전부 자체 작성, 고객 데이터 없음) + 채점·진도 요약 순수 함수
//  서버(채점 재확인)·클라이언트(화면) 공용. 실행계획은 PostgreSQL EXPLAIN(FORMAT JSON) 모양을 줄인 예시. 시험 : node --test src/lib/learn/learn.test.mjs

export type Topic = 'INDEX' | 'JOIN' | 'PARTITION' | 'NORMAL' | 'NAMING' | 'ISOLATION' | 'LOCK'
export const TOPICS: Topic[] = ['INDEX', 'JOIN', 'PARTITION', 'NORMAL', 'NAMING', 'ISOLATION', 'LOCK']

export type Question = {
  id: string
  topic: Topic
  level: 1 | 2 | 3 // 1 기초 · 2 중급 · 3 실전
  q: string
  sql?: string
  plan?: unknown // 실행계획 JSON 조각
  choices: string[]
  answer: number // choices 인덱스
  expl: string
}

export const QUESTIONS: Question[] = [
  {
    id: 'q01', topic: 'INDEX', level: 1,
    q: '아래 계획에서 rows 가 1,000만 건인 ord 테이블을 cust_id = ? 조건으로 조회했다. 병목의 원인으로 가장 알맞은 것은?',
    sql: 'SELECT ord_id, ord_amt FROM ord WHERE cust_id = $1',
    plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'ord', Filter: '(cust_id = $1)', 'Plan Rows': 12, 'Rows Removed by Filter': 9999988 },
    choices: ['cust_id 칼럼에 인덱스가 없어 전체 스캔', '정렬 메모리(work_mem) 부족', '중첩 루프 조인의 내부 반복', '통계가 너무 최신이라서'],
    answer: 0,
    expl: '12건을 찾으려고 999만 건을 버렸다(Rows Removed by Filter). 선택도가 매우 좋은 조건이므로 ord(cust_id) 인덱스를 만들면 Index Scan 으로 바뀐다.',
  },
  {
    id: 'q02', topic: 'INDEX', level: 2,
    q: '인덱스 (reg_dtm) 이 있는데도 아래 SQL 이 Seq Scan 을 탄다. 가장 알맞은 고침은?',
    sql: "SELECT * FROM ord WHERE to_char(reg_dtm, 'YYYYMMDD') = '20261101'",
    plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'ord', Filter: "(to_char(reg_dtm, 'YYYYMMDD') = '20261101')" },
    choices: ['인덱스를 다시 만든다', "reg_dtm >= '2026-11-01' AND reg_dtm < '2026-11-02' 범위 조건으로 바꾼다", 'ANALYZE 를 돌린다', 'SELECT * 를 SELECT 1 로 바꾼다'],
    answer: 1,
    expl: '칼럼을 함수로 가공하면 (reg_dtm) 인덱스를 쓸 수 없다. 칼럼은 그대로 두고 상수 쪽을 범위로 바꾸는 것이 정석이다(함수 기반 인덱스는 차선).',
  },
  {
    id: 'q03', topic: 'INDEX', level: 2,
    q: '복합 인덱스 (cust_id, ord_dt) 가 있다. 다음 중 이 인덱스를 가장 효율적으로 쓰는 조건은?',
    choices: ["ord_dt = '2026-11-01'", "cust_id = 7 AND ord_dt BETWEEN '2026-10-01' AND '2026-10-31'", "ord_dt > '2026-01-01' OR cust_id = 7", "cust_id::text LIKE '7%'"],
    answer: 1,
    expl: '선두 칼럼(cust_id)을 = 로 고정하고 둘째 칼럼(ord_dt)을 범위로 주면 인덱스 범위 스캔 폭이 가장 좁다. 선두 칼럼 없는 조건은 Skip Scan 지원이 없으면 비효율적이다.',
  },
  {
    id: 'q04', topic: 'INDEX', level: 3,
    q: '아래 계획에서 Heap Fetches 가 매우 크다. Index Only Scan 인데 테이블을 계속 읽는 이유는?',
    plan: { 'Node Type': 'Index Only Scan', 'Index Name': 'x_ord_02', 'Actual Rows': 50000, 'Heap Fetches': 49870 },
    choices: ['인덱스가 손상되었다', 'Visibility Map 이 갱신되지 않아(VACUUM 부족) 가시성 확인을 위해 힙을 읽는다', '인덱스 칼럼 순서가 틀렸다', 'Index Only Scan 은 원래 항상 힙을 읽는다'],
    answer: 1,
    expl: 'PostgreSQL 의 Index Only Scan 은 Visibility Map 에서 all-visible 로 표시된 페이지만 힙 방문을 생략한다. VACUUM 이 밀리면 Heap Fetches 가 늘어난다.',
  },
  {
    id: 'q05', topic: 'JOIN', level: 1,
    q: '작은 테이블(100건)과 큰 테이블(1,000만 건)을 큰 쪽 조인 칼럼 인덱스로 조인할 때 일반적으로 가장 유리한 조인 방식은?',
    choices: ['Nested Loop(작은 쪽 선행, 큰 쪽 인덱스 탐색)', 'Hash Join(큰 쪽으로 해시 테이블 생성)', 'Merge Join(양쪽 전체 정렬)', 'Cartesian Product'],
    answer: 0,
    expl: '선행 건수가 적고 후행에 인덱스가 있으면 Nested Loop 가 100번의 인덱스 탐색으로 끝난다. Hash 를 쓰더라도 해시 테이블은 작은 쪽으로 만들어야 한다.',
  },
  {
    id: 'q06', topic: 'JOIN', level: 2,
    q: '아래 Hash Join 계획에서 Batches 가 16 이다. 이것이 의미하는 것은?',
    plan: { 'Node Type': 'Hash Join', Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'ord' }, { 'Node Type': 'Hash', 'Hash Batches': 16, 'Peak Memory Usage': 4096 }] },
    choices: ['해시 테이블이 work_mem 을 넘어 디스크로 나뉘어 처리되었다', '16개 병렬 작업자가 사용되었다', '16번 재시도했다', '인덱스 16개를 사용했다'],
    answer: 0,
    expl: 'Hash Batches > 1 은 Build 쪽이 메모리(work_mem × hash_mem_multiplier)에 다 들어가지 않아 임시 파일로 분할했다는 뜻이다. Build 쪽 건수를 줄이거나 메모리를 조정한다.',
  },
  {
    id: 'q07', topic: 'JOIN', level: 2,
    q: '양쪽 입력이 이미 조인 키 순서로 정렬되어 있고(인덱스 순서 읽기) 결과도 그 순서가 필요할 때 유리한 방식은?',
    choices: ['Nested Loop', 'Hash Join', 'Merge Join', 'Semi Join 만 가능'],
    answer: 2,
    expl: 'Merge Join 은 정렬된 두 입력을 한 번씩 훑으며 짝을 맞춘다. 정렬 비용이 이미 없으면 대량 조인에서도 효율적이고 출력 순서도 유지된다.',
  },
  {
    id: 'q08', topic: 'JOIN', level: 3,
    q: 'Nested Loop 의 내부 노드가 loops=50000, 각 실행 0.2ms 로 찍혔다. 선행 결과 예상 건수(Plan Rows)는 50 이었다. 가장 먼저 의심할 것은?',
    plan: { 'Node Type': 'Nested Loop', 'Plan Rows': 50, 'Actual Rows': 50000, Plans: [{ 'Node Type': 'Seq Scan', 'Plan Rows': 50, 'Actual Rows': 50000 }, { 'Node Type': 'Index Scan', 'Actual Loops': 50000 }] },
    choices: ['인덱스가 너무 많다', '선행 테이블 통계가 낡아 건수를 1,000배 과소 추정했다', '디스크가 느리다', 'Nested Loop 는 항상 나쁘다'],
    answer: 1,
    expl: '예상 50 대 실제 50,000 — 카디널리티 오추정이 조인 방식 선택을 망쳤다. ANALYZE 로 통계를 갱신하면 Hash Join 으로 바뀔 가능성이 크다.',
  },
  {
    id: 'q09', topic: 'PARTITION', level: 1,
    q: '월별 RANGE 파티션(ord_dt 기준) 테이블에서 파티션 프루닝이 일어나는 조건은?',
    choices: ["WHERE ord_dt >= '2026-10-01' AND ord_dt < '2026-11-01'", "WHERE extract(month FROM ord_dt) = 10", 'WHERE cust_id = 7', "WHERE ord_dt::text LIKE '2026-10%'"],
    answer: 0,
    expl: '파티션 키 칼럼을 가공하지 않은 범위 조건이어야 옵티마이저가 해당 파티션만 고른다. 함수·형변환을 씌우면 전 파티션을 읽는다.',
  },
  {
    id: 'q10', topic: 'PARTITION', level: 2,
    q: '아래 계획은 무엇을 보여 주는가?',
    plan: { 'Node Type': 'Append', 'Subplans Removed': 22, Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'ord_2026_10' }, { 'Node Type': 'Seq Scan', 'Relation Name': 'ord_2026_11' }] },
    choices: ['24개 파티션 중 22개가 실행 시점 프루닝으로 제외되었다', '22개 파티션에서 오류가 났다', '파티션이 2개뿐이다', '병렬 처리가 22번 일어났다'],
    answer: 0,
    expl: "'Subplans Removed' 는 바인드 변수 값 등으로 실행 시점에 제외된 파티션 수다. 2개 파티션만 읽었으므로 프루닝이 잘 된 계획이다.",
  },
  {
    id: 'q11', topic: 'PARTITION', level: 3,
    q: '오래된 월 데이터를 매달 정리해야 한다. 파티션 테이블에서 가장 부하가 적은 방법은?',
    choices: ['DELETE ... WHERE ord_dt < ?', '해당 월 파티션을 DETACH 후 보관 또는 DROP', 'UPDATE 로 del_yn = Y', 'VACUUM FULL'],
    answer: 1,
    expl: '파티션 단위 DETACH·DROP 은 메타데이터 작업이라 대량 DELETE 의 redo·bloat·잠금 부담이 없다. 파티션 설계의 핵심 이점 중 하나다.',
  },
  {
    id: 'q12', topic: 'NORMAL', level: 1,
    q: "주문 테이블에 '상품목록' 칼럼이 'A,B,C' 처럼 쉼표로 여러 값을 담고 있다. 위반한 정규형은?",
    choices: ['1NF(원자값)', '2NF(부분 함수 종속)', '3NF(이행 함수 종속)', 'BCNF'],
    answer: 0,
    expl: '한 칼럼에 반복 값이 들어 있어 원자성을 어긴다. 주문상품 테이블로 분리해 1NF 를 만족시킨다.',
  },
  {
    id: 'q13', topic: 'NORMAL', level: 2,
    q: '주문상품(주문번호, 상품번호, 수량, 상품명) 에서 주식별자는 (주문번호, 상품번호) 이다. 상품명 때문에 위반되는 정규형은?',
    choices: ['1NF', '2NF — 상품명이 상품번호에만 종속(부분 종속)', '3NF', '위반 없음'],
    answer: 1,
    expl: '상품명은 복합 식별자의 일부(상품번호)에만 종속되므로 부분 함수 종속, 2NF 위반이다. 상품 엔터티로 분리한다.',
  },
  {
    id: 'q14', topic: 'NORMAL', level: 2,
    q: '사원(사원번호, 부서코드, 부서명) 에서 부서명은 부서코드에 종속된다. 위반한 정규형과 해결은?',
    choices: ['1NF — 칼럼 분할', '2NF — 식별자 변경', '3NF — 부서 엔터티로 분리(이행 종속 제거)', 'BCNF — 사원번호 삭제'],
    answer: 2,
    expl: '사원번호 → 부서코드 → 부서명 의 이행 함수 종속이다. 부서(부서코드, 부서명) 로 분리해 3NF 를 만족시킨다.',
  },
  {
    id: 'q15', topic: 'NAMING', level: 1,
    q: 'DA 표준 단어 약어 규칙에 맞는 칼럼명은? (등록일시)',
    choices: ['regDate', 'reg_dtm', 'REGISTER_DATETIME_VALUE', 'rdt'],
    answer: 1,
    expl: "표준 단어 '등록(REG)' + 도메인 접미어 '일시(_DTM)' 의 조합이다. 카멜 표기·풀어쓴 영문·뜻을 알 수 없는 약어는 표준 위반이다.",
  },
  {
    id: 'q16', topic: 'NAMING', level: 2,
    q: '"남/녀" 처럼 값이 2~3개로 고정되고 추가될 일이 없는 코드의 분류로 알맞은 것은?',
    choices: ['유형코드', '구분코드', '상태코드', '자유 텍스트'],
    answer: 1,
    expl: '값이 소수로 고정되면 구분코드, 4개 이상이거나 앞으로 추가될 수 있으면 유형코드로 관리한다. 상태코드는 업무 처리 단계(접수·승인 등)를 나타낸다.',
  },
  {
    id: 'q17', topic: 'NAMING', level: 2,
    q: '표준 물리 객체 이름 규칙에 맞는 것은? (테이블 ord 의 PK 와 첫 번째 인덱스)',
    choices: ['ord_pkey / idx_ord_1', 'pk_ord / x_ord_01', 'PK / INDEX1', 'ord_pk_constraint / ord_index'],
    answer: 1,
    expl: 'PK 는 pk_<테이블>, 인덱스는 x_<테이블>_NN(두 자리 순번)으로 이름을 붙인다. 이름 없는 PRIMARY KEY 가 만드는 기본 _pkey 이름은 금지다.',
  },
  {
    id: 'q18', topic: 'ISOLATION', level: 1,
    q: 'PostgreSQL 기본 격리 수준 READ COMMITTED 에서 한 트랜잭션 안에 같은 SELECT 를 두 번 실행했다. 일어날 수 있는 현상은?',
    choices: ['Dirty Read', 'Non-Repeatable Read(다른 트랜잭션 커밋 값이 두 번째에 보임)', '어떤 이상 현상도 없음', '항상 교착 상태'],
    answer: 1,
    expl: 'READ COMMITTED 는 문장마다 새 스냅샷을 잡으므로 두 번째 조회에 다른 트랜잭션의 커밋 결과가 보일 수 있다. PostgreSQL 은 Dirty Read 를 허용하지 않는다.',
  },
  {
    id: 'q19', topic: 'ISOLATION', level: 3,
    q: 'REPEATABLE READ 에서 UPDATE 중 "could not serialize access due to concurrent update" 오류가 났다. 올바른 대응은?',
    choices: ['격리 수준을 READ UNCOMMITTED 로 낮춘다', '트랜잭션 전체를 처음부터 재시도한다', '오류를 무시하고 커밋한다', 'VACUUM 을 돌린다'],
    answer: 1,
    expl: '다른 트랜잭션이 먼저 같은 행을 바꿔 커밋했기 때문이다. REPEATABLE READ·SERIALIZABLE 을 쓰는 앱은 직렬화 실패(40001)를 트랜잭션 단위로 재시도하도록 만들어야 한다.',
  },
  {
    id: 'q20', topic: 'LOCK', level: 1,
    q: '세션 A 가 행 X 를, 세션 B 가 행 Y 를 잠근 뒤 A 는 Y, B 는 X 를 기다린다. 이 상황과 DBMS 의 처리는?',
    choices: ['라이브락 — 둘 다 무한 대기', '교착 상태(Deadlock) — DBMS 가 감지해 한쪽 트랜잭션을 오류로 끝낸다', '정상 대기 — 곧 풀린다', '테이블 잠금으로 자동 승격'],
    answer: 1,
    expl: 'PostgreSQL 은 deadlock_timeout 뒤 순환 대기를 감지해 한쪽에 40P01 오류를 낸다. 예방책은 여러 행을 항상 같은 순서(예: 키 오름차순)로 잠그는 것이다.',
  },
  {
    id: 'q21', topic: 'LOCK', level: 2,
    q: '운영 중 큰 테이블에 인덱스를 추가할 때 쓰기 작업을 막지 않는 방법은? (PostgreSQL)',
    choices: ['CREATE INDEX', 'CREATE INDEX CONCURRENTLY', 'LOCK TABLE ... IN ACCESS EXCLUSIVE MODE 후 생성', 'REINDEX TABLE'],
    answer: 1,
    expl: '일반 CREATE INDEX 는 SHARE 잠금으로 INSERT·UPDATE·DELETE 를 막는다. CONCURRENTLY 는 오래 걸리지만 쓰기를 막지 않는다(트랜잭션 블록 안에서는 불가, 실패 시 INVALID 인덱스 정리 필요).',
  },
  {
    id: 'q22', topic: 'LOCK', level: 3,
    q: '아래 잠금 대기 조회 결과에서 ALTER TABLE 이 오래 기다리는 동안 새 SELECT 들까지 줄줄이 멈췄다. 이유는?',
    plan: { blocked: 'ALTER TABLE ord ADD COLUMN memo text', wait_mode: 'AccessExclusiveLock', blocker: 'idle in transaction (35분)', queued_after: 'SELECT ... FROM ord (120 세션)' },
    choices: ['SELECT 가 원래 테이블 잠금을 건다', '대기 중인 AccessExclusiveLock 요청 뒤로 새 AccessShareLock 요청이 줄을 서기 때문', '디스크가 가득 찼다', 'autovacuum 때문'],
    answer: 1,
    expl: '잠금 대기열은 순서를 지키므로, 대기 중인 배타 잠금 뒤에 온 SELECT 도 막힌다. DDL 전 lock_timeout 을 짧게 두고, idle in transaction 세션을 먼저 정리한다.',
  },
]

const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]))
export const questionById = (id: string) => BY_ID.get(id)

// 채점 — 없는 문제·범위 밖 선택은 null(서버는 400)
export function grade(qstId: string, choice: number): boolean | null {
  const q = BY_ID.get(qstId)
  if (!q || !Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return null
  return q.answer === choice
}

export type ProgressRow = { qstId: string; crctYn: 'Y' | 'N' }
export type TopicScore = { topic: Topic; total: number; solved: number; correct: number }

// 진도 요약 — 은행에 없는 문제(폐기된 id)는 건너뛴다
export function summarize(rows: ProgressRow[]): { total: number; solved: number; correct: number; byTopic: TopicScore[] } {
  const done = new Map(rows.filter((r) => BY_ID.has(r.qstId)).map((r) => [r.qstId, r.crctYn]))
  const byTopic = TOPICS.map((topic) => {
    const qs = QUESTIONS.filter((q) => q.topic === topic)
    return {
      topic,
      total: qs.length,
      solved: qs.filter((q) => done.has(q.id)).length,
      correct: qs.filter((q) => done.get(q.id) === 'Y').length,
    }
  })
  return {
    total: QUESTIONS.length,
    solved: done.size,
    correct: [...done.values()].filter((v) => v === 'Y').length,
    byTopic,
  }
}
