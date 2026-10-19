// 표준코드값 목록(?cd_id= 필수)·등록 { cd_id, cd_val, cd_val_nm, ... } — 공용 처리 src/lib/std-code.ts
import { codeValCrud } from '@/lib/std-code'

export const GET = codeValCrud.list
export const POST = codeValCrud.create
