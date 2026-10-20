// 표준코드 코드상세 수정·삭제 — [cdVal] = 코드값(주식별자, 바꾸려면 삭제 뒤 새로 등록), PATCH { ver_no, ... } / DELETE ?ver_no=
import { deleteDtl, updateDtl } from '@/lib/std-code'

export const PATCH = updateDtl
export const DELETE = deleteDtl
