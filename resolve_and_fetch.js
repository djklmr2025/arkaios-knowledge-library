const { execSync } = require('child_process');
const fs = require('path');

const url = 'https://www.facebook.com/share/p/19pf44tsSp/';
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

console.log('Resolviendo redireccion de:', url);

try {
  // Check headers with curl
  const headers = execSync(`curl.exe -s -I -A "${userAgent}" "${url}"`).toString('utf-8');
  console.log('--- HEADERS ---');
  console.log(headers.slice(0, 1000));

  // Also try mobile facebook or basic facebook or follow redirect
  const redirectCmd = `curl.exe -s -L -i -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" "${url}"`;
  const fullResp = execSync(redirectCmd, { maxBuffer: 20 * 1024 * 1024 }).toString('utf-8');
  
  const locations = fullResp.match(/location:\s*([^\r\n]+)/gi) || [];
  console.log('Locations:', locations);

} catch (e) {
  console.error('Error:', e.message);
}
