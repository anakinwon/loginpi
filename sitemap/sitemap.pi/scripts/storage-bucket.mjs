// Storage 버킷 site-img 생성·점검 — OPS_SETUP §2. 실행: node scripts/storage-bucket.mjs [--env-prefix STAGING_|PROD_] (기본 STAGING_, .env.local 의 <prefix>SUPABASE_URL·<prefix>SUPABASE_SERVICE_ROLE_KEY 사용)
//  이미 있으면 설정만 출력. 공개 버킷·2MB·PNG/JPEG/WebP/GIF — src/lib/site.ts IMG_BUCKET·IMG_MIME·LIMITS.imgMaxBytes 와 같은 값
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'site-img'
const MAX_BYTES = 2 * 1024 * 1024
const MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

const args = process.argv.slice(2)
const prefix = args[args.indexOf('--env-prefix') + 1] || 'STAGING_'
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [
      l.slice(0, l.indexOf('=')).trim(),
      l.slice(l.indexOf('=') + 1).trim(),
    ]),
)
// 프로세스 환경변수가 .env.local 보다 우선 — 운영 키는 파일에 두지 않고 1회성으로 넘긴다
const url = process.env[prefix + 'SUPABASE_URL'] ?? env[prefix + 'SUPABASE_URL']
const key =
  process.env[prefix + 'SUPABASE_SERVICE_ROLE_KEY'] ??
  env[prefix + 'SUPABASE_SERVICE_ROLE_KEY']
if (!url || !key) {
  console.error(
    `${prefix}SUPABASE_URL / ${prefix}SUPABASE_SERVICE_ROLE_KEY 미설정`,
  )
  process.exitCode = 1
} else {
  const sb = createClient(url, key)
  const { data: got, error: getErr } = await sb.storage.getBucket(BUCKET)
  if (got) {
    console.log('이미 있음:', {
      public: got.public,
      fileSizeLimit: got.file_size_limit,
      allowedMimeTypes: got.allowed_mime_types,
    })
  } else {
    if (getErr && !/not found/i.test(getErr.message))
      console.warn('getBucket:', getErr.message)
    const { error } = await sb.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: MIME,
    })
    if (error) {
      console.error('createBucket 실패:', error.message)
      process.exitCode = 1
    } else
      console.log('생성 완료:', BUCKET, '(public, 2MB, ' + MIME.join(' ') + ')')
  }
}
