/**
 * ARKAIOS Meta Token Manager & Automated Verification Assistant
 * 
 * Safely tests, exchanges, and validates Facebook Graph API tokens locally.
 * NEVER prints secret tokens to stdout. Sanitizes all output.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.join(__dirname, '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

function updateEnv(updates) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  for (const [key, val] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${val}`);
    } else {
      content += `\n${key}=${val}`;
    }
  }
  fs.writeFileSync(ENV_PATH, content.trim() + '\n', 'utf-8');
}

async function run() {
  console.log('======================================================================');
  console.log('🔐 ARKAIOS META GRAPH API TOKEN ASSISTANT & TEST RUNNER');
  console.log('======================================================================\n');

  const env = loadEnv();
  const appId = env.META_APP_ID;
  const appSecret = env.META_APP_SECRET;
  const userToken = env.META_USER_TOKEN;
  let pageToken = env.FACEBOOK_PAGE_TOKEN;
  let pageId = env.FACEBOOK_PAGE_ID;

  if (!userToken && !pageToken) {
    console.log('⚠️  No se encontró ningún token en .env');
    console.log(`Por favor abre el archivo:\n  ${ENV_PATH}`);
    console.log('\nY coloca al menos uno de los siguientes:');
    console.log('  META_USER_TOKEN=tu_token_corto_de_graph_explorer');
    console.log('  META_APP_ID=tu_app_id');
    console.log('  META_APP_SECRET=tu_app_secret');
    console.log('\n(O si ya tienes el token de página directamente):');
    console.log('  FACEBOOK_PAGE_TOKEN=tu_token_de_pagina');
    console.log('  FACEBOOK_PAGE_ID=tu_id_de_pagina');
    return;
  }

  // PASO 1: Si hay token de usuario pero no token de página, probar y canjear
  if (userToken && !pageToken) {
    console.log('[1/4] Validando Token de Usuario en Graph API...');
    try {
      const meRes = await fetch(`https://graph.facebook.com/v23.0/me?fields=id,name&access_token=${userToken}`);
      const meData = await meRes.json();

      if (meData.error) {
        console.error('❌ Error al validar token de usuario:', meData.error.message);
        console.log(`Código de error: ${meData.error.code} (Subcódigo: ${meData.error.error_subcode || 'N/A'})`);
        return;
      }

      console.log(`✅ Token de usuario válido. Usuario autenticado: ${meData.name} (ID: ${meData.id})`);

      let workingToken = userToken;

      // PASO 2: Canjear por token largo si tenemos App ID y App Secret
      if (appId && appSecret) {
        console.log('\n[2/4] Canjeando token corto por token de larga duración (60 días)...');
        const exchangeUrl = `https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${userToken}`;
        const exRes = await fetch(exchangeUrl);
        const exData = await exRes.json();

        if (exData.access_token) {
          console.log(`✅ Token de larga duración obtenido con éxito (Tipo: ${exData.token_type || 'Bearer'})`);
          workingToken = exData.access_token;
        } else {
          console.log('⚠️ No se pudo canjear por token largo (usando token actual):', exData.error?.message || 'Error desconocido');
        }
      } else {
        console.log('\nℹ️ META_APP_ID o META_APP_SECRET no definidos en .env; omitiendo canje a 60 días y usando token actual.');
      }

      // PASO 3: Obtener páginas y sus tokens permanentes
      console.log('\n[3/4] Consultando páginas administradas (/me/accounts)...');
      const accountsRes = await fetch(`https://graph.facebook.com/v23.0/me/accounts?fields=id,name,category,access_token&access_token=${workingToken}`);
      const accountsData = await accountsRes.json();

      if (accountsData.error) {
        console.error('❌ Error al consultar páginas:', accountsData.error.message);
        return;
      }

      const pages = accountsData.data || [];
      console.log(`Encontradas ${pages.length} página(s) administrada(s):`);

      if (pages.length === 0) {
        console.log('⚠️ La respuesta data: [] vino vacía. Asegúrate de conceder permisos a tu fanpage al generar el token en Graph Explorer.');
        return;
      }

      pages.forEach((p, idx) => {
        console.log(`  [${idx + 1}] ${p.name} | ID: ${p.id} | Categoría: ${p.category || 'N/A'}`);
      });

      // Seleccionar la página (arkaiosIA o la primera)
      const targetPage = pages.find(p => /arkaios/i.test(p.name)) || pages[0];
      console.log(`\nSeleccionando fanpage objetivo: "${targetPage.name}" (ID: ${targetPage.id})`);

      pageToken = targetPage.access_token;
      pageId = targetPage.id;

      // Guardar permanentemente en .env
      updateEnv({
        FACEBOOK_PAGE_TOKEN: pageToken,
        FACEBOOK_PAGE_ID: pageId
      });
      console.log('💾 Token de página permanente y Page ID guardados en .env automáticamente.');

    } catch (err) {
      console.error('❌ Excepción de red al procesar token:', err.message);
      return;
    }
  }

  // PASO 4: Prueba real de lectura de publicaciones con el token de página
  if (pageToken && pageId) {
    console.log(`\n[4/4] Ejecutando prueba de lectura en la Fanpage (ID: ${pageId})...`);
    try {
      const postsUrl = `https://graph.facebook.com/v23.0/${pageId}/posts?fields=id,message,created_time,permalink_url,attachments{url,title,type,media}&limit=5&access_token=${pageToken}`;
      const postsRes = await fetch(postsUrl);
      const postsData = await postsRes.json();

      if (postsData.error) {
        console.error('❌ Error al leer publicaciones de la página:', postsData.error.message);
        console.log(`Código: ${postsData.error.code}`);
        return;
      }

      const posts = postsData.data || [];
      console.log(`\n🎉 ¡PRUEBA EXITOSA! Se recibieron ${posts.length} publicaciones de la Fanpage:\n`);

      posts.forEach((post, i) => {
        const msg = (post.message || 'Sin mensaje de texto').slice(0, 100).replace(/\n/g, ' ');
        const date = new Date(post.created_time).toLocaleString();
        const attach = post.attachments?.data?.[0];
        const attachType = attach?.type || 'none';
        const attachTitle = attach?.title || 'N/A';

        console.log(`[Post #${i + 1}] ID: ${post.id}`);
        console.log(`  Fecha: ${date}`);
        console.log(`  Texto: ${msg}...`);
        console.log(`  Adjunto (${attachType}): ${attachTitle}`);
        console.log(`  Enlace: ${post.permalink_url || 'N/A'}\n`);
      });

      console.log('======================================================================');
      console.log('✅ El token de página funciona al 100% y tiene acceso de lectura.');
      console.log('   Ya puedes sincronizar con el recolector Graph API oficial.');
      console.log('======================================================================');

    } catch (err) {
      console.error('❌ Excepción al leer posts:', err.message);
    }
  }
}

run();
