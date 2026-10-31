#!/usr/bin/env node
// pi-i18n CLI 진입 — translate | validate | audit (앱 폴더에서 실행, cwd = 앱 루트). 사용법 : docs/I18N_STANDARD.md 4.4절
const [cmd, ...argv] = process.argv.slice(2)
const commands = { translate: '../cli/translate.mjs', validate: '../cli/validate.mjs', audit: '../cli/audit.mjs' }

if (!commands[cmd]) {
  console.log('사용법 : pi-i18n <translate|validate|audit> [옵션]  (docs/I18N_STANDARD.md 4.4절)')
  process.exit(cmd ? 1 : 0)
}
try {
  const mod = await import(commands[cmd])
  await mod.run(argv)
} catch (e) {
  console.error(`pi-i18n ${cmd} 실패 : ${e.message}`)
  process.exit(1)
}
