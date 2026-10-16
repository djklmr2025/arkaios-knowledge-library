/**
 * ARKAIOS Knowledge Library - Sovereign Persistent Knowledge Store
 * 
 * Manages cognitive lessons with immutable index 0 preservation, cryptographic
 * content hashing (SHA-256), date traceability (published vs captured vs updated),
 * and separation between extracted facts and AI agent lessons.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { eventBus } from './events_manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIBRARY_FILE = path.join(__dirname, 'library.json');

/**
 * Calcula el hash SHA-256 canónico del contenido sustantivo para detectar modificaciones.
 */
export function computeContentHash(data) {
  const normText = (data.summary || data.text || data.message || '').trim();
  const normTitle = (data.title || '').trim();
  const normUrl = (data.original_url || data.canonical_url || '').trim();
  const normType = (data.content_type || data.platform || '').trim();
  const repos = Array.isArray(data.github_repo) ? data.github_repo.join(',') : (data.github_repo || '');

  const payload = `${normTitle}|${normText}|${normUrl}|${normType}|${repos}`;
  return crypto.createHash('sha256').update(payload, 'utf-8').digest('hex');
}

/**
 * Carga la biblioteca asegurando atomicidad y manejo de fallback.
 */
export function loadLibrary() {
  if (!fs.existsSync(LIBRARY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

/**
 * Guarda la biblioteca de forma atómica respetando el índice 0.
 */
export function saveLibrary(items) {
  const tmpPath = `${LIBRARY_FILE}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(items, null, 2), 'utf-8');
  fs.renameSync(tmpPath, LIBRARY_FILE);
}

/**
 * Ingesta o actualiza una publicación proveniente de Meta (Graph API o Webhook).
 * @param {object} rawPost Datos crudos de la publicación
 * @param {string} source Origen ('meta_graph_api' | 'meta_webhook' | 'manual_sync')
 * @returns {object} Resultado de la operación: { status: 'CREATED' | 'UPDATED' | 'UNCHANGED', item, event }
 */
export function ingestMetaPost(rawPost, source = 'meta_graph_api') {
  const library = loadLibrary();
  const nowIso = new Date().toISOString();

  const metaId = rawPost.id || rawPost.post_id;
  const canonicalId = `meta-${metaId}`;
  const canonicalUrl = rawPost.permalink_url || rawPost.url || `https://www.facebook.com/${metaId}`;
  const originalUrl = rawPost.permalink_url || rawPost.original_url || canonicalUrl;

  const msg = (rawPost.message || rawPost.text || '').trim();
  const publishedAt = rawPost.created_time 
    ? new Date(rawPost.created_time).toISOString()
    : (rawPost.published_at || nowIso);

  const attach = rawPost.attachments?.data?.[0] || rawPost.attachment || {};
  const attachTitle = attach.title || '';
  const attachUrl = attach.url || '';
  const attachType = attach.type || '';
  const thumbnail = attach.media?.image?.src || rawPost.thumbnail || null;
  const isVideo = attachType.includes('video') || (attachUrl && attachUrl.includes('/reel/')) || rawPost.content_type === 'video';

  // Detección de enlaces GitHub
  const textBlob = `${msg} ${attachUrl} ${rawPost.github_repo || ''}`;
  const repoMatch = textBlob.match(/https?:\/\/github\.com\/[a-zA-Z0-9_\-\.\/]+/i);
  const githubRepo = repoMatch ? repoMatch[0] : (rawPost.github_repo || null);

  // Hechos extraídos estrictos (separados de cualquier inferencia)
  const facts = {
    source_platform: 'Facebook Fanpage (arkaiosIA)',
    page_id: rawPost.page_id || '776644758860856',
    meta_post_id: metaId,
    published_date_raw: rawPost.created_time || publishedAt,
    has_video: isVideo,
    external_links: Array.from(new Set([attachUrl, githubRepo].filter(Boolean))),
    raw_message_snippet: msg.slice(0, 500)
  };

  // Título
  const lines = msg.split('\n').map(l => l.trim()).filter(Boolean);
  let title = attachTitle || lines[0];
  if (!title && isVideo) {
    title = `ARKAIOS Reel / Video #${metaId ? metaId.slice(-6) : 'Oficial'}`;
  }
  if (!title) {
    title = `Publicación Oficial ARKAIOS #${metaId ? metaId.slice(-6) : Date.now()}`;
  }
  title = title.slice(0, 120);

  // Inferencia cognitiva de agente (separada y claramente rotulada)
  const agentLesson = isVideo
    ? `[INFERENCIA DE AGENTE] Recurso audiovisual de la fanpage ARKAIOS (${canonicalUrl}). Apto para transcripción, análisis de audio e indexación de conceptos operativos.`
    : `[INFERENCIA DE AGENTE] Contenido asimilado de la publicación oficial ARKAIOS: ${msg.slice(0, 240)}... Extrae tecnologías e integra a la base cognitiva.`;

  // Categorización
  let category = 'Sovereign Knowledge & Systems';
  const lower = (msg + ' ' + title).toLowerCase();
  if (/rust|c\+\+|reverse|kernel|driver|compil/i.test(lower)) category = 'Autonomous Software Engineering';
  else if (/mcp|model context protocol|agente|multi-agent/i.test(lower)) category = 'Multi-Agent Intelligence & MCP';
  else if (/android|artemis|mobile|apk|adb/i.test(lower)) category = 'Robotics & Hardware Control';
  else if (/meshtastic|lora|radio|mesh|off-grid/i.test(lower)) category = 'Resilient Hardware & Networks';
  else if (/hugging|torrent|magnet|p2p|pesos/i.test(lower)) category = 'Decentralized AI Infrastructure';
  else if (/xp|windows|industrial|plc|scada/i.test(lower)) category = 'Critical Infrastructure & Legacy Resilience';
  else if (/democracia|suiza|gobernanza|consenso/i.test(lower)) category = 'Decentralized Governance & Consensus';

  const contentHash = computeContentHash({
    title,
    summary: msg || title,
    original_url: canonicalUrl,
    content_type: isVideo ? 'video' : 'post',
    github_repo: githubRepo
  });

  // Buscar coincidencia previa por ID de Meta o por URL canónica
  const existingIndex = library.findIndex(item => 
    item.id === canonicalId ||
    item.meta_post_id === metaId ||
    (metaId && item.id && item.id.includes(metaId)) ||
    item.canonical_url === canonicalUrl
  );

  if (existingIndex !== -1) {
    const existing = library[existingIndex];

    // Verificar si el hash de contenido cambió
    if (existing.content_hash && existing.content_hash === contentHash) {
      return { status: 'UNCHANGED', item: existing, event: null };
    }

    // Actualización detectada
    existing.title = title;
    existing.summary = msg || existing.summary;
    existing.facts = facts;
    existing.content_hash = contentHash;
    existing.updated_at = nowIso;
    existing.verification_status = 'VERIFIED_OFFICIAL_META';

    if (githubRepo && !existing.github_repo) existing.github_repo = githubRepo;
    if (thumbnail && !existing.thumbnail) existing.thumbnail = thumbnail;

    saveLibrary(library);

    const event = eventBus.emit('knowledge.post.updated', {
      item_id: existing.id,
      meta_post_id: metaId,
      title: existing.title,
      content_hash: contentHash,
      published_at: existing.published_at,
      updated_at: nowIso,
      canonical_url: canonicalUrl
    }, source);

    return { status: 'UPDATED', item: existing, event };
  }

  // Inserción de Nuevo Registro
  const newItem = {
    id: canonicalId,
    meta_post_id: metaId,
    platform: isVideo ? 'Facebook (Reel / Video Official)' : 'Facebook (Graph API Official)',
    author: 'ARKAIOS Official Fanpage',
    title,
    category,
    content_type: isVideo ? 'video' : 'post',
    original_url: originalUrl,
    canonical_url: canonicalUrl,
    thumbnail,
    github_repo: githubRepo,
    website: attachUrl.includes('github') ? null : (attachUrl || null),
    technologies: githubRepo ? ['Open Source', 'GitHub'] : (isVideo ? ['Multimedia', 'Reel'] : []),
    skills_unlocked: githubRepo ? [`Herramienta Open Source vinculada: ${githubRepo}`] : [],
    summary: msg || postSnippet(attachTitle, metaId),
    facts,
    agent_lesson: agentLesson,
    content_hash: contentHash,
    verification_status: 'VERIFIED_OFFICIAL_META',
    published_at: publishedAt,
    captured_at: nowIso,
    updated_at: nowIso,
    tags: ['meta-official', 'arkaios-knowledge', isVideo ? 'video' : 'post']
  };

  // Preservar ArtCraft en índice 0 si existe
  if (library.length > 0 && library[0].id === 'kb-top-01-artcraft') {
    library.splice(1, 0, newItem);
  } else {
    library.push(newItem);
  }

  saveLibrary(library);

  const event = eventBus.emit('knowledge.post.created', {
    item_id: newItem.id,
    meta_post_id: metaId,
    title: newItem.title,
    category: newItem.category,
    content_type: newItem.content_type,
    content_hash: contentHash,
    published_at: newItem.published_at,
    captured_at: newItem.captured_at,
    canonical_url: canonicalUrl
  }, source);

  return { status: 'CREATED', item: newItem, event };
}

function postSnippet(title, id) {
  return title ? `Publicación: ${title}` : `Contenido oficial de la fanpage ARKAIOS (#${id}).`;
}

/**
 * Consulta registros incorporados después de un timestamp o ID.
 */
export function getItemsSince(since, limit = 50) {
  const library = loadLibrary();
  if (!since) return library.slice(-limit);

  const sinceTime = new Date(since).getTime();
  if (!isNaN(sinceTime)) {
    return library
      .filter(item => {
        const itemDate = new Date(item.captured_at || item.synced_at || 0).getTime();
        return itemDate > sinceTime;
      })
      .slice(0, limit);
  }

  const idx = library.findIndex(i => i.id === since);
  if (idx !== -1) {
    return library.slice(idx + 1, idx + 1 + limit);
  }

  return library.slice(-limit);
}
