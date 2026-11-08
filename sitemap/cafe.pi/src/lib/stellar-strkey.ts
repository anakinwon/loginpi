import 'server-only'
import { createPrivateKey, createPublicKey } from 'crypto'

// Stellar(Pi) strkey 유틸 — 외부 의존성 없이 시드(S...) → 공개키(G...) 도출.
// pnpm strict 모드에서 stellar-sdk를 앱 코드가 직접 import할 수 없어 순수 Node로 구현.
// 용도: A2U 진단(운영 시드가 도출하는 앱 지갑 공개키 확인) — 서명·송금엔 pi-backend 사용.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(s: string): Buffer {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of s.replace(/=+$/, '')) {
    const idx = B32.indexOf(ch)
    if (idx < 0) throw new Error('잘못된 base32 문자')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((value >> bits) & 0xff)
    }
  }
  return Buffer.from(out)
}

function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of buf) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += B32[(value >> bits) & 0x1f]
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 0x1f]
  return out
}

// CRC16-XMODEM (poly 0x1021, init 0x0000) — strkey 체크섬
function crc16(buf: Buffer): Buffer {
  let crc = 0x0000
  for (const b of buf) {
    crc ^= b << 8
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return Buffer.from([crc & 0xff, (crc >> 8) & 0xff]) // little-endian
}

// 시드 strkey(S...) → 32바이트 ed25519 원시 시드
function decodeSeed(secret: string): Buffer {
  const raw = base32Decode(secret)
  const version = raw[0]
  if (version !== 18 << 3)
    throw new Error('시드 버전 바이트가 아님(S 접두 아님)')
  const payload = raw.subarray(1, 33)
  if (payload.length !== 32) throw new Error('시드 페이로드 길이 오류')
  return payload
}

// 공개키 32바이트 → strkey(G...)
function encodePublicKey(pub: Buffer): string {
  const version = Buffer.from([6 << 3]) // 'G'
  const payload = Buffer.concat([version, pub])
  return base32Encode(Buffer.concat([payload, crc16(payload)]))
}

// Ed25519 원시 시드 → 원시 공개키 (Node crypto, PKCS8/SPKI DER 래핑)
function ed25519PublicFromSeed(seed: Buffer): Buffer {
  const pkcs8 = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    seed,
  ])
  const key = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
  const spki = createPublicKey(key).export({ format: 'der', type: 'spki' })
  return spki.subarray(spki.length - 32) // SPKI 접두 12바이트 뒤 32바이트가 원시 공개키
}

// 시드(S...) → 공개키(G...). 유효하지 않으면 throw.
export function publicKeyFromSeed(secret: string): string {
  return encodePublicKey(ed25519PublicFromSeed(decodeSeed(secret)))
}
