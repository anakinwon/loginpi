// 주제영역 수정·삭제 — PATCH { ver_no, ...바꿀 항목 } / DELETE ?ver_no= (하위 주제영역·엔터티가 있으면 삭제 불가, 논리 삭제)
import { subjCrud } from '@/lib/model'

export const PATCH = subjCrud.update
export const DELETE = subjCrud.remove
