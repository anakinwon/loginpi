// MS-SQL 실행 도우미 : docker exec <컨테이너> sqlcmd 로 T-SQL 을 표준입력으로 보내고 표준출력을 돌려준다(PRD dbms.pi 11.7 대상 ②)
// 쓰는 곳 : mssql/setup.mjs · datagen/datagen.mjs --target mssql · bench/progress.mjs. 접속 비밀번호는 컨테이너 환경변수 MSSQL_SA_PASSWORD 를 컨테이너 안에서만 읽는다(인자·화면·로그에 남기지 않음)
import { spawn } from 'node:child_process'

export const MS = {
  container: process.env.PITEL_MS_CONTAINER || 'sql-server',
  db: 'pitel',
  tool: '/opt/mssql-tools18/bin/sqlcmd',
}

// sql 실행(끝에 GO 를 붙여 한 배치). db = 접속 DB(기본 pitel, 관리 작업은 master), failOk = 오류가 나도 결과 반환
export function ms(sql, { db = MS.db, failOk = false } = {}) {
  // -b 오류 시 종료 코드 1, -I 따옴표 식별자, -h -1 머리줄 없음, -W 끝 공백 제거, -s '|' 칼럼 구분, -x 변수 치환 끔($ 문자 보호)
  const cmd = `${MS.tool} -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d ${db} ${failOk ? '' : '-b'} -I -h -1 -W -s '|' -x -f 65001`
  return new Promise((res, rej) => {
    const p = spawn('docker', ['exec', '-i', MS.container, 'bash', '-c', cmd])
    let out = ''
    p.stdout.setEncoding('utf8')
    p.stderr.setEncoding('utf8')
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (out += d))
    p.on('error', rej)
    p.on('close', code => (code === 0 ? res(out) : rej(new Error(out.trim().split('\n').slice(-40).join('\n') || `sqlcmd 종료 코드 ${code}`))))
    p.stdin.end(`SET NOCOUNT ON;\n${sql.trimEnd()}\nGO\n`)
  })
}

// 결과 줄 → 배열(빈 줄 제외)
export const rows = out => out.split('\n').map(l => l.trimEnd()).filter(Boolean)
