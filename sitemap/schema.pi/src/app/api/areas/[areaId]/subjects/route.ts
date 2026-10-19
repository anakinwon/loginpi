// 주제영역 — GET 목록(조회 권한, 정렬순서), POST 등록(신청 권한 신청 권한 역할, 2레벨·약어 3자는 DB 강제 sql/018). 공용 처리 src/lib/simple-crud.ts
import { subjCrud } from '@/lib/model'

export const GET = subjCrud.list
export const POST = subjCrud.create
