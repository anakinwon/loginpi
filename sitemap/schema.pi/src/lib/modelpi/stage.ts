// 모델 단계 관문(순수, 마스터 지시 2026-10-17) — 주제영역별 논리 작성중 → 논리완료 → (주제영역 선택) 물리 전환 → 물리 작성중 → 물리완료 → ERD
// 관문은 주제영역 범위로 판정 : 그 주제영역 엔터티의 주식별자 누락·FK 상속 누락(자식 기준)·N:M 관계(한쪽이라도)·수정 필요 점검 이슈
import type { EntCheck, FkGap, Issue } from './normalize.ts'

export const STS_NM = { WRT: '작성중', CMPTN: '완료' } as const
export type Sts = keyof typeof STS_NM

// 범위(엔터티 ID 집합) 논리 관문 — 막는 사유 목록(빈 배열 = 통과)
export function scopeWhy(chk: { checks: EntCheck[]; fkGaps: FkGap[]; issues: Issue[] }, rels: { prnt_ent_id: string; chld_ent_id: string; crdn_cd: string }[], ents: Set<string>): string[] {
  const why: string[] = []
  if (!ents.size) return ['엔터티가 없습니다']
  const noPk = chk.checks.filter((c) => ents.has(c.ent_id) && !c.pk).length
  if (noPk) why.push(`주식별자 없는 엔터티 ${noPk}개`)
  const fk = chk.fkGaps.filter((g) => ents.has(g.chld_ent_id)).length
  if (fk) why.push(`FK 상속 누락 ${fk}건`)
  const nm = rels.filter((r) => r.crdn_cd === 'NM' && (ents.has(r.prnt_ent_id) || ents.has(r.chld_ent_id))).length
  if (nm) why.push(`N:M 관계 ${nm}건(해소 필요)`)
  const iss = chk.issues.filter((i) => ents.has(i.ent_id) && i.action !== 'review').length
  if (iss) why.push(`수정 필요 점검 이슈 ${iss}건`)
  return why
}
