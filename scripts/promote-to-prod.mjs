/**
 * 운영 승격(promote) — master → production.
 *
 * 2단계 배포 전략의 핵심 동작:
 *   - staging(loginpi)은 master 자동배포로 늘 최신.
 *   - 운영(cafepi)은 production 브랜치만 배포 → 이 스크립트로만 승격.
 *
 * 안전장치:
 *   - 작업트리/현재 브랜치를 건드리지 않음(checkout 없음). 멀티세션 안전.
 *   - `git push origin origin/master:production` = **fast-forward만** 허용.
 *     production이 master의 조상이 아니면(누가 production에 직접 커밋 등) push 거부 →
 *     검증 안 된/갈라진 코드가 운영에 새지 않음.
 *   - 기본은 미리보기(dry-run). 실제 승격은 `--yes` 필요.
 *
 * 사용:
 *   node scripts/promote-to-prod.mjs          # 무엇이 운영에 나갈지 미리보기
 *   node scripts/promote-to-prod.mjs --yes     # 실제 승격
 */
import { execSync } from 'node:child_process'

const YES = process.argv.includes('--yes')
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
const run = (cmd) => execSync(cmd, { stdio: 'inherit' })

try {
  console.log('· origin 최신 정보 가져오는 중…')
  run('git fetch origin --quiet')

  const ahead = sh('git rev-list --count origin/production..origin/master')
  const behind = sh('git rev-list --count origin/master..origin/production')

  if (behind !== '0') {
    console.error(
      `\n✗ production이 master보다 ${behind}커밋 앞서 있음(갈라짐).\n` +
        `  fast-forward 승격 불가. production에 직접 커밋했는지 확인하고\n` +
        `  master로 역머지(또는 cherry-pick)한 뒤 다시 승격하세요.`,
    )
    process.exit(1)
  }

  if (ahead === '0') {
    console.log('\n✅ 이미 최신 — production == master. 승격할 커밋 없음.')
    process.exit(0)
  }

  console.log(`\n▶ 운영(production)에 새로 나갈 커밋 ${ahead}개:\n`)
  run('git --no-pager log --oneline origin/production..origin/master')

  if (!YES) {
    console.log(
      `\n— 미리보기입니다. 위 커밋을 cafepi(운영)에 배포하려면:\n` +
        `    node scripts/promote-to-prod.mjs --yes\n` +
        `  (staging(loginpi)에서 검증 완료된 상태인지 먼저 확인하세요.)`,
    )
    process.exit(0)
  }

  console.log('\n· 승격 중: origin/master → production (fast-forward)…')
  run('git push origin origin/master:production')
  console.log(
    '\n✅ 승격 완료. cafepi(운영) 프로젝트가 production 브랜치를 배포합니다.\n' +
      '   Vercel 대시보드에서 배포 상태 확인 → P0 실기기(로그인·결제) 점검 권장.',
  )
} catch (e) {
  console.error(`\n✗ 승격 실패: ${e.message}`)
  console.error('  push 거부 시 대개 non-fast-forward(갈라짐) — 위 안내 참고.')
  process.exit(1)
}
