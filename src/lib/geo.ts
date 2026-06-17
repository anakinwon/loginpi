// 브라우저 Geolocation 공용 헬퍼 — 에러 원인별 한국어 메시지 구분
// "위치 권한을 허용해 주세요"가 모든 실패(권한·측위 불가·타임아웃)에 뜨던 문제 해결:
//  - PERMISSION_DENIED(1)만 권한 문제 — 브라우저 설정 안내
//  - POSITION_UNAVAILABLE(2): PC 등 GPS 없는 기기에서 OS 위치 서비스 꺼짐이 흔한 원인
//  - TIMEOUT(3): maximumAge 캐시 허용 + 고정밀 재시도로 완화

export interface GeoPoint {
  lat: number
  lng: number
}

export class GeoError extends Error {
  /** GeolocationPositionError.code (1=권한, 2=측위 불가, 3=타임아웃) — 미지원 기기는 0 */
  readonly code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'GeoError'
  }
}

function messageFor(code: number): string {
  switch (code) {
    case 1:
      return '위치 권한이 차단되어 있습니다. 주소창의 자물쇠(또는 설정 > 사이트 권한)에서 위치를 허용한 뒤 다시 시도해 주세요.'
    case 2:
      return '현재 위치를 확인할 수 없습니다. 기기의 위치 서비스(GPS)가 켜져 있는지 확인해 주세요.'
    case 3:
      return '위치 확인 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.'
    default:
      return '이 기기에서는 위치 서비스를 사용할 수 없습니다.'
  }
}

function getOnce(options: PositionOptions): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new GeoError(err.code, messageFor(err.code))),
      options,
    )
  })
}

// 현재 위치 1회 조회.
// 1차: 최근 60초 캐시 허용(빠름) → 측위 불가·타임아웃 시 2차: 고정밀 모드 재시도.
// 권한 거부(1)는 재시도해도 같으므로 즉시 실패.
// fresh: true — 캐시 무시하고 새로 측위 ('위치 갱신' 버튼용)
export async function getCurrentPosition(opts?: {
  fresh?: boolean
}): Promise<GeoPoint> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new GeoError(0, messageFor(0))
  }
  try {
    return await getOnce({
      timeout: 8000,
      maximumAge: opts?.fresh ? 0 : 60_000,
    })
  } catch (e) {
    if (e instanceof GeoError && (e.code === 2 || e.code === 3)) {
      return getOnce({
        timeout: 12_000,
        maximumAge: 0,
        enableHighAccuracy: true,
      })
    }
    throw e
  }
}
