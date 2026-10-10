// r3 전 객체 컬럼 스캔 — 000→001→02 적용 후 information_schema 로 전체 컬럼을 출처(000/001/02)별로 분류하고
// 단일 토큰·도메인 미종결을 보고한다. 실행: node scan_all.mjs <repo_root> [ddl_path] [000_path]
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { readFileSync } from 'node:fs'
import { resolve as join } from 'node:path'

const root = process.argv[2]
const ddl = process.argv[3] ?? 'docs/da/_workspace/20261010_sitemap-data-model/02_modeler_ddl.sql'
const base = process.argv[4] ?? 'packages/pi-db/sql/000_baseline.sql' // 개명 반영 임시 000 사본 경로(실제 000 파일은 수정 금지)
const read = (p) => readFileSync(join(root, p), 'utf8')
// 도메인 화이트리스트 — .claude/hooks/da-ddl-guard.mjs DOMAIN_SUFFIXES 와 동일 유지
const DOM = new Set(['id','uid','nm','cd','yn','dtm','dt','no','cnt','amt','sz','ord','url','desc','txt','cont','key','pi','pct','seq','tp','sts','emoji','tag','crd','val'])
const SYS = new Set(['regr_id','reg_dtm','modr_id','mod_dtm','del_yn','del_dtm'])

const db = new PGlite({ extensions: { pg_trgm } })
const cols = async () => (await db.query(`SELECT c.table_name t, c.column_name c, c.data_type d FROM information_schema.columns c
  JOIN information_schema.tables x ON x.table_schema=c.table_schema AND x.table_name=c.table_name AND x.table_type='BASE TABLE'
  WHERE c.table_schema='public' ORDER BY 1, c.ordinal_position`)).rows
const key = (r) => `${r.t}.${r.c}`
const stage = {}
const seen = new Set()
for (const [tag, f] of [['000', base], ['001', process.argv[5] ?? 'sitemap/sitemap.pi/sql/001_sitemap_phase1.sql'], ['02', ddl]]) {
  await db.exec(read(f))
  for (const r of await cols()) if (!seen.has(key(r))) { seen.add(key(r)); stage[key(r)] = { ...r, src: tag } }
}
const all = Object.values(stage)
const by = (s) => all.filter((r) => r.src === s).length
console.log(`전체 ${all.length} / 신규(02) ${by('02')} / 승계 ${by('000') + by('001')} (000 ${by('000')} · 001 ${by('001')})`)
console.log(`테이블 ${new Set(all.map((r) => r.t)).size}`)
const single = all.filter((r) => !r.c.includes('_'))
const nodom = all.filter((r) => !SYS.has(r.c) && !DOM.has(r.c.split('_').pop()))
console.log('\n[단일 토큰 컬럼 — 정본 §1-3 v2.4 P1]')
single.forEach((r) => console.log(`  ${r.src} ${key(r)} (${r.d})`))
console.log('\n[도메인 미종결 컬럼 — §1-3 / R7]')
nodom.forEach((r) => console.log(`  ${r.src} ${key(r)} (${r.d})`))

// 함수 인자 — p_ 접두를 뗀 나머지가 표준용어 형식(2토큰 이상·도메인 종결)인지
const args = (await db.query(`SELECT p.proname f, unnest(p.proargnames) a FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proargnames IS NOT NULL ORDER BY 1`)).rows
console.log('\n[함수 인자 — p_ 제거 후 단일 토큰·도메인 미종결]')
for (const { f, a } of args) {
  const t = a.replace(/^p_/, '')
  const bad = !t.includes('_') ? '단일 토큰' : !DOM.has(t.split('_').pop()) ? '도메인 미종결' : ''
  if (bad) console.log(`  ${f}(${a}) — ${bad}`)
}
