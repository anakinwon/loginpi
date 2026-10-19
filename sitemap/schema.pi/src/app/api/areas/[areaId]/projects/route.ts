// 모델 프로젝트 — GET 목록(조회 권한), POST 등록(신청 권한 신청 권한 역할, sql/019). 공용 처리 src/lib/simple-crud.ts
import { prjCrud } from '@/lib/model'

export const GET = prjCrud.list
export const POST = prjCrud.create
