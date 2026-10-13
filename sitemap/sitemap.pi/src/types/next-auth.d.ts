// NextAuth 세션·JWT 타입 확장 — session.user.id = sys_user.usr_id(연동 전 ''), sub = Google raw sub
import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string // sys_user.usr_id — Pi 계정 연동 전에는 ''
      sub?: string // Google OAuth raw sub — link-complete 에서 prvd_sub_txt 로 사용
      linkUnknown?: boolean // DB 오류로 연동 판정 불가(id='' 와 구분) — 클라이언트는 코드 입력 폼 대신 일시 오류 안내
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string | null // sys_user.usr_id (null=미연동 확정, undefined=판정 불가)
    googleSub?: string // Google raw sub — update() 재조회용
  }
}

export {}
