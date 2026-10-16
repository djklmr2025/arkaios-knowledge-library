/**
 * Vercel Serverless Function: Trigger Autonomous Sync (/api/sync)
 * 
 * Allows AI Agents or administrative triggers to invoke Meta Graph API synchronization
 * in the cloud without requiring any local user actions.
 */

import { syncFromMetaGraph } from '../meta_collector.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const result = await syncFromMetaGraph();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Sincronización autónoma completada por Agentes ARKAIOS.',
      ...result
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: err.message
    }));
  }
}
