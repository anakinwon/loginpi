import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { StoreShopfront } from '@/components/store/store-shopfront'

async function getShop(shopId: string) {
  const { data } = await getSupabaseAdmin()
    .from('mps_shop')
    .select(
      'seller_id, shop_nm, shop_type_cd, addr, biz_hour, owner_verified_yn, dlvr_yn',
    )
    .eq('shop_id', shopId)
    .eq('del_yn', 'N')
    .maybeSingle()
  return data as {
    seller_id: string
    shop_nm: string
    shop_type_cd: string
    addr: string | null
    biz_hour: string | null
    owner_verified_yn: string | null
    dlvr_yn: string | null
  } | null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shopId: string }>
}) {
  const { shopId } = await params
  const shop = await getShop(shopId)
  return { title: shop?.shop_nm ?? '매장' }
}

// SCR-10 매장 스토어프론트 — 한 매장의 상품 모아보기 (FR-15). 공개(게스트 포함), redirect 금지.
export default async function ShopfrontPage({
  params,
}: {
  params: Promise<{ shopId: string }>
}) {
  const t = await getTranslations('store')
  const { shopId } = await params
  const shop = await getShop(shopId)

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <Link
        href="/store"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('backToList')}
      </Link>

      {!shop ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          매장을 찾을 수 없습니다
        </p>
      ) : (
        <>
          {/* 매장 헤더 */}
          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                🏪 {shop.shop_nm}
              </h1>
              {shop.owner_verified_yn === 'Y' && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  ✅ 인증
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {t(`shopType.${shop.shop_type_cd}`)}
              {shop.addr && ` · 📍 ${shop.addr}`}
              {shop.biz_hour && ` · 🕒 ${shop.biz_hour}`}
              {shop.dlvr_yn === 'Y' && ' · 🛵 배달가능'}
            </p>
          </div>

          <StoreShopfront shopId={shopId} ownerSellerId={shop.seller_id} />
        </>
      )}
    </div>
  )
}
