/**
 * ARKAIOS Knowledge Library - Meta Graph API Official Collector
 * 
 * Fetches authenticated posts and media directly from Facebook Graph API v23.0.
 * Ingests them via knowledge_store.mjs ensuring date traceability,
 * cryptographic content hashes (SHA-256), and event dispatching.
 * Strictly reads credentials from local .env (never committed).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestMetaPost, ingestMetaPostsBatch, loadLibrary } from './knowledge_store.mjs';
import { eventBus } from './events_manager.mjs';
import { curateLibrary } from './curate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.join(__dirname, '.env');
const SYNC_STATUS_FILE = path.join(__dirname, 'sync_status.json');

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

function updateSyncStatus(status) {
  const current = fs.existsSync(SYNC_STATUS_FILE) 
    ? JSON.parse(fs.readFileSync(SYNC_STATUS_FILE, 'utf-8')) 
    : {};
  const updated = {
    ...current,
    ...status,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(SYNC_STATUS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export async function syncFromMetaGraph() {
  console.log('======================================================================');
  console.log('📡 RECOLECTOR OFICIAL GRAPH API META v23.0');
  console.log('======================================================================\n');

  const env = loadEnv();
  const pageToken = process.env.FACEBOOK_PAGE_TOKEN || env.FACEBOOK_PAGE_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID || env.FACEBOOK_PAGE_ID || '776644758860856';

  if (!pageToken || !pageId) {
    const errorMsg = 'Falta FACEBOOK_PAGE_TOKEN o FACEBOOK_PAGE_ID (configure en variables de entorno de GitHub Actions o en archivo .env local).';
    console.error(`❌ ${errorMsg}`);
    updateSyncStatus({
      token_status: 'MISSING',
      token_expired: false,
      last_error: errorMsg,
      success: false
    });
    eventBus.emit('knowledge.sync.failed', { reason: errorMsg }, 'meta_graph_api');
    return { success: false, error: 'Missing tokens' };
  }

  console.log(`[+] Conectando a Meta Graph API para la página ID: ${pageId}...`);

  try {
    let nextUrl = `https://graph.facebook.com/v23.0/${pageId}/posts?fields=id,message,created_time,permalink_url,attachments{url,title,type,media,target}&limit=50&access_token=${pageToken}`;
    let allPosts = [];
    let pageCount = 0;

    while (nextUrl && allPosts.length < 300) {
      pageCount++;
      const res = await fetch(nextUrl);
      const data = await res.json();

      if (data.error) {
        const isExpired = data.error.code === 190;
        console.error(`❌ Error de Graph API [Código ${data.error.code}]:`, data.error.message);

        updateSyncStatus({
          token_status: isExpired ? 'EXPIRED' : 'ERROR',
          token_expired: isExpired,
          last_error: data.error.message,
          error_code: data.error.code,
          success: false
        });

        if (isExpired) {
          eventBus.emit('knowledge.token.expired', {
            error_code: 190,
            message: data.error.message,
            detected_at: new Date().toISOString()
          }, 'meta_graph_api');
        }

        eventBus.emit('knowledge.sync.failed', {
          error_code: data.error.code,
          reason: data.error.message
        }, 'meta_graph_api');

        return { success: false, error: data.error.message, is_expired: isExpired };
      }

      const currentBatch = data.data || [];
      allPosts = allPosts.concat(currentBatch);
      console.log(`[+] Página #${pageCount}: recibidas ${currentBatch.length} publicaciones (total acumulado: ${allPosts.length})`);

      nextUrl = data.paging?.next || null;
      if (!currentBatch.length) break;
    }

    console.log(`[+] Total final de publicaciones extraídas desde Graph API: ${allPosts.length}.`);

    const { created: newCount, updated: updatedCount } = ingestMetaPostsBatch(allPosts, 'meta_graph_api');

    console.log(`[+] Elementos nuevos añadidos: ${newCount} | Actualizados: ${updatedCount}`);

    try {
      curateLibrary();
    } catch (e) {
      console.warn('[CURATE] Aviso en curación:', e.message);
    }

    const totalLib = loadLibrary().length;

    updateSyncStatus({
      token_status: 'ACTIVE',
      token_expired: false,
      last_error: null,
      total_items: totalLib,
      added_count: newCount,
      updated_count: updatedCount,
      success: true
    });

    return { success: true, count: allPosts.length, added: newCount, updated: updatedCount };

  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
    updateSyncStatus({
      token_status: 'NETWORK_ERROR',
      token_expired: false,
      last_error: err.message,
      success: false
    });
    eventBus.emit('knowledge.sync.failed', { reason: err.message }, 'meta_graph_api');
    return { success: false, error: err.message };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncFromMetaGraph();
}
