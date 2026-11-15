// MySQL 실행 도우미 : docker exec <컨테이너> mysql 로 SQL 을 표준입력으로 보내고 표준출력을 돌려준다(PRD dbms.pi 11.7 대상 ③)
// 쓰는 곳 : mysql/setup.mjs · datagen/datagen.mjs --target mysql · bench/progress.mjs. 비밀번호는 컨테이너 환경변수 MYSQL_ROOT_PASSWORD 를 컨테이너 안에서만 읽는다(인자·화면·로그에 남기지 않음)
import { spawn } from 'node:child_process'

export const MY = {
  container: process.env.PITEL_MY_CONTAINER || 'mysql',
  db: 'pitel',
}

// sql 실행. db = 접속 DB(기본 pitel, 관리 작업은 빈 문자열), 세션 sql_mode 에 PIPES_AS_CONCAT(|| = 문자열 연결, PostgreSQL·Oracle 과 같게)
export function my(sql, { db = MY.db } = {}) {
  const cmd = `MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --default-character-set=utf8mb4 -N -B ${db}`
  return new Promise((res, rej) => {
    const p = spawn('docker', ['exec', '-i', MY.container, 'bash', '-c', cmd])
    let out = ''
    p.stdout.setEncoding('utf8')
    p.stderr.setEncoding('utf8')
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (out += d))
    p.on('error', rej)
    p.on('close', code => (code === 0 ? res(out) : rej(new Error(out.trim().split('\n').slice(-20).join('\n') || `mysql 종료 코드 ${code}`))))
    p.stdin.end(`SET SESSION sql_mode = CONCAT(@@SESSION.sql_mode, ',PIPES_AS_CONCAT');\n${sql.trimEnd()}\n`)
  })
}

// 결과 줄 → 배열(빈 줄 제외)
export const rows = out => out.split('\n').map(l => l.trimEnd()).filter(Boolean)
