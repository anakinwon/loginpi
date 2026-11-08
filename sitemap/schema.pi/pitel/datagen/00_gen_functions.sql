-- Pi통신 테스트 데이터 공용 생성 함수(스키마 gen) — CONTEXT.md 5절 결정적 키 공식·의도적 편향 S1~S14 의 기반
-- 실행 : docker exec -i pitel-pg psql -U postgres -d pitel_dev -v ON_ERROR_STOP=1 < datagen/00_gen_functions.sql
-- 모든 함수는 IMMUTABLE(같은 입력 = 같은 출력) — 부모·자식을 조인 없이 병렬 생성해도 부모 키가 항상 존재한다.

CREATE SCHEMA IF NOT EXISTS gen;

-- 데이터 기간(D8)
CREATE OR REPLACE FUNCTION gen.t0() RETURNS timestamp LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT timestamp '2010-01-01 00:00:00' $$;
CREATE OR REPLACE FUNCTION gen.t1() RETURNS timestamp LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT timestamp '2026-10-31 23:59:59' $$;

-- 결정적 균등 난수 [0,1) : 키 k 와 용도 번호 salt 로 해시 — random() 대신 써서 재실행해도 같은 데이터
CREATE OR REPLACE FUNCTION gen.u(k bigint, salt int) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT ((hashint8extended(k, salt) & 9007199254740991)::double precision) / 9007199254740992.0 $$;

-- 균등 정수 1..n
CREATE OR REPLACE FUNCTION gen.uniform(k bigint, salt int, n bigint) RETURNS bigint
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 1 + floor(gen.u(k, salt) * n)::bigint $$;

-- 멱법칙 쏠림 정수 1..n (S1·S2·S14) : alpha 클수록 작은 번호(핫 키)에 몰림, alpha=1 이면 균등
CREATE OR REPLACE FUNCTION gen.skew(k bigint, salt int, n bigint, alpha double precision) RETURNS bigint
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT least(n, 1 + floor(n * power(gen.u(k, salt), alpha))::bigint) $$;

-- 가중 선택 : weights 비율대로 1..길이 중 하나 (S2 인기 상품·S3 상태값 98% 한 값)
CREATE OR REPLACE FUNCTION gen.wpick(k bigint, salt int, weights double precision[]) RETURNS int
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  r double precision := gen.u(k, salt) * (SELECT sum(w) FROM unnest(weights) w);
  i int;
BEGIN
  FOR i IN 1 .. array_length(weights, 1) LOOP
    r := r - weights[i];
    IF r < 0 THEN RETURN i; END IF;
  END LOOP;
  RETURN array_length(weights, 1);
END $$;

-- 가중 코드값 선택 : codes[i] 를 weights[i] 비율로
CREATE OR REPLACE FUNCTION gen.wcode(k bigint, salt int, codes text[], weights double precision[]) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT codes[gen.wpick(k, salt, weights)] $$;

-- 키 번호 → 생성 일시 (D8·S4) : 번호가 클수록 최근(단조 증가 — 자식 일시 ≥ 부모 일시 보장)
-- (x)^0.22 곡선 → 최근 3년에 약 60%. 지터는 이웃 키 간격 안에서만 흔들어 단조성 유지
CREATE OR REPLACE FUNCTION gen.recent_dtm(k bigint, n bigint) RETURNS timestamp
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT gen.t0() + (gen.t1() - gen.t0())
       * power((k - 1 + gen.u(k, 7)) / n::double precision, 0.22)
$$;

-- 연도 → 그 연도 키 범위 역산용 : recent_dtm 의 역함수(일시 → 키 번호 근사) — 실행기의 테이블×연도 분할에 쓴다
CREATE OR REPLACE FUNCTION gen.dtm_to_k(ts timestamp, n bigint) RETURNS bigint
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT greatest(0, least(n, floor(n * power(
    extract(epoch FROM ts - gen.t0()) / extract(epoch FROM gen.t1() - gen.t0()), 1 / 0.22))::bigint))
$$;

-- 부모 일시 이후 자식 일시 : 부모 일시 + 0..max_days 일(기간 끝 넘지 않게)
CREATE OR REPLACE FUNCTION gen.after_dtm(parent timestamp, k bigint, salt int, max_days int) RETURNS timestamp
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT least(gen.t1(), parent + gen.u(k, salt) * make_interval(days => max_days)) $$;

-- 말일·1일 쏠림 (S4) : 확률 p 로 날짜를 그 달 1일 또는 말일로 당긴다(시각은 유지)
CREATE OR REPLACE FUNCTION gen.month_edge(ts timestamp, k bigint, salt int, p double precision) RETURNS timestamp
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN gen.u(k, salt) >= p THEN ts
    WHEN gen.u(k, salt + 1) < 0.5 THEN date_trunc('month', ts) + (ts - date_trunc('day', ts))
    ELSE date_trunc('month', ts) + interval '1 month - 1 day' + (ts - date_trunc('day', ts))
  END
$$;

-- 일자 CHAR(8) (도메인 일자C8)
CREATE OR REPLACE FUNCTION gen.ymd(ts timestamp) RETURNS char(8)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT to_char(ts, 'YYYYMMDD')::char(8) $$;

-- 키 형식화 : 접두어 + 0 채운 번호 (gen.fmt('C', 123, 12) = 'C00000000123')
CREATE OR REPLACE FUNCTION gen.fmt(prefix text, k bigint, width int) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT prefix || lpad(k::text, width, '0') $$;

-- 고아 행 (S11) : 0.05% 확률로 부모 범위 밖 번호(n+1 ~ 2n — 좁은 숫자 키도 넘치지 않게)
CREATE OR REPLACE FUNCTION gen.orphan(parent_k bigint, n bigint, k bigint, salt int) RETURNS bigint
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT CASE WHEN gen.u(k, salt) < 0.0005 THEN n + 1 + (k % greatest(n, 1)) ELSE parent_k END $$;

-- NULL 쏠림 (S5) : 확률 p_null 로 NULL
CREATE OR REPLACE FUNCTION gen.null_p(v anyelement, k bigint, salt int, p_null double precision) RETURNS anyelement
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT CASE WHEN gen.u(k, salt) < p_null THEN NULL ELSE v END $$;

-- 합성 이름 (D11·S8) : 성 20 × 이름 40 = 800 조합 — 동명이인 다수
CREATE OR REPLACE FUNCTION gen.person_nm(k bigint) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT (ARRAY['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','류','홍'])
           [gen.skew(k, 11, 20, 2.0)]
      || (ARRAY['민준','서연','도윤','서윤','시우','지우','하준','하은','주원','지유',
                '지호','윤서','지후','채원','준서','수아','준우','지아','현우','서아',
                '도현','다은','건우','예은','우진','수빈','선우','지민','서진','예린',
                '민재','소율','현준','하린','연우','지원','유준','시은','정우','유나'])
           [gen.uniform(k, 12, 40)]
$$;

-- 합성 법인명 (S13 표기 흔들림 : (주)·㈜·주식회사)
CREATE OR REPLACE FUNCTION gen.corp_nm(k bigint) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT (ARRAY['한빛','누리','미래','대한','하나','새솔','다온','푸른','태양','바른'])[gen.uniform(k, 13, 10)]
      || (ARRAY['전자','물산','건설','정보통신','유통','식품','제약','물류','금융','에너지'])[gen.uniform(k, 14, 10)]
      || (ARRAY['(주)','㈜',' 주식회사','',' (유)'])[gen.wpick(k, 15, ARRAY[50,20,15,10,5]::float8[])]
$$;

-- 합성 휴대전화번호 (D11) : 010 + 8자리 해시값(실제 번호와 무관)
CREATE OR REPLACE FUNCTION gen.phone(k bigint) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT '010' || lpad((gen.uniform(k, 16, 99999999) - 1)::text, 8, '0') $$;

-- 금액 이상치 (S7) : 0.001% 확률 x1000 극단값, 0.1% 확률 음수 조정
CREATE OR REPLACE FUNCTION gen.amt(base numeric, k bigint, salt int) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN gen.u(k, salt) < 0.00001 THEN base * 1000
    WHEN gen.u(k, salt) < 0.00101 THEN -base
    ELSE base
  END
$$;

-- 형식 함정 (S12) : 확률 p 로 코드 앞뒤에 공백
CREATE OR REPLACE FUNCTION gen.dirty(v text, k bigint, salt int, p double precision) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT CASE WHEN gen.u(k, salt) < p THEN ' ' || v || ' ' ELSE v END $$;

-- 넓은 행 (S9) : 확률 p 로 1~4KB 메모(TOAST 유발), 아니면 NULL
CREATE OR REPLACE FUNCTION gen.memo(k bigint, salt int, p double precision) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE WHEN gen.u(k, salt) < p
    THEN repeat('상담 메모 ' || k::text || ' ', 60 + gen.uniform(k, salt + 1, 180)::int)
    ELSE NULL END
$$;
