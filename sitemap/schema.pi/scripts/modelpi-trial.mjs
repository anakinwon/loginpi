// ModelPi 반자동 추천 시험(개발 서버 3002 전용) — 사용자가 추천 칩을 고르는 동작을 흉내 : 추천 조회(저장 없음) → 고른 것만 기존 등록 API 로 저장 → 집계 → 논리 삭제
// 사용 : DEV_USER=<행안부 분류체계 DA pi_usr_nm> node scripts/modelpi-trial.mjs [업종코드] [keep]   (keep = 정리 생략)
const IND = process.argv[2] ?? 'ECOM', KEEP = process.argv[3] === 'keep'
const R = 'http://localhost:3002/api', H = { cookie: `dev_user=${process.env.DEV_USER ?? 'anakin'}`, 'content-type': 'application/json' }
const call = async (m, u, b) => { const r = await fetch(u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) } }
const area = (await call('GET', `${R}/areas`)).j.areas.find((a) => a.area_nm.startsWith('행안부'))
const B = `${R}/areas/${area.area_id}`
const hist = async () => (await call('GET', `${B}/history?page=1`)).j.total
const prj = (await call('POST', `${B}/projects`, { prj_nm: `반자동시험_${IND}`, prj_desc: '추천 시험 — 종료 후 논리 삭제', indstry_cd: IND })).j.item
const P = prj.prj_id
const h0 = await hist()
const sr = (await call('GET', `${B}/subjects/suggest?prj=${P}`)).j
const h1 = await hist()
console.log(`[추천 조회 쓰기 0건 확인] 이력 ${h0} → ${h1}`)
console.log(`[주제영역 추천] ${sr.subjects.length}건 · 바로 등록 ${sr.subjects.filter((x) => x.std_ok).length} · 신청 필요 ${sr.subjects.filter((x) => !x.std_ok).map((x) => `${x.nm}(${x.missing_words})`).join(', ') || '없음'}`)
const subjs = []
for (const x of sr.subjects.filter((x) => x.std_ok)) {
  const r = await call('POST', `${B}/subjects`, { prj_id: P, subj_nm: x.nm, subj_abbr_nm: x.abbr, subj_desc: x.desc })
  r.s === 201 ? subjs.push(r.j.item) : console.log('  주제영역 실패', x.nm, r.j.code)
}
console.log(`[주제영역 등록] ${subjs.map((s) => `${s.subj_nm}(${s.subj_abbr_nm})`).join(' ')}`)
let rec = 0, okN = 0, made = 0
const miss = new Map()
for (const s of subjs) {
  const e = (await call('GET', `${B}/subjects/suggest?${new URLSearchParams({ nm: s.subj_nm, prj: P, abbr: s.subj_abbr_nm })}`)).j.ents.filter((x) => x.src === 'industry')
  rec += e.length
  for (const x of e) {
    if (!x.ok) { x.missing_words.forEach((w) => miss.set(w, (miss.get(w) ?? 0) + 1)); if (x.rule_error) console.log('  규칙 위반', x.ent_log_nm, x.rule_error); continue }
    okN++
    const r = await call('POST', `${B}/entities`, { subj_id: s.subj_id, dic_ids: x.dic_ids, ent_tp_cd: x.ent_tp_cd, ent_desc: x.ent_desc })
    r.s === 201 ? (made++, console.log(`  ${x.ent_log_nm} → ${r.j.item.tbl_phy_nm}`)) : console.log('  엔터티 실패', x.ent_log_nm, r.j.code)
  }
}
console.log(`[핵심 엔터티] 추천 ${rec} · 바로 등록 가능 ${okN} · 등록 ${made}`)
console.log(`[미등록 표준단어] ${[...miss].map(([w, n]) => `${w}×${n}`).join(', ') || '없음'}`)
const rr = (await call('GET', `${B}/relations/suggest?prj=${P}`)).j.rels
let rm = 0
for (const x of rr) { const r = await call('POST', `${B}/relations`, { prnt_ent_id: x.prnt_ent_id, chld_ent_id: x.chld_ent_id, crdn_cd: x.crdn_cd, idnt_yn: x.idnt_yn, chld_opt_yn: x.idnt_yn === 'Y' ? 'N' : 'Y', rel_nm: x.rel_nm }); r.s === 201 ? rm++ : console.log('  관계 실패', x.prnt_nm, x.chld_nm, r.j.code) }
const rr2 = (await call('GET', `${B}/relations/suggest?prj=${P}`)).j.rels
console.log(`[관계] 추천 ${rr.length} · 등록 ${rm} · 등록 후 재추천 ${rr2.length}건(0 이어야 함)`)
if (KEEP) { console.log('정리 생략(keep) prj_id', P); process.exit(0) }
let del = 0
for (const x of (await call('GET', `${B}/relations?prj=${P}&size=100`)).j.items) del += (await call('DELETE', `${B}/relations/${x.rel_id}?ver_no=${x.ver_no}`)).s === 200
for (const x of (await call('GET', `${B}/entities?prj=${P}&size=100`)).j.items) del += (await call('DELETE', `${B}/entities/${x.ent_id}?ver_no=${x.ver_no}`)).s === 200
for (const x of (await call('GET', `${B}/subjects`)).j.items.filter((s) => s.prj_id === P)) del += (await call('DELETE', `${B}/subjects/${x.subj_id}?ver_no=${x.ver_no}`)).s === 200
const pp = (await call('GET', `${B}/projects`)).j.items.find((x) => x.prj_id === P)
del += (await call('DELETE', `${B}/projects/${P}?ver_no=${pp.ver_no}`)).s === 200
console.log(`[정리] 논리 삭제 ${del}건`)
