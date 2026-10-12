/**
 * ARKAIOS Knowledge Library - Local Bridge & Server
 * Hosts the Web UI on http://localhost:8989 and provides endpoints for Meta Admin Login & Sync
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { sync } = require('./sync_worker');

const PORT = 8989;
const PUBLIC_DIR = __dirname;
const SESSION_DIR = path.join(__dirname, '.meta_admin_session');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function hasActiveSession() {
  if (!fs.existsSync(SESSION_DIR)) return false;
  const defaultDir = path.join(SESSION_DIR, 'Default');
  return fs.existsSync(defaultDir);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoints
  if (pathname === '/api/status' && req.method === 'GET') {
    const libPath = path.join(__dirname, 'library.json');
    let totalItems = 0;
    if (fs.existsSync(libPath)) {
      try {
        const lib = JSON.parse(fs.readFileSync(libPath, 'utf-8'));
        totalItems = lib.length;
      } catch (e) {}
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      sessionActive: hasActiveSession(),
      sessionPath: SESSION_DIR,
      totalItems,
      pageUrl: 'https://www.facebook.com/arkaiosIA'
    }));
    return;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const args = [
        `--user-data-dir=${SESSION_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        'https://www.facebook.com/arkaiosIA'
      ];

      const child = spawn(CHROME_PATH, args, {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Navegador Chrome iniciado con sesión persistente de Administrador Meta.'
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (pathname === '/api/sync' && req.method === 'POST') {
    try {
      const result = sync();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Error al leer archivo: ${err.message}`);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[ARKAIOS SERVER] Servidor activo en http://localhost:${PORT}`);
  console.log(`[ARKAIOS SERVER] Perfil de sesion Meta: ${SESSION_DIR}`);
});
