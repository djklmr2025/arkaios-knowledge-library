/**
 * ARKAIOS Knowledge Library - Sovereign Multi-Tier Persistent Storage
 * 
 * Unifies persistence across:
 * 1. Local Filesystem (Atomic writes with .tmp + renameSync for Node daemon / CI)
 * 2. GitHub REST API Engine (Serverless / Vercel: verified commits directly to repository with conflict retry)
 * 3. External Key-Value / Database Engine (Vercel KV / Upstash / Supabase with strict response validation)
 * 
 * Security:
 * - Strict Fail-Closed authentication for agent endpoints (ZERO hardcoded tokens).
 * - Verified remote persistence: Never returns success if the remote storage failed.
 * - Concurrency control with automatic retry on HTTP 409 Conflict.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_LIBRARY_FILE = path.join(__dirname, 'library.json');
const LOCAL_EVENTS_FILE = path.join(__dirname, 'events.json');
const ENV_FILE = path.join(__dirname, '.env');
const ADMIN_TOKEN_FILE = path.join(__dirname, '.admin_token');

function loadLocalEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  try {
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    const env = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
    return env;
  } catch {
    return {};
  }
}

export function getConfig() {
  const localEnv = loadLocalEnv();
  return {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || process.env.ARKAIOS_STORAGE_TOKEN || localEnv.GITHUB_TOKEN || '',
    GITHUB_REPO: process.env.GITHUB_REPOSITORY || localEnv.GITHUB_REPOSITORY || 'djklmr2025/arkaios-knowledge-library',
    GITHUB_BRANCH: process.env.GITHUB_BRANCH || localEnv.GITHUB_BRANCH || 'main',
    AGENT_TOKEN: process.env.ARKAIOS_AGENT_TOKEN || process.env.ADMIN_TOKEN || localEnv.ARKAIOS_AGENT_TOKEN || localEnv.ADMIN_TOKEN || '',
    KV_REST_API_URL: process.env.KV_REST_API_URL || localEnv.KV_REST_API_URL || '',
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN || localEnv.KV_REST_API_TOKEN || '',
    IS_SERVERLESS: Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT)
  };
}

/**
 * Valida de forma estricta (tiempo constante) la autenticación del agente para consultar eventos privados.
 * Política Fail-Closed ABSOLUTA: CERO tokens fijos en código. Si no hay credenciales configuradas, rechaza todo.
 */
export function verifyAgentAuth(authHeader, customTokenHeader, overrideToken = null) {
  const config = getConfig();
  const validTokens = new Set();

  // 1. Token suministrado explícitamente en memoria (testing / programmatic)
  if (overrideToken && typeof overrideToken === 'string' && overrideToken.trim()) {
    validTokens.add(overrideToken.trim());
  }

  // 2. Token configurado en variables de entorno
  if (config.AGENT_TOKEN && config.AGENT_TOKEN.trim()) {
    validTokens.add(config.AGENT_TOKEN.trim());
  }

  // 3. Token administrativo local (archivo local no comprometido en git)
  if (fs.existsSync(ADMIN_TOKEN_FILE)) {
    try {
      const tok = fs.readFileSync(ADMIN_TOKEN_FILE, 'utf-8').trim();
      if (tok) validTokens.add(tok);
    } catch {}
  }

  // FAIL-CLOSED: Si no existe ninguna credencial autorizada configurada, denegar inmediatamente
  if (validTokens.size === 0) {
    console.warn('[AUTH-SECURITY] Fail-Closed: Cero tokens de agente configurados en el sistema. Acceso denegado.');
    return false;
  }

  // Extraer token proporcionado en la solicitud
  let provided = '';
  if (customTokenHeader && typeof customTokenHeader === 'string') {
    provided = customTokenHeader.trim();
  } else if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    provided = authHeader.slice(7).trim();
  }

  if (!provided) return false;

  const provBuf = Buffer.from(provided, 'utf-8');

  // Comparación en tiempo constante contra cada token autorizado
  for (const token of validTokens) {
    const tokBuf = Buffer.from(token, 'utf-8');
    if (provBuf.length === tokBuf.length && crypto.timingSafeEqual(provBuf, tokBuf)) {
      return true;
    }
  }

  return false;
}

/**
 * Persiste la biblioteca con garantías verificables de éxito.
 * Si el almacenamiento requerido falla, lanza una excepción (cero falsos positivos).
 */
export async function persistLibraryData(items) {
  const config = getConfig();
  const jsonContent = JSON.stringify(items, null, 2);

  // 1. Escritura local si no estamos en entorno puramente serverless de solo lectura
  let localWritten = false;
  try {
    const tmp = `${LOCAL_LIBRARY_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, jsonContent, 'utf-8');
    fs.renameSync(tmp, LOCAL_LIBRARY_FILE);
    localWritten = true;
  } catch (err) {
    if (!config.IS_SERVERLESS) {
      throw new Error(`Fallo en almacenamiento local de library.json: ${err.message}`);
    }
  }

  // 2. Persistencia en GitHub REST API cuando se ejecuta en Serverless o hay token configurado
  const requiresRemote = config.IS_SERVERLESS || Boolean(config.GITHUB_TOKEN);
  if (requiresRemote) {
    if (!config.GITHUB_TOKEN) {
      throw new Error('Almacenamiento Serverless requiere GITHUB_TOKEN configurado para persistir en repositorio.');
    }
    await commitToGitHub(config, 'library.json', jsonContent, 'chore(data): persistir biblioteca desde endpoint serverless [skip ci]');
  }

  // 3. Persistencia en KV si está configurado
  if (config.KV_REST_API_URL && config.KV_REST_API_TOKEN) {
    await persistToKv(config, 'arkaios:library', items);
  }

  return true;
}

/**
 * Carga la biblioteca desde el almacenamiento persistente activo.
 */
export async function loadPersistentLibraryData() {
  const config = getConfig();

  // Si hay KV activo, intentar leer de KV primero
  if (config.KV_REST_API_URL && config.KV_REST_API_TOKEN) {
    const kvData = await loadFromKv(config, 'arkaios:library');
    if (kvData && Array.isArray(kvData) && kvData.length > 0) return kvData;
  }

  // Fallback a archivo local
  if (fs.existsSync(LOCAL_LIBRARY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_LIBRARY_FILE, 'utf-8'));
    } catch {}
  }

  return [];
}

/**
 * Persiste los eventos con propagación estricta de errores.
 */
export async function persistEventsData(events) {
  const config = getConfig();
  const jsonContent = JSON.stringify(events, null, 2);

  // 1. Local
  try {
    const tmp = `${LOCAL_EVENTS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, jsonContent, 'utf-8');
    fs.renameSync(tmp, LOCAL_EVENTS_FILE);
  } catch (err) {
    if (!config.IS_SERVERLESS) {
      throw new Error(`Fallo en almacenamiento local de events.json: ${err.message}`);
    }
  }

  // 2. GitHub REST API en entorno Serverless
  const requiresRemote = config.IS_SERVERLESS || Boolean(config.GITHUB_TOKEN);
  if (requiresRemote) {
    if (!config.GITHUB_TOKEN) {
      throw new Error('Almacenamiento Serverless requiere GITHUB_TOKEN configurado para persistir eventos.');
    }
    await commitToGitHub(config, 'events.json', jsonContent, 'chore(events): persistir bus de eventos desde endpoint serverless [skip ci]');
  }

  // 3. KV
  if (config.KV_REST_API_URL && config.KV_REST_API_TOKEN) {
    await persistToKv(config, 'arkaios:events', events);
  }

  return true;
}

/**
 * Carga eventos desde el almacenamiento activo.
 */
export async function loadPersistentEventsData() {
  const config = getConfig();

  if (config.KV_REST_API_URL && config.KV_REST_API_TOKEN) {
    const kvData = await loadFromKv(config, 'arkaios:events');
    if (kvData && Array.isArray(kvData)) return kvData;
  }

  if (fs.existsSync(LOCAL_EVENTS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_EVENTS_FILE, 'utf-8'));
    } catch {}
  }

  return [];
}

/**
 * Commits a file update directly to GitHub repository via REST API.
 * Propaga errores categóricamente y maneja conflictos HTTP 409 con reintentos automáticos.
 */
export async function commitToGitHub(config, filePath, contentUtf8, commitMessage, maxRetries = 3) {
  if (!config.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN no configurado para persistencia remota.');
  }

  const url = `https://api.github.com/repos/${config.GITHUB_REPO}/contents/${filePath}`;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Obtener SHA actual del archivo
      let sha = null;
      const getRes = await fetch(`${url}?ref=${config.GITHUB_BRANCH}`, {
        headers: {
          'Authorization': `token ${config.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ARKAIOS-Storage-Engine'
        }
      });

      if (getRes.ok) {
        const fileData = await getRes.json();
        sha = fileData.sha;
      } else if (getRes.status !== 404) {
        const getErr = await getRes.text();
        throw new Error(`Error al consultar SHA de ${filePath} en GitHub (HTTP ${getRes.status}): ${getErr}`);
      }

      // 2. Enviar actualización
      const base64Content = Buffer.from(contentUtf8, 'utf-8').toString('base64');
      const body = {
        message: commitMessage,
        content: base64Content,
        branch: config.GITHUB_BRANCH,
        ...(sha ? { sha } : {})
      };

      const putRes = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${config.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ARKAIOS-Storage-Engine',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (putRes.ok) {
        console.log(`[STORAGE] ✓ ${filePath} persistido exitosamente en GitHub (${config.GITHUB_REPO}@${config.GITHUB_BRANCH})`);
        return true;
      }

      // 3. Manejo de conflicto de concurrencia (409 Conflict)
      if (putRes.status === 409 && attempt < maxRetries) {
        console.warn(`[STORAGE] Conflicto de concurrencia (HTTP 409) al actualizar ${filePath}. Reintentando intento ${attempt + 1}/${maxRetries}...`);
        await new Promise(r => setTimeout(r, 200 * attempt));
        continue;
      }

      const errText = await putRes.text();
      throw new Error(`Fallo al persistir ${filePath} en GitHub API (HTTP ${putRes.status}): ${errText}`);
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
    }
  }

  throw lastError || new Error(`Error desconocido al persistir ${filePath} en GitHub tras ${maxRetries} intentos.`);
}

/**
 * Persiste un elemento en Key-Value con validación de respuesta HTTP.
 */
export async function persistToKv(config, key, data) {
  if (!config.KV_REST_API_URL || !config.KV_REST_API_TOKEN) {
    throw new Error('KV_REST_API_URL o KV_REST_API_TOKEN no configurado.');
  }

  const res = await fetch(`${config.KV_REST_API_URL}/set/${key}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Fallo al guardar en almacenamiento KV (HTTP ${res.status}): ${errText}`);
  }

  return true;
}

/**
 * Carga un elemento desde Key-Value con validación.
 */
export async function loadFromKv(config, key) {
  if (!config.KV_REST_API_URL || !config.KV_REST_API_TOKEN) return null;

  try {
    const res = await fetch(`${config.KV_REST_API_URL}/get/${key}`, {
      headers: { 'Authorization': `Bearer ${config.KV_REST_API_TOKEN}` }
    });
    if (res.ok) {
      const json = await res.json();
      return json.result ? JSON.parse(json.result) : null;
    }
  } catch (err) {
    console.warn(`[STORAGE] Error al leer de KV (${key}):`, err.message);
  }
  return null;
}
