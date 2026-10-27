// 배경 효과용 MediaPipe wasm 을 node_modules → public/mediapipe/wasm/<버전> 로 복사(자체 호스팅, REA mediapipe-05 selfhost) — dev·build 앞에서 자동 실행.
// 26.8MB 바이너리라 저장소에 넣지 않는다(.gitignore). 장기 캐시(immutable)라 버전 경로를 쓰고, 엔진(engine.ts MP_VER)과 버전이 다르면 빌드를 막는다.
// 모델(약 250KB, Apache-2.0 — public/mediapipe/models/NOTICE)은 사람이 1회 받아 커밋한다. 없으면 빌드 실패(조용히 깨진 채 배포 방지) :
//   curl -L -o public/mediapipe/models/selfie_segmenter_landscape.tflite https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/1/selfie_segmenter_landscape.tflite
// 실행 : node scripts/copy-mediapipe.mjs (cwd = sitemap/seminar.pi)
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const pkg = path.resolve('node_modules/@mediapipe/tasks-vision') // pnpm 이 앱 node_modules 에 링크한다
const ver = JSON.parse(readFileSync(path.join(pkg, 'package.json'), 'utf8')).version
const engine = readFileSync('src/components/room/features/backgrounds/engine.ts', 'utf8')
if (!engine.includes(`const MP_VER = '${ver}'`)) {
  console.error(`[copy-mediapipe] engine.ts MP_VER 가 설치 버전 ${ver} 과 다르다 — 맞춘 뒤 다시 빌드`)
  process.exit(1)
}
const dst = path.resolve('public/mediapipe/wasm', ver)
mkdirSync(dst, { recursive: true })
// module 변형은 모듈 워커 전용이라 쓰지 않는다(REA mediapipe-05 not_needed)
for (const f of ['vision_wasm_internal', 'vision_wasm_nosimd_internal'])
  for (const ext of ['.js', '.wasm']) copyFileSync(path.join(pkg, 'wasm', f + ext), path.join(dst, f + ext))
if (!existsSync('public/mediapipe/models/selfie_segmenter_landscape.tflite')) {
  console.error('[copy-mediapipe] 모델 파일 없음 — 배경 효과가 전부 실패한다. 이 파일 머리 주석의 curl 1줄로 넣고 커밋할 것')
  process.exit(1)
}
