/**
 * ARKAIOS Knowledge Library - Event Bus & Notification Manager
 * 
 * Manages verifiable internal events for AI agents:
 * - knowledge.post.created
 * - knowledge.post.updated
 * - knowledge.sync.failed
 * - knowledge.token.expired
 * 
 * Provides cursor-based retrieval (since) and webhook delivery to subscribed consumers.
 * Thread-safe and persistent in events.json.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EVENTS_FILE = path.join(__dirname, 'events.json');
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');
const MAX_EVENTS_IN_MEMORY = 1000;

function loadJson(filepath, fallback = []) {
  if (!fs.existsSync(filepath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

function saveJson(filepath, data) {
  const tmp = `${filepath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filepath);
}

export class EventBus {
  constructor() {
    this.events = loadJson(EVENTS_FILE, []);
    this.subscriptions = loadJson(SUBSCRIPTIONS_FILE, []);
    this.processedEventIds = new Set(this.events.map(e => e.id));
  }

  /**
   * Emite un evento verificable en el bus de la biblioteca.
   * @param {string} type Tipo de evento: 'knowledge.post.created' | 'knowledge.post.updated' | 'knowledge.sync.failed' | 'knowledge.token.expired'
   * @param {object} payload Datos del evento
   * @param {string} source Origen del evento ('meta_graph_api' | 'meta_webhook' | 'consensus_wal' | 'sync_worker')
   * @returns {object} Evento generado
   */
  emit(type, payload, source = 'meta_graph_api') {
    const eventId = `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();

    const event = {
      id: eventId,
      type,
      source,
      timestamp,
      payload: {
        ...payload,
        // Sanitizar cualquier token accidental en payload
        token: undefined,
        access_token: undefined
      }
    };

    this.events.push(event);
    this.processedEventIds.add(eventId);

    // Limitar tamaño persistente para eficiencia
    if (this.events.length > MAX_EVENTS_IN_MEMORY) {
      this.events = this.events.slice(-MAX_EVENTS_IN_MEMORY);
    }

    try {
      saveJson(EVENTS_FILE, this.events);
    } catch (err) {
      console.error('[EVENT_BUS] Error al guardar events.json:', err.message);
    }

    // Disparar notificaciones a suscriptores push en segundo plano
    this.notifySubscribers(event).catch(err => {
      console.error('[EVENT_BUS] Error en notificación a suscriptores:', err.message);
    });

    return event;
  }

  /**
   * Recupera eventos ocurridos después de un cursor o marca temporal ISO.
   * @param {string|number} since Timestamp ISO o Event ID
   * @param {number} limit Límite máximo de eventos (def: 50)
   * @returns {Array} Lista de eventos
   */
  getEvents(since = null, limit = 50) {
    if (!since) {
      return this.events.slice(-limit);
    }

    // Si since coincide con un eventId
    const idx = this.events.findIndex(e => e.id === since);
    if (idx !== -1) {
      return this.events.slice(idx + 1, idx + 1 + limit);
    }

    // Si since es un timestamp ISO
    const sinceTime = new Date(since).getTime();
    if (!isNaN(sinceTime)) {
      return this.events
        .filter(e => new Date(e.timestamp).getTime() > sinceTime)
        .slice(0, limit);
    }

    return this.events.slice(-limit);
  }

  /**
   * Registra una suscripción para recibir alertas push vía HTTP Callback
   * @param {string} agentId Identificador del agente
   * @param {string} callbackUrl URL de entrega HTTP POST
   * @param {Array<string>} topics Lista de tipos de eventos o ['*']
   */
  subscribe(agentId, callbackUrl, topics = ['*']) {
    if (!agentId || !callbackUrl) {
      throw new Error('agentId y callbackUrl son requeridos para la suscripción.');
    }

    try {
      const u = new URL(callbackUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error('callbackUrl debe ser HTTP o HTTPS.');
      }
    } catch (e) {
      throw new Error(`URL de callback inválida: ${e.message}`);
    }

    const existingIdx = this.subscriptions.findIndex(s => s.agentId === agentId);
    const sub = {
      agentId,
      callbackUrl,
      topics,
      subscribedAt: new Date().toISOString(),
      active: true
    };

    if (existingIdx !== -1) {
      this.subscriptions[existingIdx] = sub;
    } else {
      this.subscriptions.push(sub);
    }

    saveJson(SUBSCRIPTIONS_FILE, this.subscriptions);
    return { success: true, agentId, callbackUrl, topics };
  }

  /**
   * Consulta las suscripciones activas
   */
  getSubscriptions() {
    return this.subscriptions.filter(s => s.active);
  }

  /**
   * Despacha notificaciones a los agentes con canal push activo
   */
  async notifySubscribers(event) {
    const active = this.subscriptions.filter(s => s.active);
    for (const sub of active) {
      const wantsTopic = sub.topics.includes('*') || sub.topics.includes(event.type);
      if (!wantsTopic) continue;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        await fetch(sub.callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Arkaios-Event-Type': event.type,
            'X-Arkaios-Event-Id': event.id
          },
          body: JSON.stringify(event),
          signal: controller.signal
        });
        clearTimeout(timeout);
      } catch (err) {
        // Fallo de red controlado (sin tumbar el proceso)
      }
    }
  }
}

export const eventBus = new EventBus();
