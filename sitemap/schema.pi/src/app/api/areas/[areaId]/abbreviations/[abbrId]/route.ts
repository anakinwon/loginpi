// 약어 수정·삭제 — PATCH { ver_no, ... } / DELETE ?ver_no=
import { abbrCrud } from '@/lib/settings'

export const PATCH = abbrCrud.update
export const DELETE = abbrCrud.remove
