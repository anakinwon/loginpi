// DBA 학습 10-2 튜닝 사례집(PRD 12 §10-2, 결정 D9) — 자체 작성 예제만(고객 데이터 사례화는 동의 절차 뒤). 문제 SQL·계획 요지·고침·효과
//  수치는 설명용 예시값이다(실측 아님). 화면 components/learn/learn.tsx 가 읽는다

export type TuningCase = {
  id: string
  title: string
  problemSql: string
  plan: string // 계획 요지(한두 줄)
  cause: string
  fixSql: string
  effect: string
}

export const CASES: TuningCase[] = [
  {
    id: 'c01',
    title: '날짜 칼럼 가공으로 인덱스 미사용',
    problemSql: "SELECT ord_id, ord_amt FROM ord WHERE to_char(ord_dtm, 'YYYYMMDD') = '20261101'",
    plan: 'Seq Scan on ord (rows removed 9,950,000)',
    cause: '칼럼에 함수를 씌워 (ord_dtm) 인덱스를 쓸 수 없음',
    fixSql: "SELECT ord_id, ord_amt FROM ord WHERE ord_dtm >= '2026-11-01' AND ord_dtm < '2026-11-02'",
    effect: '예시 : 2,300ms → 4ms (Index Scan using x_ord_01)',
  },
  {
    id: 'c02',
    title: '암시적 형변환 — 문자 칼럼에 숫자 상수',
    problemSql: 'SELECT * FROM cust WHERE tel_no = 01012345678',
    plan: 'Seq Scan on cust, Filter: ((tel_no)::numeric = 1012345678)',
    cause: '칼럼 쪽이 숫자로 변환되어 인덱스 무력화 + 앞자리 0 유실로 결과도 틀림',
    fixSql: "SELECT cust_id, cust_nm FROM cust WHERE tel_no = '01012345678'",
    effect: '예시 : 900ms → 1ms, 결과 정확성 회복',
  },
  {
    id: 'c03',
    title: '카디널리티 오추정으로 잘못된 Nested Loop',
    problemSql: "SELECT o.ord_id, d.prod_id FROM ord o JOIN ord_dtl d ON d.ord_id = o.ord_id WHERE o.sts_cd = 'NEW'",
    plan: 'Nested Loop (예상 40행 / 실제 400,000행), inner Index Scan loops=400,000',
    cause: '대량 적재 뒤 통계 미갱신 — sts_cd 분포가 바뀜',
    fixSql: 'ANALYZE ord;  -- 이후 같은 SQL 이 Hash Join 으로 바뀜',
    effect: '예시 : 38s → 1.9s',
  },
  {
    id: 'c04',
    title: 'OFFSET 깊은 페이지 조회',
    problemSql: 'SELECT brd_id, ttl FROM brd ORDER BY reg_dtm DESC OFFSET 200000 LIMIT 20',
    plan: 'Limit → Index Scan Backward (200,020행 읽고 200,000행 버림)',
    cause: 'OFFSET 은 앞 페이지 행을 모두 읽은 뒤 버린다',
    fixSql: 'SELECT brd_id, ttl FROM brd WHERE reg_dtm < $1 ORDER BY reg_dtm DESC LIMIT 20  -- $1 = 이전 페이지 마지막 값(키셋)',
    effect: '예시 : 페이지 깊이와 무관하게 2ms 안팎',
  },
  {
    id: 'c05',
    title: 'NOT IN 부질의와 NULL',
    problemSql: 'SELECT cust_id FROM cust WHERE cust_id NOT IN (SELECT cust_id FROM ord)',
    plan: 'Seq Scan on cust, Filter: (NOT (hashed SubPlan 1)) — ord.cust_id 에 NULL 1건이면 결과 0행',
    cause: 'NOT IN 은 부질의에 NULL 이 있으면 항상 UNKNOWN, 안티 조인 최적화도 제한됨',
    fixSql: 'SELECT c.cust_id FROM cust c WHERE NOT EXISTS (SELECT 1 FROM ord o WHERE o.cust_id = c.cust_id)',
    effect: '예시 : Hash Anti Join 으로 12s → 0.8s, NULL 에도 올바른 결과',
  },
  {
    id: 'c06',
    title: '파티션 키 가공으로 프루닝 실패',
    problemSql: 'SELECT count(*) FROM log_evt WHERE extract(year FROM evt_dtm) = 2026',
    plan: 'Append (36개 파티션 전부 Seq Scan)',
    cause: '파티션 키(evt_dtm)에 함수를 씌워 프루닝 불가',
    fixSql: "SELECT count(*) FROM log_evt WHERE evt_dtm >= '2026-01-01' AND evt_dtm < '2027-01-01'",
    effect: '예시 : 36개 → 12개 파티션만 스캔, 41s → 13s',
  },
  {
    id: 'c07',
    title: '선두 칼럼 없는 복합 인덱스',
    problemSql: "SELECT * FROM ord WHERE ord_dt = '2026-11-01'  -- 인덱스는 (cust_id, ord_dt)",
    plan: 'Seq Scan on ord',
    cause: '복합 인덱스 선두 칼럼(cust_id) 조건이 없어 범위 탐색 불가',
    fixSql: 'CREATE INDEX CONCURRENTLY x_ord_03 ON ord (ord_dt);  -- 날짜 단독 조회가 잦을 때',
    effect: '예시 : 1,800ms → 6ms (쓰기 부담 늘어나는 점 함께 검토)',
  },
]
