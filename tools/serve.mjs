// 极简静态服务器：只用于本地预览 dist 产物（截图自检 / 人工试玩）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.argv[2] ?? 'dist';
const port = Number(process.argv[3] ?? 58411);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // 目录请求（/ 或 /sub/）补 index.html，模拟 GitHub Pages 的行为
  const rel = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
  const file = normalize(join(root, decodeURIComponent(rel)));
  if (!file.startsWith(normalize(root))) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
