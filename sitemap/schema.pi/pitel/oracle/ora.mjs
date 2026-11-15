// Oracle 실행 도우미 : docker exec <컨테이너> sqlplus 로 SQL 을 보내고 표준출력을 돌려준다(PRD dbms.pi 11.6 시나리오 S1)
// 쓰는 곳 : oracle/s1.mjs · datagen/datagen.mjs --target oracle. 접속 비밀번호는 pitel/.env.local PITEL_ORA_PWD 에서 읽어 표준입력으로만 넘긴다(인자·화면·로그에 남기지 않음)
// 관리 작업(사용자·테이블스페이스)은 컨테이너 OS 인증 sysdba 로 PDB 에 들어가 수행한다
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ORA = {
  container: process.env.PITEL_ORA_CONTAINER || 'oracle21c',
  sid: 'ORCLCDB',
  pdb: 'ORCLPDB',
  user: 'PITEL',
  tbs: 'PITEL_DATA',
  envFile: path.join(ROOT, '.env.local'),
}
const PWD_KEY = 'PITEL_ORA_PWD'

// 비밀번호 : 없으면 만들어 .env.local(gitignore)에 덧붙인다. Oracle 규칙상 영문자로 시작, 따옴표로 감싸 접속
export function oraPwd(create = false) {
  const env = fs.existsSync(ORA.envFile) ? fs.readFileSync(ORA.envFile, 'utf8') : ''
  const hit = env.match(new RegExp(`^${PWD_KEY}=(.+)$`, 'm'))?.[1]?.trim()
  if (hit) return hit
  if (!create) throw new Error(`${PWD_KEY} 없음 — node oracle/s1.mjs setup 먼저`)
  const pwd = 'P' + crypto.randomBytes(18).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 20)
  fs.appendFileSync(ORA.envFile, `${env && !env.endsWith('\n') ? '\n' : ''}${PWD_KEY}=${pwd}\n`)
  return pwd
}

const SETS = 'SET HEADING OFF FEEDBACK OFF PAGESIZE 0 LINESIZE 32767 TRIMSPOOL ON TRIMOUT ON TAB OFF VERIFY OFF ECHO OFF DEFINE OFF SQLBLANKLINES ON LONG 2000000 LONGCHUNKSIZE 2000000'

// sql 실행. sysdba = 관리 접속(PDB 로 전환), failOk = 오류가 나도 계속(DROP 등). 실패하면 출력 끝 40줄을 담아 reject
export function ora(sql, { sysdba = false, failOk = false } = {}) {
  const pwdNow = (() => {
    try {
      return oraPwd()
    } catch {
      return null
    }
  })()
  const conn = sysdba ? `CONNECT / AS SYSDBA\nALTER SESSION SET CONTAINER = ${ORA.pdb};` : `CONNECT ${ORA.user}/"${oraPwd()}"@//localhost:1521/${ORA.pdb}`
  const input = [
    failOk ? 'WHENEVER SQLERROR CONTINUE' : 'WHENEVER SQLERROR EXIT FAILURE ROLLBACK',
    'WHENEVER OSERROR EXIT FAILURE',
    SETS,
    conn,
    'ALTER SESSION SET NLS_LENGTH_SEMANTICS = CHAR;',
    "ALTER SESSION SET NLS_NUMERIC_CHARACTERS = '.,';",
    sql.trimEnd(),
    'EXIT',
    '',
  ].join('\n')
  return new Promise((res, rej) => {
    // NLS_LANG = UTF-8 : 한글 리터럴(이름·주소 배열)이 깨지지 않게
    const p = spawn('docker', ['exec', '-i', '-e', `ORACLE_SID=${ORA.sid}`, '-e', 'NLS_LANG=AMERICAN_AMERICA.AL32UTF8', ORA.container, 'sqlplus', '-s', '-L', '/nolog'])
    let out = ''
    p.stdout.setEncoding('utf8') // 한글이 data 조각 경계에서 갈리지 않게
    p.stderr.setEncoding('utf8')
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (out += d))
    p.on('error', rej)
    // 오류 출력에 문장이 되풀이될 수 있어(CREATE USER … IDENTIFIED BY) 비밀번호를 가린다
    const mask = s => (pwdNow ? s.split(pwdNow).join('***') : s)
    p.on('close', code => (code === 0 ? res(mask(out)) : rej(new Error(mask(out.trim().split('\n').slice(-40).join('\n')) || `sqlplus 종료 코드 ${code}`))))
    p.stdin.end(input)
  })
}

// 결과 줄 → 배열(빈 줄 제외)
export const rows = out => out.split('\n').map(l => l.trimEnd()).filter(Boolean)
