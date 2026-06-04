declare global {
  interface PiInitOptions {
    version: string
    sandbox?: boolean
  }

  interface PiUserDTO {
    uid: string
    username?: string
    credentials: {
      scopes: string[]
      valid_until: {
        timestamp: number
        iso8601: string
      }
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

  // 결제 타입
  interface PaymentData {
    amount: number                        // Pi 금액 (예: 0.001, 1, 3.14)
    memo: string                          // 사용자에게 표시되는 결제 설명
    metadata: Record<string, unknown>     // 앱 내부 데이터 — 서버에서 검증용
  }

  interface PaymentStatus {
    developer_approved: boolean           // 서버 /approve 완료
    transaction_verified: boolean         // 블록체인 트랜잭션 확인
    developer_completed: boolean          // 서버 /complete 완료
    cancelled: boolean
    user_cancelled: boolean
  }

  interface PaymentTransaction {
    txid: string
    verified: boolean
    _link: string                         // Pi 블록체인 탐색기 URL
  }

  interface PaymentDTO {
    identifier: string                    // 결제 고유 ID (paymentId)
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
      onIncompletePaymentFound: (payment: PaymentDTO) => void
    ): Promise<PiAuthResult>
    createPayment(data: PaymentData, callbacks: PaymentCallbacks): void
  }

  interface Window {
    Pi?: PiSDK
  }
}

export {}
