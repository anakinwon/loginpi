// 접속 비밀번호 봉인(순수, 2026-10-18) — AES-256-GCM, 형식 v1:iv.tag.ct(base64url), AAD = 'area_id:conn_id'(다른 접속 행으로 옮겨 붙이면 복호 실패)
// 키 = 32바이트(base64 44자 또는 hex 64자). 서버 키 읽기·접속 지문은 src/lib/secret.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export function parseKey(raw: string | undefined | null): Buffer | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  const b = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, 'hex') : Buffer.from(s, 'base64')
  return b.length === 32 ? b : null
}

export function seal(key: Buffer, plain: string, aad: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return `v1:${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${ct.toString('base64url')}`
}

// 변조·다른 키·다른 AAD 면 예외
export function unseal(key: Buffer, txt: string, aad: string): string {
  const m = /^v1:([\w-]+)\.([\w-]+)\.([\w-]*)$/.exec(txt)
  if (!m) throw new Error('seal_format')
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(m[1], 'base64url'))
  d.setAAD(Buffer.from(aad))
  d.setAuthTag(Buffer.from(m[2], 'base64url'))
  return Buffer.concat([d.update(Buffer.from(m[3], 'base64url')), d.final()]).toString('utf8')
}

// 접속 지문 — 실행 대상(주소·계정·암호문·에이전트·버전)이 요청 뒤 바뀌었는지 대조
export function connFp(c: { dbms_cd: string; exec_mthd_cd: string; host_nm: string | null; port_no: number | null; db_nm: string | null; usr_nm: string | null; pwd_enc_txt: string | null; agt_id: string | null; conn_url_txt?: string | null; jndi_nm?: string | null; ver_no: number }): string {
  return createHash('sha256').update(JSON.stringify([c.dbms_cd, c.exec_mthd_cd, c.host_nm, c.port_no, c.db_nm, c.usr_nm, c.pwd_enc_txt, c.agt_id, c.conn_url_txt ?? null, c.jndi_nm ?? null, c.ver_no])).digest('hex')
}
