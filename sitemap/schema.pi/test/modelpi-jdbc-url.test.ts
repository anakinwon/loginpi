// JDBC 접속 URL 해석·조립 검사(2026-10-18) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildJdbcUrl, jndiOk, parseJdbcUrl, urlStorable } from '../src/lib/modelpi/jdbc-url.ts'

test('PostgreSQL : JDBC·libpq URI, 기본 포트, 사용자·비밀번호 분리', () => {
  assert.deepEqual(parseJdbcUrl('jdbc:postgresql://db.example.com:6543/shop?sslmode=require'), { dbms: '0014', usr: undefined, pwd: undefined, host: 'db.example.com', port: 6543, db: 'shop' })
  assert.equal(parseJdbcUrl('jdbc:postgresql://db.example.com/shop')?.port, 5432)
  assert.deepEqual(parseJdbcUrl('postgresql://app:p%40ss@10.0.0.5:5432/erp'), { dbms: '0014', usr: 'app', pwd: 'p@ss', host: '10.0.0.5', port: 5432, db: 'erp' })
  assert.equal(parseJdbcUrl('jdbc:postgresql://[2600:1f18::1]:5432/d')?.host, '[2600:1f18::1]')
})

test('Oracle : //서비스·서비스·SID 세 형식, Tibero', () => {
  assert.deepEqual(parseJdbcUrl('jdbc:oracle:thin:@//ora.example.com:1521/ORCLPDB1'), { dbms: '0001', host: 'ora.example.com', port: 1521, db: 'ORCLPDB1' })
  assert.equal(parseJdbcUrl('jdbc:oracle:thin:@ora:1522/svc')?.port, 1522)
  assert.equal(parseJdbcUrl('jdbc:oracle:thin:@ora:1521:ORCL')?.db, 'ORCL')
  assert.deepEqual(parseJdbcUrl('jdbc:tibero:thin:@10.1.1.1:8629:tibero'), { dbms: '0013', host: '10.1.1.1', port: 8629, db: 'tibero' })
})

test('해석 불가·잘못된 포트는 null', () => {
  for (const u of ['', 'mysql://h/d', 'jdbc:postgresql://h:99999/d', 'jdbc:oracle:thin:@(DESCRIPTION=(ADDRESS=(HOST=h)))', 'jdbc:postgresql://h:5432/']) assert.equal(parseJdbcUrl(u), null, u)
})

test('조립 → 다시 해석하면 같은 값', () => {
  for (const [d, h, p, db] of [['0014', 'h', 5432, 'd'], ['0001', 'o', 1521, 'SVC'], ['0013', 't', 8629, 'tb']] as const) {
    const r = parseJdbcUrl(buildJdbcUrl(d, h, p, db))!
    assert.deepEqual([r.dbms, r.host, r.port, r.db], [d, h, p, db])
  }
})

test('저장 가능한 URL : 세 형식·DBMS 일치·인자 허용 목록만(보안 검토)', () => {
  assert.ok(urlStorable('jdbc:tibero:thin:@10.0.0.5:8629:tibero', '0013'))
  assert.ok(urlStorable('jdbc:oracle:thin:@//ora:1521/SVC', '0001'))
  assert.ok(urlStorable('jdbc:postgresql://h:5432/d?sslmode=require&ApplicationName=schemapi', '0014'))
  for (const [u, d] of [
    ['jdbc:tibero:thin:@10.0.0.5:8629:tibero', '0014'], // DBMS 불일치
    ['jdbc:postgresql://h/d?password=x', '0014'],
    ['jdbc:postgresql://h/d?socketFactory=org.springframework.context.support.ClassPathXmlApplicationContext', '0014'],
    ['jdbc:postgresql://h/d?loggerFile=/tmp/x', '0014'],
    ['jdbc:postgresql://h/d/extra', '0014'],
    ['jdbc:postgresql://h/d#x', '0014'],
    ["jdbc:h2:mem:x;INIT=RUNSCRIPT FROM 'http://e'", '0014'],
    ['jdbc:oracle:thin:@h:1521:X;PWD=x', '0001'],
    ['jdbc:x:a b', '0014'],
    ['postgresql://u:p@h/d', '0014'], // libpq 형식은 저장 안 함(사용자·비밀번호)
  ] as const) assert.ok(!urlStorable(u, d), u)
})

test('JNDI 이름 : 로컬 이름만(원격 조회 차단)', () => {
  for (const n of ['jdbc/TiberoDS', 'java:comp/env/jdbc/ds', 'java:jboss/datasources/X', 'TiberoDS']) assert.ok(jndiOk(n), n)
  for (const n of ['ldap://evil/x', 'rmi://evil:1099/x', 'java:comp/env/../x', 'dns:x', 'iiop://h/x', ':x', '']) assert.ok(!jndiOk(n), n)
})
