#!/usr/bin/env node
/**
 * ARKAIOS Media Extractor (No Keys, No Login)
 * Universal parser for Facebook, TikTok, and YouTube video knowledge.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetUrl = process.argv[2];

if (!targetUrl) {
  console.log('Uso: node media_extractor.js <URL>');
  console.log('Ejemplo: node media_extractor.js "https://www.facebook.com/share/v/19C2HiwhRs/"');
  process.exit(1);
}

console.log(`[ARKAIOS] Extrayendo conocimiento de: ${targetUrl}...`);

function fetchUrl(url, userAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)') {
  return new Promise((resolve, reject) => {
    try {
      // Use curl CLI directly since it is universally installed and handles SSL/redirects natively
      const cmd = `curl.exe -s -L -A "${userAgent}" "${url}"`;
      const output = execSync(cmd, { maxBuffer: 20 * 1024 * 1024 }).toString('utf-8');
      resolve(output);
    } catch (e) {
      reject(e);
    }
  });
}

async function extract() {
  try {
    let result = {
      url: targetUrl,
      timestamp: new Date().toISOString(),
      platform: 'Unknown',
      title: '',
      description: '',
      author: '',
      video_id: '',
      tags: []
    };

    if (targetUrl.includes('facebook.com')) {
      result.platform = 'Facebook';
      const html = await fetchUrl(targetUrl);
      
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i);
      const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i);
      const videoIdMatch = html.match(/"videoId"\s*:\s*"([0-9]+)"/) || html.match(/\/videos\/([0-9]+)/);
      
      result.title = titleMatch ? titleMatch[1] : 'Facebook Video / Post';
      result.description = descMatch ? descMatch[1] : '';
      result.video_id = videoIdMatch ? videoIdMatch[1] : '';

    } else if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
      result.platform = 'YouTube';
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
      const jsonStr = await fetchUrl(oembedUrl);
      try {
        const oembed = JSON.parse(jsonStr);
        result.title = oembed.title || '';
        result.author = oembed.author_name || '';
      } catch (e) {}

    } else if (targetUrl.includes('tiktok.com')) {
      result.platform = 'TikTok';
      const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(targetUrl)}`;
      const jsonStr = await fetchUrl(oembedUrl);
      try {
        const oembed = JSON.parse(jsonStr);
        result.title = oembed.title || '';
        result.author = oembed.author_name || '';
      } catch (e) {}
    }

    console.log('\n[EXTRACCIÓN EXITOSA]');
    console.log(JSON.stringify(result, null, 2));

    // Append to library.json
    const libPath = path.join(__dirname, 'library.json');
    if (fs.existsSync(libPath)) {
      const lib = JSON.parse(fs.readFileSync(libPath, 'utf-8'));
      lib.unshift({
        id: `kb-ext-${Date.now().toString().slice(-4)}`,
        title: result.title || `Video de ${result.platform}`,
        category: "Extracted Media",
        platform: result.platform,
        original_url: targetUrl,
        external_resource: targetUrl,
        summary: result.description || result.title,
        agent_lesson: `Conocimiento extraído dinámicamente de ${result.platform}.`,
        tags: [`#${result.platform}`, '#SovereignExtracted']
      });
      fs.writeFileSync(libPath, JSON.stringify(lib, null, 2));
      console.log(`\n[+] Añadido a ${libPath}`);
    }

  } catch (err) {
    console.error('Error durante extracción:', err.message);
  }
}

extract();
