// 접속 대상 IP 판정(순수, 2026-10-18) — 서버 직접 실행은 공인 유니캐스트 주소만(SSRF 차단). 사설·내부망은 로컬 에이전트로 실행
// 막는 대역 : IPv4 0/8·10/8·100.64/10(CGNAT)·127/8·169.254/16(메타데이터 포함)·172.16/12·192.0.0/24·192.0.2/24·192.88.99/24·192.168/16·198.18/15·198.51.100/24·203.0.113/24·224/4·240/4
//  IPv6 ::·::1·fc00::/7·fe80::/10·ff00::/8·2001:db8::/32·2001::/23(Teredo 포함)·100::/64, IPv4 내장(::ffff:·64:ff9b::/96 NAT64·2002::/16 6to4)은 안의 IPv4 로 다시 판정
import { BlockList, isIP } from 'node:net'

const v4 = new BlockList()
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) v4.addSubnet(a, p, 'ipv4')
const v6 = new BlockList()
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['2001::', 23], ['100::', 64]] as const) v6.addSubnet(a, p, 'ipv6')

// IPv6 → 16바이트(:: 확장, 끝 IPv4 표기 허용)
function v6Bytes(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]
  const m = /(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  if (m) {
    const b = m[1].split('.').map(Number)
    s = s.slice(0, -m[1].length) + ((b[0] << 8) | b[1]).toString(16) + ':' + ((b[2] << 8) | b[3]).toString(16)
  }
  const [h, t] = s.split('::')
  const hs = h ? h.split(':') : [], ts = t !== undefined && t ? t.split(':') : []
  const groups = t === undefined ? hs : [...hs, ...Array(8 - hs.length - ts.length).fill('0'), ...ts]
  if (groups.length !== 8) return null
  return groups.flatMap((g) => { const n = parseInt(g || '0', 16); return [n >> 8, n & 255] })
}
const v4Of = (b: number[], i: number) => b.slice(i, i + 4).join('.')

export function ipAllowed(ip: string): boolean {
  const k = isIP(ip)
  if (k === 4) return !v4.check(ip, 'ipv4')
  if (k !== 6) return false
  const b = v6Bytes(ip)
  if (!b) return false
  const zero = (n: number) => b.slice(0, n).every((x) => x === 0)
  if (zero(10) && b[10] === 255 && b[11] === 255) return ipAllowed(v4Of(b, 12)) // ::ffff:a.b.c.d
  if (zero(12)) return false // ::a.b.c.d(폐기된 IPv4 호환)·::·::1
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) return ipAllowed(v4Of(b, 12)) // NAT64
  if (b[0] === 0x20 && b[1] === 0x02) return ipAllowed(v4Of(b, 2)) // 6to4
  return !v6.check(ip, 'ipv6')
}

// 포트 — DBMS 표준 포트 또는 1024~65535(잘 알려진 다른 서비스 포트 차단)
export const portAllowed = (p: number) => Number.isInteger(p) && p >= 1024 && p <= 65535
