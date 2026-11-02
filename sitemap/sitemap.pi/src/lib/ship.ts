// 워프 이동 안내 우주선 기체 코드 — 단일 소스(마스터 지시 2026-11-03). 기본 1종(SAUCER) + 유료 부가서비스 4종.
// 렌더는 src/components/ships(Ship·ShipPreview), 레이어는 leave-dialog(ship prop). 모르는 값·null 이면 기본 기체
export const SHIP_DEFAULT = 'SAUCER'
export const SHIP_CD = ['BRIDGE', 'TWIN', 'DAGGER', 'CROSS'] as const // 유료 — DB CHECK(site_mst_ship_cd_check)·RPC 2종(sql/020)과 동일
export type ShipPaidCd = (typeof SHIP_CD)[number] // site_mst.ship_cd(NULL = 기본 SAUCER)
export type ShipCd = typeof SHIP_DEFAULT | ShipPaidCd

export const isShipCd = (v: unknown): v is ShipCd =>
  v === SHIP_DEFAULT || (SHIP_CD as readonly unknown[]).includes(v)

// 표시 이름 번역 키 — messages 'ship' 네임스페이스, 키 = 코드(efct 와 같은 방식) : useTranslations()(shipNameKey(cd)) 또는 useTranslations('ship')(cd)
export const shipNameKey = (cd: ShipCd) => `ship.${cd}` as const
