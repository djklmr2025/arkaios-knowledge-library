const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const urls = [
  'https://www.facebook.com/arkaiosIA/videos',
  'https://www.facebook.com/arkaiosIA/reels',
  'https://www.facebook.com/arkaiosIA'
];

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

console.log('--- Iniciando Deep Scraper de Videos de ARKAIOS ---');

const foundVideos = new Map();

urls.forEach(url => {
  console.log(`\nConsultando ${url}...`);
  try {
    const cmd = `curl.exe -s -L -A "${userAgent}" "${url}"`;
    const html = execSync(cmd, { maxBuffer: 40 * 1024 * 1024 }).toString('utf-8');
    console.log(`Descargados ${(html.length / 1024 / 1024).toFixed(2)} MB`);

    // Match video URLs
    const patterns = [
      /https:\\?\/\\?\/www\.facebook\.com\\?\/share\\?\/[vr]\\?\/[a-zA-Z0-9_-]+/g,
      /https:\\?\/\\?\/www\.facebook\.com\\?\/arkaiosIA\\?\/videos\\?\/[0-9]+/g,
      /https:\\?\/\\?\/www\.facebook\.com\\?\/reel\\?\/[0-9]+/g,
      /\/videos\/([0-9]{10,25})/g,
      /\/reel\/([0-9]{10,25})/g,
      /"video_id":"([0-9]+)"/g
    ];

    patterns.forEach(regex => {
      let match;
      while ((match = regex.exec(html)) !== null) {
        let raw = match[0].replace(/\\/g, '');
        let cleanUrl = raw;
        if (raw.startsWith('/videos/')) cleanUrl = `https://www.facebook.com/arkaiosIA/videos/${match[1]}`;
        else if (raw.startsWith('/reel/')) cleanUrl = `https://www.facebook.com/reel/${match[1]}`;
        else if (raw.startsWith('"video_id"')) cleanUrl = `https://www.facebook.com/arkaiosIA/videos/${match[1]}`;

        if (!foundVideos.has(cleanUrl)) {
          foundVideos.set(cleanUrl, {
            url: cleanUrl,
            sourceTab: url,
            foundAt: new Date().toISOString()
          });
        }
      }
    });

  } catch (err) {
    console.error(`Error en ${url}:`, err.message);
  }
});

console.log(`\nTotal de enlaces de videos y reels encontrados: ${foundVideos.size}`);
let i = 1;
for (const [vUrl, data] of foundVideos) {
  console.log(`${i++}. [${data.sourceTab}] ${vUrl}`);
}
