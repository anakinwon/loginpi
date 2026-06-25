import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string // Supabase users.id (Pi row와 연동 후 동일한 값)
      sub?: string // Google OAuth raw sub — upsert 실패 시 id와 달라질 수 있으므로 별도 보존
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string | null // Supabase users.id (Pi 미연동 신규 Google 사용자는 null)
    hasPiAccount?: boolean  // Pi 계정 연동 여부 — false면 /link로 유도
  }
}

export {}
