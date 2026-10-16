// 모델 프로젝트 수정·삭제 — PATCH { ver_no, ...바꿀 항목 } / DELETE ?ver_no= (주제영역이 있으면 삭제 불가, 논리 삭제)
import { prjCrud } from '@/lib/model'

export const PATCH = prjCrud.update
export const DELETE = prjCrud.remove
