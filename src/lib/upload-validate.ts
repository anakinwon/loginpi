// KISA MC(악성 콘텐츠) — 업로드 파일 Magic Byte(파일 시그니처) 검증 공통 헬퍼
// 클라이언트가 보낸 file.type(Content-Type)은 위조 가능하므로, 실제 파일 선두 바이트가
// 선언된 MIME의 시그니처와 일치하는지 서버에서 재검증한다 (MIME 화이트리스트의 2차 방어).
// 사용처: store/items/images · chat/rooms/upload · board/attachments · stickers/custom · admin/stickers
// SVG는 Stored XSS 위험으로 모든 업로드 경로 화이트리스트에서 의도적으로 제외돼 있다.

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))

// 선언 MIME과 실제 바이트 시그니처 일치 여부. 화이트리스트에 없는 MIME은 기본 거부.
export function validateMagicBytes(buffer: ArrayBuffer, mime: string): boolean {
  const b = new Uint8Array(buffer)
  const matchAt = (sig: number[], offset = 0): boolean =>
    b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v)
  const matchAscii = (s: string, offset = 0): boolean =>
    matchAt(ascii(s), offset)

  switch (mime) {
    case 'image/png':
      return matchAt([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/jpeg':
      return matchAt([0xff, 0xd8, 0xff])
    case 'image/gif':
      return matchAscii('GIF87a') || matchAscii('GIF89a')
    case 'image/webp':
      return matchAscii('RIFF') && matchAscii('WEBP', 8)
    case 'audio/mpeg':
      // ID3 태그 또는 MPEG 프레임 싱크(0xFFEx/0xFFFx)
      return (
        matchAscii('ID3') ||
        (b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0)
      )
    case 'audio/mp4':
      return matchAscii('ftyp', 4)
    case 'audio/webm':
      return matchAt([0x1a, 0x45, 0xdf, 0xa3]) // EBML (WebM/Matroska 공통)
    case 'audio/ogg':
      return matchAscii('OggS')
    case 'audio/wav':
      return matchAscii('RIFF') && matchAscii('WAVE', 8)
    case 'application/pdf':
      return matchAscii('%PDF')
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      // OOXML(docx/xlsx)은 ZIP 컨테이너 — PK 로컬/빈/스팬 헤더 허용
      return (
        matchAt([0x50, 0x4b, 0x03, 0x04]) ||
        matchAt([0x50, 0x4b, 0x05, 0x06]) ||
        matchAt([0x50, 0x4b, 0x07, 0x08])
      )
    case 'application/msword':
      return matchAt([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) // OLE 복합문서
    case 'text/plain': {
      // 텍스트는 시그니처가 없음 — 선두 4KB에 NUL 바이트가 있으면 위장 바이너리로 간주
      const scan = b.subarray(0, 4096)
      return !scan.includes(0)
    }
    default:
      return false
  }
}
