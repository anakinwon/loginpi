// 표준코드 코드기본 수정·삭제 — [cdId] = 코드ID(코드 영문 표준용어), PATCH { ver_no, ... } / DELETE ?ver_no=(코드상세 있으면 삭제 불가)
import { deleteBas, updateBas } from '@/lib/std-code'

export const PATCH = updateBas
export const DELETE = deleteBas
