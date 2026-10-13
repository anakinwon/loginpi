// 회사 로고 정규화(클라이언트) — 올린 이미지를 LOGO_PX 정사각형으로 중앙 자르기(cover) 해 PNG Blob 으로 돌려준다.
//  메인 버블·목록이 원형으로 그리므로 비율을 미리 맞춘다. 디코딩 못 하는 형식(HEIC 등)은 호출 쪽이 원본으로 폴백해 서버 형식 검사에 맡긴다
import { LOGO_PX } from './site'

export async function normalizeLogo(file: File, px = LOGO_PX): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => no(new Error('logo decode'))
      i.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    if (!side) throw new Error('logo empty')
    const canvas = document.createElement('canvas')
    canvas.width = px
    canvas.height = px
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      px,
      px,
    )
    // ponytail: PNG 고정(toBlob webp 는 구형 WebView 미지원) — 용량이 문제 되면 webp 시도 후 PNG 폴백
    return await new Promise<Blob>((ok, no) =>
      canvas.toBlob(
        (b) => (b ? ok(b) : no(new Error('logo encode'))),
        'image/png',
      ),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
