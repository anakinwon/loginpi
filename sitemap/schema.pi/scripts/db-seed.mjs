// schema.pi 기준 데이터 적재 — DA# SQLite(DA#_META/SQLiteDB_v5.db)의 DBMS·논리 데이터타입·DBMS별 물리타입을 std_dbms·std_lgc_tp·std_tp_map 에 반영
// 실행 : pnpm db:seed [-- --dry-run] [--src=<sqlite 경로>]   (접속 SCHEMA_DATABASE_URL, .env.local)
// 원본 대응 : DA_CODE UP_CD_ID 0001(DBMS)·0101(논리타입명)·0134(논리타입 약어), STD_DATATYPE(CD_NO=논리타입코드, DB_TYPE=DBMS코드, DATA_TYPE NULL = 미지원 → 제외)
// 재실행 가능 : 코드 기준 UPSERT, 원본에 없는 기존 행은 건드리지 않음
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import postgres from 'postgres'

const SRC = path.resolve(process.argv.find((a) => a.startsWith('--src='))?.slice(6) ?? 'DA#_META/SQLiteDB_v5.db')
const DRY = process.argv.includes('--dry-run')
const REGR = 'SEED_DA#'

const lite = new DatabaseSync(SRC, { readOnly: true })
const code = (up) => lite.prepare('SELECT CD_ID id, CD_NM nm FROM DA_CODE WHERE UP_CD_ID = ? ORDER BY CD_ID').all(up)
const dbms = code('0001')
const lgcNm = code('0101')
const lgcAbbr = new Map(code('0134').map((r) => [r.id, r.nm]))
const lgc = lgcNm.map((r) => ({ id: r.id, nm: r.nm, abbr: lgcAbbr.get(r.id) }))
const maps = lite
  .prepare("SELECT DB_TYPE dbms, CD_NO lgc, DATA_TYPE phy, LEN_YN len FROM STD_DATATYPE WHERE DATA_TYPE IS NOT NULL AND trim(DATA_TYPE) <> '' ORDER BY 1, 2")
  .all()
lite.close()

const missAbbr = lgc.filter((r) => !r.abbr)
if (missAbbr.length) throw new Error(`논리타입 약어 누락 : ${missAbbr.map((r) => r.id).join(',')}`)
console.log(`· 원본 : DBMS ${dbms.length} · 논리타입 ${lgc.length} · 타입매핑 ${maps.length}${DRY ? ' (dry-run)' : ''}`)
if (DRY) process.exit(0)

const url = process.env.SCHEMA_DATABASE_URL
if (!url) {
  console.error('✗ SCHEMA_DATABASE_URL 미설정')
  process.exit(2)
}
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
try {
  await sql.begin(async (tx) => {
    for (const r of dbms)
      await tx`INSERT INTO std_dbms (dbms_cd, dbms_nm, regr_id, modr_id) VALUES (${r.id}, ${r.nm}, ${REGR}, ${REGR})
               ON CONFLICT (dbms_cd) DO UPDATE SET dbms_nm = EXCLUDED.dbms_nm, modr_id = ${REGR}
               WHERE std_dbms.dbms_nm IS DISTINCT FROM EXCLUDED.dbms_nm`
    for (const r of lgc)
      await tx`INSERT INTO std_lgc_tp (lgc_tp_cd, lgc_tp_nm, lgc_tp_abbr_nm, regr_id, modr_id) VALUES (${r.id}, ${r.nm}, ${r.abbr}, ${REGR}, ${REGR})
               ON CONFLICT (lgc_tp_cd) DO UPDATE SET lgc_tp_nm = EXCLUDED.lgc_tp_nm, lgc_tp_abbr_nm = EXCLUDED.lgc_tp_abbr_nm, modr_id = ${REGR}
               WHERE (std_lgc_tp.lgc_tp_nm, std_lgc_tp.lgc_tp_abbr_nm) IS DISTINCT FROM (EXCLUDED.lgc_tp_nm, EXCLUDED.lgc_tp_abbr_nm)`
    for (const r of maps)
      await tx`INSERT INTO std_tp_map (dbms_cd, lgc_tp_cd, phy_tp_nm, len_use_yn, regr_id, modr_id)
               VALUES (${r.dbms}, ${r.lgc}, ${r.phy}, ${r.len === 'Y' ? 'Y' : 'N'}, ${REGR}, ${REGR})
               ON CONFLICT (dbms_cd, lgc_tp_cd) WHERE del_yn = 'N' DO UPDATE
               SET phy_tp_nm = EXCLUDED.phy_tp_nm, len_use_yn = EXCLUDED.len_use_yn, modr_id = ${REGR}
               WHERE (std_tp_map.phy_tp_nm, std_tp_map.len_use_yn) IS DISTINCT FROM (EXCLUDED.phy_tp_nm, EXCLUDED.len_use_yn)`
  })
  const [c] = await sql`SELECT (SELECT count(*) FROM std_dbms WHERE del_yn='N')::int d, (SELECT count(*) FROM std_lgc_tp WHERE del_yn='N')::int l, (SELECT count(*) FROM std_tp_map WHERE del_yn='N')::int m`
  console.log(`✓ 적재 후 : DBMS ${c.d} · 논리타입 ${c.l} · 타입매핑 ${c.m}`)
} catch (e) {
  console.error('✗ 적재 실패 :', e.message)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
