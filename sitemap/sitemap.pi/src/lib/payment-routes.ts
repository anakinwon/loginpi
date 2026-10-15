// sitemap.pi 결제 라우트 인스턴스 — @pi/payments 공통 흐름 + sitemap 유형 핸들러(SITE_REG·SITE_SPK·SITE_EFCT)
import 'server-only'
import { createPaymentRoutes } from '@pi/payments'
import { apiError, db, dbFail, dbRoute, parseBody, requireUser } from './api'
import { paymentHandlers } from './payment-handlers'

export const paymentRoutes = createPaymentRoutes(
  { db, requireUser, parseBody, apiError, dbFail, dbRoute },
  paymentHandlers,
)
