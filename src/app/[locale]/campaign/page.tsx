import { ClientCampaign } from './client-campaign'

// 매장 온보딩 보상 캠페인 — getSessionUser 미사용(클라이언트 게이트, Pi Browser 무한루프 방지)
export default function CampaignPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-4 text-3xl font-bold">🏪 매장 선착순 온보딩 이벤트</h1>
      <ClientCampaign />
    </div>
  )
}
