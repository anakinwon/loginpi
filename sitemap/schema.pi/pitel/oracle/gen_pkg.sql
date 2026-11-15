-- pitel Oracle 생성 함수 패키지 GEN : PostgreSQL datagen/00_gen_functions.sql 의 gen.* 21개를 같은 계산으로 옮김(PRD dbms.pi 11.6 ORA-R04)
-- 실행 : node oracle/s1.mjs gen --target oracle (pitel 사용자로 접속해 이 파일을 컴파일, 오류는 USER_ERRORS 로 확인)
-- 원칙 : 같은 키 = PostgreSQL 과 같은 값. 해시 = PostgreSQL hashint8extended(Jenkins lookup3)를 SIMPLE_INTEGER(32비트 감김) 연산으로, 실수 = BINARY_DOUBLE(IEEE 754 배정밀도)
--        구간 곱(interval * float8)은 PostgreSQL 17 interval_mul 의 일·초 나머지 계산과 마이크로초 반올림(rint)을 그대로 따른다
--        null_p(다형 함수)는 SQL 생성기가 CASE 식으로 펼친다. series = generate_series 대신 쓰는 파이프라인 함수

CREATE OR REPLACE TYPE gen_num_tab AS TABLE OF NUMBER;
/

CREATE OR REPLACE PACKAGE gen AUTHID DEFINER AS
  FUNCTION h53(k NUMBER, salt NUMBER) RETURN NUMBER DETERMINISTIC;
  FUNCTION t0 RETURN TIMESTAMP DETERMINISTIC;
  FUNCTION t1 RETURN TIMESTAMP DETERMINISTIC;
  FUNCTION u(k NUMBER, salt NUMBER) RETURN BINARY_DOUBLE DETERMINISTIC;
  FUNCTION uniform(k NUMBER, salt NUMBER, n NUMBER) RETURN NUMBER DETERMINISTIC;
  FUNCTION skew(k NUMBER, salt NUMBER, n NUMBER, alpha BINARY_DOUBLE) RETURN NUMBER DETERMINISTIC;
  FUNCTION wpick(k NUMBER, salt NUMBER, weights VARCHAR2) RETURN NUMBER DETERMINISTIC;
  FUNCTION wcode(k NUMBER, salt NUMBER, codes VARCHAR2, weights VARCHAR2) RETURN VARCHAR2 DETERMINISTIC;
  FUNCTION recent_dtm(k NUMBER, n NUMBER) RETURN TIMESTAMP DETERMINISTIC;
  FUNCTION dtm_to_k(ts TIMESTAMP, n NUMBER) RETURN NUMBER DETERMINISTIC;
  FUNCTION after_dtm(parent TIMESTAMP, k NUMBER, salt NUMBER, max_days NUMBER) RETURN TIMESTAMP DETERMINISTIC;
  FUNCTION month_edge(ts TIMESTAMP, k NUMBER, salt NUMBER, p BINARY_DOUBLE) RETURN TIMESTAMP DETERMINISTIC;
  FUNCTION ymd(ts TIMESTAMP) RETURN VARCHAR2 DETERMINISTIC;
  FUNCTION fmt(prefix VARCHAR2, k NUMBER, width NUMBER) RETURN VARCHAR2 DETERMINISTIC;
  FUNCTION orphan(parent_k NUMBER, n NUMBER, k NUMBER, salt NUMBER) RETURN NUMBER DETERMINISTIC;
  FUNCTION person_nm(k NUMBER) RETURN VARCHAR2 DETERMINISTIC;
  FUNCTION corp_nm(k NUMBER) RETURN VARCHAR2 DETERMINISTIC;
  FUNCTION phone(k NUMBER) RETURN VARCHAR2 DETERMINISTIC;
  FUNCTION amt(base NUMBER, k NUMBER, salt NUMBER) RETURN NUMBER DETERMINISTIC;
  FUNCTION dirty(v VARCHAR2, k NUMBER, salt NUMBER, p BINARY_DOUBLE) RETURN VARCHAR2 DETERMINISTIC;
  FUNCTION memo(k NUMBER, salt NUMBER, p BINARY_DOUBLE, maxlen NUMBER) RETURN VARCHAR2 DETERMINISTIC;
  FUNCTION memo_lob(k NUMBER, salt NUMBER, p BINARY_DOUBLE, maxlen NUMBER) RETURN CLOB DETERMINISTIC;
  FUNCTION f2n(x BINARY_DOUBLE) RETURN NUMBER DETERMINISTIC;
  FUNCTION series(a NUMBER, b NUMBER) RETURN gen_num_tab PIPELINED;
END gen;
/

CREATE OR REPLACE PACKAGE BODY gen AS
  T0V CONSTANT TIMESTAMP := TIMESTAMP '2010-01-01 00:00:00';
  T1V CONSTANT TIMESTAMP := TIMESTAMP '2026-10-31 23:59:59';
  -- t1 - t0 = 6147일 23:59:59 (PostgreSQL timestamp_mi + justify_hours 결과 : 일 6147, 시각 86399초)
  SPAN_DAY CONSTANT NUMBER := 6147;
  SPAN_US CONSTANT NUMBER := 86399000000;
  WMAX CONSTANT PLS_INTEGER := 32; -- 가중치·코드 목록 최대 개수(pitel 코드값 최대 10개)

  TYPE i_arr IS TABLE OF PLS_INTEGER INDEX BY PLS_INTEGER;
  TYPE dbl_arr IS TABLE OF BINARY_DOUBLE INDEX BY PLS_INTEGER;
  TYPE str_arr IS TABLE OF VARCHAR2(400) INDEX BY PLS_INTEGER;
  TYPE id_map IS TABLE OF PLS_INTEGER INDEX BY VARCHAR2(4000);
  sa i_arr; sbv i_arr; sc i_arr;          -- salt → 시드 섞은 뒤 a·b·c(salt 마다 같아 한 번만 계산)
  wid id_map; wsum dbl_arr; wcnt i_arr; wval dbl_arr;   -- 가중치 문자열 → 번호·합계·개수·값(번호*WMAX+i). 호출마다 배열을 복사하지 않게 평평한 배열로
  cid id_map; cval str_arr;                              -- 코드 문자열 → 번호·값
  SUR str_arr; GIV str_arr; CP1 str_arr; CP2 str_arr; CP3 str_arr; CPW VARCHAR2(30) := '50|20|15|10|5';

  -- 해시 = PostgreSQL hash_uint32_extended(Jenkins lookup3). 32비트 부호 없는 값을 SIMPLE_INTEGER(32비트, 넘치면 감김 = 2^32 나머지)로 들고 계산
  -- (2026-11-15 S1 1차 = NUMBER 정수 연산 8.4µs/회 → SIMPLE_INTEGER + PLSQL_OPTIMIZE_LEVEL 3 6.3µs/회, 15만 건 결과 동일)
  FUNCTION shr(x SIMPLE_INTEGER, n PLS_INTEGER, p PLS_INTEGER) RETURN SIMPLE_INTEGER IS -- x >>> n, p = 2^n
    v SIMPLE_INTEGER := 0;
  BEGIN
    IF x >= 0 THEN RETURN TRUNC(x / p); END IF;
    v := x + 2147483647 + 1;
    RETURN TRUNC(v / p) + POWER(2, 31 - n);
  END;
  FUNCTION xr(a SIMPLE_INTEGER, b SIMPLE_INTEGER) RETURN SIMPLE_INTEGER IS -- a XOR b = a + b - 2(a AND b) (2^32 나머지)
    t SIMPLE_INTEGER := BITAND(a, b);
  BEGIN
    RETURN a + b - t - t;
  END;
  FUNCTION rl(x SIMPLE_INTEGER, k PLS_INTEGER) RETURN SIMPLE_INTEGER IS -- 왼쪽 회전
    m SIMPLE_INTEGER := POWER(2, k);
    lo SIMPLE_INTEGER := x * m;
  BEGIN
    RETURN lo + shr(x, 32 - k, POWER(2, 32 - k));
  END;
  FUNCTION s32(v NUMBER) RETURN SIMPLE_INTEGER IS BEGIN RETURN CASE WHEN v >= 2147483648 THEN v - 4294967296 ELSE v END; END;

  PROCEDURE seed(salt PLS_INTEGER) IS
    a SIMPLE_INTEGER := s32(2658358868); b SIMPLE_INTEGER := s32(2658358868); c SIMPLE_INTEGER := s32(2658358868);
  BEGIN
    IF salt <> 0 THEN
      b := b + salt; -- a += seed >> 32 (= 0)
      a := a - c; a := xr(a, rl(c, 4));  c := c + b;
      b := b - a; b := xr(b, rl(a, 6));  a := a + c;
      c := c - b; c := xr(c, rl(b, 8));  b := b + a;
      a := a - c; a := xr(a, rl(c, 16)); c := c + b;
      b := b - a; b := xr(b, rl(a, 19)); a := a + c;
      c := c - b; c := xr(c, rl(b, 4));  b := b + a;
    END IF;
    sa(salt) := a; sbv(salt) := b; sc(salt) := c;
  END;

  -- final 단계(b·c 반환). SIMPLE_INTEGER OUT 인자는 NULL 로 시작해 ORA-06502 → IN OUT
  PROCEDURE fin(k NUMBER, salt NUMBER, bo IN OUT SIMPLE_INTEGER, co IN OUT SIMPLE_INTEGER) IS
    a SIMPLE_INTEGER := 0; b SIMPLE_INTEGER := 0; c SIMPLE_INTEGER := 0;
  BEGIN
    IF k < 0 OR salt < 0 OR salt >= 2147483648 THEN RAISE_APPLICATION_ERROR(-20001, 'gen.h53 : 음수 키·salt, 2^31 이상 salt 미지원'); END IF;
    IF NOT sa.EXISTS(salt) THEN seed(salt); END IF;
    a := sa(salt); b := sbv(salt); c := sc(salt);
    a := a + xr(s32(MOD(k, 4294967296)), s32(MOD(TRUNC(k / 4294967296), 4294967296)));
    c := xr(c, b); c := c - rl(b, 14);
    a := xr(a, c); a := a - rl(c, 11);
    b := xr(b, a); b := b - rl(a, 25);
    c := xr(c, b); c := c - rl(b, 16);
    a := xr(a, c); a := a - rl(c, 4);
    b := xr(b, a); b := b - rl(a, 14);
    c := xr(c, b); c := c - rl(b, 24);
    bo := b; co := c;
  END;

  -- hashint8extended(k, salt) & (2^53 - 1) : 생성기는 키 k ≥ 0, salt 0 ≤ salt < 2^31 만 쓴다
  FUNCTION h53(k NUMBER, salt NUMBER) RETURN NUMBER DETERMINISTIC IS
    PRAGMA UDF;
    b SIMPLE_INTEGER := 0; c SIMPLE_INTEGER := 0;
    bn NUMBER; cn NUMBER;
  BEGIN
    fin(k, salt, b, c);
    bn := BITAND(b, 2097151); cn := c;
    IF cn < 0 THEN cn := cn + 4294967296; END IF;
    RETURN bn * 4294967296 + cn;
  END;

  FUNCTION t0 RETURN TIMESTAMP DETERMINISTIC IS PRAGMA UDF; BEGIN RETURN T0V; END;
  FUNCTION t1 RETURN TIMESTAMP DETERMINISTIC IS PRAGMA UDF; BEGIN RETURN T1V; END;

  -- 하위 53비트 / 2^53 (정수 부분은 2^53 미만이라 BINARY_DOUBLE 로 정확)
  FUNCTION u(k NUMBER, salt NUMBER) RETURN BINARY_DOUBLE DETERMINISTIC IS
    PRAGMA UDF;
    b SIMPLE_INTEGER := 0; c SIMPLE_INTEGER := 0;
  BEGIN
    fin(k, salt, b, c);
    RETURN (TO_BINARY_DOUBLE(BITAND(b, 2097151)) * 4294967296d + CASE WHEN c < 0 THEN TO_BINARY_DOUBLE(c) + 4294967296d ELSE TO_BINARY_DOUBLE(c) END) / 9007199254740992d;
  END;

  FUNCTION uniform(k NUMBER, salt NUMBER, n NUMBER) RETURN NUMBER DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    RETURN 1 + TO_NUMBER(FLOOR(u(k, salt) * TO_BINARY_DOUBLE(n)));
  END;

  FUNCTION skew(k NUMBER, salt NUMBER, n NUMBER, alpha BINARY_DOUBLE) RETURN NUMBER DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    RETURN LEAST(n, 1 + TO_NUMBER(FLOOR(TO_BINARY_DOUBLE(n) * POWER(u(k, salt), alpha))));
  END;

  -- '90|10' → 번호(세션 안에서 한 번만 해석). 합계 = PostgreSQL sum(float8) 과 같은 순서의 덧셈
  FUNCTION wget(weights VARCHAR2) RETURN PLS_INTEGER IS
    id PLS_INTEGER; pos PLS_INTEGER := 1; nx PLS_INTEGER; i PLS_INTEGER := 0; s BINARY_DOUBLE := 0; v BINARY_DOUBLE;
  BEGIN
    IF wid.EXISTS(weights) THEN RETURN wid(weights); END IF;
    id := wid.COUNT + 1;
    LOOP
      nx := INSTR(weights, '|', pos);
      i := i + 1;
      IF i > WMAX THEN RAISE_APPLICATION_ERROR(-20002, 'gen.wpick : 가중치 32개 초과'); END IF;
      v := TO_BINARY_DOUBLE(CASE WHEN nx = 0 THEN SUBSTR(weights, pos) ELSE SUBSTR(weights, pos, nx - pos) END);
      wval(id * WMAX + i) := v;
      s := s + v;
      EXIT WHEN nx = 0;
      pos := nx + 1;
    END LOOP;
    wsum(id) := s; wcnt(id) := i; wid(weights) := id;
    RETURN id;
  END;

  FUNCTION cget(codes VARCHAR2) RETURN PLS_INTEGER IS
    id PLS_INTEGER; pos PLS_INTEGER := 1; nx PLS_INTEGER; i PLS_INTEGER := 0;
  BEGIN
    IF cid.EXISTS(codes) THEN RETURN cid(codes); END IF;
    id := cid.COUNT + 1;
    LOOP
      nx := INSTR(codes, '|', pos);
      i := i + 1;
      IF i > WMAX THEN RAISE_APPLICATION_ERROR(-20003, 'gen.wcode : 코드 32개 초과'); END IF;
      cval(id * WMAX + i) := CASE WHEN nx = 0 THEN SUBSTR(codes, pos) ELSE SUBSTR(codes, pos, nx - pos) END;
      EXIT WHEN nx = 0;
      pos := nx + 1;
    END LOOP;
    cid(codes) := id;
    RETURN id;
  END;

  FUNCTION wpick(k NUMBER, salt NUMBER, weights VARCHAR2) RETURN NUMBER DETERMINISTIC IS
    PRAGMA UDF;
    id PLS_INTEGER := wget(weights);
    r BINARY_DOUBLE := u(k, salt) * wsum(id);
  BEGIN
    FOR i IN 1 .. wcnt(id) LOOP
      r := r - wval(id * WMAX + i);
      IF r < 0 THEN RETURN i; END IF;
    END LOOP;
    RETURN wcnt(id);
  END;

  FUNCTION wcode(k NUMBER, salt NUMBER, codes VARCHAR2, weights VARCHAR2) RETURN VARCHAR2 DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    RETURN cval(cget(codes) * WMAX + wpick(k, salt, weights));
  END;

  -- rint : 가장 가까운 정수, 정확히 반이면 짝수(C rint 기본 반올림)
  FUNCTION rint(x BINARY_DOUBLE) RETURN BINARY_DOUBLE IS
    r BINARY_DOUBLE := FLOOR(x); d BINARY_DOUBLE := x - r;
  BEGIN
    IF d > 0.5d THEN RETURN r + 1; END IF;
    IF d < 0.5d THEN RETURN r; END IF;
    IF r - 2 * FLOOR(r / 2) = 0 THEN RETURN r; END IF;
    RETURN r + 1;
  END;
  FUNCTION tsround(x BINARY_DOUBLE) RETURN BINARY_DOUBLE IS BEGIN RETURN rint(x * 1000000d) / 1000000d; END;

  -- ts + (구간(일 sd, 마이크로초 sus) * f) : PostgreSQL interval_mul(월 = 0) + timestamp_pl_interval
  FUNCTION imul_add(ts TIMESTAMP, sd NUMBER, sus NUMBER, f BINARY_DOUBLE) RETURN TIMESTAMP IS
    dd BINARY_DOUBLE := TO_BINARY_DOUBLE(sd) * f;
    rday NUMBER := TO_NUMBER(TRUNC(dd));
    sec BINARY_DOUBLE := tsround((dd - TO_BINARY_DOUBLE(rday)) * 86400d);
    us NUMBER;
  BEGIN
    IF ABS(sec) >= 86400d THEN
      rday := rday + TO_NUMBER(TRUNC(sec / 86400d));
      sec := sec - TRUNC(sec / 86400d) * 86400d;
    END IF;
    us := TO_NUMBER(rint(TO_BINARY_DOUBLE(sus) * f + sec * 1000000d));
    RETURN ts + NUMTODSINTERVAL(rday, 'DAY') + NUMTODSINTERVAL(us / 1000000, 'SECOND');
  END;

  FUNCTION recent_dtm(k NUMBER, n NUMBER) RETURN TIMESTAMP DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    RETURN imul_add(T0V, SPAN_DAY, SPAN_US, POWER((TO_BINARY_DOUBLE(k - 1) + u(k, 7)) / TO_BINARY_DOUBLE(n), 0.22d));
  END;

  -- 실행기의 조각 경계 계산용(행 값에는 영향 없음 : 행은 키 k 로만 결정)
  FUNCTION dtm_to_k(ts TIMESTAMP, n NUMBER) RETURN NUMBER DETERMINISTIC IS
    PRAGMA UDF;
    a INTERVAL DAY(9) TO SECOND(6) := ts - T0V;
    b INTERVAL DAY(9) TO SECOND(6) := T1V - T0V;
    sa NUMBER := EXTRACT(DAY FROM a) * 86400 + EXTRACT(HOUR FROM a) * 3600 + EXTRACT(MINUTE FROM a) * 60 + EXTRACT(SECOND FROM a);
    sbv NUMBER := EXTRACT(DAY FROM b) * 86400 + EXTRACT(HOUR FROM b) * 3600 + EXTRACT(MINUTE FROM b) * 60 + EXTRACT(SECOND FROM b);
  BEGIN
    RETURN GREATEST(0, LEAST(n, FLOOR(n * POWER(sa / sbv, 1 / 0.22))));
  END;

  FUNCTION after_dtm(parent TIMESTAMP, k NUMBER, salt NUMBER, max_days NUMBER) RETURN TIMESTAMP DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    IF parent IS NULL THEN RETURN NULL; END IF;
    RETURN LEAST(T1V, imul_add(parent, max_days, 0, u(k, salt)));
  END;

  FUNCTION month_edge(ts TIMESTAMP, k NUMBER, salt NUMBER, p BINARY_DOUBLE) RETURN TIMESTAMP DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    IF ts IS NULL THEN RETURN NULL; END IF;
    IF u(k, salt) >= p THEN RETURN ts; END IF;
    IF u(k, salt + 1) < 0.5d THEN RETURN CAST(TRUNC(ts, 'MM') AS TIMESTAMP) + (ts - CAST(TRUNC(ts) AS TIMESTAMP)); END IF;
    RETURN CAST(LAST_DAY(TRUNC(ts)) AS TIMESTAMP) + (ts - CAST(TRUNC(ts) AS TIMESTAMP));
  END;

  FUNCTION ymd(ts TIMESTAMP) RETURN VARCHAR2 DETERMINISTIC IS PRAGMA UDF; BEGIN RETURN TO_CHAR(ts, 'YYYYMMDD'); END;

  FUNCTION fmt(prefix VARCHAR2, k NUMBER, width NUMBER) RETURN VARCHAR2 DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    RETURN prefix || LPAD(TO_CHAR(k), width, '0');
  END;

  FUNCTION orphan(parent_k NUMBER, n NUMBER, k NUMBER, salt NUMBER) RETURN NUMBER DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    IF u(k, salt) < 0.0005d THEN RETURN n + 1 + MOD(k, GREATEST(n, 1)); END IF;
    RETURN parent_k;
  END;

  FUNCTION person_nm(k NUMBER) RETURN VARCHAR2 DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    RETURN SUR(skew(k, 11, 20, 2.0d)) || GIV(uniform(k, 12, 40));
  END;

  FUNCTION corp_nm(k NUMBER) RETURN VARCHAR2 DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    RETURN CP1(uniform(k, 13, 10)) || CP2(uniform(k, 14, 10)) || CP3(wpick(k, 15, CPW));
  END;

  FUNCTION phone(k NUMBER) RETURN VARCHAR2 DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    RETURN '010' || LPAD(TO_CHAR(uniform(k, 16, 99999999) - 1), 8, '0');
  END;

  FUNCTION amt(base NUMBER, k NUMBER, salt NUMBER) RETURN NUMBER DETERMINISTIC IS
    PRAGMA UDF;
    x BINARY_DOUBLE := u(k, salt);
  BEGIN
    IF x < 0.00001d THEN RETURN base * 1000; END IF;
    IF x < 0.00101d THEN RETURN -base; END IF;
    RETURN base;
  END;

  FUNCTION dirty(v VARCHAR2, k NUMBER, salt NUMBER, p BINARY_DOUBLE) RETURN VARCHAR2 DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    IF u(k, salt) < p THEN RETURN ' ' || v || ' '; END IF;
    RETURN v;
  END;

  -- repeat('상담 메모 ' || k || ' ', 60 + uniform(k, salt + 1, 180)) 를 maxlen 글자로 자름(PostgreSQL left(…, 칼럼 길이) 와 같은 결과)
  FUNCTION memo_txt(k NUMBER, salt NUMBER, p BINARY_DOUBLE, maxlen NUMBER) RETURN VARCHAR2 IS
    unit VARCHAR2(100);
    r VARCHAR2(32767);
  BEGIN
    IF u(k, salt) >= p THEN RETURN NULL; END IF;
    unit := '상담 메모 ' || TO_CHAR(k) || ' ';
    FOR i IN 1 .. 60 + uniform(k, salt + 1, 180) LOOP
      r := r || unit;
      EXIT WHEN LENGTH(r) >= maxlen;
    END LOOP;
    RETURN SUBSTR(r, 1, maxlen);
  END;
  FUNCTION memo(k NUMBER, salt NUMBER, p BINARY_DOUBLE, maxlen NUMBER) RETURN VARCHAR2 DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    RETURN memo_txt(k, salt, p, maxlen);
  END;
  FUNCTION memo_lob(k NUMBER, salt NUMBER, p BINARY_DOUBLE, maxlen NUMBER) RETURN CLOB DETERMINISTIC IS
    PRAGMA UDF;
    t VARCHAR2(32767) := memo_txt(k, salt, p, maxlen);
  BEGIN
    IF t IS NULL THEN RETURN NULL; END IF;
    RETURN TO_CLOB(t);
  END;

  -- float8 → numeric : PostgreSQL float8_numeric 처럼 유효숫자 15자리(DBL_DIG)로 바꾼 뒤 NUMBER
  FUNCTION f2n(x BINARY_DOUBLE) RETURN NUMBER DETERMINISTIC IS
    PRAGMA UDF;
  BEGIN
    IF x = 0 THEN RETURN 0; END IF;
    RETURN TO_NUMBER(TO_CHAR(x, '9.99999999999999EEEE'), '9.99999999999999EEEE');
  END;

  FUNCTION series(a NUMBER, b NUMBER) RETURN gen_num_tab PIPELINED IS
  BEGIN
    FOR i IN a .. b LOOP
      PIPE ROW(i);
    END LOOP;
    RETURN;
  END;

BEGIN
  SUR(1):='김'; SUR(2):='이'; SUR(3):='박'; SUR(4):='최'; SUR(5):='정'; SUR(6):='강'; SUR(7):='조'; SUR(8):='윤'; SUR(9):='장'; SUR(10):='임';
  SUR(11):='한'; SUR(12):='오'; SUR(13):='서'; SUR(14):='신'; SUR(15):='권'; SUR(16):='황'; SUR(17):='안'; SUR(18):='송'; SUR(19):='류'; SUR(20):='홍';
  GIV(1):='민준'; GIV(2):='서연'; GIV(3):='도윤'; GIV(4):='서윤'; GIV(5):='시우'; GIV(6):='지우'; GIV(7):='하준'; GIV(8):='하은'; GIV(9):='주원'; GIV(10):='지유';
  GIV(11):='지호'; GIV(12):='윤서'; GIV(13):='지후'; GIV(14):='채원'; GIV(15):='준서'; GIV(16):='수아'; GIV(17):='준우'; GIV(18):='지아'; GIV(19):='현우'; GIV(20):='서아';
  GIV(21):='도현'; GIV(22):='다은'; GIV(23):='건우'; GIV(24):='예은'; GIV(25):='우진'; GIV(26):='수빈'; GIV(27):='선우'; GIV(28):='지민'; GIV(29):='서진'; GIV(30):='예린';
  GIV(31):='민재'; GIV(32):='소율'; GIV(33):='현준'; GIV(34):='하린'; GIV(35):='연우'; GIV(36):='지원'; GIV(37):='유준'; GIV(38):='시은'; GIV(39):='정우'; GIV(40):='유나';
  CP1(1):='한빛'; CP1(2):='누리'; CP1(3):='미래'; CP1(4):='대한'; CP1(5):='하나'; CP1(6):='새솔'; CP1(7):='다온'; CP1(8):='푸른'; CP1(9):='태양'; CP1(10):='바른';
  CP2(1):='전자'; CP2(2):='물산'; CP2(3):='건설'; CP2(4):='정보통신'; CP2(5):='유통'; CP2(6):='식품'; CP2(7):='제약'; CP2(8):='물류'; CP2(9):='금융'; CP2(10):='에너지';
  CP3(1):='(주)'; CP3(2):='㈜'; CP3(3):=' 주식회사'; CP3(4):=NULL; CP3(5):=' (유)';
END gen;
/
