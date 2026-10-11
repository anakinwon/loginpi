// pfd 뷰어용 정적 서버 — index.html 이 .mmd 를 fetch 하므로 file:// 로는 안 열림. 실행: node sitemap/sitemap.pi/pfd/serve.mjs [포트=3005] → http://localhost:3005
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[2]) || 3005
const types = {
  '.html': 'text/html; charset=utf-8',
  '.mmd': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    const file = path.join(root, urlPath === '/' ? '/index.html' : urlPath)
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404)
      return res.end('not found')
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  .listen(port, () => console.log(`pfd 뷰어: http://localhost:${port}  (Ctrl+C 로 종료)`))
