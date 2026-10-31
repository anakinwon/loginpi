// schema.pi locale 정의 — @pi/i18n 표준(docs/I18N_STANDARD.md). 목록은 i18n.config.json(빌드 시점 고정), 감지·쿠키 끔(Pi Browser)
import { createRouting, type CreateRoutingOptions } from '@pi/i18n'
import config from '../../i18n.config.json'

export const routing = createRouting({ locales: config.locales as CreateRoutingOptions['locales'] })
