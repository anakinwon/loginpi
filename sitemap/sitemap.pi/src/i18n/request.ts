// next-intl 요청별 메시지 — @pi/i18n/server 표준(ko → en → locale 깊은 병합, en·locale 은 readFile). ko 는 정적 import 로 번들에 포함
import { createRequestConfig } from '@pi/i18n/server'
import { routing } from './routing'

export default createRequestConfig({ routing, loadSource: () => import('../../messages/ko.json') })
