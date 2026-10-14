/**
 * ARKAIOS Autonomous Facebook Page Sync Worker
 * Periodically monitors https://www.facebook.com/arkaiosIA for new multimedia posts,
 * extracts transcripts & lessons, and auto-updates library.json without any login/password.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PAGE_URL = 'https://www.facebook.com/arkaiosIA';
const LIBRARY_FILE = path.join(__dirname, 'library.json');
const LOG_FILE = path.join(__dirname, 'sync_history.log');

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
}

function validateUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('URL requerida.');
  }
  if (/["'`;&|<>^\r\n]/.test(rawUrl)) {
    throw new Error('URL contiene caracteres no permitidos o sospechosos.');
  }
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Solo se permiten protocolos HTTP/HTTPS.');
  }
  return parsed.href;
}

function fetchPageHtml(url) {
  const safeUrl = validateUrl(url);

  const sessionDir = path.join(__dirname, '.meta_admin_session');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  // If authenticated admin session exists, use headless Chrome with user-data-dir
  if (fs.existsSync(sessionDir) && fs.existsSync(path.join(sessionDir, 'Default')) && fs.existsSync(chromePath)) {
    try {
      log(`[AUTH] Usando sesión de Administrador Meta persistente (.meta_admin_session)...`);
      const args = [
        '--headless=new',
        '--dump-dom',
        `--user-data-dir=${sessionDir}`,
        safeUrl
      ];
      const out = execFileSync(chromePath, args, { maxBuffer: 30 * 1024 * 1024, encoding: 'utf-8' });
      if (out && out.length > 5000) return out;
    } catch (e) {
      log(`[AUTH-WARN] Volcado headless (${e.message}), recurriendo a crawler abierto...`);
    }
  }

  const userAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  return execFileSync('curl.exe', ['-s', '-L', '-A', userAgent, safeUrl], {
    maxBuffer: 25 * 1024 * 1024,
    encoding: 'utf-8'
  });
}

function sync() {
  const TARGETS = [
    { url: PAGE_URL, name: 'Feed Principal' },
    { url: `${PAGE_URL}/videos`, name: 'Pestaña Videos' },
    { url: `${PAGE_URL}/reels`, name: 'Pestaña Reels' }
  ];

  log(`Iniciando sincronización exhaustiva de todas las pestañas de ${PAGE_URL}...`);

  try {
    let library = [];
    if (fs.existsSync(LIBRARY_FILE)) {
      library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
    }

    const existingTexts = new Set(library.map(item => item.summary.trim().slice(0, 100)));
    const existingUrls = new Set(library.map(item => (item.original_url || '').replace(/\/$/, '')));

    let newItemsCount = 0;

    for (const target of TARGETS) {
      log(`Escaneando ${target.name} (${target.url})...`);
      let html = '';
      try {
        html = fetchPageHtml(target.url);
      } catch (fErr) {
        log(`[!] Error al descargar ${target.url}: ${fErr.message}`);
        continue;
      }

      log(`HTML descargado (${(html.length / 1024 / 1024).toFixed(2)} MB). Procesando contenidos...`);

      // 1. Extract Relay text posts
      const rawPosts = html.split(/"message"\s*:\s*\{\s*"text"\s*:\s*"/);
      for (let i = 1; i < rawPosts.length; i++) {
        const section = rawPosts[i];
        const endQuote = section.indexOf('"}');
        let text = section.slice(0, endQuote);
        try { text = JSON.parse(`"${text}"`); } catch (e) {}
        text = text.trim();
        if (text.length < 15) continue;

        const snippet = text.slice(0, 100);
        if (existingTexts.has(snippet)) continue;

        const surrounding = rawPosts[i - 1].slice(-1500) + section.slice(0, 2000);
        const shareMatch = surrounding.match(/https:\\?\/\\?\/www\.facebook\.com\\?\/share\\?\/[vrp]\\?\/[a-zA-Z0-9_-]+/);
        const shareUrl = shareMatch ? shareMatch[0].replace(/\\/g, '').replace(/\/$/, '') : PAGE_URL;

        if (existingUrls.has(shareUrl) && shareUrl !== PAGE_URL) continue;

        const firstLine = text.split('\n')[0].replace(/^[#\s]+/, '').slice(0, 80);
        let category = "General Knowledge";
        if (/android|artemis|mobile/i.test(text)) category = "AI Robotics & Agents";
        else if (/ia|anthropic|seguridad|arma|claude/i.test(text)) category = "AI Safety & Alignment";
        else if (/meshtastic|lora|descentraliz|suiza|mesh/i.test(text)) category = "Decentralized Infrastructure";
        else if (/rust|codigo|software|windows|xp/i.test(text)) category = "Systems & Legacy Infrastructure";
        else if (/arkaios|builder|revenue|facto|pay/i.test(text)) category = "ARKAIOS Ecosystem";
        else if (/humano|persona|dios|corazon|dinero/i.test(text)) category = "Philosophy & Human Ethics";

        const tags = (text.match(/#[a-zA-Z0-9_]+/g) || ['#Arkaios', '#Nuevo']).slice(0, 4);

        const newItem = {
          id: `kb-sync-${Date.now().toString().slice(-4)}-${library.length + 1}`,
          title: firstLine || `Publicación Arkaios #${library.length + 1}`,
          category,
          platform: shareUrl.includes('/v/') ? 'Facebook Video / Arkaios' : (shareUrl.includes('/r/') ? 'Facebook Reel / Arkaios' : 'Facebook / Arkaios Oficial'),
          original_url: shareUrl,
          external_resource: shareUrl,
          summary: text,
          agent_lesson: `Conocimiento sincronizado automáticamente de la página oficial: ${firstLine}`,
          tags,
          synced_at: new Date().toISOString()
        };

        library.unshift(newItem);
        existingTexts.add(snippet);
        existingUrls.add(shareUrl);
        newItemsCount++;
        log(`[+] Nuevo contenido detectado: "${newItem.title}"`);
      }

      // 2. Extract numerical video IDs
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
          summary: `Video oficial del Fanpage ARKAIOS (ID: ${vId}).`,
          agent_lesson: `Recurso multimedia para memoria de agentes: Transmisión y video oficial #${vId}.`,
          tags: ["#Arkaios", "#VideoHD", "#Oficial"],
          synced_at: new Date().toISOString()
        };

        library.unshift(newItem);
        existingUrls.add(videoUrl);
        newItemsCount++;
        log(`[+] Nuevo video ID indexado: ${videoUrl}`);
      }

      // 3. Extract /reel/ IDs
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
        newItemsCount++;
        log(`[+] Nuevo Reel indexado: ${reelUrl}`);
      }
    }

    // Save updated library
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(library, null, 2), 'utf-8');

    // Also update inlined defaultKnowledge in app.js for direct file:// browser viewing
    if (newItemsCount > 0) {
      try {
        const appJsPath = path.join(__dirname, 'app.js');
        if (fs.existsSync(appJsPath)) {
          const appJs = fs.readFileSync(appJsPath, 'utf-8');
          const startMarker = 'const defaultKnowledge = ';
          const endMarker = ';\n\n// Load from live library.json';
          const startIndex = appJs.indexOf(startMarker);
          const endIndex = appJs.indexOf(endMarker);
          if (startIndex !== -1 && endIndex !== -1) {
            const updatedApp = appJs.slice(0, startIndex + startMarker.length) +
              JSON.stringify(library, null, 2) +
              appJs.slice(endIndex);
            fs.writeFileSync(appJsPath, updatedApp, 'utf-8');
            log(`[+] app.js actualizado automáticamente con ${library.length} lecciones.`);
          }
        }
      } catch (appErr) {
        log(`[!] Advertencia al actualizar app.js: ${appErr.message}`);
      }
    }

    log(`Sincronización finalizada. Nuevos aportes añadidos: ${newItemsCount}. Total en biblioteca: ${library.length}`);

    return { success: true, newItemsCount, total: library.length };
  } catch (err) {
    log(`[ERROR] Falló la sincronización: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// Watch mode or direct execution
if (require.main === module) {
  const watchArg = process.argv.indexOf('--watch');
  if (watchArg !== -1) {
    const minutes = parseInt(process.argv[watchArg + 1], 10) || 15;
    log(`[DAEMON] Modo monitor activo. Sincronizando cada ${minutes} minutos...`);
    sync();
    setInterval(sync, minutes * 60 * 1000);
  } else {
    const result = sync();
    console.log('\nResultado:', JSON.stringify(result, null, 2));
  }
}

module.exports = { sync };
