// 도메인그룹 수정·삭제 — PATCH { ver_no, ... } / DELETE ?ver_no=(도메인에서 사용 중이면 삭제 불가)
import { domGrpCrud } from '@/lib/settings'

export const PATCH = domGrpCrud.update
export const DELETE = domGrpCrud.remove
