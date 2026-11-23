#!/usr/bin/env node
// 환경변수 금고(2026-11-17 마스터 지시) — 저장소 안 .env* 비밀 파일을 암호문 1개로 묶고(pack), 새 PC 에서 원래 경로로 복원(unpack)한다
//   node scripts/env-vault.mjs pack   [--vault <경로>]            # .env*(.env.example 제외) 수집 → AES-256-GCM 암호화 → 금고 파일
//   node scripts/env-vault.mjs unpack [--vault <경로>] [--force] [--dry-run]   # 복호화 → 원래 경로에 쓰기(다른 내용의 기존 파일은 --force 때만 덮어씀)
//   node scripts/env-vault.mjs list   [--vault <경로>]            # 복호화해서 파일 목록·키 개수만 출력(값은 출력하지 않음)
//   암호문구 = 프롬프트 입력(저장 안 함). 자동화가 필요하면 환경변수 ENV_VAULT_PASS. 금고 기본 경로 = $WORKSPACE_ROOT/loginpi-secrets/env-vault.enc
//   ⚠ loginpi 는 공개 저장소 — 금고 파일은 이 저장소에 커밋 금지, 비공개 저장소(loginpi-secrets)에만 둔다
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { createInterface } from 'node:readline'

const ROOT = join(import.meta.dirname, '..')
const C = {
  magic: Buffer.from('ENVVAULT1'), // 파일 형식 표식(버전 포함)
  saltLen: 16,
  ivLen: 12, // GCM 권장 IV 길이
  tagLen: 16,
  scrypt: { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, // 추측 1회당 ~128MB·수백 ms — 무차별 대입 비용
  minPass: 12,
  skipDirs: new Set(['node_modules', '.git', '.next', '.vercel', '.turbo', 'worktrees', 'dist', 'out']),
  envName: /^\.env(\..+)?$/,
  excluded: new Set(['.env.example']),
}

const args = process.argv.slice(2)
const cmd = args[0]
const flag = (n) => args.includes(n)
const opt = (n) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : undefined
}
const defaultVault = () => {
  const ws = process.env.WORKSPACE_ROOT || join(ROOT, '..')
  return join(ws, 'loginpi-secrets', 'env-vault.enc')
}
const vaultPath = opt('--vault') || process.env.ENV_VAULT_PATH || defaultVault()

// 저장소 안 .env* 파일 수집 — 경로는 '/' 구분 상대경로(PC 간 이식)
function collect(dir = ROOT, out = []) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name)
    if (d.isDirectory()) {
      if (!C.skipDirs.has(d.name)) collect(p, out)
    } else if (d.isFile() && C.envName.test(d.name) && !C.excluded.has(d.name)) {
      out.push(relative(ROOT, p).split(sep).join('/'))
    }
  }
  return out.sort()
}

// 키 이름만 추출(값 비교·출력 금지용)
const keysOf = (text) =>
  text
    .split(/\r?\n/)
    .map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1])
    .filter(Boolean)

// 화면에 보이지 않게 암호문구 입력 — TTY 가 아니면(파이프·mintty) 한 줄 읽기
function ask(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY })
    if (process.stdin.isTTY) {
      rl._writeToOutput = (s) => {
        if (s.includes(prompt)) process.stdout.write(prompt)
      }
    } else {
      process.stderr.write('(주의: TTY 가 아니라 입력이 화면에 보일 수 있음 — PowerShell 또는 winpty 사용 권장)\n')
    }
    rl.question(prompt, (a) => {
      rl.close()
      process.stdout.write('\n')
      resolve(a)
    })
  })
}

async function passphrase(confirm) {
  if (process.env.ENV_VAULT_PASS) return process.env.ENV_VAULT_PASS
  const p = await ask('암호문구: ')
  if (confirm) {
    if (p.length < C.minPass) throw new Error(`암호문구는 ${C.minPass}자 이상 (권장: 무작위 단어 4~5개)`)
    if ((await ask('암호문구 확인: ')) !== p) throw new Error('암호문구가 서로 다름')
  }
  return p
}

const deriveKey = (pass, salt) => scryptSync(pass.normalize('NFC'), salt, 32, C.scrypt)

function encrypt(plain, pass) {
  const salt = randomBytes(C.saltLen)
  const iv = randomBytes(C.ivLen)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(pass, salt), iv)
  cipher.setAAD(C.magic) // 표식도 인증 대상
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([C.magic, salt, iv, cipher.getAuthTag(), body])
}

function decrypt(buf, pass) {
  if (!buf.subarray(0, C.magic.length).equals(C.magic)) throw new Error('금고 파일 형식이 아님')
  let o = C.magic.length
  const salt = buf.subarray(o, (o += C.saltLen))
  const iv = buf.subarray(o, (o += C.ivLen))
  const tag = buf.subarray(o, (o += C.tagLen))
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(pass, salt), iv)
  decipher.setAAD(C.magic)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(buf.subarray(o)), decipher.final()])
  } catch {
    throw new Error('복호화 실패 — 암호문구가 틀렸거나 금고 파일이 손상·변조됨')
  }
}

async function openVault() {
  if (!existsSync(vaultPath)) throw new Error(`금고 파일 없음: ${vaultPath} (--vault 로 지정)`)
  const payload = JSON.parse(decrypt(readFileSync(vaultPath), await passphrase(false)).toString('utf8'))
  if (payload.v !== 1 || !Array.isArray(payload.files)) throw new Error('지원하지 않는 금고 버전')
  return payload
}

// 금고 안 경로가 저장소 밖을 가리키지 못하게(경로 조작 방어)
function safeTarget(rel) {
  const n = normalize(rel)
  if (isAbsolute(n) || n.split(sep).includes('..') || !C.envName.test(n.split(sep).pop()))
    throw new Error(`허용하지 않는 경로: ${rel}`)
  return join(ROOT, n)
}

async function pack() {
  const files = collect()
  if (files.length === 0) throw new Error('수집할 .env* 파일이 없음 — 먼저 .env 파일을 저장소에 두세요')
  console.log(`수집 ${files.length}개:`)
  for (const f of files) console.log(`  ${f}  (키 ${keysOf(readFileSync(join(ROOT, f), 'utf8')).length}개)`)
  const payload = {
    v: 1,
    created: new Date().toISOString(),
    files: files.map((f) => ({ path: f, b64: readFileSync(join(ROOT, f)).toString('base64') })),
  }
  const enc = encrypt(Buffer.from(JSON.stringify(payload)), await passphrase(true))
  mkdirSync(dirname(vaultPath), { recursive: true })
  writeFileSync(vaultPath, enc, { mode: 0o600 })
  console.log(`\n금고 저장: ${vaultPath} (${enc.length.toLocaleString()} B)`)
  console.log('다음 : 그 폴더(비공개 저장소)에서 git add env-vault.enc && git commit && git push')
}

async function unpack() {
  const { files, created } = await openVault()
  const force = flag('--force')
  const dry = flag('--dry-run')
  console.log(`금고 생성 ${created} · 파일 ${files.length}개${dry ? ' (dry-run: 쓰지 않음)' : ''}`)
  const tally = { new: 0, same: 0, overwritten: 0, skipped: 0 }
  for (const f of files) {
    const target = safeTarget(f.path)
    const data = Buffer.from(f.b64, 'base64')
    let state
    if (!existsSync(target)) state = 'new'
    else if (readFileSync(target).equals(data)) state = 'same'
    else state = force ? 'overwritten' : 'skipped'
    tally[state]++
    const label = { new: '생성', same: '동일(건너뜀)', overwritten: '덮어씀', skipped: '내용 다름(건너뜀 — --force 로 덮어쓰기)' }[state]
    console.log(`  [${label}] ${f.path}`)
    if (state === 'skipped' || state === 'overwritten') {
      // 값은 출력하지 않고 키 이름 차이만
      const cur = new Set(keysOf(readFileSync(target, 'utf8')))
      const nxt = new Set(keysOf(data.toString('utf8')))
      const add = [...nxt].filter((k) => !cur.has(k))
      const del = [...cur].filter((k) => !nxt.has(k))
      if (add.length) console.log(`      금고에만 있는 키: ${add.join(', ')}`)
      if (del.length) console.log(`      현재 파일에만 있는 키: ${del.join(', ')}`)
      if (!add.length && !del.length) console.log('      키 이름은 같고 값만 다름')
    }
    if (!dry && (state === 'new' || state === 'overwritten')) {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, data, { mode: 0o600 })
    }
  }
  console.log(`\n생성 ${tally.new} · 동일 ${tally.same} · 덮어씀 ${tally.overwritten} · 건너뜀 ${tally.skipped}`)
}

async function list() {
  const { files, created } = await openVault()
  console.log(`금고 생성 ${created} · 파일 ${files.length}개`)
  for (const f of files) console.log(`  ${f.path}  (키 ${keysOf(Buffer.from(f.b64, 'base64').toString('utf8')).length}개)`)
}

const run = { pack, unpack, list }[cmd]
if (!run) {
  console.log('사용법: node scripts/env-vault.mjs <pack|unpack|list> [--vault <경로>] [--force] [--dry-run]')
  process.exit(cmd ? 1 : 0)
}
run().catch((e) => {
  console.error(`오류: ${e.message}`)
  process.exit(1)
})
