/**
 * Vercel Serverless Function: Events Endpoint (/api/events)
 * 
 * Protected by Sovereign Fail-Closed Agent Authentication:
 * Requires valid Bearer token or x-arkaios-agent-token header.
 */

import { eventBus } from '../events_manager.mjs';
import { verifyAgentAuth } from '../persistent_storage.mjs';

export default function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const customHeader = req.headers['x-arkaios-agent-token'];

  // Fail-Closed: Rechazar si no se proporciona token de agente válido
  if (!verifyAgentAuth(authHeader, customHeader)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Acceso no autorizado al bus de eventos de agentes (se requiere token Bearer o cabecera x-arkaios-agent-token).'
    }));
    return;
  }

  try {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url, `https://${host}`);
    const since = url.searchParams.get('since');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);

    const events = eventBus.getEvents(since, limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: events.length, events }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
}
