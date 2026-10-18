// 서버 전용 비밀 처리(2026-10-18) — env DB_PROFILE_KEY 로 접속 비밀번호 봉인·해제. 키가 없으면 null(호출자가 503 DB_CONN_DISABLED)
// 비밀번호 원문은 응답·로그·감사 이력에 남기지 않는다(has_pwd 만)
import 'server-only'
import { parseKey, seal, unseal } from './modelpi/seal'

export const profileKey = () => parseKey(process.env.DB_PROFILE_KEY)
// 서버 직접 실행 스위치(기본 꺼짐 — 운영은 명시적으로 1)
export const directEnabled = () => process.env.DDL_DIRECT_ENABLED === '1'
// 접속 기능이 꺼진 이유(운영 환경변수 진단, 값·일부 글자는 내보내지 않음) — 없으면 null. key = 키만 볼지(봉인·해제), direct = 서버 직접 실행 스위치도 볼지
export function connBlock(o: { key?: boolean; direct?: boolean } = { key: true, direct: true }): string | null {
  const raw = process.env.DB_PROFILE_KEY?.trim()
  if (o.key && !raw) return 'DB_PROFILE_KEY 미설정 — 이 배포에 환경변수가 없습니다(Vercel Production 환경에 추가한 뒤 다시 배포)'
  if (o.key && !profileKey()) return `DB_PROFILE_KEY 형식 오류 — 32바이트 키(base64 43~44자 또는 hex 64자)가 아닙니다(지금 ${raw!.length}자, 따옴표·공백·이름까지 붙여 넣었는지 확인)`
  if (o.direct && !directEnabled()) return `DDL_DIRECT_ENABLED 가 1 이 아닙니다(${process.env.DDL_DIRECT_ENABLED ? '다른 값' : '미설정'}) — 서버 직접 실행 꺼짐`
  return null
}
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
