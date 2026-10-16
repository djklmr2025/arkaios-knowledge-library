/**
 * Vercel Serverless Function: Events Endpoint (/api/events)
 */

import { eventBus } from '../events_manager.mjs';

export default function handler(req, res) {
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
