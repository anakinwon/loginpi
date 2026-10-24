// M0 실기기 관문 시험 화면(/lab/camera, PRD_01 5절) — Pi Browser 카메라·자동재생·기기 2대 직접 연결 점검
// 운영 빌드는 LAB_ENABLED=1 일 때만 열린다(R-P6 첫 줄). 실험 화면이라 문구는 한국어 고정(i18n 감사 제외 대상)
import { notFound } from 'next/navigation'
import { env } from '@/env'
import { CameraLab } from './camera-lab'

export const dynamic = 'force-dynamic'

export default function LabCameraPage() {
  if (process.env.NODE_ENV === 'production' && env.LAB_ENABLED !== '1') notFound()
  return (
    <CameraLab
      signalUrl={env.NEXT_PUBLIC_LAB_SUPABASE_URL}
      signalKey={env.NEXT_PUBLIC_LAB_SUPABASE_PUBLISHABLE_KEY}
    />
  )
}
