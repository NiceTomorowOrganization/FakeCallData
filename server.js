#!/usr/bin/env node
/*
 * Server quản lý dữ liệu CDN (fake-call, coloringbook, ringtone, wallpaper).
 * Không cần cài dependency — chỉ dùng module có sẵn của Node.
 *
 * Chạy:   node server.js     rồi mở http://localhost:4321
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = process.env.PORT || 4321;

// Các bộ dữ liệu cho phép chỉnh sửa. type: 'categories' | 'flat'
// media: thư mục gốc chứa file media của bộ dữ liệu đó.
const DATASETS = {
  fakecalls:    { file: 'fakecalls.json',    type: 'categories', label: 'Fake Call',      media: 'fake-call' },
  coloringbook: { file: 'coloringbook.json', type: 'categories', label: 'Coloring Book',  media: 'coloringbook' },
  ringtones:    { file: 'ringtones.json',    type: 'flat',       label: 'Ringtone',       media: 'ringtone' },
  wallpapers:   { file: 'wallpapers.json',   type: 'flat',       label: 'Wallpaper',      media: 'wallpaper' },
};

// Các thư mục cho phép ghi file upload (chặn ghi lung tung)
const ALLOWED_MEDIA = Object.values(DATASETS).map(d => d.media);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 50e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Đọc body nhị phân (cho upload file media). Tối đa 300MB.
function readBinary(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 300e6) { req.destroy(); reject(new Error('File quá lớn (>300MB)')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sanitizeName(name) {
  return String(name || 'file')
    .replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-')
    .replace(/^[-.]+/, '').slice(0, 120) || 'file';
}

// Phục vụ file tĩnh có hỗ trợ Range (để tua video/audio)
function serveStatic(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (start > end || start >= stat.size) start = 0;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': type,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': type, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsed.pathname);

  // ---- API ----
  if (pathname === '/api/datasets') {
    const list = Object.entries(DATASETS).map(([key, d]) => ({ key, type: d.type, label: d.label, media: d.media }));
    return sendJson(res, 200, list);
  }

  // ---- Upload file media ----
  // POST /api/upload?dir=<thư mục đích>&name=<tên file>   (body = nội dung file nhị phân)
  if (pathname === '/api/upload' && req.method === 'POST') {
    const dir = (parsed.query.dir || '').replace(/^\/+|\/+$/g, '');
    const name = sanitizeName(parsed.query.name);
    const topFolder = dir.split('/')[0];
    if (!ALLOWED_MEDIA.includes(topFolder)) {
      return sendJson(res, 403, { error: 'Thư mục không được phép: ' + dir });
    }
    const targetDir = path.join(ROOT, dir);
    if (!targetDir.startsWith(ROOT)) return sendJson(res, 403, { error: 'Đường dẫn không hợp lệ' });
    try {
      const buf = await readBinary(req);
      fs.mkdirSync(targetDir, { recursive: true });
      let finalName = name;
      // Nếu trùng tên thì thêm hậu tố -1, -2... để không ghi đè file khác
      if (fs.existsSync(path.join(targetDir, finalName)) && parsed.query.overwrite !== '1') {
        const ext = path.extname(name);
        const base = name.slice(0, name.length - ext.length);
        let i = 1;
        while (fs.existsSync(path.join(targetDir, `${base}-${i}${ext}`))) i++;
        finalName = `${base}-${i}${ext}`;
      }
      fs.writeFileSync(path.join(targetDir, finalName), buf);
      return sendJson(res, 200, { ok: true, path: `${dir}/${finalName}` });
    } catch (e) {
      return sendJson(res, 500, { error: 'Upload lỗi: ' + e.message });
    }
  }

  const dataMatch = /^\/api\/data\/([\w-]+)$/.exec(pathname);
  if (dataMatch) {
    const key = dataMatch[1];
    const ds = DATASETS[key];
    if (!ds) return sendJson(res, 404, { error: 'Dataset không tồn tại' });
    const filePath = path.join(ROOT, ds.file);

    if (req.method === 'GET') {
      fs.readFile(filePath, 'utf8', (err, txt) => {
        if (err) return sendJson(res, 500, { error: 'Không đọc được file: ' + err.message });
        try { sendJson(res, 200, { type: ds.type, label: ds.label, data: JSON.parse(txt) }); }
        catch (e) { sendJson(res, 500, { error: 'JSON lỗi: ' + e.message }); }
      });
      return;
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      let parsedBody;
      try { parsedBody = JSON.parse(body); }
      catch (e) { return sendJson(res, 400, { error: 'Body không phải JSON hợp lệ' }); }
      const data = parsedBody.data !== undefined ? parsedBody.data : parsedBody;
      // Backup file cũ trước khi ghi
      try {
        if (fs.existsSync(filePath)) fs.copyFileSync(filePath, filePath + '.bak');
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        return sendJson(res, 200, { ok: true });
      } catch (e) {
        return sendJson(res, 500, { error: 'Không ghi được file: ' + e.message });
      }
    }

    return sendJson(res, 405, { error: 'Method không hỗ trợ' });
  }

  // ---- Trang editor ----
  if (pathname === '/' || pathname === '/index.html') {
    return serveStatic(req, res, path.join(ROOT, 'editor.html'));
  }

  // ---- File tĩnh (thumbnail, video, audio...) ----
  const safe = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(ROOT, safe);
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  serveStatic(req, res, filePath);
});

server.listen(PORT, () => {
  console.log(`\n  ✅ Trang quản lý dữ liệu đang chạy:\n     http://localhost:${PORT}\n`);
  console.log('  Nhấn Ctrl+C để dừng.\n');
});
