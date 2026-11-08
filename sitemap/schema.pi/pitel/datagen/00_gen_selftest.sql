-- gen 함수 자체 점검 — 결정성·범위·단조성·편향 비율을 assert, 실패 시 예외로 중단
-- 실행 : docker exec -i pitel-pg psql -U postgres -d pitel_dev -v ON_ERROR_STOP=1 < datagen/00_gen_selftest.sql
DO $$
DECLARE
  n bigint := 1000000;
  v double precision;
  c bigint;
BEGIN
  -- 결정성
  ASSERT gen.u(42, 1) = gen.u(42, 1), '결정성 위반';
  -- 범위 [0,1)
  SELECT min(gen.u(k, 3)), max(gen.u(k, 3)) INTO v, v FROM generate_series(1, 100000) k;
  SELECT count(*) INTO c FROM generate_series(1, 100000) k WHERE gen.u(k, 3) < 0 OR gen.u(k, 3) >= 1;
  ASSERT c = 0, 'u 범위 위반';
  -- 단조성 : recent_dtm(k) <= recent_dtm(k+1)
  SELECT count(*) INTO c FROM generate_series(1, 200000) k WHERE gen.recent_dtm(k, 200000) > gen.recent_dtm(k + 1, 200000);
  ASSERT c = 0, format('recent_dtm 단조성 위반 %s건', c);
  -- 기간 경계
  ASSERT gen.recent_dtm(1, n) >= gen.t0() AND gen.recent_dtm(n, n) <= gen.t1(), 'recent_dtm 기간 밖';
  -- S4 최근 3년(2023-11 이후) 비율 55~65%
  SELECT avg((gen.recent_dtm(k, 200000) >= timestamp '2023-11-01')::int) INTO v FROM generate_series(1, 200000) k;
  ASSERT v BETWEEN 0.55 AND 0.65, format('최근 3년 비율 %s', v);
  -- dtm_to_k 역함수 오차 ±1%
  c := gen.dtm_to_k(gen.recent_dtm(500000, n), n);
  ASSERT abs(c - 500000) < n * 0.01, format('dtm_to_k 오차 %s', c);
  -- S1 skew alpha=6 : 상위 0.01% 번호 점유 15~25%
  SELECT avg((gen.skew(k, 5, n, 6) <= n / 10000)::int) INTO v FROM generate_series(1, 200000) k;
  ASSERT v BETWEEN 0.15 AND 0.25, format('skew 상위 0.01%% 점유 %s', v);
  -- S3 wpick 98/2
  SELECT avg((gen.wpick(k, 9, ARRAY[98, 2]::float8[]) = 1)::int) INTO v FROM generate_series(1, 200000) k;
  ASSERT v BETWEEN 0.975 AND 0.985, format('wpick 98%% 값 %s', v);
  -- S11 고아 0.05% (0.03~0.07%)
  SELECT avg((gen.orphan(k, n, k, 21) > n)::int) INTO v FROM generate_series(1, 200000) k;
  ASSERT v BETWEEN 0.0003 AND 0.0007, format('고아 비율 %s', v);
  -- S8 이름 중복 : 10만 명 중 고유 이름 ≤ 800
  SELECT count(DISTINCT gen.person_nm(k)) INTO c FROM generate_series(1, 100000) k;
  ASSERT c <= 800, format('이름 고유 %s', c);
  -- D11 전화번호 형식
  SELECT count(*) INTO c FROM generate_series(1, 100000) k WHERE gen.phone(k) !~ '^010[0-9]{8}$';
  ASSERT c = 0, '전화번호 형식 위반';
  -- 월 경계 쏠림 : 결과가 항상 같은 달 안
  SELECT count(*) INTO c FROM generate_series(1, 100000) k
   WHERE date_trunc('month', gen.month_edge(gen.recent_dtm(k, 100000), k, 31, 0.3)) <> date_trunc('month', gen.recent_dtm(k, 100000));
  ASSERT c = 0, 'month_edge 달 이탈';
  RAISE NOTICE 'gen 자체 점검 통과';
END $$;
