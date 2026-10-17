// ModelPi 논리 모델 점검(순수, 2026-10-17 마스터 지시) — FK 전파 누락·정규화 의심(1NF~3NF·4NF 경고)·표준 용어·엔터티별 검증·준수율
// 반자동 : 점검·제안만 만들고 저장하지 않는다(적용은 화면이 기존 속성 API 로). 함수 종속은 업무 규칙이라 이름 기반 "의심"으로만 표시, 판단은 DA
// 근거 : 데이터 모델링 가이드 04 §3(식별 = 부모 식별자 상속·비식별 = 참조 속성), 04 문단 240~(3NF·BCNF 필수, 다치 종속은 4NF 분리), 필수 4종(logical.ts)
import type { EntWord } from '../model-name.ts'
import { entCore, mustCheck } from './logical.ts'

export interface LAttr {
  attr_id: string
  term_id: string
  term_log_nm: string
  term_phy_nm: string
  dom_nm: string | null
  pk_yn: string
  pk_seq: number | null
  esntl_yn: string
  fk_rel_id: string | null
  ver_no: number
  term_ok: boolean // 승인완료·활성 표준용어
}
export interface LEnt {
  ent_id: string
  ent_log_nm: string
  tbl_phy_nm: string
  ent_tp_cd: string
  subj_nm: string
  words: EntWord[]
  attrs: LAttr[]
}
export interface LRel {
  rel_id: string
  prnt_ent_id: string
  chld_ent_id: string
  rel_nm: string | null
  crdn_cd: string
  idnt_yn: string
  prnt_opt_yn: string
  chld_opt_yn: string
}
export interface FkGap {
  rel_id: string
  chld_ent_id: string
  prnt_nm: string
  chld_nm: string
  term_id: string
  term_log_nm: string
  pk: boolean // 식별 관계 → 자식 PK 구성
  esntl: boolean
}
export interface Issue {
  kind: '1NF' | '2NF' | '3NF' | '4NF' | 'KEY' | 'STD'
  ent_id: string
  attr_ids: string[]
  msg: string
  action: 'move' | 'remove' | 'split' | 'review'
  target_ent_id?: string // move 대상
}
export interface EntCheck {
  ent_id: string
  pk: boolean
  must: number // 필수 4종 충족 수(0~4)
  orphan: boolean
  fk_missing: number
  issues: number
  term_bad: number
  pass: boolean
}

export function checkLogical(ents: LEnt[], rels: LRel[]) {
  const byId = new Map(ents.map((e) => [e.ent_id, e]))
  const fkGaps: FkGap[] = []
  const issues: Issue[] = []
  const pkOf = (e: LEnt) => e.attrs.filter((a) => a.pk_yn === 'Y')

  // ① FK 전파 누락 — 관계마다 부모 PK 용어가 자식에 있는지
  for (const r of rels) {
    const p = byId.get(r.prnt_ent_id), c = byId.get(r.chld_ent_id)
    if (!p || !c) continue
    if (p.ent_id === c.ent_id) {
      issues.push({ kind: 'KEY', ent_id: c.ent_id, attr_ids: [], msg: `자기참조(${r.rel_nm ?? '관계'}) : 부모 식별자를 "상위~" 역할 속성(예 상위${entCore(c.words).core}번호)으로 두십시오(04 §3)`, action: 'review' })
      continue
    }
    const ppk = pkOf(p)
    if (!ppk.length) {
      issues.push({ kind: 'KEY', ent_id: c.ent_id, attr_ids: [], msg: `부모 ${p.ent_log_nm} 에 주식별자가 없어 FK 를 전파할 수 없습니다`, action: 'review' })
      continue
    }
    const have = new Set(c.attrs.map((a) => a.term_id))
    for (const k of ppk)
      if (!have.has(k.term_id))
        fkGaps.push({ rel_id: r.rel_id, chld_ent_id: c.ent_id, prnt_nm: p.ent_log_nm, chld_nm: c.ent_log_nm, term_id: k.term_id, term_log_nm: k.term_log_nm, pk: r.idnt_yn === 'Y', esntl: r.idnt_yn === 'Y' || r.prnt_opt_yn === 'N' })
  }

  for (const e of ents) {
    const nonKey = e.attrs.filter((a) => a.pk_yn !== 'Y' && !a.fk_rel_id)
    // ② 1NF 반복 그룹 — 같은 뼈대 + 숫자 꼬리, 목록·리스트 이름
    const groups = new Map<string, LAttr[]>()
    for (const a of e.attrs) {
      const m = a.term_log_nm.match(/^(.*?)(\d+)$/)
      if (m) groups.set(m[1], [...(groups.get(m[1]) ?? []), a])
    }
    for (const [base, g] of groups)
      if (g.length >= 2) issues.push({ kind: '1NF', ent_id: e.ent_id, attr_ids: g.map((a) => a.attr_id), msg: `반복 그룹 의심 : ${g.map((a) => a.term_log_nm).join('·')} → ${base} 를 별도 엔터티(1:N)로 분리`, action: 'split' })
    for (const a of e.attrs.filter((x) => /(목록|리스트|내역들)/.test(x.term_log_nm)))
      issues.push({ kind: '1NF', ent_id: e.ent_id, attr_ids: [a.attr_id], msg: `다중값 의심 : ${a.term_log_nm} → 별도 엔터티로 분리`, action: 'split' })

    const parents = rels.filter((r) => r.chld_ent_id === e.ent_id && r.prnt_ent_id !== e.ent_id).map((r) => ({ r, p: byId.get(r.prnt_ent_id) })).filter((x): x is { r: LRel; p: LEnt } => !!x.p)
    const pkN = pkOf(e).length
    // ③ 2NF 부분 종속 — 복합 PK 이고 식별 부모가 있을 때 : 부모에 같은 용어가 있거나 부모 수준 속성(부모 핵심어 + 명·일시·등록일시·상태코드)이면 부모로
    for (const { r, p } of parents.filter((x) => x.r.idnt_yn === 'Y')) {
      if (pkN < 2) continue
      const pcore = entCore(p.words).core
      const pTerms = new Set(p.attrs.map((a) => a.term_id))
      const pLevel = new Set([`${pcore}명`, `${pcore}일시`, `${pcore}등록일시`, `${pcore}상태코드`])
      for (const a of nonKey)
        if (pTerms.has(a.term_id)) issues.push({ kind: '2NF', ent_id: e.ent_id, attr_ids: [a.attr_id], msg: `부분 종속 의심 : ${a.term_log_nm} 는 부모 ${p.ent_log_nm} 에도 있음(식별자 일부에만 종속) → 이 엔터티에서 제거`, action: 'remove', target_ent_id: p.ent_id })
        else if (pLevel.has(a.term_log_nm)) issues.push({ kind: '2NF', ent_id: e.ent_id, attr_ids: [a.attr_id], msg: `부분 종속 의심 : ${a.term_log_nm} 는 ${p.ent_log_nm}(식별자 일부) 수준 속성 → 부모로 이동`, action: 'move', target_ent_id: p.ent_id })
      void r
    }
    // ④ 3NF 이행 종속 — 비식별 부모(FK 참조)의 일반 속성이 자식에도 있음
    for (const { p } of parents.filter((x) => x.r.idnt_yn !== 'Y')) {
      const pNon = new Set(p.attrs.filter((a) => a.pk_yn !== 'Y').map((a) => a.term_id))
      for (const a of nonKey) if (pNon.has(a.term_id)) issues.push({ kind: '3NF', ent_id: e.ent_id, attr_ids: [a.attr_id], msg: `이행 종속 의심 : ${a.term_log_nm} 는 참조하는 ${p.ent_log_nm} 의 속성(FK 로 조회 가능) → 제거(반정규화는 물리 단계에서 근거·동기화와 함께)`, action: 'remove', target_ent_id: p.ent_id })
    }
    // ⑤ 4NF 경고 — 식별 부모 3개 이상
    const idp = parents.filter((x) => x.r.idnt_yn === 'Y')
    if (idp.length >= 3) issues.push({ kind: '4NF', ent_id: e.ent_id, attr_ids: [], msg: `다치 종속 의심 : 식별 부모 ${idp.length}개(${idp.map((x) => x.p.ent_log_nm).join('·')}) — 서로 독립인 조합이면 관계 엔터티로 분해(04 문단 240)`, action: 'review' })
    // ⑥ 표준 — 폐기·미승인 용어
    for (const a of e.attrs.filter((x) => !x.term_ok)) issues.push({ kind: 'STD', ent_id: e.ent_id, attr_ids: [a.attr_id], msg: `승인완료가 아닌 용어 : ${a.term_log_nm} → 승인 용어로 교체`, action: 'remove' })
  }

  const linked = new Set(rels.flatMap((r) => [r.prnt_ent_id, r.chld_ent_id]))
  const checks: EntCheck[] = ents.map((e) => {
    const m = mustCheck(e.attrs.map((a) => a.term_log_nm), e.attrs.some((a) => a.pk_yn === 'Y'))
    const must = [m.pk, m.name, m.dt, m.st].filter(Boolean).length
    const orphan = ents.length > 1 && !linked.has(e.ent_id)
    const fk_missing = fkGaps.filter((g) => g.chld_ent_id === e.ent_id).length
    const iss = issues.filter((i) => i.ent_id === e.ent_id && i.kind !== 'KEY' && i.action !== 'review').length
    const term_bad = e.attrs.filter((a) => !a.term_ok).length
    return { ent_id: e.ent_id, pk: m.pk, must, orphan, fk_missing, issues: iss, term_bad, pass: m.pk && must === 4 && !orphan && fk_missing === 0 && iss === 0 }
  })
  const passed = checks.filter((c) => c.pass).length
  const summary = {
    ents: ents.length,
    passed,
    rate: ents.length ? Math.round((passed / ents.length) * 100) : 0,
    no_pk: checks.filter((c) => !c.pk).length,
    must_short: checks.filter((c) => c.must < 4).length,
    orphan: checks.filter((c) => c.orphan).length,
    fk_missing: fkGaps.length,
    issues: issues.filter((i) => i.action !== 'review').length,
    reviews: issues.filter((i) => i.action === 'review').length,
  }
  return { fkGaps, issues, checks, summary }
}
