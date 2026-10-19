// 표준코드 목록·등록(조회 = 표준 메뉴, 등록 = 표준 신청 권한) — 공용 처리 src/lib/std-code.ts
import { codeCrud } from '@/lib/std-code'

export const GET = codeCrud.list
export const POST = codeCrud.create
