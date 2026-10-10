// 02_modeler_ddl.sql r3 검증(modeler) — PGlite 에 000 → 001 → 02(+재적용) 적용 후 업무 규칙·sys_user 7컬럼 개명 단언.
// 실행 : 저장소 밖 임시 폴더에서 npm i @electric-sql/pglite@0.2.17 후 node 02_modeler_pglite_check.mjs <repo root> [new|rename]
//   new    = 개명본 000 + 수정본 001(신규 DB 경로 — 000·001 텍스트는 메모리에서만 치환, 실제 파일 무수정)
//   rename = 구판 000·001 + RENAME 델타(구판이 이미 적용된 DB 경로)
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { readFileSync } from 'node:fs'
import assertBase from 'node:assert/strict'

// 단언 수 집계용 래퍼
let nAssert = 0
const assert = new Proxy(assertBase, { get: (t, k) => (typeof t[k] === 'function' ? (...a) => { nAssert++; return t[k](...a) } : t[k]) })

const root = process.argv[2]
const job = `${root}/docs/da/_workspace/20261010_sitemap-data-model`
const db = new PGlite({ extensions: { pg_trgm } })
const run = (p) => db.exec(readFileSync(p, 'utf8'))
const one = async (q, p) => (await db.query(q, p)).rows[0]
const fails = async (q, re) => {
  try { await db.exec(q) } catch (e) { assert.match(e.message, re); return }
  assert.fail(`expected failure ${re}: ${q}`)
}

// MODE=new : 개명본 000 + 수정본 001(신규 DB 경로) / MODE=rename : 구판 000·001 + RENAME 델타(기적용 DB 경로)
const MODE = process.argv[3] ?? 'new'
const RENAME_DELTA = String.raw`DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('id', 'usr_id'), ('role', 'role_cd'), ('pi_username', 'pi_usr_nm'),
      ('pi_wallet_address', 'pi_wlt_adr_txt'), ('display_name', 'dsp_nm'),
      ('last_login_dtm', 'lst_lgn_dtm'), ('rejoin_dtm', 'rjn_dtm')) AS v (old_nm, new_nm)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'sys_user' AND column_name = r.old_nm) THEN
      EXECUTE format('ALTER TABLE sys_user RENAME COLUMN %I TO %I', r.old_nm, r.new_nm);
    END IF;
  END LOOP;
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'sys_user' AND column_name = 'role_cd') = 'text' THEN
    ALTER TABLE sys_user ALTER COLUMN role_cd TYPE VARCHAR(20);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sys_user_role_check' AND conrelid = 'sys_user'::regclass) THEN
    ALTER TABLE sys_user RENAME CONSTRAINT sys_user_role_check TO sys_user_role_cd_check;
  END IF;
  IF to_regclass('ux_sys_user_pi_username_actv') IS NOT NULL THEN
    ALTER INDEX ux_sys_user_pi_username_actv RENAME TO ux_sys_user_pi_usr_nm_actv;
  END IF;
END;
$$;
`
const base = readFileSync(`${root}/packages/pi-db/sql/000_baseline.sql`, 'utf8')
const p001 = readFileSync(`${root}/sitemap/sitemap.pi/sql/001_sitemap_phase1.sql`, 'utf8')
if (MODE === 'new') {
  const renamed = base
    .replace(/^  id {16}UUID /m, '  usr_id            UUID ')
    .replace('PRIMARY KEY (id)', 'PRIMARY KEY (usr_id)')
    .replace(/^  role {14}TEXT /m, '  role_cd           VARCHAR(20) ')
    .replace('sys_user_role_check CHECK (role IN', 'sys_user_role_cd_check CHECK (role_cd IN')
    .replace('COMMENT ON COLUMN sys_user.role ', 'COMMENT ON COLUMN sys_user.role_cd ')
    .replace(/ux_sys_user_pi_username_actv/g, 'ux_sys_user_pi_usr_nm_actv') // `_` 는 단어 문자라 아래 \b 치환에 안 걸림
    .replace(/\bpi_username\b/g, 'pi_usr_nm')
    .replace(/\bpi_wallet_address\b/g, 'pi_wlt_adr_txt')
    .replace(/\bdisplay_name\b/g, 'dsp_nm')
    .replace(/\blast_login_dtm\b/g, 'lst_lgn_dtm')
    .replace(/\brejoin_dtm\b/g, 'rjn_dtm')
  assert.notEqual(renamed, base)
  await db.exec(renamed)
  await db.exec(p001.replaceAll('REFERENCES sys_user (id)', 'REFERENCES sys_user (usr_id)'))
} else {
  await db.exec(base)
  await db.exec(p001)
  await db.exec(RENAME_DELTA)
}
await run(`${job}/02_modeler_ddl.sql`)
await run(`${job}/02_modeler_ddl.sql`) // 멱등

// Part A
// r3 재점검 — 개명·인자·컬럼 인벤토리
assert.equal((await one(`SELECT COUNT(*)::int n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='sys_user' AND column_name IN ('usr_id','role_cd')`)).n, 2)
assert.equal((await one(`SELECT COUNT(*)::int n FROM pg_constraint WHERE conname='sys_user_role_cd_check'`)).n, 1)
const single = (await db.query(`SELECT table_name||'.'||column_name c FROM information_schema.columns WHERE table_schema=current_schema() AND position('_' in column_name)=0`)).rows
assert.deepEqual(single, []) // 단일 단어 컬럼 0
const inv = (await db.query(`SELECT table_name t, COUNT(*)::int n FROM information_schema.columns WHERE table_schema=current_schema() GROUP BY 1 ORDER BY 1`)).rows
const total = inv.reduce((a, r) => a + r.n, 0)
const inherit = inv.filter((r) => ['sys_user','site_mst','site_rpt','stat_site_dly'].includes(r.t)).reduce((a, r) => a + r.n, 0)
console.log('컬럼 인벤토리', JSON.stringify(inv), 'total', total, 'inherited(000+001 테이블, site_mst A 추가 5 포함)', inherit)
assert.equal((await db.query(`SELECT * FROM fn_sel_stat_site_chg(p_days => 7)`)).rows.length, 0) // 기존 함수 인자 p_days grandfathered — 이름 호출 유지
assert.equal((await one(`SELECT COUNT(*)::int n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='sys_user' AND column_name IN ('pi_usr_nm','pi_wlt_adr_txt','dsp_nm','lst_lgn_dtm','rjn_dtm')`)).n, 5)
assert.equal((await one(`SELECT COUNT(*)::int n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='sys_user' AND column_name IN ('id','role','pi_username','pi_wallet_address','display_name','last_login_dtm','rejoin_dtm')`)).n, 0) // 구 컬럼명 0
assert.equal((await one(`SELECT COUNT(*)::int n FROM pg_indexes WHERE schemaname=current_schema() AND indexname='ux_sys_user_pi_usr_nm_actv'`)).n, 1)
assert.equal((await one(`SELECT COUNT(*)::int n FROM pg_indexes WHERE schemaname=current_schema() AND indexname='ux_sys_user_pi_username_actv'`)).n, 0)
assert.equal((await one(`SELECT data_type||'('||character_maximum_length||')' t FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='sys_user' AND column_name='role_cd'`)).t, 'character varying(20)') // leader #11 판정
assert.equal((await one(`SELECT COUNT(*)::int n FROM site_sts_hist`)).n, 19)
const admin = (await one(`INSERT INTO sys_user (pi_usr_nm, role_cd) VALUES ('adm','ADMIN') RETURNING usr_id`)).usr_id
const u1 = (await one(`INSERT INTO sys_user (pi_usr_nm) VALUES ('u1') RETURNING usr_id`)).usr_id
const u2 = (await one(`INSERT INTO sys_user (pi_usr_nm) VALUES ('u2') RETURNING usr_id`)).usr_id
await fails(`INSERT INTO sys_user (pi_usr_nm) VALUES ('u2')`, /ux_sys_user_pi_usr_nm_actv/) // REQ-11 불변 키 활성 UNIQUE 유지
const s1 = (await one(`INSERT INTO site_mst (site_dom_nm, site_nm, site_ctgr_cd, ownr_usr_id, site_sts_cd, modr_id)
  VALUES ('foo.pi','foo','SHOP',$1,'PENDING',$2) RETURNING site_id`, [u1, u1])).site_id
await fails(`UPDATE site_mst SET site_sts_cd='APPROVED', apv_dtm=now() WHERE site_id='${s1}'`, /vrf_yn_apv_check/)
await fails(`UPDATE site_mst SET site_mv_url='http://x' WHERE site_id='${s1}'`, /site_mv_url_check/)
await fails(`UPDATE site_mst SET rjct_rsn_cont=repeat('a',501) WHERE site_id='${s1}'`, /rjct_rsn_cont_check/) // Q-P3-3
await db.exec(`UPDATE site_mst SET site_sts_cd='APPROVED', apv_dtm=now(), vrf_yn='Y', vrf_dtm=now(), vrf_usr_id='${admin}',
  vrf_dom_nm='foo.pi', site_mv_url='https://foo.example/', modr_id='${admin}' WHERE site_id='${s1}'`)
const rpt = (await one(`INSERT INTO site_rpt (site_id, rptr_usr_id, rpt_rsn_cd) VALUES ($1,$2,'FRAUD') RETURNING rpt_id`, [s1, u2])).rpt_id
const r = await one(`SELECT * FROM fn_prcs_site_rpt($1,'ACCEPTED','x',$2)`, [rpt, admin])
assert.equal(r.rpt_sts_cd, 'ACCEPTED')
assert.equal((await one(`SELECT site_sts_cd FROM site_mst WHERE site_id=$1`, [s1])).site_sts_cd, 'SUSPENDED')
const h = await one(`SELECT old_sts_cd, new_sts_cd, chg_rsn_cd, chgr_id FROM site_sts_hist WHERE site_id=$1 ORDER BY reg_dtm DESC, new_sts_cd DESC LIMIT 1`, [s1])
assert.deepEqual([h.old_sts_cd, h.new_sts_cd, h.chg_rsn_cd, h.chgr_id], ['APPROVED', 'SUSPENDED', 'RPT_ACCEPT', admin])
assert.equal((await one(`SELECT chg_rsn_cont FROM site_sts_hist WHERE site_id=$1 AND chg_rsn_cd='RPT_ACCEPT'`, [s1])).chg_rsn_cont, 'x') // Q-P3-1
assert.equal((await one(`SELECT rpt_id FROM fn_prcs_site_rpt($1,'DISMISSED',NULL,$2)`, [rpt, admin])).rpt_id, null) // 이미 처리
// 관리자 직권 정지 → 사유 NULL(GUC 누수 없음)
await db.exec(`UPDATE site_mst SET site_sts_cd='APPROVED', modr_id='${admin}' WHERE site_id='${s1}'`)
await db.exec(`UPDATE site_mst SET site_sts_cd='SUSPENDED', modr_id='${admin}' WHERE site_id='${s1}'`)
assert.equal((await one(`SELECT COUNT(*)::int n FROM site_sts_hist WHERE site_id=$1 AND new_sts_cd='SUSPENDED' AND chg_rsn_cd IS NULL`, [s1])).n, 1)
await db.exec(`UPDATE site_mst SET site_sts_cd='APPROVED', modr_id='${admin}' WHERE site_id='${s1}'`)

// Part B — 상품
await db.exec(`INSERT INTO fee_plan (fee_plan_cd, fee_tp_cd, use_day_cnt, pi_amt, nrm_pi_amt, stk_cnt, stk_scp_cd, use_yn) VALUES
  ('CTGR_SLOT_7D','CTGR_SLOT',7,1,1,1,'PER_CTGR','Y'),
  ('HOME_SLOT_30D','HOME_SLOT',30,6,6,6,'GLOBAL','Y'),
  ('STATS_30D','STATS',30,1,1,NULL,NULL,'Y'),
  ('PREMIUM30','PREMIUM30',30,9,10,NULL,NULL,'Y'),
  ('SPARKLE_30D','SPARKLE',30,1,1,NULL,NULL,'Y'),
  ('MBR_1M','MEMBERSHIP',30,3,3,NULL,NULL,'Y')`)
await db.exec(`INSERT INTO fee_plan (fee_plan_cd, fee_tp_cd, lft_yn, pi_amt, nrm_pi_amt) VALUES ('MBR_LFT','MEMBERSHIP','Y',270,270)`)
await fails(`INSERT INTO fee_plan (fee_plan_cd, fee_tp_cd, lft_yn, pi_amt, nrm_pi_amt) VALUES ('X','STATS','Y',1,1)`, /check/)
await db.exec(`INSERT INTO fee_plan_bnd (bnd_plan_cd, item_plan_cd) VALUES ('PREMIUM30','CTGR_SLOT_7D'),('PREMIUM30','HOME_SLOT_30D'),('PREMIUM30','STATS_30D')`)

const ins = (site, plan, extra = '') => `INSERT INTO fee_ord (ord_usr_id, site_id, fee_plan_cd, ord_pi_amt, nrm_pi_amt, ord_sts_cd, hld_expr_dtm${extra ? ',' + extra.split('|')[0] : ''})
  VALUES ('${u1}', ${site ? `'${site}'` : 'NULL'}, '${plan}', 1, 1, 'HELD', now() + interval '15 min'${extra ? ',' + extra.split('|')[1] : ''})`
// 자사 사이트 구매 금지
const own = (await one(`SELECT site_id FROM site_mst WHERE site_dom_nm='cafe.pi'`)).site_id
await fails(ins(own, 'STATS_30D'), /OWN_SITE_NOT_BUYABLE/)
// SPARKLE — NONE 요금제 금지
await fails(ins(s1, 'SPARKLE_30D'), /SPARKLE_PLAN_REQUIRED/)
await db.exec(`UPDATE site_mst SET plan_cd='BSC1' WHERE site_id='${s1}'`)
await db.exec(ins(s1, 'SPARKLE_30D'))
assert.equal((await one(`SELECT site_ctgr_cd FROM fee_ord WHERE fee_plan_cd='SPARKLE_30D'`)).site_ctgr_cd, 'SHOP')
// 재고 — SHOP 카테고리 슬롯 1개: s1 PREMIUM30 점유 → s2 CTGR_SLOT 거절
const s2 = (await one(`INSERT INTO site_mst (site_dom_nm, site_nm, site_ctgr_cd, ownr_usr_id, site_sts_cd, apv_dtm, vrf_yn, vrf_dtm, vrf_usr_id, vrf_dom_nm)
  VALUES ('bar.pi','bar','SHOP',$1,'APPROVED',now(),'Y',now(),$2,'bar.pi') RETURNING site_id`, [u2, admin])).site_id
await db.exec(ins(s1, 'PREMIUM30'))
await fails(ins(s1, 'STATS_30D'), /ALREADY_OCCUPIED/) // Q-P2-3 묶음 구성 유형 중복
await fails(ins(s1, 'SPARKLE_30D'), /ALREADY_OCCUPIED/) // Q-P2-3 같은 유형 중복
await fails(`INSERT INTO fee_ord (ord_usr_id, site_id, fee_plan_cd, ord_pi_amt, nrm_pi_amt, ord_sts_cd, use_bgn_dtm, use_end_dtm, promo_apl_yn) VALUES ('${u2}','${s2}','STATS_30D',0,1,'ACTIVE',now(),now()+interval '30 day','Y')`, /PROMO_NOT_ELIGIBLE/) // Q-P3-8
await fails(ins(s2, 'CTGR_SLOT_7D'), /STOCK_EXHAUSTED: CTGR_SLOT/)
// 멤버십 site_id 금지
await fails(ins(s1, 'MBR_1M'), /MBR_SITE_NOT_ALLOWED/)
// 사이트 정지 → HELD 취소·ACTIVE 회수
await db.exec(`UPDATE fee_ord SET ord_sts_cd='ACTIVE', use_bgn_dtm=now(), use_end_dtm=now()+interval '30 day', pymnt_id='p1' WHERE fee_plan_cd='PREMIUM30'`)
await db.exec(`UPDATE site_mst SET site_sts_cd='SUSPENDED', modr_id='${admin}' WHERE site_id='${s1}'`)
const st = (await db.query(`SELECT fee_plan_cd, ord_sts_cd, rvk_rsn_cd FROM fee_ord WHERE site_id=$1 ORDER BY fee_plan_cd`, [s1])).rows
assert.deepEqual(st.map((x) => [x.fee_plan_cd, x.ord_sts_cd, x.rvk_rsn_cd]), [['PREMIUM30', 'REVOKED', 'SITE_SUSPENDED'], ['SPARKLE_30D', 'CANCELED', null]])
await db.exec(ins(s2, 'CTGR_SLOT_7D')) // 재고 반환
// 제재 — 멤버십 정지 → 취소(오인) 시 복귀 + 보상
const m = (await one(`INSERT INTO fee_ord (ord_usr_id, fee_plan_cd, ord_pi_amt, nrm_pi_amt, ord_sts_cd, use_bgn_dtm, use_end_dtm, pymnt_id)
  VALUES ($1,'MBR_1M',3,3,'ACTIVE',now(),now()+interval '30 day','p2') RETURNING ord_id`, [u1])).ord_id
assert.equal((await one(`SELECT fn_sel_mbr_actv_yn($1) v`, [u1])).v, 'Y')
await db.exec(`UPDATE sys_cfg SET use_yn='N' WHERE cfg_key='GRACE_DAY'`)
await fails(`SELECT fn_sel_mbr_actv_yn('${u1}')`, /CFG_MISSING/) // Q-P3-2
await db.exec(`UPDATE sys_cfg SET use_yn='Y' WHERE cfg_key='GRACE_DAY'`)
const sc = (await one(`INSERT INTO usr_snc (tgt_usr_id, snc_rsn_cd, prcs_usr_id, snc_bgn_dtm, modr_id) VALUES ($1,'FRAUD',$2, now() - interval '3 day', $3) RETURNING snc_id`, [u1, admin, admin])).snc_id
assert.equal((await one(`SELECT ord_sts_cd FROM fee_ord WHERE ord_id=$1`, [m])).ord_sts_cd, 'SUSPENDED')
assert.equal((await one(`SELECT fn_sel_mbr_actv_yn($1) v`, [u1])).v, 'N')
await fails(`INSERT INTO fee_ord (ord_usr_id, fee_plan_cd, ord_pi_amt, nrm_pi_amt, hld_expr_dtm) VALUES ('${u1}','MBR_1M',3,3,now())`, /USR_SANCTIONED/)
await db.exec(`UPDATE usr_snc SET snc_sts_cd='CANCELED', rel_dtm=now() WHERE snc_id='${sc}'`)
assert.equal((await one(`SELECT ord_sts_cd FROM fee_ord WHERE ord_id=$1`, [m])).ord_sts_cd, 'ACTIVE')
const c = await one(`SELECT ord_tp_cd, ord_pi_amt::text a, upr_ord_id, (use_end_dtm - use_bgn_dtm) d FROM fee_ord WHERE ord_tp_cd='CMPN'`)
assert.equal(c.upr_ord_id, m); assert.equal(Number(c.a), 0)
assert.equal((await one(`SELECT COUNT(*)::int n FROM fee_ord_hist WHERE ord_id=$1`, [m])).n, 3) // ACTIVE·SUSPENDED·ACTIVE
console.log(`OK — ${MODE} 경로 단언 ${nAssert}건 통과; CMPN 기간`, c.d)
