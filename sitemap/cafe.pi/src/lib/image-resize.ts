// 브라우저 canvas 이미지 리사이즈/압축 (client-only — document/Image 의존)
// 폰 카메라 원본(수 MB)을 업로드 전 축소·압축해 1MB 이하를 보장한다.

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러올 수 없습니다'))
    }
    img.src = url
  })
}

// 긴 변이 maxDim을 넘지 않도록 비율 유지 축소 (확대는 안 함)
function fit(w: number, h: number, maxDim: number): { w: number; h: number } {
  if (w <= maxDim && h <= maxDim) return { w, h }
  const ratio = w > h ? maxDim / w : maxDim / h
  return { w: Math.round(w * ratio), h: Math.round(h * ratio) }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환 실패'))),
      'image/jpeg',
      quality,
    )
  })
}

// maxDim으로 축소 + JPEG 압축. maxBytes 지정 시 품질을 낮춰가며 크기 목표를 맞춘다.
export async function resizeImage(
  file: File,
  maxDim: number,
  opts: { quality?: number; maxBytes?: number } = {},
): Promise<Blob> {
  const img = await loadImage(file)
  const { w, h } = fit(img.naturalWidth, img.naturalHeight, maxDim)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 컨텍스트를 만들 수 없습니다')
  ctx.drawImage(img, 0, 0, w, h)

  let quality = opts.quality ?? 0.85
  let blob = await toBlob(canvas, quality)

  // 목표 용량 초과 시 품질을 단계적으로 낮춰 재인코딩 (최저 0.4)
  if (opts.maxBytes) {
    while (blob.size > opts.maxBytes && quality > 0.4) {
      quality -= 0.15
      blob = await toBlob(canvas, quality)
    }
  }
  return blob
}
