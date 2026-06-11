import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'

export async function GET() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({
    id: user.id,
    display_name: user.display_name,
    role: user.role,
  })
}
