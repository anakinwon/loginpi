// MySQL 생성 SQL 기능 점검 : 테이블마다 키 1~2,000 만 넣어 형 변환·문법 오류를 찾는다(비교 적재 아님, 끝나면 setup --yes 로 DB 재생성)
// 실행 : node datagen/datagen.mjs plan --scale 1 --target mysql && node mysql/smoke.mjs datagen/out/plan.json  (점검 뒤 PostgreSQL plan 은 plan --scale 1 로 다시 만든다)
import fs from 'node:fs'
import { my } from './my.mjs'
import { inlineGen } from './inline.mjs'

const plan = JSON.parse(fs.readFileSync(process.argv[2]))
let ok = 0
let bad = 0
const t = Date.now()
for (const p of plan) {
  const body = p.sql.replaceAll('__KFROM__', '(1)').replaceAll('__KTO__', `(${Math.min(2000, p.n)})`)
  try {
    await my(inlineGen(body) + ';\n')
    ok++
  } catch (e) {
    bad++
    console.log('실패', p.tbl, e.message.split('\n').slice(-2).join(' | ').slice(0, 300))
  }
}
console.log(`성공 ${ok} · 실패 ${bad} · ${((Date.now() - t) / 1000).toFixed(0)}초`)
