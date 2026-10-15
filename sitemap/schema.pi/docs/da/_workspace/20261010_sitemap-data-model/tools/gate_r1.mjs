// 품질 게이트 실측 — 000 → 001 → 02(Part A·B) 적용, 재적용 멱등, 게이트 탐침 시나리오
// 실행: node gate.mjs <repo_root>
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
const J = 'docs/da/_workspace/20261010_sitemap-data-model'
const read = (p) => readFileSync(join(root, p), 'utf8')
const db = new PGlite({ extensions: { pg_trgm } })
const res = []
const ok = (name, cond, note = '') => res.push(`${cond ? 'PASS' : 'FAIL'} | ${name}${note ? ' | ' + note : ''}`)
const tryq = async (sql) => { try { return { r: await db.query(sql) } } catch (e) { return { e: `${e.code ?? ''} ${e.message}` } } }

for (const f of ['packages/pi-db/sql/000_baseline.sql', 'sitemap/sitemap.pi/sql/001_sitemap_phase1.sql', `${J}/02_modeler_ddl.sql`]) {
  const r = await db.exec(read(f)).then(() => null, (e) => e.message)
  ok(`적용 ${f.split('/').pop()}`, r === null, r ?? '')
}
const re = await db.exec(read(`${J}/02_modeler_ddl.sql`)).then(() => null, (e) => e.message)
ok('02 재적용(멱등)', re === null, re ?? '')

const one = async (sql) => (await db.query(sql)).rows[0]
ok('기준선 이력 19', (await one(`SELECT COUNT(*)::int c FROM site_sts_hist`)).c === 19)

// 사용자 2명(관리자·등록자)
const adm = (await one(`INSERT INTO sys_user (pi_uid, pi_username, role) VALUES ('u-adm','adm','ADMIN') RETURNING id`)).id
const usr = (await one(`INSERT INTO sys_user (pi_uid, pi_username) VALUES ('u-1','user1') RETURNING id`)).id

// 외부 사이트 A(BSC1)·B(NONE) — 소유 확인 후 APPROVED
const mk = async (dom, plan) => (await one(`INSERT INTO site_mst (site_dom_nm, site_nm, site_ctgr_cd, site_sts_cd, ownr_usr_id, own_site_yn, plan_cd, regr_id, modr_id)
  VALUES ('${dom}','${dom}','SHOP','PENDING','${usr}','N','${plan}','${usr}','${usr}') RETURNING site_id`)).site_id
const sa = await mk('alpha.pi', 'BSC1'); const sb = await mk('beta.pi', 'NONE')
const noVrf = await tryq(`UPDATE site_mst SET site_sts_cd='APPROVED', apv_dtm=now(), modr_id='${adm}' WHERE site_id='${sa}'`)
ok('소유 확인 없이 승인 → 23514', /23514/.test(noVrf.e ?? ''), noVrf.e?.slice(0, 60))
for (const s of [sa, sb]) await db.query(`UPDATE site_mst SET site_sts_cd='APPROVED', apv_dtm=now(), vrf_yn='Y', vrf_dtm=now(), vrf_usr_id='${adm}', vrf_dom_nm=site_dom_nm, modr_id='${adm}' WHERE site_id='${s}'`)
ok('생성 이력 chgr_id = 등록자', (await one(`SELECT chgr_id FROM site_sts_hist WHERE site_id='${sa}' AND old_sts_cd IS NULL`)).chgr_id === usr)

// 탐침 1 : 반려 문구 > 500자 — site_mst 는 무제한, 이력은 500 CHECK
const p1 = await tryq(`UPDATE site_mst SET site_sts_cd='SUSPENDED', rjct_rsn_cont=repeat('x',501), modr_id='${adm}' WHERE site_id='${sb}'`)
ok('[탐침1] 정지 사유 501자 → 이력 CHECK 로 전이 실패', !!p1.e, p1.e?.slice(0, 80))

// 요금 상품 시드(테스트 값)
await db.exec(`INSERT INTO fee_plan (fee_plan_cd, fee_tp_cd, use_day_cnt, pi_amt, nrm_pi_amt, stk_cnt, stk_scp_cd, use_yn) VALUES
 ('HOME_SLOT_7','HOME_SLOT',7,2,2,6,'GLOBAL','Y'), ('SPARKLE_30','SPARKLE',30,1,1,NULL,NULL,'Y'), ('MBR_30','MEMBERSHIP',30,3,3,NULL,NULL,'Y');`)
const ord = (site, plan, extra = '') => tryq(`INSERT INTO fee_ord (ord_usr_id, site_id, fee_plan_cd, ord_pi_amt, nrm_pi_amt, hld_expr_dtm, regr_id, modr_id)
  VALUES ('${usr}', ${site ? `'${site}'` : 'NULL'}, '${plan}', 2, 2, now() + interval '15 min', '${usr}', '${usr}') RETURNING ord_id`)

// 탐침 2 : 같은 사이트 같은 슬롯 NEW 2건(기간 중첩) 허용 여부
const o1 = await ord(sa, 'HOME_SLOT_7'); const o2 = await ord(sa, 'HOME_SLOT_7')
ok('[탐침2] 같은 사이트 HOME_SLOT NEW 중복', !o1.e && !o2.e, !o1.e && !o2.e ? '2건 모두 HELD 생성(재고 1 점유 — 중복 결제 가능)' : (o1.e || o2.e))

// REQ-55 반짝임 : NONE 거절, BSC1 허용
await db.query(`UPDATE site_mst SET site_sts_cd='APPROVED', rjct_rsn_cont=NULL, modr_id='${adm}' WHERE site_id='${sb}'`).catch(() => {})
const spB = await ord(sb, 'SPARKLE_30'); const spA = await ord(sa, 'SPARKLE_30')
ok('REQ-55 NONE 사이트 반짝임 거절', /SPARKLE_PLAN_REQUIRED/.test(spB.e ?? ''), spB.e?.slice(0, 60))
ok('REQ-55 BSC1 사이트 반짝임 허용', !spA.e, spA.e ?? '')
// REQ-44 자사 거절
const own = (await one(`SELECT site_id FROM site_mst WHERE own_site_yn='Y' LIMIT 1`)).site_id
await db.query(`UPDATE site_mst SET plan_cd='VIP' WHERE site_id='${own}'`)
const ow = await ord(own, 'SPARKLE_30')
ok('REQ-44 자사 사이트 구매 거절', /OWN_SITE_NOT_BUYABLE/.test(ow.e ?? ''), ow.e?.slice(0, 60))
// 멤버십 site_id 거절
const ms = await ord(sa, 'MBR_30')
ok('멤버십 site_id 지정 거절', /MBR_SITE_NOT_ALLOWED/.test(ms.e ?? ''))

// 탐침 3 : GRACE_DAY 누락 시 판정 함수 동작
await db.query(`INSERT INTO fee_ord (ord_usr_id, fee_plan_cd, ord_pi_amt, nrm_pi_amt, ord_sts_cd, ord_tp_cd, use_bgn_dtm, use_end_dtm, regr_id, modr_id)
  VALUES ('${usr}','MBR_30',0,0,'ACTIVE','NEW', now() - interval '1 day', now() + interval '29 day', '${usr}', '${usr}')`)
const y1 = (await one(`SELECT fn_sel_mbr_actv_yn('${usr}') v`)).v
await db.query(`UPDATE sys_cfg SET del_yn='Y', del_dtm=now() WHERE cfg_key='GRACE_DAY'`)
const y2 = (await one(`SELECT fn_sel_mbr_actv_yn('${usr}') v`)).v
ok('[탐침3] GRACE_DAY 누락 시 활성 멤버십 판정', y1 === 'Y' && y2 === 'Y', `정상=${y1}, 누락=${y2}`)
await db.query(`UPDATE sys_cfg SET del_yn='N', del_dtm=NULL WHERE cfg_key='GRACE_DAY'`)

// 신고 인용 RPC → 정지 + 슬롯 회수 + 이력 사유
const rpt = (await one(`INSERT INTO site_rpt (site_id, rptr_usr_id, rpt_rsn_cd, regr_id, modr_id) VALUES ('${sa}','${adm}','FRAUD','${adm}','${adm}') RETURNING rpt_id`)).rpt_id
await db.query(`SELECT fn_prcs_site_rpt('${rpt}','ACCEPTED','인용','${adm}')`)
const st = await one(`SELECT site_sts_cd FROM site_mst WHERE site_id='${sa}'`)
const hs = await one(`SELECT chg_rsn_cd FROM site_sts_hist WHERE site_id='${sa}' ORDER BY chg_dtm DESC, reg_dtm DESC LIMIT 1`)
const live = await one(`SELECT COUNT(*)::int c FROM fee_ord WHERE site_id='${sa}' AND ord_sts_cd IN ('HELD','ACTIVE')`)
ok('신고 인용 → SUSPENDED·RPT_ACCEPT·주문 회수', st.site_sts_cd === 'SUSPENDED' && hs.chg_rsn_cd === 'RPT_ACCEPT' && live.c === 0, JSON.stringify({ st, hs, live }))

// 제재 → 멤버십 SUSPENDED → 오인 취소 → 복귀 + CMPN
const snc = (await one(`INSERT INTO usr_snc (tgt_usr_id, snc_rsn_cd, prcs_usr_id, regr_id, modr_id) VALUES ('${usr}','ETC','${adm}','${adm}','${adm}') RETURNING snc_id`)).snc_id
ok('제재 → 판정 N', (await one(`SELECT fn_sel_mbr_actv_yn('${usr}') v`)).v === 'N')
await db.query(`UPDATE usr_snc SET snc_sts_cd='CANCELED', rel_dtm=now() + interval '2 day', modr_id='${adm}' WHERE snc_id='${snc}'`)
const cm = await one(`SELECT COUNT(*)::int c FROM fee_ord WHERE ord_tp_cd='CMPN'`)
ok('오인 취소 → 복귀·보상 주문', (await one(`SELECT fn_sel_mbr_actv_yn('${usr}') v`)).v === 'Y' && cm.c === 1)

// sys_user·pi_pymnt 무변경
const cols = (await one(`SELECT COUNT(*)::int c FROM information_schema.columns WHERE table_name='sys_user' AND column_name ~ '(snc|vrf|mv)'`)).c
ok('sys_user 미확장', cols === 0)
console.log(res.join('\n'))
