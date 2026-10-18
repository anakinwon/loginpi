// 서버 전용 비밀 처리(2026-10-18) — env DB_PROFILE_KEY 로 접속 비밀번호 봉인·해제. 키가 없으면 null(호출자가 503 DB_CONN_DISABLED)
// 비밀번호 원문은 응답·로그·감사 이력에 남기지 않는다(has_pwd 만)
import 'server-only'
import { parseKey, seal, unseal } from './modelpi/seal'

export const profileKey = () => parseKey(process.env.DB_PROFILE_KEY)
// 서버 직접 실행 스위치(기본 꺼짐 — 운영은 명시적으로 1)
export const directEnabled = () => process.env.DDL_DIRECT_ENABLED === '1'
// 사설 주소 허용은 개발에서만
export const allowPrivate = () => process.env.NODE_ENV !== 'production' && process.env.DB_CONN_ALLOW_PRIVATE === '1'

export function sealPwd(areaId: string, connId: string, pwd: string): string | null {
  const k = profileKey()
  return k ? seal(k, pwd, `${areaId}:${connId}`) : null
}

export function openPwd(areaId: string, connId: string, txt: string): string | null {
  const k = profileKey()
  if (!k) return null
  try {
    return unseal(k, txt, `${areaId}:${connId}`)
  } catch {
    return null // 키 교체·변조 — 비밀번호 다시 입력
  }
}
