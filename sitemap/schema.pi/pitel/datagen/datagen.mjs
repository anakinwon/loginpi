// Pi통신 테스트 데이터 생성기 — model/physical/*.json 을 읽어 테이블별 INSERT…SELECT(gen 함수)를 만들고 테이블×연도 단위로 병렬 적재
// 실행 : node datagen/datagen.mjs plan --scale 0.001            → datagen/out/plan.json·volume.md (SQL 미리보기)
//        node datagen/datagen.mjs run  --db dev --schema chk_gen --scale 0.001 --jobs 6 [--only ptl_pay_bill_m] [--ddl]
// 접속 : docker exec pitel-pg psql (DB 이름은 sitemap/schema.pi/pitel/.env.local 의 PITEL_DB_URL·PITEL_DEV_DB_URL 경로에서 — 값 출력 안 함)
// 재시작 : 끝난 조각은 datagen/state/<db>_<schema>.json 에 기록, 다시 실행하면 건너뜀. 조각 1개 = INSERT 1문(원자적)
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
// 컨테이너 — 기본 pitel-pg, 재구축 시험 등 다른 컨테이너는 환경변수 PITEL_CONTAINER(rebuild.mjs 가 넘김). 다른 컨테이너의 state 파일은 이름 앞에 컨테이너명
const CT = process.env.PITEL_CONTAINER || 'pitel-pg'
const ST_PRE = CT === 'pitel-pg' ? '' : CT + '_'

// 상수 — 볼륨·편향 기준(docs/06_datagen.md 와 같은 값)
const C = {
  targetTotal: 1.1e9, // D9 목표 합계(배율 1.0)
  keepRows: 100000, // 이하(T1 기준 테이블)는 배율 무관 고정 — 코드·기준 분포 유지
  minRows: 10,
  fkAlpha: 3, // 일반 FK 쏠림
  hotAlpha: 6, // S1·S14 핫 키(고객·청구계정·회선)
  hotRef: /^PTL_(CUS_CUST|CUS_BILL_ACNT|ORD_LINE)/,
  nullFk: 0.3, // S5 선택 FK NULL
  nullCol: 0.6, // S5 선택 칼럼 NULL
  sttsMain: 0.98, // S3 상태값 한 값 비율
  memoP: 0.005, // S9 넓은 행
  dirtyP: 0.001, // S12 공백 섞인 코드
  years: [2010, 2026],
  chunkMin: 1000000, // 이보다 작은 테이블은 조각 1개
}

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k)
  return i < 0 ? d : process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1]
}
const q = s => "'" + String(s).replace(/'/g, "''") + "'"

// ---------- 모델 적재 ----------
function loadModel() {
  const dir = path.join(ROOT, 'model/physical')
  const tables = []
  for (const f of fs.readdirSync(dir).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    for (const t of j.tables) tables.push({ ...t, area: j.area })
  }
  const codes = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'model/std/codes.json'), 'utf8')).map(c => [c.termNm, c.vals.map(v => v.cd)]))
  return { tables, codes }
}

// 테이블별 목표 행 수 : 기준 테이블 고정, 나머지 = 예상 행 × (목표 합계 / 예상 합계) × 배율
function volumes(tables, scale) {
  const big = tables.filter(t => (+t.estRows || 0) > C.keepRows)
  const bigSum = big.reduce((s, t) => s + +t.estRows, 0)
  const f = C.targetTotal / bigSum
  const n = new Map()
  for (const t of tables) {
    const e = +t.estRows || 1000
    n.set(t.tblNm, e <= C.keepRows ? Math.min(e, Math.max(C.minRows, Math.round(e * Math.min(1, scale * 1000)))) : Math.max(C.minRows, Math.round(e * f * scale)))
  }
  return n
}

// 데이터 타입 해석
function typeOf(dataTp) {
  const m = dataTp.match(/^(\w+)(?:\((\d+)(?:,(\d+))?\))?/)
  return { base: m[1], len: m[2] ? +m[2] : null, scale: m[3] ? +m[3] : 0 }
}

// ---------- 식 생성 ----------
function build(model, scale) {
  const { tables, codes } = model
  const byName = new Map(tables.map(t => [t.tblNm, t]))
  const N = volumes(tables, scale)
  const memo = new Map()
  let saltSeq = 100

  // FK 부모 번호 식 : salt 는 FK 이름에서 고정(같은 FK 칼럼끼리 같은 부모), 첫 칼럼만 고아(S11) 섞음
  function fkParentK(f, first) {
    const pn = N.get(f.refTbl)
    const alpha = C.hotRef.test(f.refTbl) ? C.hotAlpha : C.fkAlpha
    const fs_ = 10000 + [...f.nm].reduce((a, ch) => a + ch.charCodeAt(0), 0)
    return first ? `gen.orphan(gen.skew(K, ${fs_}, ${pn}, ${alpha}), ${pn}, K, ${fs_ + 1})` : `gen.skew(K, ${fs_}, ${pn}, ${alpha})`
  }

  // 테이블 t 의 PK 칼럼 식(키 식 K 기준) — 부모 키 식을 재귀로 펼친다
  function pkExprs(t) {
    if (memo.has(t.tblNm)) return memo.get(t.tblNm)
    const pkCols = t.pk?.cols?.length ? t.pk.cols : [t.cols[0].colNm]
    const n = N.get(t.tblNm)
    // 식별 부모 : PK 칼럼을 덮는 FK 중 부모가 실제 존재하는 첫 번째
    const idf = (t.fks || []).find(fk => fk.cols.every(c => pkCols.includes(c)) && byName.has(fk.refTbl) && fk.refTbl !== t.tblNm)
    const fns = {}
    let fan = 1
    let parentN = 1
    if (idf) {
      parentN = N.get(idf.refTbl)
      fan = Math.max(1, Math.ceil(n / parentN))
      const pfn = pkExprs(byName.get(idf.refTbl))
      idf.cols.forEach((c, i) => {
        const rc = idf.refCols[i]
        fns[c] = K => (pfn[rc] ? pfn[rc](`(((${K}) - 1) / ${fan} + 1)`) : `gen.fmt('X', ${K}, 10)`)
      })
    }
    const fk2 = idf && (t.fks || []).find(f => f !== idf && byName.has(f.refTbl) && f.refTbl !== t.tblNm && f.cols.every(c => pkCols.includes(c)) && f.cols.some(c => !fns[c]))
    if (fk2) {
      const pn2 = N.get(fk2.refTbl)
      const pf2 = pkExprs(byName.get(fk2.refTbl))
      fk2.cols.forEach((c, i) => {
        if (fns[c]) return
        const rc = fk2.refCols[i]
        fns[c] = K => (pf2[rc] ? pf2[rc](`((((${K}) - 1) / ${fan} + ((${K}) - 1) % ${fan}) % ${pn2} + 1)`) : `gen.fmt('X', ${K}, 10)`)
      })
    }
    // 겸용 FK : 식별 부모가 없고 PK 일부가 FK 에 속하면 그 칼럼은 FK 부모 값(유일성은 나머지 PK 칼럼이 보장)
    if (!idf) {
      const part = (t.fks || []).find(f => byName.has(f.refTbl) && f.refTbl !== t.tblNm && f.cols.some(c => pkCols.includes(c)) && !pkCols.every(c => f.cols.includes(c)))
      if (part) {
        const pf = pkExprs(byName.get(part.refTbl))
        part.cols.forEach((c, i) => {
          if (!pkCols.includes(c) || fns[c] || !pf[part.refCols[i]]) return
          fns[c] = K => pf[part.refCols[i]](fkParentK(part, false).replace(/K/g, `(${K})`))
        })
      }
    }
    const rest = pkCols.filter(c => !fns[c])
    rest.forEach((c, i) => {
      const col = t.cols.find(x => x.colNm === c)
      const ty = typeOf(col.dataTp)
      const isSeq = idf && i === 0
      const key = isSeq ? K => `(((${K}) - 1) % ${fan} + 1)` : K => `(${K})`
      const nn = isSeq ? fan : n
      // 유일성을 맡지 않는 뒤쪽 숫자 키는 자릿수 안에서 순환(NUMERIC(p) 넘침 방지)
      const lead = i === 0
      fns[c] = K => keyExpr(col, ty, lead || ty.base !== 'NUMERIC' ? key(K) : `((${key(K)} - 1) % ${10 ** Math.min(ty.len - ty.scale, 15) - 1} + 1)`, K, nn, n, t, isSeq)
    })
    const res = fns
    memo.set(t.tblNm, res)
    return res
  }

  // 키 칼럼 하나의 식 : kk = 그 칼럼이 쓸 번호, K = 행 키, nn = 번호 범위
  function keyExpr(col, ty, kk, K, nn, n, t, isSeq) {
    const nm = col.colNm
    // 식별 자식의 날짜형 순번 : 기준일 + 순번(일·월) — 같은 부모 안에서 겹치지 않게
    if (isSeq && ty.base === 'TIMESTAMP') return `(gen.t0() + (${kk}) * interval '1 hour')`
    if (isSeq && ty.base === 'CHAR' && ty.len === 8) return `gen.ymd(gen.t0() + (${kk}) * interval '1 day')`
    if (isSeq && ty.base === 'CHAR' && ty.len === 6) return `to_char(gen.t0() + (${kk}) * interval '1 month', 'YYYYMM')`
    if (ty.base === 'TIMESTAMP') return `gen.recent_dtm(${K}, ${n})`
    if (ty.base === 'CHAR' && ty.len === 8) return `gen.ymd(gen.recent_dtm(${K}, ${n}))`
    if (ty.base === 'CHAR' && ty.len === 6) return `to_char(gen.recent_dtm(${K}, ${n}), 'YYYYMM')`
    if (ty.base === 'NUMERIC') return kk
    const L = ty.len || 20
    const digits = String(nn).length
    const pre = digits + 1 > L ? '' : (t.tblNm.split('_')[2] || 'X')[0]
    const w = Math.max(digits, Math.min(L - pre.length, digits + 2))
    if (/_CD$/.test(nm) && (ty.len || 20) <= 10) return `lpad((${kk})::text, ${Math.min(ty.len || 10, Math.max(2, String(nn).length))}, '0')`
    return `gen.fmt(${q(pre)}, ${kk}, ${w})`
  }

  // 일반 칼럼 식
  function colExpr(t, col, n) {
    const nm = col.colNm
    const ty = typeOf(col.dataTp)
    const s = saltSeq++
    const term = col.termNm || ''
    const len = ty.len || 20
    const cut = e => (ty.base === 'VARCHAR' || ty.base === 'CHAR') ? `left(${e}, ${len})` : e
    const nul = (e, p) => (col.nullYn ? `gen.null_p(${e}, K, ${s + 7}, ${p})` : e)
    const base = `gen.recent_dtm(K, ${n})`
    // 유일 인덱스(PK 밖) : 식별 관계처럼 — 인덱스와 겹치는 FK 는 부모 번호 = (K-1)/fan+1, 인덱스의 나머지 칼럼은 순번 (K-1)%fan+1
    const pkc = t.pk?.cols || []
    const ux = (t.idx || []).filter(x => x.unq && !x.where && !x.cols.every(c => pkc.includes(c)))
    const uxFk = x => (t.fks || []).find(f => byName.has(f.refTbl) && f.cols.some(c => x.cols.includes(c)))
    for (const x of ux) {
      const f = uxFk(x)
      const fan = f ? Math.max(1, Math.ceil(n / N.get(f.refTbl))) : 1
      const others = x.cols.filter(c => !(f?.cols || []).includes(c) && !pkc.includes(c))
      if (others[0] === nm) return cut(keyExpr(col, ty, f ? `(((K) - 1) % ${fan} + 1)` : '(K)', 'K', f ? fan : n, n, t, !!f))
    }
    // 비식별 FK
    const fk = (t.fks || []).filter(f => f.cols.includes(nm) && byName.has(f.refTbl)).sort((a, b) => b.cols.length - a.cols.length)[0]
    if (fk && !(t.pk?.cols || []).includes(nm)) {
      const p = byName.get(fk.refTbl)
      const pfn = pkExprs(p)
      const rc = fk.refCols[fk.cols.indexOf(nm)]
      if (pfn[rc]) {
        const pn = N.get(p.tblNm)
        const uniq = ux.some(x => uxFk(x) === fk)
        // PK 에 걸친 겸용 FK 는 PK 쪽과 같은 부모를 써야 하므로 고아를 섞지 않는다
        const shared = fk.cols.some(c => pkc.includes(c))
        const pk = uniq ? `(((K) - 1) / ${Math.max(1, Math.ceil(n / pn))} + 1)` : fkParentK(fk, fk.cols[0] === nm && !shared)
        return nul(cut(pfn[rc](pk)), C.nullFk)
      }
    }
    if (ty.base === 'TIMESTAMP') return nul(/RG|REG|CRT/.test(nm) ? base : `gen.after_dtm(gen.month_edge(${base}, K, ${s}, 0.05), K, ${s + 1}, 30)`, C.nullCol)
    if (ty.base === 'CHAR' && ty.len === 8) return nul(`gen.ymd(gen.after_dtm(${base}, K, ${s}, 30))`, C.nullCol)
    if (ty.base === 'CHAR' && ty.len === 6) return nul(`to_char(${base}, 'YYYYMM')`, C.nullCol)
    if (/_YN$/.test(nm)) return nul(`gen.wcode(K, ${s}, ARRAY['N','Y'], ARRAY[90,10]::float8[])`, C.nullCol)
    if (/_CD$/.test(nm)) {
      const vals = codes.get(term)
      if (vals?.length) {
        const main = /STTS/.test(nm) ? C.sttsMain : 0.6
        const ws = vals.map((_, i) => (i === 0 ? main : (1 - main) / (vals.length - 1 || 1)))
        const e = `gen.wcode(K, ${s}, ARRAY[${vals.map(q).join(',')}], ARRAY[${ws.map(w => w.toFixed(6)).join(',')}]::float8[])`
        return nul(len >= 6 && ty.base === 'VARCHAR' ? `gen.dirty(${e}, K, ${s + 2}, ${C.dirtyP})` : e, C.nullCol)
      }
      return nul(cut(`lpad(gen.skew(K, ${s}, 50, 2)::text, 2, '0')`), C.nullCol)
    }
    if (/TELNO$/.test(nm)) return nul(cut('gen.phone(K)'), C.nullCol)
    if (/ZIP$/.test(nm)) return nul(cut(`lpad(gen.uniform(K, ${s}, 63999)::text, 5, '0')`), C.nullCol)
    if (/BRNO$/.test(nm)) return nul(cut(`lpad(gen.uniform(K, ${s}, 999999999)::text, 10, '0')`), C.nullCol)
    if (/ADDR$/.test(nm)) return nul(cut(`(ARRAY['서울특별시','경기도','부산광역시','인천광역시','대구광역시','대전광역시'])[gen.skew(K, ${s}, 6, 2)] || ' 테스트로 ' || gen.uniform(K, ${s + 1}, 999)`), C.nullCol)
    if (/_NM$/.test(nm)) {
      if (/고객명|성명|대표자명|담당자명|납부자명|예금주명|수령인명|신청인명/.test(term)) return nul(cut('gen.person_nm(K)'), C.nullCol)
      if (/법인명|상호|파트너명|대리점명|판매점명|회사명|사업자명/.test(term)) return nul(cut('gen.corp_nm(K)'), C.nullCol)
      return nul(cut(`${q(term.replace(/명$/, ''))} || ' ' || gen.uniform(K, ${s}, 5000)`), C.nullCol)
    }
    if (/_CN$/.test(nm) || len >= 1000) {
      const m = `gen.memo(K, ${s}, ${C.memoP})`
      return cut(col.nullYn ? m : `coalesce(${m}, ${q(term || nm)} || ' ' || K)`)
    }
    if (ty.base === 'NUMERIC') {
      const max = Math.max(1, Math.min(10 ** Math.min(ty.len - ty.scale, 12) - 1, 1e9))
      // 극단값 x1000 이 자릿수를 넘지 않게 기본값 상한 = max/1000
      if (/AMT$/.test(nm)) return nul(`gen.amt(gen.uniform(K, ${s}, ${Math.max(1, Math.min(Math.floor(max / 1000), 50000))})::numeric, K, ${s + 1})`, C.nullCol)
      if (/RT$/.test(nm)) return nul(`round((gen.u(K, ${s}) * ${Math.min(max, 100)})::numeric, ${ty.scale})`, C.nullCol)
      return nul(`gen.skew(K, ${s}, ${Math.min(max, 100000)}, 2)`, C.nullCol)
    }
    if (/_NO$/.test(nm)) return nul(cut(`gen.fmt('N', gen.uniform(K, ${s}, 99999999), 10)`), C.nullCol)
    return nul(cut(`${q(term || nm)} || gen.uniform(K, ${s}, 999)`), C.nullCol)
  }

  const plans = []
  for (const t of tables) {
    const n = N.get(t.tblNm)
    const pk = pkExprs(t)
    const sel = t.cols.map(c => {
      const e = pk[c.colNm] ? pk[c.colNm]('K') : colExpr(t, c, n)
      return `  ${e.replace(/\bK\b/g, 'k')} AS ${c.colNm.toLowerCase()}`
    })
    plans.push({
      tbl: t.tblNm.toLowerCase(),
      area: t.area,
      n,
      sql: `INSERT INTO ${t.tblNm.toLowerCase()} (${t.cols.map(c => c.colNm.toLowerCase()).join(', ')})\nSELECT\n${sel.join(',\n')}\nFROM generate_series(__KFROM__::bigint, __KTO__::bigint) k`,
    })
  }
  return plans
}

// 조각 : 큰 테이블은 연도별 키 범위(dtm_to_k), 작은 테이블은 1조각
function chunks(p) {
  if (p.n < C.chunkMin) return [{ id: `${p.tbl}:all`, from: '1', to: String(p.n) }]
  const out = []
  for (let y = C.years[0]; y <= C.years[1]; y++) {
    const from = y === C.years[0] ? '1' : `gen.dtm_to_k(timestamp '${y}-01-01', ${p.n}) + 1`
    const to = y === C.years[1] ? String(p.n) : `gen.dtm_to_k(timestamp '${y + 1}-01-01', ${p.n})`
    out.push({ id: `${p.tbl}:${y}`, from, to })
  }
  return out
}

// ---------- 실행 ----------
function dbName(which) {
  const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const key = which === 'prod' ? 'PITEL_DB_URL' : 'PITEL_DEV_DB_URL'
  const url = env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim()
  if (!url) throw new Error(`${key} 없음`)
  return new URL(url).pathname.slice(1)
}

function psql(db, sql) {
  return new Promise((res, rej) => {
    const p = spawn('docker', ['exec', '-i', CT, 'psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-At'])
    let out = ''
    let err = ''
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (err += d))
    p.on('close', code => (code === 0 ? res(out) : rej(new Error(err.trim().slice(0, 600)))))
    p.stdin.end(sql)
  })
}

async function run() {
  const which = arg('db', 'dev')
  if (which === 'prod' && arg('yes') !== true) throw new Error('pitel 최종 적재는 --yes 필요(최종 적재는 지정 세션만 — CONTEXT 4절)')
  const schema = arg('schema', which === 'prod' ? 'public' : 'chk_gen')
  const scale = +arg('scale', 0.001)
  const jobs = +arg('jobs', 6)
  const only = arg('only', null)
  const db = dbName(which)
  const head = `SET search_path = ${schema}, gen; SET synchronous_commit = off;\n`
  const model = loadModel()
  const plans = build(model, scale).filter(p => !only || only.split(',').includes(p.tbl))

  await psql(db, fs.readFileSync(path.join(HERE, '00_gen_functions.sql'), 'utf8'))
  if (arg('ddl') === true) {
    await psql(db, `CREATE SCHEMA IF NOT EXISTS ${schema};`)
    for (const f of fs.readFileSync(path.join(ROOT, 'ddl/00_run_order.txt'), 'utf8').split('\n').filter(l => /_tables\.sql$/.test(l.trim())))
      await psql(db, `SET search_path = ${schema};\n` + fs.readFileSync(path.join(ROOT, 'ddl', f.trim()), 'utf8'))
    console.log(`DDL 테이블 생성 완료 → ${db}.${schema}`)
  }

  const stDir = path.join(HERE, 'state')
  fs.mkdirSync(stDir, { recursive: true })
  const stFile = path.join(stDir, `${ST_PRE}${db}_${schema}_${scale}.json`)
  const done = new Set(fs.existsSync(stFile) ? JSON.parse(fs.readFileSync(stFile, 'utf8')) : [])
  const queue = plans.flatMap(p => chunks(p).map(c => ({ ...c, p }))).filter(c => !done.has(c.id))
  const total = queue.length
  const fails = []
  const t0 = Date.now()
  let fin = 0
  // state 원자적 쓰기(정지 중 반쯤 쓴 state 방지) — Windows 일시 잠금(EPERM·EBUSY·EACCES, Defender·색인기)은 짧게 쉬고 재시도, 끝내 실패하면 경고만
  async function saveState() {
    for (let i = 0; ; i++) {
      try {
        fs.writeFileSync(stFile + '.tmp', JSON.stringify([...done]))
        fs.renameSync(stFile + '.tmp', stFile)
        return true
      } catch (e) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= 4) {
          console.log(`경고 : state 기록 보류(${e.code || e.message}) — 다음 기록에 반영`)
          return false
        }
        await new Promise(r => setTimeout(r, 200 * (i + 1)))
      }
    }
  }
  console.log(`조각 ${total}개(완료 건너뜀 ${done.size}) · 테이블 ${plans.length} · 목표 ${plans.reduce((s, p) => s + p.n, 0).toLocaleString()}행 · 동시 ${jobs}`)
  async function worker() {
    while (queue.length) {
      const c = queue.shift()
      const sql = head + c.p.sql.replace('__KFROM__', `(${c.from})`).replace('__KTO__', `(${c.to})`) + ';\n'
      // 조각 시작·완료 시각 줄 — database/run-init.mjs 가 이 로그로 테이블별 시작·종료를 기록(완료 줄은 state 기록 뒤)
      console.log(`시작 ${c.id} ${new Date().toISOString()}`)
      try {
        await psql(db, sql)
        done.add(c.id)
        await saveState() // 기록 실패는 조각 실패가 아님(적재는 이미 커밋) — done 은 다음 기록에 반영
        console.log(`완료 ${c.id} ${new Date().toISOString()}`)
      } catch (e) {
        fails.push({ id: c.id, err: e.message })
        console.log(`실패 ${c.id} : ${e.message.split('\n')[0]}`)
      }
      fin++
      if (fin % 20 === 0 || fin === total) console.log(`진행 ${fin}/${total} · ${((Date.now() - t0) / 1000).toFixed(0)}초`)
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker))
  // 마지막 확정 기록 — 보류된 기록이 남지 않게. 이것도 실패하면 재실행 때 커밋된 조각을 다시 넣을 수 있으므로 실패 처리
  if (total && !(await saveState())) { console.log('state 최종 기록 실패 — 재실행 전 state 파일 잠금 확인'); process.exitCode = 1 }
  fs.writeFileSync(path.join(stDir, `${ST_PRE}${db}_${schema}_${scale}_fails.json`), JSON.stringify(fails, null, 2))
  console.log(`끝 · 성공 ${total - fails.length} · 실패 ${fails.length} · ${((Date.now() - t0) / 1000).toFixed(0)}초`)
  if (fails.length) process.exitCode = 1
}

function plan() {
  const scale = +arg('scale', 1)
  const model = loadModel()
  const plans = build(model, scale)
  const outDir = path.join(HERE, 'out')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify(plans, null, 1))
  const rows = plans.map(p => `| ${p.area} | ${p.tbl} | ${p.n.toLocaleString()} | ${chunks(p).length} |`)
  const sum = plans.reduce((s, p) => s + p.n, 0)
  fs.writeFileSync(path.join(outDir, 'volume.md'), `| 영역 | 테이블 | 목표 행(배율 ${scale}) | 조각 |\n|---|---|---:|---:|\n${rows.join('\n')}\n| 합계 | ${plans.length}개 | ${sum.toLocaleString()} | |\n`)
  console.log(`테이블 ${plans.length} · 목표 ${sum.toLocaleString()}행(배율 ${scale}) → datagen/out/plan.json·volume.md`)
}

const cmd = process.argv[2]
if (cmd === 'plan') plan()
else if (cmd === 'run') run().catch(e => { console.error(e.message); process.exit(1) })
else console.log('사용 : node datagen/datagen.mjs plan|run [--scale 0.001] [--db dev|prod] [--schema chk_gen] [--jobs 6] [--only tbl,...] [--ddl]')
