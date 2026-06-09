// 갤러리 본문 블록 타입 및 직렬화/파싱 유틸리티 (서버·클라이언트 공용)

export type TextBlock = { t: 'text'; c: string }

export type PendingImageBlock = {
  t: 'img'
  kind: 'pending'
  tempId: string
  file: File
  blobUrl: string
  nm: string
}

export type SavedImageBlock = {
  t: 'img'
  kind: 'saved'
  id: string
  url: string
  nm: string
}

export type ImageBlock = PendingImageBlock | SavedImageBlock
export type EditorBlock = TextBlock | ImageBlock

// post_cont JSON 배열 → EditorBlock 배열
// JSON이 아니거나 빈 값이면 단일 TextBlock으로 폴백 (하위 호환)
export function parseBlocks(raw: string | null | undefined): EditorBlock[] {
  if (!raw) return [{ t: 'text', c: '' }]
  try {
    const arr: unknown = JSON.parse(raw)
    if (Array.isArray(arr) && arr.length > 0) {
      return (arr as unknown[]).map((b): EditorBlock => {
        const block = b as Record<string, unknown>
        if (block?.t === 'text') return { t: 'text', c: String(block.c ?? '') }
        if (block?.t === 'img' && block.id) {
          return {
            t: 'img',
            kind: 'saved',
            id: String(block.id),
            url: String(block.url ?? ''),
            nm: String(block.nm ?? ''),
          }
        }
        return { t: 'text', c: '' }
      })
    }
  } catch {
    // JSON 파싱 실패 → plain text 폴백
  }
  return [{ t: 'text', c: raw }]
}

type StoredBlock = { t: 'text'; c: string } | { t: 'img'; id: string; url: string; nm: string }

// EditorBlock 배열 → post_cont 저장 문자열
// pending 이미지는 업로드 후 saved로 교체된 뒤 호출해야 함
export function serializeBlocks(blocks: EditorBlock[]): string | null {
  const items: StoredBlock[] = []
  for (const b of blocks) {
    if (b.t === 'text' && b.c.trim()) items.push({ t: 'text', c: b.c })
    else if (b.t === 'img' && b.kind === 'saved') items.push({ t: 'img', id: b.id, url: b.url, nm: b.nm })
  }
  return items.length > 0 ? JSON.stringify(items) : null
}
