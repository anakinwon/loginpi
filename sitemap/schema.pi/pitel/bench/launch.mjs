// 적재 실행기 : datagen 을 자식 프로세스로 돌리고 출력을 로그에 덧붙인 뒤, 끝나면 'exit <코드> <ISO 시각>' 줄을 남긴다(bench/progress.mjs 가 끝 시각으로 읽음)
// 쓰는 이유 : Claude Code 백그라운드 작업은 PC 메모리가 부족하면 자동 종료된다(2026-11-15 MS-SQL 2차 중단). 이 파일을 Windows WMI 로 띄우면 그 관리 밖에서 돈다
// 실행 : node bench/launch.mjs <로그> <datagen 인자…>   예) node bench/launch.mjs mysql/out/full_load.log run --target mysql --scale 1 --jobs 7
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [log, ...args] = process.argv.slice(2)
if (!log || !args.length) throw new Error('사용 : node bench/launch.mjs <로그> <datagen 인자…>')
const fd = fs.openSync(path.resolve(ROOT, log), 'a')
const p = spawn(process.execPath, [path.join(ROOT, 'datagen/datagen.mjs'), ...args], { cwd: ROOT, stdio: ['ignore', fd, fd] })
p.on('close', code => fs.appendFileSync(path.resolve(ROOT, log), `exit ${code} ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}\n`))
// 실행 중 Windows 절전 막기(rebuild.mjs 와 같은 방식, 전원 설정은 바꾸지 않음 — 이 프로세스가 끝나면 자동 해제). 새 PC AC 절전 = 5분(2026-11-21 powercfg)
const ps = `Add-Type -Name P -Namespace W -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'; [W.P]::SetThreadExecutionState([uint32]2147483649) | Out-Null; Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue`
spawn('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true, stdio: 'ignore' }).on('error', () => fs.appendFileSync(path.resolve(ROOT, log), '경고 : 절전 막기 실패 — Windows 설정에서 절전 "안 함"으로\n')).unref()
