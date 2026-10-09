/**
 * 운영 승격(promote) — master → production(cafe) 또는 master → prod/<site>(PRD_28 사이트 앱).
 *
 * 2단계 배포 전략의 핵심 동작:
 *   - staging(loginpi)은 master 자동배포로 늘 최신.
 *   - 운영(cafepi)은 production 브랜치만 배포 → 이 스크립트로만 승격.
 *   - 사이트 앱(sitemap/<도메인>.pi)은 사이트별 운영 브랜치 prod/<site>로 승격(19개를 한 브랜치에 묶지 않음).
 *
 * 안전장치:
 *   - 작업트리/현재 브랜치를 건드리지 않음(checkout 없음). 멀티세션 안전.
 *   - `git push origin origin/master:<운영 브랜치>` = **fast-forward만** 허용.
 *     운영 브랜치가 master의 조상이 아니면(누가 직접 커밋 등) push 거부 →
 *     검증 안 된/갈라진 코드가 운영에 새지 않음.
 *   - 기본은 미리보기(dry-run). 실제 승격은 `--yes` 필요.
 *
 * 사용:
 *   node scripts/promote-to-prod.mjs                          # cafe : 무엇이 운영에 나갈지 미리보기
 *   node scripts/promote-to-prod.mjs --yes                    # cafe : 실제 승격
 *   node scripts/promote-to-prod.mjs --app sitemap [--yes]    # 사이트 앱 → prod/sitemap (첫 승격이면 브랜치 생성)
 */
import { execSync } from 'node:child_process'

const YES = process.argv.includes('--yes')
const ai = process.argv.indexOf('--app')
const APP = ai > -1 ? process.argv[ai + 1] : 'cafe'
if (!/^[a-z0-9-]+$/.test(APP || '')) {
  console.error('✗ --app 값은 소문자·숫자·하이픈만 (예: --app sitemap)')
  process.exit(2)
}
const BR = APP === 'cafe' ? 'production' : `prod/${APP}` // cafe는 기존 production 브랜치 유지(PRD_28 §6)
const TARGET = APP === 'cafe' ? 'cafepi(운영)' : `${APP} 운영 프로젝트`
const YES_CMD = `node scripts/promote-to-prod.mjs${APP === 'cafe' ? '' : ` --app ${APP}`} --yes`
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
const run = (cmd) => execSync(cmd, { stdio: 'inherit' })

try {
  console.log('· origin 최신 정보 가져오는 중…')
  run('git fetch origin --quiet')

  if (sh(`git ls-remote --heads origin ${BR}`) === '') {
    console.log(
      `\n▶ origin/${BR} 없음 — 첫 승격: master 현재 시점으로 ${BR} 브랜치를 만듭니다.`,
    )
    if (!YES) {
      console.log(`\n— 미리보기입니다. 생성하려면:\n    ${YES_CMD}`)
      process.exit(0)
    }
    run(`git push origin origin/master:refs/heads/${BR}`)
    console.log(
      `\n✅ ${BR} 생성 완료. ${TARGET}의 Vercel Production Branch를 ${BR}로 설정하세요.`,
    )
    process.exit(0)
  }

  const ahead = sh(`git rev-list --count origin/${BR}..origin/master`)
  const behind = sh(`git rev-list --count origin/master..origin/${BR}`)

  if (behind !== '0') {
    console.error(
      `\n✗ ${BR}이 master보다 ${behind}커밋 앞서 있음(갈라짐).\n` +
        `  fast-forward 승격 불가. ${BR}에 직접 커밋했는지 확인하고\n` +
        `  master로 역머지(또는 cherry-pick)한 뒤 다시 승격하세요.`,
    )
    process.exit(1)
  }

  if (ahead === '0') {
    console.log(`\n✅ 이미 최신 — ${BR} == master. 승격할 커밋 없음.`)
    process.exit(0)
  }

  console.log(`\n▶ ${TARGET}(${BR})에 새로 나갈 커밋 ${ahead}개:\n`)
  run(`git --no-pager log --oneline origin/${BR}..origin/master`)

  if (!YES) {
    console.log(
      `\n— 미리보기입니다. 위 커밋을 ${TARGET}에 배포하려면:\n` +
        `    ${YES_CMD}\n` +
        `  (staging에서 검증 완료된 상태인지 먼저 확인하세요.)`,
    )
    process.exit(0)
  }

  console.log(`\n· 승격 중: origin/master → ${BR} (fast-forward)…`)
  run(`git push origin origin/master:${BR}`)
  console.log(
    `\n✅ 승격 완료. ${TARGET} 프로젝트가 ${BR} 브랜치를 배포합니다.\n` +
      '   Vercel 대시보드에서 배포 상태 확인 → P0 실기기(로그인·결제) 점검 권장.',
  )
} catch (e) {
  console.error(`\n✗ 승격 실패: ${e.message}`)
  console.error('  push 거부 시 대개 non-fast-forward(갈라짐) — 위 안내 참고.')
  process.exit(1)
}
