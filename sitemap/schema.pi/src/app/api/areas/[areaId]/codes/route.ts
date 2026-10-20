// 표준코드 코드기본 목록·등록(조회 = 표준 메뉴, 등록 = 표준 신청 권한) — 주식별자 = 코드 영문 표준용어(sql/060), 처리 src/lib/std-code.ts
import { createBas, listBas } from '@/lib/std-code'

export const GET = listBas
export const POST = createBas
