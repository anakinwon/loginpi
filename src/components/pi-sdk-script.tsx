'use client'
import Script from 'next/script'

// Pi SDK를 afterInteractive로 로드하고 완료 시 'pi-sdk-loaded' 이벤트를 dispatch.
// onLoad는 이벤트 핸들러이므로 Server Component에서 직접 사용 불가 — Client Component 분리 필수.
export function PiSdkScript() {
  return (
    <Script
      src="https://sdk.minepi.com/pi-sdk.js"
      strategy="afterInteractive"
      onLoad={() => window.dispatchEvent(new Event('pi-sdk-loaded'))}
    />
  )
}
