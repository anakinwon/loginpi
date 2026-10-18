// 접속 비밀번호 봉인(AES-256-GCM) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { connFp, parseKey, seal, unseal } from '../src/lib/modelpi/seal.ts'

const key = randomBytes(32)

test('왕복 : 같은 키·AAD 면 원문, 매번 다른 암호문', () => {
  const a = seal(key, '비밀p@ss', 'A:C')
  assert.match(a, /^v1:/)
  assert.notEqual(a, seal(key, '비밀p@ss', 'A:C'))
  assert.equal(unseal(key, a, 'A:C'), '비밀p@ss')
})

test('다른 AAD(다른 접속 행)·다른 키·변조는 복호 실패', () => {
  const a = seal(key, 'pw', 'A:C')
  assert.throws(() => unseal(key, a, 'A:D'))
  assert.throws(() => unseal(randomBytes(32), a, 'A:C'))
  const parts = a.split('.')
  const ct = Buffer.from(parts[2], 'base64url')
  ct[0] ^= 1
  assert.throws(() => unseal(key, `${parts[0]}.${parts[1]}.${ct.toString('base64url')}`, 'A:C'))
  assert.throws(() => unseal(key, 'plain', 'A:C'))
})

test('키 형식 : base64 32바이트·hex 64자만', () => {
  assert.equal(parseKey(key.toString('base64'))?.length, 32)
  assert.equal(parseKey(key.toString('hex'))?.length, 32)
  assert.equal(parseKey('short'), null)
  assert.equal(parseKey(''), null)
  assert.equal(parseKey(undefined), null)
})

test('접속 지문 : 주소·버전이 바뀌면 다른 값', () => {
  const c = { dbms_cd: '0014', exec_mthd_cd: 'SRV', host_nm: 'h', port_no: 5432, db_nm: 'd', usr_nm: 'u', pwd_enc_txt: 'v1:x', agt_id: null, ver_no: 1 }
  assert.equal(connFp(c), connFp({ ...c }))
  assert.notEqual(connFp(c), connFp({ ...c, host_nm: 'evil' }))
  assert.notEqual(connFp(c), connFp({ ...c, ver_no: 2 }))
})
