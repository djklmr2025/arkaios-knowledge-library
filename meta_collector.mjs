/**
 * ARKAIOS Knowledge Library - Meta Graph API Official Collector
 * 
 * Fetches authenticated posts and media directly from Facebook Graph API v23.0.
 * Ingests them into library.json as structured cognitive lessons.
 * Reads credentials strictly from local .env (never committed).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { curateLibrary } from './curate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.join(__dirname, '.env');
const LIBRARY_PATH = path.join(__dirname, 'library.json');

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

function detectCategory(text) {
  const lower = (text || '').toLowerCase();
  if (/rust|c\+\+|reverse|kernel|driver|compil/i.test(lower)) return 'Autonomous Software Engineering';
  if (/mcp|model context protocol|agente|multi-agent/i.test(lower)) return 'Multi-Agent Intelligence & MCP';
  if (/android|artemis|mobile|apk|adb/i.test(lower)) return 'Robotics & Hardware Control';
  if (/meshtastic|lora|radio|mesh|off-grid/i.test(lower)) return 'Resilient Hardware & Networks';
  if (/hugging|torrent|magnet|p2p|pesos/i.test(lower)) return 'Decentralized AI Infrastructure';
  if (/xp|windows|industrial|plc|scada/i.test(lower)) return 'Critical Infrastructure & Legacy Resilience';
  if (/democracia|suiza|gobernanza|consenso/i.test(lower)) return 'Decentralized Governance & Consensus';
  return 'Sovereign Knowledge & Systems';
}

function extractGithubRepo(text, attachUrl) {
  const match = (text + ' ' + (attachUrl || '')).match(/https?:\/\/github\.com\/[a-zA-Z0-9_\-\.\/]+/i);
  return match ? match[0] : null;
}

export async function syncFromMetaGraph() {
  console.log('======================================================================');
  console.log('📡 RECOLECTOR OFICIAL GRAPH API META v23.0');
  console.log('======================================================================\n');

  const env = loadEnv();
  const pageToken = env.FACEBOOK_PAGE_TOKEN;
  const pageId = env.FACEBOOK_PAGE_ID;

  if (!pageToken || !pageId) {
    console.error('❌ Falta FACEBOOK_PAGE_TOKEN o FACEBOOK_PAGE_ID en .env.');
    console.log('Ejecuta primero: node meta_token_manager.mjs para canjear y guardar tus tokens.');
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
        console.error('❌ Error de Graph API:', data.error.message);
        break;
      }

      const currentBatch = data.data || [];
      allPosts = allPosts.concat(currentBatch);
      console.log(`[+] Página #${pageCount}: recibidas ${currentBatch.length} publicaciones (total acumulado: ${allPosts.length})`);

      nextUrl = data.paging?.next || null;
      if (!currentBatch.length) break;
    }

    const posts = allPosts;
    console.log(`[+] Total final de publicaciones extraídas desde Graph API: ${posts.length}.`);

    const library = fs.existsSync(LIBRARY_PATH) ? JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8')) : [];

    let newCount = 0;
    posts.forEach(post => {
      const msg = post.message || '';
      if (!msg && !post.attachments) return;

      const attach = post.attachments?.data?.[0];
      const attachTitle = attach?.title || '';
      const attachUrl = attach?.url || '';
      const attachType = attach?.type || '';
      const targetId = attach?.target?.id || '';
      const thumbnail = attach?.media?.image?.src || null;
      const isVideo = attachType.includes('video') || (attachUrl && attachUrl.includes('/reel/'));

      const lines = msg.split('\n').map(l => l.trim()).filter(Boolean);
      let title = attachTitle || lines[0];
      if (!title && isVideo) {
        title = `ARKAIOS Reel #${targetId || post.id.split('_')[1] || post.id.slice(-6)}`;
      }
      if (!title) {
        title = `Publicación Oficial ARKAIOS #${post.id.split('_')[1] || post.id.slice(-6)}`;
      }

      const repo = extractGithubRepo(msg, attachUrl);
      const category = detectCategory(msg + ' ' + title);
      const canonical = attachUrl || post.permalink_url || `https://www.facebook.com/${post.id}`;

      const newItem = {
        id: `meta-${post.id}`,
        title: title.slice(0, 120),
        category: category,
        platform: isVideo ? 'Facebook (Reel / Video Official)' : 'Facebook (Graph API Official)',
        original_url: canonical,
        canonical_url: canonical,
        thumbnail: thumbnail,
        github_repo: repo,
        website: attachUrl.includes('github') ? null : (attachUrl || null),
        technologies: repo ? ['Open Source', 'GitHub'] : (isVideo ? ['Multimedia', 'Reel'] : []),
        skills_unlocked: repo ? [`Herramienta Open Source vinculada: ${repo}`] : (isVideo ? ['Transmisión Multimedia Soberana'] : []),
        summary: msg.slice(0, 400) || post.story || 'Contenido oficial sincronizado directamente desde Meta Graph API.',
        agent_lesson: isVideo 
          ? `Registro audiovisual oficial verificado de la fanpage ARKAIOS (${canonical}). Analizable para visión por computadora y transcripción.`
          : `Lección oficial asimilada desde la página ARKAIOS: ${(msg || post.story || '').slice(0, 250)}...`,
        tags: ['meta-graph-api', 'arkaios-official', isVideo ? 'video' : 'post']
      };

      // Si no existe, agregar
      if (!library.some(x => x.id === newItem.id || x.canonical_url === newItem.canonical_url)) {
        library.push(newItem);
        newCount++;
      }
    });

    console.log(`[+] Elementos nuevos añadidos a la base: ${newCount}`);
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf-8');

    // Ejecutar curación y normalización automática
    curateLibrary();

    return { success: true, count: posts.length, added: newCount };

  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
    return { success: false, error: err.message };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncFromMetaGraph();
}
