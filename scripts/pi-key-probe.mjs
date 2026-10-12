// Pi Platform API 키 유효성 프로브 — 결제 approve 타임아웃 진단 1단계(TROUBLESHOOT 2026-10-12 sitemap 편).
//  존재하지 않는 결제 ID 를 GET 해 응답으로 판정 : 404 payment_not_found = 키 생존 / 401 = 무효(재발급·오타). 읽기 전용(부작용 없음).
//  ⚠ VALID 는 어느 앱·네트워크의 키인지 판정 못 한다(다른 앱 키도 404) — 앱 일치는 배포 후 approve 로그(Pi GET 404 = 다른 앱 키)로 확인
//  사용: node scripts/pi-key-probe.mjs --app sitemap|cafe   (각 앱 .env.local 의 PI_API_KEY)
//        node scripts/pi-key-probe.mjs --key <API_KEY>       (셸 이력에 남으므로 --env/--app 우선)
//        node scripts/pi-key-probe.mjs --env <경로/.env>      (임의 env 파일)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'
const APP_ENV = { sitemap: 'sitemap/sitemap.pi/.env.local', cafe: '.env.local' }

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const readKey = (file) => {
  const line = readFileSync(resolve(file), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('PI_API_KEY='))
  return line?.slice('PI_API_KEY='.length).trim()
}

const app = opt('--app')
const key =
  opt('--key') ??
  (opt('--env') ? readKey(opt('--env')) : app ? readKey(APP_ENV[app]) : undefined)
if (!key) {
  console.error('사용: --app sitemap|cafe | --key <API_KEY> | --env <env 파일>')
  process.exit(2)
}

const res = await fetch(`${PI_PAYMENTS_URL}/probe_nonexistent`, {
  headers: { Authorization: `Key ${key}` },
})
const body = (await res.text()).slice(0, 160)
const label = app ?? (opt('--env') ?? '--key')
if (res.status === 404 && body.includes('payment_not_found')) {
  console.log(`[${label}] VALID — 키 유효 (len=${key.length}, 404 payment_not_found)`)
} else if (res.status === 401) {
  console.log(`[${label}] INVALID — 401 ${body} (Portal 에서 키 재복사·재발급 후 Vercel 교체·Redeploy)`)
  process.exitCode = 1
} else {
  console.log(`[${label}] UNKNOWN — ${res.status} ${body}`)
  process.exitCode = 1
}
