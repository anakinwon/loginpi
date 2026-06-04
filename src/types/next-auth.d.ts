import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string  // Supabase users.id (Pi row와 Google row 연동 시 동일한 값)
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string  // Supabase users.id
  }
}

export {}
