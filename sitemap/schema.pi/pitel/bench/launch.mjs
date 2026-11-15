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
