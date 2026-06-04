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
  }

  interface PiAuthResult {
    accessToken: string
    user: PiUser
  }

  interface PiIncompletePayment {
    identifier: string
    [key: string]: unknown
  }

  interface PiSDK {
    init(options: PiInitOptions): void | Promise<void>
    authenticate(
      scopes: string[],
      onIncompletePaymentFound: (payment: PiIncompletePayment) => void
    ): Promise<PiAuthResult>
  }

  interface Window {
    Pi?: PiSDK
  }
}

export {}
