'use client'

// @pi/auth/client — Pi SDK를 afterInteractive로 로드하고 완료 시 'pi-sdk-loaded' 이벤트 dispatch(PiAuthProvider가 수신).
// 출처: cafe.pi src/components/pi-sdk-script.tsx. <body> 안에 배치(<html> 직속은 hydration 불일치)
import Script from 'next/script'

export function PiSdkScript() {
  return (
    <Script
      src="https://sdk.minepi.com/pi-sdk.js"
      strategy="afterInteractive"
      onLoad={() => window.dispatchEvent(new Event('pi-sdk-loaded'))}
    />
  )
}
