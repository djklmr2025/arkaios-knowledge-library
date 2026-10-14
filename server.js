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

function isLocalClient(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function checkAdminAuth(req, res) {
  // 1. Debe provenir de la interfaz loopback local
  if (!isLocalClient(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Acceso denegado: solo peticiones desde localhost (127.0.0.1) están autorizadas.' }));
    return false;
  }

  // 2. Protección contra CSRF: si se incluye origen o referer, debe ser de localhost
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      const isAllowedHost = parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1';
      if (!isAllowedHost || (parsedOrigin.port && parsedOrigin.port !== String(PORT))) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Acceso denegado por protección CSRF: origen no autorizado.' }));
        return false;
      }
    } catch (e) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Acceso denegado: cabecera de origen inválida.' }));
      return false;
    }
  }

  return true;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = url.pathname;

  // CORS headers: abierto para lectura pública, restringido para mutaciones
  if (req.method === 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', `http://localhost:${PORT}`);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Arkaios-Client');

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
    if (!checkAdminAuth(req, res)) return;

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
    if (!checkAdminAuth(req, res)) return;

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

  // Static File Serving - Seguridad: Bloquear directory traversal y archivos ocultos/privados/código
  let rawUrl = '';
  try { rawUrl = decodeURIComponent(req.url || ''); } catch (e) { rawUrl = req.url || ''; }
  const normalizedPath = path.normalize(pathname).replace(/\\/g, '/');

  if (
    rawUrl.includes('..') ||
    normalizedPath.includes('..') ||
    /(?:^|\/)\./.test(normalizedPath) ||
    /^\/(?:\.env|\.git|\.meta_admin_session)/i.test(normalizedPath) ||
    /\.(bat|cmd|log|mjs|env|sh|lock)$/i.test(normalizedPath) ||
    /^\/(package\.json|package-lock\.json|sync_history\.log)/i.test(normalizedPath)
  ) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: Acceso denegado a archivos de configuracion o del sistema.');
    return;
  }

  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(PUBLIC_DIR))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: Path traversal detectado.');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ARKAIOS SERVER] Servidor activo exclusivamente en http://127.0.0.1:${PORT}`);
  console.log(`[ARKAIOS SERVER] Perfil de sesion Meta: ${SESSION_DIR}`);
});
