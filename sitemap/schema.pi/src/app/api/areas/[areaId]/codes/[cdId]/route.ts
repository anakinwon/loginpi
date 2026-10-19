// 표준코드 수정·삭제 — PATCH { ver_no, ... }(용어 교체 불가) / DELETE ?ver_no=(코드값 있으면 삭제 불가)
import { codeCrud } from '@/lib/std-code'

export const PATCH = codeCrud.update
export const DELETE = codeCrud.remove
