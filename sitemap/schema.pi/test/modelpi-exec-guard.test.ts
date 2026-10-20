// DDL 직접 실행 가드 검사(2026-10-18) — 접속 대상 IP(SSRF)·실행 문장 화이트리스트(공용 벡터) · 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ipAllowed, portAllowed } from '../src/lib/modelpi/net-guard.ts'
import { deniedAt, stmtAllowed } from '../src/lib/modelpi/sql-guard.ts'
import { genDdl } from '../src/lib/modelpi/ddl.ts'
import { splitStatements } from '../src/lib/modelpi/ddl-parse.ts'

test('IP : 공인 유니캐스트만 허용', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '52.79.1.1', '2600:1f18::1', '2404:6800:4004:80a::200e']) assert.equal(ipAllowed(ip), true, ip)
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '::', '::1', 'fd00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '2001::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a9fe:a9fe', '2002:c0a8:0101::1', '::127.0.0.1', 'localhost', 'not-ip', ''])
    assert.equal(ipAllowed(ip), false, ip)
  assert.equal(ipAllowed('::ffff:8.8.8.8'), true)
  // IPv6 기본 거부(보안 검토 2026-10-18) : 전역 유니캐스트 밖·NAT64 지역 접두·IPv4 변환 접두
  for (const ip of ['64:ff9b:1::a9fe:a9fe', '64:ff9b:1::808:808', '::ffff:0:a9fe:a9fe', '100::1', '3fff::1', '4000::1', 'fec0::1', '::8.8.8.8']) assert.equal(ipAllowed(ip), false, ip)
  assert.equal(ipAllowed('64:ff9b::808:808'), true) // 공인 IPv4 를 담은 NAT64
  assert.equal(ipAllowed('2002:0808:0808::1'), true) // 6to4 안의 공인 IPv4
})

test('포트 : 1024~65535', () => {
  assert.ok(portAllowed(5432) && portAllowed(1521) && portAllowed(8629))
  assert.ok(!portAllowed(22) && !portAllowed(80) && !portAllowed(0) && !portAllowed(70000) && !portAllowed(5432.5))
})

test('실행 문장 화이트리스트 : 공용 벡터(에이전트와 같은 결과)', () => {
  const v = JSON.parse(readFileSync(new URL('./fixtures/sql-guard.json', import.meta.url), 'utf8')) as { allow: string[]; deny: string[]; script_ok: string[][]; script_bad: string[][] }
  for (const s of v.allow) assert.equal(stmtAllowed(s), true, `허용 기대 : ${s}`)
  for (const s of v.deny) assert.equal(stmtAllowed(s), false, `거부 기대 : ${s}`)
  for (const s of v.script_ok) assert.equal(deniedAt(s), -1, `스크립트 허용 기대 : ${s.join(' / ')}`)
  for (const s of v.script_bad) assert.ok(deniedAt(s) >= 0, `스크립트 거부 기대 : ${s.join(' / ')}`)
})

test('생성기 출력 문장은 전부 허용(PostgreSQL·Oracle·Tibero, 자동 증가·일반/유일 인덱스 포함)', () => {
  const col = (n: string, pk: number | null) => ({ attr_id: n, sys_col_yn: 'N' as const, col_nm: n, col_seq: pk ?? 9, dom_id: null, dom_ver_no: null, phy_tp_nm: 'NUMBER', data_len: 12, data_scale: null, null_yn: 'N' as const, bsc_val_txt: pk ? null : "'X'", pk_yn: (pk ? 'Y' : 'N') as 'Y' | 'N', pk_seq: pk })
  for (const dbms of ['0014', '0001', '0013'] as const) {
    const sql = genDdl({ dbms, ltr: dbms === '0014' ? 'LOWER' : 'UPPER', tables: [{ ent_id: 'a', tbl_nm: 'TB_CUST', tbl_desc: "고객's", auto_inc_yn: 'Y', cols: [col('CUST_NO', 1), col('CUST_CD', null)], indexes: [{ idx_nm: 'IX_TB_CUST_01', unq_yn: 'N', col_nms: ['CUST_CD', 'CUST_NO'] }, { idx_nm: 'IX_TB_CUST_02', unq_yn: 'Y', col_nms: ['CUST_CD'] }] }], fks: [], src: new Map(), fkOf: new Map() }, { prjNm: 'p', at: 'now' })
    const st = splitStatements(sql)
    assert.ok(st.length >= 5)
    for (const s of st) assert.equal(stmtAllowed(s), true, `${dbms} : ${s}`)
    assert.equal(deniedAt(st), -1, `${dbms} 스크립트(CREATE 직전 DROP)`)
    assert.ok(st.some((s) => /^DROP TABLE/i.test(s)))
    assert.ok(st.some((s) => /^CREATE INDEX/i.test(s)) && st.filter((s) => /^CREATE UNIQUE INDEX/i.test(s)).length === 2) // PK + 유일 인덱스
  }
})
