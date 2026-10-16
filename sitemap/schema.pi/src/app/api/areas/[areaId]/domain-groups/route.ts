// 도메인그룹 목록·등록(분류체계 관리자) — 공용 처리 src/lib/simple-crud.ts
import { domGrpCrud } from '@/lib/settings'

export const GET = domGrpCrud.list
export const POST = domGrpCrud.create
