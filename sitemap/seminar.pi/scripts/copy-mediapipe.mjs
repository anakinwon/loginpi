// 배경 효과용 MediaPipe wasm 을 node_modules → public/mediapipe/wasm 로 복사(자체 호스팅, REA mediapipe-05 selfhost) — dev·build 앞에서 자동 실행.
// 26.8MB 바이너리라 저장소에 넣지 않는다(.gitignore). 모델(약 250KB)은 사람이 1회 받아 커밋한다(에이전트 다운로드 권한 없음) :
//   curl -L -o public/mediapipe/models/selfie_segmenter_landscape.tflite https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite
// 실행 : node scripts/copy-mediapipe.mjs (cwd = sitemap/seminar.pi)
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const src = path.resolve('node_modules/@mediapipe/tasks-vision/wasm') // pnpm 이 앱 node_modules 에 링크한다
const dst = path.resolve('public/mediapipe/wasm')
mkdirSync(dst, { recursive: true })
// module 변형은 모듈 워커 전용이라 쓰지 않는다(REA mediapipe-05 not_needed)
for (const f of ['vision_wasm_internal', 'vision_wasm_nosimd_internal'])
  for (const ext of ['.js', '.wasm']) copyFileSync(path.join(src, f + ext), path.join(dst, f + ext))
if (!existsSync('public/mediapipe/models/selfie_segmenter_landscape.tflite'))
  console.warn('[copy-mediapipe] 모델 파일 없음 — 배경 효과는 "불러오지 못했습니다"로 끝난다(이 파일 머리 주석의 curl 1줄로 넣을 것)')
