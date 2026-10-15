// r3 대조 — 같은 원본에서 4갈래로 스키마를 만들어 비교한다.
//   NEW = 개명본 000 + 수정본 001(modeler 신규 DB 경로 치환) + 02
//   REN = 구판 000·001 + modeler RENAME 델타(최종 문서 §10-2 블록) + 02
//   REN2 = REN 에 델타 1회 더(멱등)
//   PRE = 구판 000·001 + quality rename_prelude.sql + role_cd TYPE VARCHAR(20) + 02
// 실행: node compare_r3.mjs <repo_root>
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { readFileSync } from 'node:fs'

const R = process.argv[2]
const J = `${R}/docs/da/_workspace/20261010_sitemap-data-model`
const rd = (p) => readFileSync(p, 'utf8')
const base = rd(`${R}/packages/pi-db/sql/000_baseline.sql`)
const p001 = rd(`${R}/sitemap/sitemap.pi/sql/001_sitemap_phase1.sql`)
const ddl = rd(`${J}/02_modeler_ddl.sql`)
// 델타는 최종 문서 §10-2 의 sql 블록에서 직접 추출(문서 = 정본)
const doc = rd(`${R}/sitemap/sitemap.pi/data-model/sitemaps-data-model.md`)
const delta = doc.slice(doc.indexOf('### 10-2')).match(/```sql\n([\s\S]*?)```/)[1]
const prelude = rd(new URL('./rename_prelude.sql', import.meta.url)) + '\nALTER TABLE sys_user ALTER COLUMN role_cd TYPE VARCHAR(20);\n'
const renamed000 = base
  .replace(/^  id {16}UUID /m, '  usr_id            UUID ')
  .replace('PRIMARY KEY (id)', 'PRIMARY KEY (usr_id)')
  .replace(/^  role {14}TEXT /m, '  role_cd           VARCHAR(20) ')
  .replace('sys_user_role_check CHECK (role IN', 'sys_user_role_cd_check CHECK (role_cd IN')
  .replace('COMMENT ON COLUMN sys_user.role ', 'COMMENT ON COLUMN sys_user.role_cd ')
  .replace(/ux_sys_user_pi_username_actv/g, 'ux_sys_user_pi_usr_nm_actv')
  .replace(/\bpi_username\b/g, 'pi_usr_nm')
  .replace(/\bpi_wallet_address\b/g, 'pi_wlt_adr_txt')
  .replace(/\bdisplay_name\b/g, 'dsp_nm')
  .replace(/\blast_login_dtm\b/g, 'lst_lgn_dtm')
  .replace(/\brejoin_dtm\b/g, 'rjn_dtm')

const SNAP = [
  ['컬럼', `SELECT table_name||'.'||column_name||' '||data_type||coalesce('('||character_maximum_length||')','')||' null='||is_nullable||' def='||coalesce(column_default,'') x
            FROM information_schema.columns WHERE table_schema='public' ORDER BY 1`],
  ['제약', `SELECT conrelid::regclass||' '||conname||' '||pg_get_constraintdef(oid) x FROM pg_constraint
            WHERE connamespace='public'::regnamespace ORDER BY 1`],
  ['인덱스', `SELECT indexname||' '||regexp_replace(indexdef,'^CREATE (UNIQUE )?INDEX \\S+ ','') x FROM pg_indexes WHERE schemaname='public' ORDER BY 1`],
  ['함수', `SELECT p.proname||'('||pg_get_function_arguments(p.oid)||')' x FROM pg_proc p WHERE p.pronamespace='public'::regnamespace ORDER BY 1`],
]
async function build(steps) {
  const db = new PGlite({ extensions: { pg_trgm } })
  for (const s of steps) await db.exec(s)
  const out = {}
  for (const [k, q] of SNAP) out[k] = (await db.query(q)).rows.map((r) => r.x)
  await db.close()
  return out
}
const v = {
  NEW: await build([renamed000, p001.replaceAll('REFERENCES sys_user (id)', 'REFERENCES sys_user (usr_id)'), ddl]),
  REN: await build([base, p001, delta, ddl]),
  REN2: await build([base, p001, delta, delta, ddl, ddl]),
  PRE: await build([base, p001, prelude, ddl]),
}
const diff = (a, b) => {
  const res = []
  for (const [k] of SNAP) {
    const A = new Set(v[a][k]); const B = new Set(v[b][k])
    const onlyA = [...A].filter((x) => !B.has(x)); const onlyB = [...B].filter((x) => !A.has(x))
    if (onlyA.length || onlyB.length) res.push({ k, [`only_${a}`]: onlyA, [`only_${b}`]: onlyB })
  }
  return res
}
for (const [a, b] of [['REN', 'PRE'], ['NEW', 'REN'], ['REN', 'REN2']]) {
  const d = diff(a, b)
  console.log(`${a} vs ${b} : ${d.length ? 'DIFF' : 'IDENTICAL'}`)
  if (d.length) console.log(JSON.stringify(d, null, 1))
}
console.log('sys_user(NEW) :', v.NEW['컬럼'].filter((x) => x.startsWith('sys_user.')).join(' | '))
