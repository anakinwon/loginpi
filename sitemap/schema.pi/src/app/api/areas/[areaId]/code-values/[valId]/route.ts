// 표준코드값 수정·삭제 — PATCH { ver_no, ... }(다른 코드로 이동 불가) / DELETE ?ver_no=
import { codeValCrud } from '@/lib/std-code'

export const PATCH = codeValCrud.update
export const DELETE = codeValCrud.remove
