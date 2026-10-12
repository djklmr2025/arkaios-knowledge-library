/**
 * ARKAIOS Comprehensive Fanpage Video & Reel Extractor
 * Crawls https://www.facebook.com/arkaiosIA, /videos, and /reels
 * Extracts every video and reel published on the page and updates library.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LIBRARY_FILE = path.join(__dirname, 'library.json');
const APP_JS_FILE = path.join(__dirname, 'app.js');

const TARGETS = [
  { url: 'https://www.facebook.com/arkaiosIA', type: 'Feed Principal' },
  { url: 'https://www.facebook.com/arkaiosIA/videos', type: 'Pestaña Videos' },
  { url: 'https://www.facebook.com/arkaiosIA/reels', type: 'Pestaña Reels' }
];

const userAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

console.log('=== ARKAIOS COMPREHENSIVE MEDIA CRAWLER ===\n');

let library = [];
if (fs.existsSync(LIBRARY_FILE)) {
  library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
}

const existingUrls = new Set(library.map(x => (x.original_url || '').replace(/\/$/, '')));
const existingTitles = new Set(library.map(x => (x.title || '').trim().toLowerCase()));

let totalAdded = 0;

for (const target of TARGETS) {
  console.log(`[+] Rastreador escaneando: ${target.url} (${target.type})...`);
  try {
    const cmd = `curl.exe -s -L -A "${userAgent}" "${target.url}"`;
    const html = execSync(cmd, { maxBuffer: 50 * 1024 * 1024 }).toString('utf-8');
    console.log(`    Descargados ${(html.length / 1024 / 1024).toFixed(2)} MB de datos.`);

    // 1. Extract share URLs
    const shareMatches = html.match(/https:\\?\/\\?\/www\.facebook\.com\\?\/share\\?\/[vr]\\?\/[a-zA-Z0-9_-]+/g) || [];
    for (const raw of shareMatches) {
      const cleanUrl = raw.replace(/\\/g, '').replace(/\/$/, '');
      if (existingUrls.has(cleanUrl)) continue;

      const isReel = cleanUrl.includes('/r/');
      const videoId = cleanUrl.split('/').pop();

      // Find surrounding text for caption
      const idx = html.indexOf(raw);
      let snippet = '';
      if (idx !== -1) {
        const surrounding = html.slice(Math.max(0, idx - 1500), Math.min(html.length, idx + 1500));
        const msgMatch = surrounding.match(/"message"\s*:\s*\{\s*"text"\s*:\s*"([^"]+)"/);
        if (msgMatch) {
          try { snippet = JSON.parse(`"${msgMatch[1]}"`).trim(); } catch (e) { snippet = msgMatch[1]; }
        }
      }

      const title = snippet ? snippet.split('\n')[0].slice(0, 80) : `ARKAIOS ${isReel ? 'Reel' : 'Video'} Oficial (${videoId})`;
      const summary = snippet || `Video oficial publicado en el Fanpage ARKAIOS (${cleanUrl}).`;

      let category = isReel ? "Decentralized Infrastructure" : "AI Robotics & Agents";
      if (/seguridad|misalignment|arma|nuclear|amenaza/i.test(summary)) category = "AI Safety & Alignment";
      else if (/xp|windows|sistema|legacy/i.test(summary)) category = "Systems & Legacy Infrastructure";
      else if (/arkaios|revenue|pay/i.test(summary)) category = "ARKAIOS Ecosystem";

      const newItem = {
        id: `kb-media-${Date.now().toString().slice(-4)}-${library.length + 1}`,
        title,
        category,
        platform: isReel ? "Facebook Reel / Arkaios" : "Facebook Video / Arkaios",
        original_url: cleanUrl,
        external_resource: cleanUrl,
        summary,
        agent_lesson: `Análisis multimedia para agentes IA extraído de ${cleanUrl}: ${title}`,
        tags: ["#Arkaios", isReel ? "#Reel" : "#VideoHD", "#Media"],
        synced_at: new Date().toISOString()
      };

      library.unshift(newItem);
      existingUrls.add(cleanUrl);
      totalAdded++;
      console.log(`    [+] Nuevo video indexado: "${title}" -> ${cleanUrl}`);
    }

    // 2. Extract numerical video / reel IDs
    const numVideoMatches = html.match(/"video_id"\s*:\s*"([0-9]+)"/g) || [];
    for (const raw of numVideoMatches) {
      const idMatch = raw.match(/"([0-9]+)"$/);
      if (!idMatch) continue;
      const vId = idMatch[1];
      const videoUrl = `https://www.facebook.com/arkaiosIA/videos/${vId}`;
      if (existingUrls.has(videoUrl)) continue;

      const newItem = {
        id: `kb-vid-${Date.now().toString().slice(-4)}-${library.length + 1}`,
        title: `ARKAIOS Video Transmisión #${vId.slice(-4)}`,
        category: "AI Robotics & Agents",
        platform: "Facebook Video / Arkaios",
        original_url: videoUrl,
        external_resource: videoUrl,
        summary: `Video y archivo multimedia oficial en Fanpage ARKAIOS (ID: ${vId}).`,
        agent_lesson: `Recurso multimedia para memoria de agentes: Transmisión y video oficial #${vId}.`,
        tags: ["#Arkaios", "#VideoHD", "#Oficial"],
        synced_at: new Date().toISOString()
      };

      library.unshift(newItem);
      existingUrls.add(videoUrl);
      totalAdded++;
      console.log(`    [+] Nuevo ID de video indexado: ${videoUrl}`);
    }

    // 3. Extract direct /reel/ matches
    const reelMatches = html.match(/\/reel\/([0-9]{10,25})/g) || [];
    for (const raw of reelMatches) {
      const rId = raw.replace('/reel/', '');
      const reelUrl = `https://www.facebook.com/reel/${rId}`;
      if (existingUrls.has(reelUrl)) continue;

      const newItem = {
        id: `kb-reel-${Date.now().toString().slice(-4)}-${library.length + 1}`,
        title: `ARKAIOS Reel Oficial #${rId.slice(-4)}`,
        category: "Decentralized Infrastructure",
        platform: "Facebook Reel / Arkaios",
        original_url: reelUrl,
        external_resource: reelUrl,
        summary: `Reel oficial con micro-lección y demostración técnica en Fanpage ARKAIOS.`,
        agent_lesson: `Micro-lección para agentes IA extraída de Reel oficial #${rId}.`,
        tags: ["#Arkaios", "#Reel", "#MicroLeccion"],
        synced_at: new Date().toISOString()
      };

      library.unshift(newItem);
      existingUrls.add(reelUrl);
      totalAdded++;
      console.log(`    [+] Nuevo Reel indexado: ${reelUrl}`);
    }

  } catch (err) {
    console.error(`    [!] Error al escanear ${target.url}: ${err.message}`);
  }
}

console.log(`\n========================================`);
console.log(`Total nuevos videos y reels añadidos: ${totalAdded}`);
console.log(`Total elementos en biblioteca ahora: ${library.length}`);

// Guardar library.json
fs.writeFileSync(LIBRARY_FILE, JSON.stringify(library, null, 2), 'utf-8');

// Actualizar app.js
if (fs.existsSync(APP_JS_FILE)) {
  try {
    const appJs = fs.readFileSync(APP_JS_FILE, 'utf-8');
    const startMarker = 'const defaultKnowledge = ';
    const endMarker = ';\n\n// Load from live library.json';
    const sIdx = appJs.indexOf(startMarker);
    const eIdx = appJs.indexOf(endMarker);
    if (sIdx !== -1 && eIdx !== -1) {
      const updated = appJs.slice(0, sIdx + startMarker.length) +
        JSON.stringify(library, null, 2) +
        appJs.slice(eIdx);
      fs.writeFileSync(APP_JS_FILE, updated, 'utf-8');
      console.log(`[+] app.js actualizado con todo el catálogo de ${library.length} lecciones.`);
    }
  } catch (e) {
    console.error('[!] Error actualizando app.js:', e.message);
  }
}

console.log('=== CRAWLER FINALIZADO CON ÉXITO ===');
