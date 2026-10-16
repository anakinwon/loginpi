// 엔터티 관계 수정·삭제 — PATCH { ver_no, ...바뀐 항목 } 규칙 재검증(현재 행과 합침) / DELETE ?ver_no= 논리 삭제. 신청 권한, 감사 이력(변경 전후)
import { relCrud } from '@/lib/model'

export const PATCH = relCrud.update
export const DELETE = relCrud.remove
