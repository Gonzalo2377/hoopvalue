/* Servidor para producir el vídeo promocional: sirve la composición y guarda el MP4.
   Uso: node marketing/render-server.js  →  http://localhost:3310/promo.html */
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = __dirname, OUT = path.join(DIR, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript' };

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/save/')) {
    const name = path.basename(req.url.slice(6)).replace(/[^a-z0-9._-]/gi, '');
    const chunks = [];
    req.on('data', c => chunks.push(c)).on('end', () => {
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(path.join(OUT, name), buf);
      console.log(`Guardado marketing/out/${name} (${(buf.length / 1e6).toFixed(1)} MB)`);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, file: `marketing/out/${name}` }));
    });
    return;
  }
  const file = path.join(DIR, path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([\\/])+/, '') || 'promo.html');
  if (!file.startsWith(DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    const type = TYPES[path.extname(file)] || (file.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream');
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');   // peticiones parciales: el navegador las usa para saltar dentro del vídeo
    if (m) {
      const start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : buf.length - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return res.end(buf.subarray(start, end + 1));
    }
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }); res.end(buf);
  });
}).listen(3310, () => console.log('Render: http://localhost:3310/promo.html'));
