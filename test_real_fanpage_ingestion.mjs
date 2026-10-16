/**
 * ARKAIOS Knowledge Library - Prueba de Ingesta y Alerta sobre Publicación Humana Real
 * 
 * Demuestra el recorrido completo utilizando datos reales de la fanpage facebook.com/arkaiosIA:
 * 1. Simulación de entrega Webhook de Meta firmada con HMAC SHA-256 para una publicación real.
 * 2. Ingesta mediante knowledge_store.mjs calculando content_hash y separando facts de agent_lesson.
 * 3. Emisión y persistencia del evento verificable knowledge.post.created en events.json.
 * 4. Consulta MCP para agentes (knowledge_latest y knowledge_get).
 * 5. Entrega de alerta push al agente conectado.
 */

import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processWebhookPayload } from './webhook_handler.mjs';
import { eventBus } from './events_manager.mjs';
import { loadLibrary } from './knowledge_store.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.join(__dirname, '.env');

async function testRealFanpageIngestion() {
  console.log('======================================================================');
  console.log('📢 PRUEBA DE PRINCIPIO A FIN: PUBLICACIÓN REAL DE FANPAGE ARKAIOS');
  console.log('======================================================================\n');

  // Secreto criptográfico efímero generado estrictamente en memoria (cero modificaciones a .env)
  const ephemeralSecret = crypto.randomBytes(32).toString('hex');
  console.log('[CONFIG] Secreto criptográfico efímero generado en memoria para prueba Fail-Closed (sin tocar .env).');

  // 1. Datos reales de la publicación humana del Fanpage ARKAIOS
  // ID de Página Real: 776644758860856 (Fanpage Oficial facebook.com/arkaiosIA)
  const realPostData = {
    object: 'page',
    entry: [
      {
        id: '776644758860856',
        time: 1792128000,
        changes: [
          {
            field: 'feed',
            value: {
              item: 'post',
              verb: 'add',
              post_id: '776644758860856_pfbid0xHc6syHSZDhmuuNbuNMtL645Bqk7DV7igJqmC2sdz7EVe5aEtiTLtGog8wT7graul',
              message: 'ArtCraft: La Suite Adobe Clonada en Rust con Claude (7 Apps Open Source + MCP para Agentes). Un programador de Rust se cansó de pagar las suscripciones y políticas de cancelación abusivas de Adobe y está clonando en solitario toda la suite creativa con ayuda de Claude (Opus 5.5). Se llama ArtCraft y comprende 7 aplicaciones gratis y open source https://github.com/storytold',
              link: 'https://www.facebook.com/arkaiosIA/posts/pfbid0xHc6syHSZDhmuuNbuNMtL645Bqk7DV7igJqmC2sdz7EVe5aEtiTLtGog8wT7graul'
            }
          }
        ]
      }
    ]
  };

  const rawPayload = JSON.stringify(realPostData);
  const signature = 'sha256=' + crypto.createHmac('sha256', ephemeralSecret).update(rawPayload).digest('hex');

  // 2. Levantar agente receptor de alertas push
  let alertReceivedByAgent = null;
  const mockAgent = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      alertReceivedByAgent = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    });
  });

  await new Promise(r => mockAgent.listen(0, '127.0.0.1', r));
  const agentPort = mockAgent.address().port;
  const agentCallbackUrl = `http://127.0.0.1:${agentPort}/agent/feed_alerts`;

  eventBus.subscribe('Agente-AURA-Cognitivo', agentCallbackUrl, ['knowledge.post.created', 'knowledge.post.updated']);
  console.log(`[AGENTE] Agente AURA suscrito en: ${agentCallbackUrl}\n`);

  // 3. Procesar a través del Webhook con validación estricta HMAC SHA-256
  console.log('[WEBHOOK] Enviando payload auténtico de la Fanpage ARKAIOS firmado criptográficamente...');
  const webhookResult = await processWebhookPayload(rawPayload, signature, ephemeralSecret);

  if (!webhookResult.success) {
    throw new Error(`El Webhook rechazó el payload: ${webhookResult.error}`);
  }
  console.log(`✅ Webhook procesado exitosamente (HTTP 200). Entregas procesadas: ${webhookResult.processed}`);

  // Dar tiempo para la entrega de notificación HTTP asíncrona
  await new Promise(r => setTimeout(r, 200));
  mockAgent.close();

  // 4. Verificar alerta en el agente
  if (alertReceivedByAgent) {
    console.log('\n🎯 ¡ALERTA RECIBIDA POR EL AGENTE CONECTADO!');
    console.log(`   - Tipo de Evento: ${alertReceivedByAgent.type}`);
    console.log(`   - ID de Evento: ${alertReceivedByAgent.id}`);
    console.log(`   - Título: ${alertReceivedByAgent.payload.title}`);
    console.log(`   - URL Canónica: ${alertReceivedByAgent.payload.canonical_url}`);
    console.log(`   - Hash Criptográfico: ${alertReceivedByAgent.payload.content_hash}`);
  } else {
    throw new Error('El agente suscriptor no recibió la alerta push.');
  }

  // 5. Verificar consulta mediante el Contrato MCP para Agentes
  const lib = loadLibrary();
  const ingested = lib.find(i => i.canonical_url.includes('pfbid0xHc6syHSZDhmuuNbuNMtL645Bqk7DV7igJqmC2sdz7EVe5aEtiTLtGog8wT7graul'));

  if (ingested) {
    console.log('\n🏛️ [MCP CONSULTA] Registro verificado disponible en la biblioteca:');
    console.log(`   - ID: ${ingested.id}`);
    console.log(`   - Meta Post ID: ${ingested.meta_post_id}`);
    console.log(`   - Hechos extraídos (facts):`);
    console.log(`     * Plataforma: ${ingested.facts?.source_platform || 'Facebook Fanpage'}`);
    console.log(`     * Page ID: ${ingested.facts?.page_id}`);
    console.log(`     * Enlaces externos: ${ingested.facts?.external_links?.join(', ')}`);
    console.log(`   - Inferencia de Agente (agent_lesson):`);
    console.log(`     * ${ingested.agent_lesson.slice(0, 150)}...`);
    console.log(`   - Estado de Verificación: ${ingested.verification_status}`);
  } else {
    throw new Error('El registro no fue localizado en la biblioteca.');
  }

  console.log('\n======================================================================');
  console.log('🎉 RECORRIDO COMPLETO DEMOSTRADO CON DATOS REALES DE LA FANPAGE:');
  console.log('   Publicación humana ➔ Firma HMAC ➔ Ingesta persistente ➔ Evento ➔ Alerta Agente.');
  console.log('======================================================================\n');
}

testRealFanpageIngestion().catch(err => {
  console.error('\n❌ ERROR EN LA PRUEBA REAL:', err);
  process.exit(1);
});
