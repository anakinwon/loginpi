// 초대 링크 주소 시험 — node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hereBase, piBase, publicUrl, webBase } from './site-url.ts'

test('초대 링크 — localhost·http 값은 버리고 운영 주소로', () => {
  assert.equal(publicUrl('http://localhost:3003'), undefined)
  assert.equal(publicUrl('https://localhost:3003'), undefined)
  assert.equal(publicUrl('[확인중 : 운영 도메인]'), undefined)
  assert.equal(publicUrl('https://seminarz.vercel.app/'), 'https://seminarz.vercel.app')
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3003'
  delete process.env.NEXT_PUBLIC_PI_APP_DOMAIN
  assert.equal(webBase(), 'https://seminarz.vercel.app')
  assert.equal(piBase(), 'https://seminar0532.pinet.com')
  assert.equal(hereBase('seminar0532.pinet.com'), 'https://seminar0532.pinet.com')
  assert.equal(hereBase('seminarz.vercel.app'), 'https://seminarz.vercel.app')
  assert.equal(hereBase('localhost'), 'https://seminarz.vercel.app')
})
