/**
 * ARKAIOS Knowledge Library - Local Bridge & Server
 * Hosts the Web UI on http://localhost:8989 and provides endpoints for Meta Admin Login & Sync
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { sync } = require('./sync_worker');

const PORT = 8989;
const PUBLIC_DIR = __dirname;
const SESSION_DIR = path.join(__dirname, '.meta_admin_session');
const TOKEN_FILE = path.join(__dirname, '.admin_token');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// Carga o generación de token administrativo secreto (nunca hardcodeado en GitHub)
let ADMIN_TOKEN = process.env.ARKAIOS_ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      ADMIN_TOKEN = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
    } catch (e) {}
  }
  if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 16) {
    ADMIN_TOKEN = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(TOKEN_FILE, ADMIN_TOKEN, { mode: 0o600, encoding: 'utf-8' });
    } catch (e) {}
  }
}

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

function isValidOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (!origin) return true; // Petición local directa o CLI sin Origin
  try {
    const parsedOrigin = new URL(origin);
    const isAllowedHost = parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1';
    return isAllowedHost && (!parsedOrigin.port || parsedOrigin.port === String(PORT));
  } catch (e) {
    return false;
  }
}

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

// Almacén de sesiones efímeras independientes en memoria del servidor
// La cookie solo guarda un ID de sesión efímero, NUNCA el token maestro
const activeSessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas de vigencia

function createSession() {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  activeSessions.set(sessionId, {
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  });
  return sessionId;
}

function isValidSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return false;
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(sessionId);
    return false;
  }
  return true;
}

function revokeSession(sessionId) {
  if (sessionId) {
    activeSessions.delete(sessionId);
  }
}

function checkAdminAuth(req, res) {
  // 1. Debe provenir exclusivamente de loopback local
  if (!isLocalClient(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Acceso denegado: solo peticiones desde localhost (127.0.0.1) están autorizadas.' }));
    return false;
  }

  // 2. Protección contra CSRF en peticiones con Origin o Referer
  if (!isValidOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Acceso denegado por protección CSRF: origen no autorizado.' }));
    return false;
  }

  // 3. Autenticación:
  // Vía A: Sesión efímera válida en Cookie HttpOnly (arkaios_session_id)
  const cookies = parseCookies(req);
  const sessionId = cookies['arkaios_session_id'];
  if (isValidSession(sessionId)) {
    return true;
  }

  // Vía B: Token maestro en cabecera directa para scripts y agentes locales autorizados
  const tokenHeader = req.headers['x-arkaios-admin-token'] || 
                      (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, '').trim());

  if (tokenHeader) {
    const providedBuf = Buffer.from(String(tokenHeader));
    const expectedBuf = Buffer.from(String(ADMIN_TOKEN));
    const isMatch = providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
    if (isMatch) {
      return true;
    }
  }

  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'No autorizado: se requiere sesión activa o token administrativo válido.' }));
  return false;
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Arkaios-Admin-Token, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Endpoint de creación de sesión independiente (Login de sesión local)
  if (pathname === '/api/auth/session' && req.method === 'POST') {
    if (!isLocalClient(req) || !isValidOrigin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Acceso denegado.' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let providedToken = req.headers['x-arkaios-admin-token'];
      if (!providedToken && body) {
        try {
          const parsed = JSON.parse(body);
          providedToken = parsed.token;
        } catch (e) {}
      }

      if (!providedToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token administrativo requerido.' }));
        return;
      }

      const pBuf = Buffer.from(String(providedToken));
      const eBuf = Buffer.from(String(ADMIN_TOKEN));
      const isMatch = pBuf.length === eBuf.length && crypto.timingSafeEqual(pBuf, eBuf);

      if (!isMatch) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token administrativo inválido.' }));
        return;
      }

      const newSessionId = createSession();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `arkaios_session_id=${newSessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`
      });
      res.end(JSON.stringify({ success: true, message: 'Sesión administrativa efímera creada con éxito.' }));
    });
    return;
  }

  // Endpoint de revocación de sesión (Logout)
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    revokeSession(cookies['arkaios_session_id']);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'arkaios_session_id=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
    });
    res.end(JSON.stringify({ success: true, message: 'Sesión cerrada y revocada.' }));
    return;
  }

  // API Endpoints - Nota de Seguridad: NO existe ningún endpoint GET que exponga o entregue secretos.
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

  // Static File Serving - Lista blanca estricta de recursos públicos autorizados
  const ALLOWED_STATIC = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/styles.css': 'styles.css',
    '/app.js': 'app.js',
    '/library.json': 'library.json',
    '/favicon.ico': 'favicon.ico',
    '/SKILL.md': 'SKILL.md',
    '/AGENTS.md': 'AGENTS.md'
  };

  const targetFile = ALLOWED_STATIC[pathname];
  if (!targetFile) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: Recurso no disponible o no autorizado.');
    return;
  }

  const filePath = path.join(PUBLIC_DIR, targetFile);

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
