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

// ERD 작성완료 관문(sql/037) — 주제영역 다이어그램·배치 저장됨·그린 테이블 1개 이상·화면에 그린 엔터티 전부 좌표 저장
export function dgmWhy(x: { subj: boolean; saved: boolean; own: number; unplaced: number }): string[] {
  if (!x.subj) return ['주제영역 ERD 만 작성완료할 수 있습니다(전체 보기 불가)']
  if (!x.saved) return ['배치를 먼저 저장하십시오']
  const why: string[] = []
  if (!x.own) why.push('그린 테이블이 없습니다(테이블 작성완료 후)')
  if (x.unplaced) why.push(`배치가 저장되지 않은 엔터티 ${x.unplaced}개 — 배치 저장 후 완료`)
  return why
}

// 테이블 상태 변경의 ERD 역순 관문 — 완료 ERD 에 있는 엔터티의 테이블은 완료 취소 불가, 완료 ERD 주제영역에 새 테이블 완료 불가(배치 끼어듦 차단)
export function phyDgmWhy(sts: Sts, ent: { ent_id: string; subj_id: string }, lock: { ents: Set<string>; subjs: Set<string> }): string[] {
  if (sts === 'WRT' && lock.ents.has(ent.ent_id)) return ['작성완료 ERD 에 있는 테이블입니다 — ERD 완료 취소 후 테이블 완료 취소']
  if (sts === 'CMPTN' && lock.subjs.has(ent.subj_id) && !lock.ents.has(ent.ent_id)) return ['주제영역 ERD 가 작성완료입니다 — ERD 완료 취소 후 새 테이블 완료']
  return []
}
