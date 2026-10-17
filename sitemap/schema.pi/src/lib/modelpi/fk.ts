// FK 상속 계획(순수, PRD_PiErd S1 L1) — 관계 1건의 부모 주식별자 → 자식 상속 속성을 어떻게 맞출지 단계 목록으로 계산. 저장하지 않음(미리보기 → 사용자 1회 확인 → API 적용)
// add = 자식에 없음 → 새 상속 속성, link = 같은 용어 일반 속성이 있음 → 이 관계 상속으로 연결, fix = 이미 상속했지만 PK·필수가 관계와 다름(식별 여부·부모 선택성 변경)
// 자기참조는 계획하지 않음(같은 용어를 쓸 수 없어 "상위~" 역할 속성이 필요 — L2)

export interface FkRelIn {
  rel_id: string
  prnt_ent_id: string
  chld_ent_id: string
  idnt_yn: string
  prnt_opt_yn: string
}
export interface FkPkIn {
  attr_id: string
  term_id: string
  term_log_nm: string
}
export interface FkChildIn {
  attr_id: string
  term_id: string
  pk_yn: string
  esntl_yn: string
  fk_rel_id: string | null
  src_attr_id: string | null
}
export type FkStep =
  | { kind: 'add'; src_attr_id: string; term_id: string; term_log_nm: string; pk: boolean; esntl: boolean }
  | { kind: 'link'; src_attr_id: string; attr_id: string; term_log_nm: string; pk: boolean; esntl: boolean }
  | { kind: 'fix'; src_attr_id: string; attr_id: string; term_log_nm: string; pk: boolean; esntl: boolean }

// 관계가 요구하는 자식 속성 상태 : 식별 → 자식 PK(필수), 비식별 → 일반, 부모 필수면 필수
export const fkWant = (r: Pick<FkRelIn, 'idnt_yn' | 'prnt_opt_yn'>) => ({ pk: r.idnt_yn === 'Y', esntl: r.idnt_yn === 'Y' || r.prnt_opt_yn !== 'Y' })

export function fkPlan(rel: FkRelIn, parentPk: FkPkIn[], child: FkChildIn[]): FkStep[] {
  if (rel.prnt_ent_id === rel.chld_ent_id) return []
  const w = fkWant(rel)
  const steps: FkStep[] = []
  for (const k of parentPk) {
    // 이 관계·이 원천으로 이미 상속 → 상태만 비교
    const inh = child.find((a) => a.fk_rel_id === rel.rel_id && a.src_attr_id === k.attr_id)
    if (inh) {
      if ((inh.pk_yn === 'Y') !== w.pk || (inh.esntl_yn === 'Y') !== w.esntl) steps.push({ kind: 'fix', src_attr_id: k.attr_id, attr_id: inh.attr_id, term_log_nm: k.term_log_nm, ...w })
      continue
    }
    // 같은 용어 속성 : 상속 표시가 없거나(일반·원천 미기록) 이 관계 상속이면 연결, 다른 관계로 상속된 것이면 건드리지 않음
    const same = child.find((a) => a.term_id === k.term_id)
    if (same) {
      // 자식이 자기 PK 로 쓰는 속성인데 관계가 비식별이면 건드리지 않음 — 연결하면 이후 fix 가 자식 식별자를 강등하므로(식별 관계로 바꿀지는 사용자 판단)
      if (same.pk_yn === 'Y' && !w.pk && same.fk_rel_id === null) continue
      if (same.fk_rel_id === null || same.fk_rel_id === rel.rel_id) steps.push({ kind: 'link', src_attr_id: k.attr_id, attr_id: same.attr_id, term_log_nm: k.term_log_nm, ...w })
      continue
    }
    // 역할명으로 이미 상속(같은 관계·같은 원천)은 위에서 처리됨 → 없으면 새로 추가
    steps.push({ kind: 'add', src_attr_id: k.attr_id, term_id: k.term_id, term_log_nm: k.term_log_nm, ...w })
  }
  return steps
}

// 역할명 상속이 필요한 부모 식별자(PRD_PiErd S1 L2) — 같은 용어로는 상속할 수 없거나 하지 않은 경우
// SELF = 자기참조(자기 PK 와 같은 용어 불가 → "상위~"), OTHER_REL = 같은 용어가 이미 다른 관계로 상속됨(예 발신·수신 고객번호), OWN_PK = 비식별 관계인데 자식이 같은 용어를 자기 PK 로 씀
export interface FkNeed {
  src_attr_id: string
  term_id: string
  term_log_nm: string
  reason: 'SELF' | 'OTHER_REL' | 'OWN_PK'
}
export function fkNeeds(rel: FkRelIn, parentPk: FkPkIn[], child: FkChildIn[]): FkNeed[] {
  const w = fkWant(rel)
  const out: FkNeed[] = []
  for (const k of parentPk) {
    if (child.some((a) => a.fk_rel_id === rel.rel_id && a.src_attr_id === k.attr_id)) continue // 이미 이 관계로 상속(같은 용어든 역할명이든)
    const base = { src_attr_id: k.attr_id, term_id: k.term_id, term_log_nm: k.term_log_nm }
    if (rel.prnt_ent_id === rel.chld_ent_id) {
      out.push({ ...base, reason: 'SELF' })
      continue
    }
    const same = child.find((a) => a.term_id === k.term_id)
    if (!same) continue
    if (same.fk_rel_id && same.fk_rel_id !== rel.rel_id) out.push({ ...base, reason: 'OTHER_REL' })
    else if (same.pk_yn === 'Y' && !w.pk && same.fk_rel_id === null) out.push({ ...base, reason: 'OWN_PK' })
  }
  return out
}
