// DDL 직접 실행 가드 검사(2026-10-18) — 접속 대상 IP(SSRF)·실행 문장 화이트리스트(공용 벡터) · 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ipAllowed, portAllowed } from '../src/lib/modelpi/net-guard.ts'
import { stmtAllowed } from '../src/lib/modelpi/sql-guard.ts'
import { genDdl } from '../src/lib/modelpi/ddl.ts'
import { splitStatements } from '../src/lib/modelpi/ddl-parse.ts'

test('IP : 공인 유니캐스트만 허용', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '52.79.1.1', '2600:1f18::1', '2404:6800:4004:80a::200e']) assert.equal(ipAllowed(ip), true, ip)
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '::', '::1', 'fd00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '2001::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a9fe:a9fe', '2002:c0a8:0101::1', '::127.0.0.1', 'localhost', 'not-ip', ''])
    assert.equal(ipAllowed(ip), false, ip)
  assert.equal(ipAllowed('::ffff:8.8.8.8'), true)
  assert.equal(ipAllowed('2002:0808:0808::1'), true) // 6to4 안의 공인 IPv4
})

test('포트 : 1024~65535', () => {
  assert.ok(portAllowed(5432) && portAllowed(1521) && portAllowed(8629))
  assert.ok(!portAllowed(22) && !portAllowed(80) && !portAllowed(0) && !portAllowed(70000) && !portAllowed(5432.5))
})

test('실행 문장 화이트리스트 : 공용 벡터(에이전트와 같은 결과)', () => {
  const v = JSON.parse(readFileSync(new URL('./fixtures/sql-guard.json', import.meta.url), 'utf8')) as { allow: string[]; deny: string[] }
  for (const s of v.allow) assert.equal(stmtAllowed(s), true, `허용 기대 : ${s}`)
  for (const s of v.deny) assert.equal(stmtAllowed(s), false, `거부 기대 : ${s}`)
})

test('생성기 출력 문장은 전부 허용(PostgreSQL·Oracle·Tibero, 자동 증가 포함)', () => {
  const col = (n: string, pk: number | null) => ({ attr_id: n, sys_col_yn: 'N' as const, col_nm: n, col_seq: pk ?? 9, dom_id: null, dom_ver_no: null, phy_tp_nm: 'NUMBER', data_len: 12, data_scale: null, null_yn: 'N' as const, bsc_val_txt: pk ? null : "'X'", pk_yn: (pk ? 'Y' : 'N') as 'Y' | 'N', pk_seq: pk })
  for (const dbms of ['0014', '0001', '0013'] as const) {
    const sql = genDdl({ dbms, ltr: dbms === '0014' ? 'LOWER' : 'UPPER', tables: [{ ent_id: 'a', tbl_nm: 'TB_CUST', tbl_desc: "고객's", auto_inc_yn: 'Y', cols: [col('CUST_NO', 1), col('CUST_CD', null)] }], fks: [], src: new Map(), fkOf: new Map() }, { prjNm: 'p', at: 'now' })
    const st = splitStatements(sql)
    assert.ok(st.length >= 5)
    for (const s of st) assert.equal(stmtAllowed(s), true, `${dbms} : ${s}`)
  }
})
