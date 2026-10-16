// 표준용어 수정·삭제 — PATCH { ver_no, ...바꿀 항목 } / DELETE ?ver_no= (공용 처리 : src/lib/change-route.ts)
import { changeRoutes } from '@/lib/change-route'

const r = changeRoutes('TERM', 'termId')
export const PATCH = r.PATCH
export const DELETE = r.DELETE
