// M1 SFU 시험 화면(/lab/sfu, PRD_02 6절 M1) — Galápagos 엔진에 발표자 1 → 청중 2 영상 연결 점검
// 운영 빌드는 LAB_ENABLED=1 일 때만 열린다(R-P6 첫 줄). 실험 화면이라 문구는 한국어 고정(i18n 감사 제외 대상)
import { notFound } from 'next/navigation'
import { env } from '@/env'
import { SfuLab } from './sfu-lab'

export const dynamic = 'force-dynamic'

export default function LabSfuPage() {
  if (process.env.NODE_ENV === 'production' && env.LAB_ENABLED !== '1') notFound()
  return <SfuLab wsUrl={env.NEXT_PUBLIC_MEDIA_WS_URL} />
}
