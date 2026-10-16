/**
 * ARKAIOS Knowledge Library - Meta Webhook Secure Handler
 * 
 * Implements Meta Webhook protocol:
 * 1. Subscription verification (GET): hub.mode, hub.verify_token, hub.challenge
 * 2. Authenticity verification (POST): HMAC SHA-256 validation via X-Hub-Signature-256
 * 3. Idempotent processing with memory cache of delivered entries
 * 4. Ingestion into persistent knowledge store & internal event bus dispatching
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestMetaPost } from './knowledge_store.mjs';
import { eventBus } from './events_manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.join(__dirname, '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf-8');
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
}

const processedDeliveries = new Set();
const MAX_DELIVERIES_CACHE = 5000;

/**
 * Maneja la verificación de suscripción de Webhook (GET).
 */
export function handleWebhookVerification(query, res) {
  const env = loadEnv();
  const verifyToken = env.META_VERIFY_TOKEN || env.ARKAIOS_WEBHOOK_VERIFY_TOKEN || 'arkaios_knowledge_webhook_secure_2026';

  const mode = query.get('hub.mode');
  const token = query.get('hub.verify_token');
  const challenge = query.get('hub.challenge');

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WEBHOOK] Suscripción de Meta verificada exitosamente.');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(challenge);
    return true;
  }

  console.warn('[WEBHOOK] Fallo en verificación de suscripción: token o modo no válido.');
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Fallo de verificación de token de webhook.' }));
  return false;
}

/**
 * Valida la firma criptográfica HMAC SHA-256 de Meta de forma estricta (Fail-Closed).
 * Si falta el secret, falta la cabecera o no coincide exactamente el HMAC, RECHAZA categóricamente.
 */
export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || typeof appSecret !== 'string' || !appSecret.trim()) {
    console.warn('[WEBHOOK-SECURITY] Fail-Closed: appSecret ausente o vacío.');
    return false;
  }
  if (!signatureHeader || typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) {
    console.warn('[WEBHOOK-SECURITY] Fail-Closed: signatureHeader ausente o malformada.');
    return false;
  }

  const expectedSig = signatureHeader.slice(7).trim();
  const hmac = crypto.createHmac('sha256', appSecret.trim()).update(rawBody).digest('hex');

  const hmacBuf = Buffer.from(hmac, 'utf-8');
  const sigBuf = Buffer.from(expectedSig, 'utf-8');

  if (hmacBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(hmacBuf, sigBuf);
}

/**
 * Procesa el payload entrante de Webhooks de Meta (POST).
 */
export async function processWebhookPayload(rawBody, signatureHeader) {
  const env = loadEnv();
  const appSecret = env.META_APP_SECRET;

  // Política Fail-Closed obligatoria: Si no hay secreto configurado, rechazar inmediatamente
  if (!appSecret || !appSecret.trim()) {
    const errorMsg = 'Acceso denegado: META_APP_SECRET no configurado en el servidor (Fail-Closed estricto).';
    console.error(`[WEBHOOK-SECURITY] ❌ ${errorMsg}`);
    eventBus.emit('knowledge.sync.failed', {
      reason: errorMsg,
      source: 'meta_webhook'
    }, 'meta_webhook');
    return { success: false, status: 403, error: errorMsg };
  }

  if (!verifyMetaSignature(rawBody, signatureHeader, appSecret)) {
    const errorMsg = 'Acceso denegado: Firma HMAC SHA-256 inválida o ausente en webhook de Meta.';
    console.error(`[WEBHOOK-SECURITY] ❌ ${errorMsg}`);
    eventBus.emit('knowledge.sync.failed', {
      reason: errorMsg,
      source: 'meta_webhook'
    }, 'meta_webhook');
    return { success: false, status: 403, error: errorMsg };
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch (err) {
    eventBus.emit('knowledge.sync.failed', {
      reason: 'Payload JSON de webhook malformado',
      error: err.message
    }, 'meta_webhook');
    return { success: false, status: 400, error: 'JSON malformado' };
  }

  if (data.object !== 'page') {
    return { success: true, status: 200, message: 'Evento ignorado (no es de tipo page).' };
  }

  const results = [];

  for (const entry of (data.entry || [])) {
    const entryId = entry.id;
    const entryTime = entry.time;

    // Deduplicación idempotente
    const deliveryKey = `${entryId}_${entryTime}`;
    if (processedDeliveries.has(deliveryKey)) {
      continue;
    }
    processedDeliveries.add(deliveryKey);
    if (processedDeliveries.size > MAX_DELIVERIES_CACHE) {
      const first = processedDeliveries.values().next().value;
      processedDeliveries.delete(first);
    }

    for (const change of (entry.changes || [])) {
      if (change.field === 'feed') {
        const val = change.value;
        const itemType = val.item; // 'post', 'status', 'video', 'photo', etc.
        const verb = val.verb;     // 'add', 'edit', 'delete'

        if (verb === 'add' || verb === 'edit') {
          const postPayload = {
            id: val.post_id || `${entryId}_${entryTime}`,
            page_id: entryId,
            message: val.message || val.description || '',
            created_time: new Date(entryTime * 1000).toISOString(),
            permalink_url: val.link || `https://www.facebook.com/${val.post_id}`,
            content_type: itemType === 'video' ? 'video' : 'post',
            thumbnail: val.photo || null
          };

          const outcome = ingestMetaPost(postPayload, 'meta_webhook');
          results.push(outcome);
        }
      }
    }
  }

  return { success: true, status: 200, processed: results.length, details: results };
}
