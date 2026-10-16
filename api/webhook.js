/**
 * Vercel Serverless Function: Meta Webhook Endpoint (/api/webhook)
 * 
 * Handles:
 * 1. GET: Handshake subscription verification with Meta (hub.mode, hub.verify_token, hub.challenge)
 * 2. POST: Secure HMAC SHA-256 validation (X-Hub-Signature-256) & idempotent ingestion into knowledge store
 */

import { handleWebhookVerification, processWebhookPayload } from '../webhook_handler.mjs';

export const config = {
  api: {
    bodyParser: false, // Requerido para capturar el rawBody exacto para la verificación HMAC SHA-256
  },
};

async function getRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf-8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', err => reject(err));
  });
}

export default async function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `https://${host}`);

  // Handshake GET de verificación de suscripción
  if (req.method === 'GET') {
    return handleWebhookVerification(url.searchParams, res);
  }

  // Recepción POST de eventos de publicaciones
  if (req.method === 'POST') {
    try {
      const rawBody = await getRawBody(req);
      const signature = req.headers['x-hub-signature-256'] || '';
      const result = await processWebhookPayload(rawBody, signature);

      res.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Método no permitido. Solo GET y POST.' }));
}
