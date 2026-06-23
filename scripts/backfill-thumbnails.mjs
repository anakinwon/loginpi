// 썸네일 없는 상품에 이미지를 fetch → Supabase Storage 업로드 → thumbnail_url 설정
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    }),
)

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
)
const BUCKET = 'mps-items'

// 이미지를 외부 URL에서 fetch → Supabase Storage 업로드 → 공개 URL 반환
async function uploadFromUrl(srcUrl, itemId, label) {
  console.log(`  [${label}] 이미지 다운로드 중: ${srcUrl.slice(0, 70)}...`)
  const res = await fetch(srcUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cafe-pi-bot/1.0)' },
  })
  if (!res.ok) throw new Error(`이미지 fetch 실패: ${res.status} ${res.statusText}`)

  const ct = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'jpg'
  const buf = await res.arrayBuffer()
  console.log(`  [${label}] 업로드 중 (${Math.round(buf.byteLength / 1024)} KB, ${ext})`)

  const path = `admin-backfill/${itemId}_thumb.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: ct,
    upsert: true,
  })
  if (error) throw new Error(`Storage 업로드 실패: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// 상품별 이미지 소스 (네이버 이미지 검색에서 확인한 URL)
const IMAGE_MAP = [
  {
    item_id: 'ec1f7dc1-502c-4cad-a3f8-54626986b4f8',
    item_nm: '지바냥 프라',
    // 네이버 쇼핑 지바냥 프라모델 첫 번째 결과
    src: 'https://search.pstatic.net/common/?src=http%3A%2F%2Fshopping.phinf.naver.net%2Fmain_5717391%2F57173911987.20251011222054.jpg&type=a340',
  },
  {
    item_id: '433b21e2-b353-45f3-b80d-1f8b81197e53',
    item_nm: '영어책 득템하기 좋은 <북메카 패밀리 세일X신세계백화점 하남>',
    // 네이버 이미지검색 — yes24 영어책 커버
    src: 'https://search.pstatic.net/sunny/?src=https%3A%2F%2Fimage.yes24.com%2Fgoods%2F103287662%2FXL&type=a340',
  },
]

async function main() {
  for (const { item_id, item_nm, src } of IMAGE_MAP) {
    console.log(`\n▶ ${item_nm}`)
    try {
      const publicUrl = await uploadFromUrl(src, item_id, item_nm.slice(0, 8))
      console.log(`  공개 URL: ${publicUrl}`)

      // mps_item thumbnail_url 업데이트
      const { error } = await supabase
        .from('mps_item')
        .update({ thumbnail_url: publicUrl, mod_dtm: new Date().toISOString() })
        .eq('item_id', item_id)

      if (error) throw new Error(`DB 업데이트 실패: ${error.message}`)

      // mps_item_img에도 추가 (sort_ord=1 대표 이미지)
      const { error: imgErr } = await supabase.from('mps_item_img').insert({
        item_id,
        img_url: publicUrl,
        sort_ord: 1,
      })
      if (imgErr) console.warn(`  ⚠ mps_item_img 추가 실패 (무시): ${imgErr.message}`)

      console.log(`  ✓ 완료`)
    } catch (e) {
      console.error(`  ✗ 실패: ${e.message}`)
    }
  }
  console.log('\n전체 완료')
}

main().catch((e) => { console.error(e); process.exit(1) })
