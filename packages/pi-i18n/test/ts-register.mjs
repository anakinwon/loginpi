// 시험용 해석 훅 등록(ts-hooks.mjs) — node --import 로 먼저 불러온다
import { register } from 'node:module'
register('./ts-hooks.mjs', import.meta.url)
