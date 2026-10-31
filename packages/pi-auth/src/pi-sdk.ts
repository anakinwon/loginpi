// @pi/auth — Pi SDK(https://sdk.minepi.com/pi-sdk.js) 전역 타입 선언. 출처: cafe.pi types/pi-network.d.ts
// .d.ts가 아닌 모듈로 둔 이유: 소비 앱 tsconfig include 밖이라 import로만 프로그램에 편입된다(server/route·client/provider가 import)
declare global {
  interface PiInitOptions {
    version: string
    sandbox?: boolean
  }

  // GET https://api.minepi.com/v2/me 응답
  interface PiUserDTO {
    uid: string
    username?: string
    credentials: {
      scopes: string[]
      valid_until: { timestamp: number; iso8601: string }
    }
  }

  interface PiUser {
    uid: string
    username: string
    wallet_address?: string
  }

  interface PiAuthResult {
    accessToken: string
    user: PiUser
  }

  interface PaymentData {
    amount: number
    memo: string
    metadata: Record<string, unknown>
  }

  interface PaymentStatus {
    developer_approved: boolean
    transaction_verified: boolean
    developer_completed: boolean
    cancelled: boolean
    user_cancelled: boolean
  }

  interface PaymentTransaction {
    txid: string
    verified: boolean
    _link: string
  }

  interface PaymentDTO {
    identifier: string
    user_uid: string
    amount: number
    memo: string
    metadata: Record<string, unknown>
    from_address: string
    to_address: string
    direction: 'user_to_app' | 'app_to_user'
    network: 'Pi Network' | 'Pi Testnet'
    status: PaymentStatus
    transaction: PaymentTransaction | null
    created_at: string
  }

  interface PaymentCallbacks {
    onReadyForServerApproval: (paymentId: string) => void
    onReadyForServerCompletion: (paymentId: string, txid: string) => void
    onCancel: (paymentId: string) => void
    onError: (error: Error, payment: PaymentDTO) => void
  }

  interface PiSDK {
    init(options: PiInitOptions): void | Promise<void>
    authenticate(
      scopes: string[],
      onIncompletePaymentFound: (payment: PaymentDTO) => void,
    ): Promise<PiAuthResult>
    createPayment(data: PaymentData, callbacks: PaymentCallbacks): void
    // 공식 유틸(SDK_reference) — 구 Pi Browser 엔 없을 수 있어 선택(?) : 호출 전 기능 탐지, reject('No minimal requirements' 등)·무반응 양쪽 처리
    openUrlInSystemBrowser?(url: string): Promise<void> // Pi Browser 를 벗어나 시스템 브라우저로(외부 이동 — 사용자 클릭 + 고지)
    openShareDialog?(title: string, message: string): void | Promise<void> // OS 공유창(메일·메신저 포함)
    copyText?(text: string): Promise<void> // 클립보드 복사(WebView navigator.clipboard 대안)
  }

  interface Window {
    Pi?: PiSDK
  }
}

export {}
